# elasticsearch-config

部署需要有 es 环境并安装好 ik 与 pinyin 插件，并将 `/plugins/ik/config/stopword.dic` 与 `/plugins/ik/config/extra_stopword.dic` 内容清空（禁用停用词）：

```
npm install
git clone https://github.com/OI-wiki/OI-wiki.git /home/ubuntu/OI-wiki
cd /home/ubuntu/OI-wiki
git remote add gh https://github.com/OI-wiki/OI-wiki.git
```

初始化并启动 webhook：

```
npm run webhook
```

测试：

```
npm run test
```

不连接 Elasticsearch、不启动服务或执行索引脚本的离线回归测试：

```
npm run test:unit
```

搜索字段权重为 `title: 4, h2: 3, h3: 2, content: 1, url: 3`，保留每字段 `75%` 命中条件和 `dis_max` 的 `0.3` 系数。三级标题从正文移出，四级及更深标题仍保留在正文。

升级后需要从 Markdown 全量重新提取、写入文档，现有索引不会自动补齐 `h3`。线上迁移应先在新索引校验再切换；当前 `build.sh` 会删除旧索引，不要直接在生产索引上执行。

启动 api 接口：

```
npm run serve
```

统计：

```
curl -H'Content-Type: application/json' -XGET http://localhost:PORT/oiwiki/_count
```

清空

```
curl -H'Content-Type: application/json' -XPOST "http://localhost:PORT/oiwiki/_delete_by_query" -d'
{
     "query":{
          "match_all":{}
      }
}'

```

