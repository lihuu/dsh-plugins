<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a>
</p>

# dsh-plugins

Personal unified plugin collection for [DeepSeek Harness](https://github.com/deepseek-harness). All self-authored plugins live here in one place, so a fresh machine can install everything with a single command.

## Plugins

| Plugin | Location | Kind | Purpose |
| --- | --- | --- | --- |
| `dsh-file-ref` | `plugins/dsh-file-ref` (repo subdirectory) | Web plugin (browser + host) | Composer `@file` — locate a workspace file and insert its full absolute path |
| `dsh-lazy-skill` | `plugins/dsh-lazy-skill` (submodule → [lihuu/dsh-lazy-skill](https://github.com/lihuu/dsh-lazy-skill)) | Host plugin | Lazily load skill bundles |
| `dsh-tavily-search` | `plugins/dsh-tavily-search` (repo subdirectory) | Host plugin | Tavily-backed `WebSearchProvider` for `ctx.web` — makes the `web_search` tool use Tavily |

## Install (on a new machine)

```sh
# 1. Clone (with submodules)
git clone --recurse-submodules https://github.com/lihuu/dsh-plugins.git
cd dsh-plugins

# 2. Install everything to the local DSH
./install.sh
```

`install.sh`:
- symlinks each plugin into `$DSH_HOME/plugins/<name>`
- ensures the matching rows exist in `$DSH_HOME/cordis.patch.yml` (idempotent — no duplicates)
- source edits under the symlink take effect immediately

After installing, restart dsh-web for the host halves to take effect:

```sh
launchctl kickstart -k gui/501/com.lihu.dsh-web
```

Browser-side changes appear on page refresh (or via HMR).

## Adding a plugin

1. Create a directory under `plugins/` with the source
2. Add one line to the `link_plugin` list in `install.sh`
3. Add a matching row to the `rows` table in `install.sh`
4. Commit

## Layout

```
dsh-plugins/
├── install.sh                    one-shot install into ~/.dsh
├── plugins/
│   ├── dsh-file-ref/             file-ref source (managed directly here)
│   └── dsh-lazy-skill/           submodule (own repository, pointer)
└── README.md
```

## Per-plugin docs

- [`plugins/dsh-file-ref/README.md`](plugins/dsh-file-ref/README.md) — `@file` workspace file reference
- lazy-skill docs live in its own repository

## License

MIT
