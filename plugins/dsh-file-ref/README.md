# dsh-file-ref

独立可安装的 `@file` 工作区文件引用插件,为 DeepSeek Harness Web GUI 提供**打字 `@` 快速定位工作区文件并插入完整绝对路径**的 UX 快捷方式。

**核心特性:完全独立插件形态,零主仓库改动。** 不像仓库内 `packages/client/ui-file-ref`(需改 `packages/` 才能接线),本插件的 host 半和 browser 半都通过官方扩展点独立挂载:

- **browser 半**:声明 `dsh.client`(platform web)+ `exports["./client"]`,由 `clientModules` 扫描 `@local` 挂载、注入 `__DSH_BOOT__`、经 `/plugins/<id>/client.js` 提供。
- **host 半**:typert 运行时 Remote(`TypertRemoteService` + `@Remote('find')`),由 `dsh-api-gateway` 在运行时的 **source-mode 发现**下把 `/api/fileRefFinder/find` 派发到本服务的 live 实例——不需要编译期生成的 remote 静态装配,不需要在 apiproxy RpcMethodMap 加行。

## 安装

把本目录放到 `$DSH_HOME/plugins/dsh-file-ref`,并在 `$DSH_HOME/cordis.patch.yml` 加一行:

```yaml
- insert:
    - id: dsh-file-ref
      name: '@local/dsh-file-ref'
```

重启 dsh-web 服务使 host 半生效,浏览器刷新页面即可(浏览器侧 bundle 变更走 HMR)。

## 工作原理

| 环节 | 机制 |
| --- | --- |
| 菜单入口 | browser 半注册 `@` trigger source,经 `inputTriggers.registerSource` |
| 数据通道 | browser 半 `connection.rpc.call('/api', 'fileRefFinder/find', { args })` → host `dsh-api-gateway` source-mode 派发到本服务 |
| host 后端 | ripgrep 快速遍历工作区,回落受限 fs 枚举,经 basename/path 打分排序,上限 12 条 |
| 插入 | pick 后插入文件的**完整绝对路径** + 空格(纯文本,不含文件内容) |
| 防闪烁 | per-session 已稳定缓存,精化查询同步命中缓存,后台刷新 |

typert 通道工作是因为 `TypertGatewayService` 会扫描 live service 上携带 `typertRemote` binding 的对象(`collectSrcClaims`),并以 `src-json` codec 做边界校验。本插件正是利用这一**运行时注册**能力,无需生成器 / 无静态装配。

## 与仓库内 `ui-file-ref` 的关系

仓库内 `packages/client/ui-file-ref` 用 apiproxy `fileRef.find` 域实现同样的 `@file` 源(trigger `@` name `file`)。两者**不能同时注册同一 `(trigger, name)`**——触发源注册时同名会抛错。迁移到本独立插件时请去掉仓库内版本,使独立插件独占 `file` 源(仓库已切回 master,不含 ui-file-ref,故本插件现为唯一实现)。

本插件浏览器半使用 `name: 'file'`,作为唯一源。若需与仓库内版本暂时共存做对照,可临时改成其他名字(如 `file-ref-indep`)。

## Known Limitations and Deferred Work

- browser 半是手写纯 JS 单文件(无打包器),与仓库内 SSOT 版本有实现重复;后续可考虑把独立插件与仓库内版本收敛。
- host 半依赖可选 `fs`/`subprocess`/`sessions` 服务,首次调用需 `inject: ['fs']` 等待就绪。
- 验证阶段 host 半为快速迭代采用 `console.error` 暂无残留。
