# dsh-tavily-search

Tavily-backed `WebSearchProvider` for DeepSeek Harness. Registers a Tavily search provider into `ctx.web` so the standard `web_search` tool uses Tavily instead of the default DeepSeek search.

## What it does

- Implements the `WebSearchProvider` seam (`id: 'tavily'`, `available()`, `search()`).
- Calls `POST https://api.tavily.com/search` with `api_key`, `query`, `max_results`, `include_answer`.
- Maps Tavily `results[]` → `WebSearchSource` (`url`/`title`/`content→snippet`/`published_date→publishedAt`) and `answer` → `WebSearchResult.content`.

## Install

From the `dsh-plugins` repo root:

```sh
./install.sh
```

This symlinks the plugin into `$DSH_HOME/plugins/dsh-tavily-search` and adds its row to `$DSH_HOME/cordis.patch.yml`.

## Configuration

After installing, three things must be in place for `web_search` to use Tavily.

### 1. Mount the plugin row

`install.sh` adds this to `$DSH_HOME/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-tavily-search
      name: '@local/dsh-tavily-search'
```

### 2. Point the web seam at Tavily

The base bundle pins `searchProvider: deepseek-official`. Override it in `$DSH_HOME/cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: tavily
```

### 3. Configure the API key

The plugin reads the key from its `config.apiKey`, falling back to the `TAVILY_API_KEY` environment variable. The key is **never stored in this repo** — configure it locally, one of two ways:

**Option A — plugin config (recommended).** Add `apiKey` to the plugin row in `$DSH_HOME/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-tavily-search
      name: '@local/dsh-tavily-search'
      config:
        apiKey: tvly-xxxxxxxxxxxxxxxx
```

**Option B — environment variable.** Set `TAVILY_API_KEY` in the environment the harness process runs under (your shell profile, a systemd/launchd unit, a process manager, etc.):

```sh
export TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxx"
```

Get a key at [tavily.com](https://tavily.com). Keys start with `tvly-`.

## Usage

Once configured, the model's `web_search` tool automatically routes through Tavily — no code changes. Ask the model to search the web and it will return Tavily results (an optional answer plus a list of source URLs).

To verify it works, restart the harness (however you run it) and ask the model to search something.

## Build

```sh
# link your harness's node_modules so the peer dependencies resolve
ln -s "$DSH_HOME/profiles/node_modules" node_modules
tsc -p tsconfig.json
```

## License

MIT
