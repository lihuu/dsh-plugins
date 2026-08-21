# dsh-client-usage-stats

Token usage statistics panel for the DeepSeek Harness web GUI.

## Overview

Adds a "用量统计" (Usage) page to the Settings panel, aggregating the token
usage every session already carries in its projection column. Pure client
plugin: no host-side code, no extra RPC — the data rides the `tokenUsage`
session projection that `session.list` attaches to each row (live sessions
from the watermark cache, cold sessions from the persisted projection cache).

## UI Location

Settings → 用量统计 (Usage):

```
Settings
├── General
├── Models
├── ...
└── 用量统计        ← this plugin
    ├── 总用量（输入 + 输出）  771.5M
    ├── 未缓存输入  361.5M
    ├── 缓存读取    407.7M
    ├── 缓存写入    0
    ├── 输出        2.9M
    └── 34 个会话
```

## What it shows

- **Total tokens** — input + output summed over every listed session
  (`uncachedInput + cacheRead + cacheWrite + output`).
- **Per-bucket breakdown** — uncached input, cache read, cache write, output.
- **Session count** — sessions whose projection carries token usage.

## Data source

Each session summary's `projectionValues.tokenUsage` (the `tokenUsage`
projection registered by `@deepseek-ai/dsh-token-meter`). The host computes
it durably per session; this plugin only sums the values already on the wire.

## Install

```sh
./install.sh          # wires the plugin + adds the patch row
launchctl kickstart -k "gui/$(id -u)/com.lihu.dsh-web"   # restart, then refresh the browser
```

## Build

```sh
# from the plugin directory, with the harness repo's tsdown on PATH
/Users/lihu/git/deepseek-harness/node_modules/.bin/tsdown
```

The committed `lib/client.js` is the loadable browser bundle; a fresh machine
needs no build toolchain.
