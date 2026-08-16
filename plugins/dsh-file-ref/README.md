# dsh-file-ref

DeepSeek Harness Web GUI 的 `@file` 工作区文件引用插件:在输入框输入 `@file`,快速定位当前工作区的文件,选中后插入它的完整绝对路径。

一个纯粹的文件路径快捷方式 —— 不读取、不上传、不发送文件内容,不影响模型绑定。

## 功能

- 在作曲家输入框输入 `@` 触发文件源,按文件名 / 路径搜索工作区文件
- 左侧边栏点选或回车选中,插入文件的**完整绝对路径**(后带一个空格)
- 基于 ripgrep 快速搜索,搜索受限目录(如 `node_modules`、`.git`)自动排除
- 无内容读取:菜单只枚举并展示路径

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
