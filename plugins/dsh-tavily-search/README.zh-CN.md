# dsh-tavily-search

基于 Tavily 的 DeepSeek Harness `WebSearchProvider`。把 Tavily 搜索 provider 注册进 `ctx.web`,让标准的 `web_search` 工具走 Tavily,而不是默认的 DeepSeek 搜索。

## 作用

- 实现 `WebSearchProvider` 接口(`id: 'tavily'`、`available()`、`search()`)。
- 调用 `POST https://api.tavily.com/search`,携带 `api_key`、`query`、`max_results`、`include_answer`。
- 把 Tavily `results[]` 映射为 `WebSearchSource`(`url`/`title`/`content→snippet`/`published_date→publishedAt`),把 `answer` 映射为 `WebSearchResult.content`。

## 安装

在 `dsh-plugins` 仓库根目录:

```sh
./install.sh
```

这会把插件软链到 `$DSH_HOME/plugins/dsh-tavily-search`,并在 `$DSH_HOME/cordis.patch.yml` 里加上对应行。

## 配置

安装后,要让 `web_search` 走 Tavily,需要三处配置。

### 1. 挂载插件行

`install.sh` 会在 `$DSH_HOME/cordis.patch.yml` 里加上:

```yaml
- insert:
    - id: dsh-tavily-search
      name: '@local/dsh-tavily-search'
```

### 2. 把 web 搜索指向 Tavily

base bundle 默认把 `searchProvider` 固定为 `deepseek-official`。在 `$DSH_HOME/cordis.patch.yml` 里覆盖:

```yaml
- id: web
  config:
    searchProvider: tavily
```

### 3. 配置 API key

插件从 `config.apiKey` 读取 key,回退到 `TAVILY_API_KEY` 环境变量。**key 永远不会存进本仓库**——在本地配置,二选一:

**方式 A——插件配置(推荐)。** 在 `$DSH_HOME/cordis.patch.yml` 的插件行加 `apiKey`:

```yaml
- insert:
    - id: dsh-tavily-search
      name: '@local/dsh-tavily-search'
      config:
        apiKey: tvly-xxxxxxxxxxxxxxxx
```

**方式 B——环境变量。** 在 harness 进程运行的环境里设置 `TAVILY_API_KEY`(你的 shell 配置文件、systemd/launchd 单元、进程管理器等):

```sh
export TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxx"
```

在 [tavily.com](https://tavily.com) 获取 key,以 `tvly-` 开头。

## 使用

配置好后,模型的 `web_search` 工具会自动走 Tavily,无需改代码。让模型搜索网页,它就会返回 Tavily 结果(可选答案 + 来源 URL 列表)。

验证是否生效:重启 harness(无论你怎么运行它),让模型搜个东西。

## 构建

```sh
# 链接你 harness 的 node_modules,让 peer 依赖可解析
ln -s "$DSH_HOME/profiles/node_modules" node_modules
tsc -p tsconfig.json
```

## License

MIT
