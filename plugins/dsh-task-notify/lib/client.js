/**
 * dsh-task-notify — browser notification plugin (BROWSER half).
 *
 * Plain-JS client bundle served as `/plugins/@local/dsh-task-notify/client.js`.
 * Subscribes to the sessions list snapshot (`ctx.sessions.list`) and fires a
 * Chrome Notification each time a session transitions running → idle (the same
 * edge the sidebar's green "done" dot uses). No UI, no host half behavior, no
 * main-repo changes.
 *
 * Toggle: enabled by default. Disable from the browser console with
 *   localStorage.setItem('dshNotifyEnabled', '0')
 * and re-enable with
 *   localStorage.removeItem('dshNotifyEnabled')
 * The value is read on every completion, so the change applies immediately.
 */
(function () {
  // The registration id MUST equal the boot graph row id (loader entry name
  // == package name). The host composes rows from the cordis patch `name`.
  var PLUGIN_ID = '@local/dsh-task-notify'

  /** localStorage key controlling the toggle; absent means enabled. */
  var ENABLED_KEY = 'dshNotifyEnabled'

  /** Notification title prefix (product copy); the session title is appended. */
  var TITLE_PREFIX = '任务已完成 · '

  /** Whether notifications are currently enabled (read live each completion). */
  function isEnabled() {
    try {
      return localStorage.getItem(ENABLED_KEY) !== '0'
    } catch (e) {
      // localStorage unavailable (privacy mode / non-browser host): default on.
      return true
    }
  }

  /** Compact human duration: 45 秒 / 2 分 15 秒 / 1 小时 5 分. */
  function formatDuration(ms) {
    var s = Math.round(ms / 1000)
    if (s < 60) return s + ' 秒'
    var m = Math.floor(s / 60)
    if (m < 60) {
      var rs = s % 60
      return rs > 0 ? m + ' 分 ' + rs + ' 秒' : m + ' 分钟'
    }
    var h = Math.floor(m / 60)
    var rm = m % 60
    return rm > 0 ? h + ' 小时 ' + rm + ' 分' : h + ' 小时'
  }

  /** Fire one notification, requesting permission on first use (Chrome promise API). */
  function notify(title, body) {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      new Notification(title, { body: body })
      return
    }
    if (Notification.permission === 'denied') return
    // First use: ask. Chrome resolves the promise; older engines use a callback.
    var request = Notification.requestPermission()
    if (request && typeof request.then === 'function') {
      request.then(function (permission) {
        if (permission === 'granted') new Notification(title, { body: body })
      })
    } else {
      Notification.requestPermission(function (permission) {
        if (permission === 'granted') new Notification(title, { body: body })
      })
    }
  }

  window.__ModuleLoader__.load({
    id: PLUGIN_ID,
    factory: function (require) {
      return {
        name: PLUGIN_ID,
        inject: ['sessions'],
        apply: function (ctx) {
          var sessions = ctx.get('sessions')
          if (sessions === undefined || sessions.list === undefined) return
          // Last-observed running bit + run start time per session; the
          // true→false edge here fires the notification (mirrors the sidebar
          // completion dot), with the run duration in the body.
          var prevRunning = new Map()

          var unsubscribe = sessions.list.subscribe(function () {
            if (!isEnabled()) return
            var snap = sessions.list.getSnapshot()
            if (snap === undefined) return
            var ids = snap.ids
            var byId = snap.byId
            for (var i = 0; i < ids.length; i++) {
              var id = ids[i]
              var row = byId[id]
              if (row === undefined) continue
              var running = row.running
              var was = prevRunning.get(id)
              if (was !== undefined && was.running === true && running === false) {
                var title = (row.displayTitle && row.displayTitle !== '') ? row.displayTitle : id
                var body = '耗时 ' + formatDuration(Date.now() - was.startTime)
                notify(TITLE_PREFIX + title, body)
              }
              if (running) {
                // Keep the first start time of a run across repeated frames.
                prevRunning.set(id, {
                  running: true,
                  startTime: was !== undefined && was.running ? was.startTime : Date.now(),
                })
              } else {
                prevRunning.set(id, { running: false, startTime: 0 })
              }
            }
          })

          ctx.effect(function () {
            return function () { unsubscribe() }
          }, 'dsh-task-notify: sessions subscription')
        },
      }
    },
  })
})()
