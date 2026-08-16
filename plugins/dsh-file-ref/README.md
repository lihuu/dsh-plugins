# dsh-file-ref

`@file` workspace file reference plugin for the DeepSeek Harness Web GUI. Type `@file` in the composer to quickly locate files in the current workspace and insert a chosen file's full absolute path.

It is a pure path-typing shortcut — it never reads, uploads, or sends file contents, and it never changes the model binding.

[[中文说明见下](#dsh-file-ref-中文)](README.md#dsh-file-ref-中文)

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

---

# dsh-file-ref (中文)

DeepSeek Harness Web GUI 的 `@file` 工作区文件引用插件:在输入框输入 `@file`,快速定位当前工作区的文件,选中后插入它的完整绝对路径。

一个纯粹的文件路径快捷方式 —— 不读取、不上传、不发送文件内容,不影响模型绑定。

## 功能

- 在作曲家输入框输入 `@` 触发文件源,按文件名 / 路径搜索工作区文件
- 选中(或按回车)后插入文件的**完整绝对路径**(后带一个空格)
- 基于 ripgrep 快速搜索,搜索受限目录(如 `node_modules`、`.git`)自动排除
- 只枚举路径,菜单从不读取文件内容

## 安装

本插件作为 [dsh-plugins](https://github.com/lihuu/dsh-plugins) 的一部分,推荐用其一次性安装脚本:

```sh
git clone --recurse-submodules https://github.com/lihuu/dsh-plugins.git
cd dsh-plugins && ./install.sh
```

或手动安装:把本目录放到 `$DSH_HOME/plugins/dsh-file-ref`,并在 `$DSH_HOME/cordis.patch.yml` 加一行挂载:

```yaml
- insert:
    - id: dsh-file-ref
      name: '@local/dsh-file-ref'
```

装完重启 dsh-web(host 半生效),浏览器刷新页面即可。

## 使用

1. 打开一个会话
2. 在输入框输入 `@file`(或 `@file` 加关键字,如 `@file read`)
3. 从候选文件中选择
4. 该文件的完整绝对路径被插入输入框

## 要求

- DeepSeek Harness Web GUI
- 可选:工作区已安装 `rg`(ripgrep)以获得快速搜索;无 `rg` 时自动回退到受限的目录扫描

## License

MIT
