# dsh-task-notify

Browser notification when a DeepSeek Harness web task finishes running.

Pure browser client plugin: subscribes to the sessions list snapshot
(`ctx.sessions.list`) and fires a Chrome `Notification` each time a session
transitions **running → idle** — the same edge the sidebar's green "done" dot
uses. No UI, no host-half behavior, zero main-repo changes: the whole feature
ships as an installable `@local` plugin.

## Install

```sh
./install.sh          # symlinks the plugin, wires the @local scope, adds the patch row
launchctl kickstart -k "gui/$(id -u)/com.lihu.dsh-web"   # restart, then refresh the browser
```

Browser-side changes appear on page refresh (or via HMR).

## Behavior

- Fires a notification titled **任务已完成 · {会话标题}** (falls back to the
  session id) with the run duration in the body (e.g. **耗时 2 分 15 秒**)
  whenever a session stops running.
- Chrome-only: uses the standard `Notification` API. On first use it requests
  permission; notifications only appear once granted.
- Notifies regardless of tab focus.

## Toggle

Enabled by default. Disable from the browser console:

```js
localStorage.setItem('dshNotifyEnabled', '0')
```

Re-enable:

```js
localStorage.removeItem('dshNotifyEnabled')
```

The value is read on every completion, so the change applies immediately
without a reload.

## Layout

```
dsh-task-notify/
├── package.json       # dsh.client platform web; ./client export
├── lib/
│   ├── index.js       # node half (empty apply, so the loader accepts the row)
│   └── client.js      # browser half: the notification logic
└── README.md
```
