<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a>
</p>

# dsh-file-ref

`@file` workspace file reference plugin for the DeepSeek Harness Web GUI. Type `@file` in the composer to quickly locate files in the current workspace and insert a chosen file's full absolute path.

It is a pure path-typing shortcut — it never reads, uploads, or sends file contents, and it never changes the model binding.

## Features

- Types `@` in the composer input to trigger the file source, searching the workspace by filename / path
- Select from a candidate list (or press Enter) to insert the file's **full absolute path** (followed by a space)
- Fast ripgrep-backed search; heavy/VCS directories (e.g. `node_modules`, `.git`) are excluded automatically
- Path-only enumeration: the menu never reads file contents

## Installation

This plugin ships as part of [dsh-plugins](https://github.com/lihuu/dsh-plugins); the recommended way is that repo's one-shot installer:

```sh
git clone --recurse-submodules https://github.com/lihuu/dsh-plugins.git
cd dsh-plugins && ./install.sh
```

To install manually, place this directory at `$DSH_HOME/plugins/dsh-file-ref` and add a mount row to `$DSH_HOME/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-file-ref
      name: '@local/dsh-file-ref'
```

After installing, restart dsh-web for the host half to take effect, then refresh the browser.

## Usage

1. Open a session
2. Type `@file` in the input box (optionally with a keyword, e.g. `@file read`)
3. Pick a file from the candidate list
4. The file's full absolute path is inserted into the input box

## Requirements

- DeepSeek Harness Web GUI
- Optional: `rg` (ripgrep) on the workspace for fast search; without it the plugin falls back to a bounded directory scan

## License

MIT
