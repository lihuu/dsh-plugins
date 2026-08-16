# dsh-plugins

个人 DeepSeek Harness 插件合集统一管理仓库。所有自研插件集中存放,换机器一条命令装齐。

## 包含的插件

| 插件 | 所在 | 类型 | 作用 |
| --- | --- | --- | --- |
| `dsh-file-ref` | `plugins/dsh-file-ref`(本仓库子目录) | Web 插件(browser + host) | 作曲家输入 `@` 快速定位工作区文件并插入完整绝对路径 |
| `dsh-lazy-skill` | `plugins/dsh-lazy-skill`(submodule→[lihuu/dsh-lazy-skill](https://github.com/lihuu/dsh-lazy-skill)) | Host 插件 | 懒加载 skill 包 |

## 安装(换机器)

```sh
# 1. clone(带 submodule)
git clone --recurse-submodules https://github.com/lihuu/dsh-plugins.git
cd dsh-plugins

# 2. 一键安装到本机 DSH
./install.sh
```

`install.sh` 会:
- 把每个插件符号链接到 `$DSH_HOME/plugins/<name>`
- 保证 `$DSH_HOME/cordis.patch.yml` 里有对应挂载行(幂等,不重复)
- 插件源码的改动在符号链接下即时生效

装完后重启 dsh-web(host 半生效):

```sh
launchctl kickstart -k gui/501/com.lihu.dsh-web
```

浏览器侧刷新页面即可(或走 HMR)。

## 新增插件

1. 在 `plugins/` 下新建目录,写好源码
2. 在 `install.sh` 的 `link_plugin` 列表和 python `rows` 表里各加一行
3. 提交

## 结构

```
dsh-plugins/
├── install.sh                    一键安装到 ~/.dsh
├── plugins/
│   ├── dsh-file-ref/             file-ref 源码(本仓库直接管理)
│   └── dsh-lazy-skill/           submodule(独立仓库,指针)
└── README.md
```

## 各插件单独说明

- [`plugins/dsh-file-ref/README.md`](plugins/dsh-file-ref/README.md) — `@file` 工作区文件引用
- lazy-skill 独立仓库说明见其自己的 README
