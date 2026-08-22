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

  /** Compact token count: 517 / 12.5K / 1.2M. */
  function formatTokens(n) {
    if (n < 1000) return String(n)
    if (n < 1000000) return (Math.round(n / 100) / 10) + 'K'
    return (Math.round(n / 100000) / 10) + 'M'
  }

  /** Sum the four disjoint usage buckets of a tokenUsage projection value. */
  function totalTokens(usage) {
    if (usage === undefined || usage === null) return undefined
    return usage.uncachedInputTokens + usage.cacheReadTokens
      + usage.cacheWriteTokens + usage.outputTokens
  }

  /**
   * Sanitize a session title for the notification: a title that looks like a
   * URL or host (e.g. a session whose title is the current origin) reads as
   * noise, so it is replaced with the product name.
   */
  function displayTitleOf(title, id) {
    if (title === undefined || title === '') return id
    if (/^(https?:\/\/|localhost|127\.0\.0\.1|[\w-]+\.\w{2,})(:\d+)?(\/|$)/i.test(title)) {
      return 'DSH'
    }
    return title
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
        inject: ['sessions', 'connection'],
        apply: function (ctx) {
          var sessions = ctx.get('sessions')
          var connection = ctx.get('connection')
          if (sessions === undefined || sessions.list === undefined) return
          // Last-observed running bit + run start time + pre-run token
          // baseline per session; the true→false edge here fires the
          // notification (mirrors the sidebar completion dot), with the run
          // duration and this run's token usage in the body.
          var prevRunning = new Map()

          // Read the session's tokenUsage via RPC. The host folds the durable
          // log (live watermark or cold restore), so this works for sessions
          // whose projection values are absent from the list snapshot.
          function readUsage(sessionId, callback) {
            if (connection === undefined || connection.api === undefined
              || connection.api.sessions === undefined) {
              callback(undefined)
              return
            }
            connection.api.sessions.history({ sessionId: sessionId, maxMessages: 1 }).then(
              function (res) {
                var block = res && res.value && res.value.projections
                var usage = block && block.values && block.values.tokenUsage
                callback(totalTokens(usage))
              },
              function () { callback(undefined) }
            )
          }

          function fireCompletion(id, title, runStart, runBaseline, tokens) {
            var parts = ['耗时 ' + formatDuration(Date.now() - runStart)]
            var used = tokens !== undefined
              ? (runBaseline !== undefined ? tokens - runBaseline : tokens)
              : undefined
            if (used !== undefined && used > 0) {
              parts.push('本次约 ' + formatTokens(used) + ' tokens')
              notify(TITLE_PREFIX + title, parts.join(' · '))
              return
            }
            // tokenUsage not in the list snapshot yet: read it via RPC.
            readUsage(id, function (tokens2) {
              var used2 = tokens2 !== undefined
                ? (runBaseline !== undefined ? tokens2 - runBaseline : tokens2)
                : undefined
              var parts2 = ['耗时 ' + formatDuration(Date.now() - runStart)]
              if (used2 !== undefined && used2 > 0) parts2.push('本次约 ' + formatTokens(used2) + ' tokens')
              notify(TITLE_PREFIX + title, parts2.join(' · '))
            })
          }

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
              var tokens = totalTokens(row.projectionValues && row.projectionValues.tokenUsage)
              if (was !== undefined && was.running === true && running === false) {
                fireCompletion(id, displayTitleOf(row.displayTitle, id), was.startTime, was.baselineTokens, tokens)
              }
              if (running) {
                // Keep the first start time and pre-run token baseline of a
                // run across repeated frames.
                prevRunning.set(id, {
                  running: true,
                  startTime: was !== undefined && was.running ? was.startTime : Date.now(),
                  baselineTokens: was !== undefined && was.running ? was.baselineTokens : tokens,
                })
              } else {
                prevRunning.set(id, { running: false, startTime: 0, baselineTokens: tokens })
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
