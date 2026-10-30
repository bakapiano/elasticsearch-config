const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Exercise the real entry points, but never start a server, run build.sh,
// connect to Elasticsearch, or read the indexer's hard-coded deployment paths.
function load(file, markdown) {
  const requests = [], routes = {}, settings = {};
  const handler = () => {};
  handler.on = () => {};
  const app = {
    set: (key, value) => { settings[key] = value; },
    get: (key, callback) => callback ? (routes[key] = callback) : settings[key],
    listen: () => {},
  };
  const mocks = {
    http: { createServer: () => ({ listen: () => {} }) },
    express: () => app,
    'github-webhook-handler': () => handler,
    child_process: { exec: () => {} },
    fs: { readFileSync: filename => {
      if (filename.endsWith('mkdocs.yml')) return 'nav:\n  - Navigation title: sample.md\n';
      if (markdown === null) throw new Error('Missing fixture');
      return markdown;
    } },
    elasticsearch: { Client: function () {
      this.bulk = (request, callback) => { requests.push(request); callback(null, {}); };
      this.search = request => { requests.push(request); return Promise.resolve({ hits: { hits: [] } }); };
    } },
  };
  const context = {
    console: { log() {}, debug() {}, error() {} },
    process: { env: {} },
    require: name => {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      assert(['yaml', 'remark', 'remark-math', 'strip-markdown-math'].includes(name), `Unexpected dependency: ${name}`);
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  return { context, requests, routes };
}

async function main() {
  const fixture = [
    'author: someone', '', '# Article title', '', '## Second heading', '',
    '### 子集遍历', 'First paragraph.', '', '### Another third heading',
    'Second paragraph.', '', '#### Fourth heading', 'Fourth paragraph.', '',
    '```text', '### Not a real heading', '```',
  ];
  for (const newline of ['\n', '\r\n']) {
    const { context, requests } = load('webhook/index.js', fixture.join(newline));
    const [title, content, h2, h3] = context.getContent('sample.md', { nav: [{ 'Navigation title': 'sample.md' }] });
    assert.strictEqual(title, 'Navigation title');
    assert.strictEqual(h2.trim(), 'Second heading');
    assert.deepStrictEqual(h3.split('\n').map(line => line.trim()), ['子集遍历', 'Another third heading']);
    for (const excluded of ['someone', 'Article title', 'Second heading', '子集遍历', 'Another third heading']) {
      assert(!content.includes(excluded), `Unexpected duplicate/metadata: ${excluded}`);
    }
    assert(content.includes('First paragraph.'));
    assert(content.includes('Fourth heading'));
    assert(!h3.includes('Not a real heading'));
    context.updateContent(['sample.md'], []);
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].body[1].h3, h3);
    assert.strictEqual(requests[0].body[1].content, content);
    assert.strictEqual(requests[0].body[1].url, '/sample/');
  }
  const empty = load('webhook/index.js', '# Title\n\nBody');
  assert.strictEqual(empty.context.getContent('sample.md', { nav: [] })[3], '');
  const missing = load('webhook/index.js', null);
  assert.deepStrictEqual(Array.from(missing.context.getContent('missing.md', { nav: [] })), ['', '', '', '']);

  const api = load('api/main.js');
  const response = await new Promise(resolve => api.routes['/']({ query: { s: '子集遍历' } }, { send: resolve }));
  assert.strictEqual(response.length, 0);
  const request = api.requests[0];
  assert.strictEqual(request.size, 12);
  assert.strictEqual(request.body.query.dis_max.tie_breaker, 0.3);
  const weights = {};
  for (const clause of request.body.query.dis_max.queries) {
    const field = Object.keys(clause.match)[0];
    const match = clause.match[field];
    weights[field] = match.boost;
    assert.strictEqual(match.minimum_should_match, '75%');
    assert.strictEqual(match.query, '子集遍历');
  }
  assert.deepStrictEqual(weights, { title: 4, h2: 3, h3: 2, content: 1, url: 3 });
  console.log('Offline regression tests passed: heading extraction, CRLF, code fences, index payload, and search weights.');
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { load };
