/**
 * dsh-about — independent "About" settings section (BROWSER half).
 *
 * Plain-JS client bundle served as `/plugins/@local/dsh-about/client.js`.
 * Registers the "关于" page into the settings.section list slot and resolves
 * the running version + build date through the host's runtime Typert Remote
 * endpoint `aboutInfo/get` via the generic `/api` RPC channel — no generated
 * artifacts, no main-repo changes.
 */
(function () {
  // The registration id MUST equal the boot graph row id (loader entry name
  // == package name). The host composes rows from the cordis patch `name`.
  var PLUGIN_ID = '@local/dsh-about'

  window.__ModuleLoader__.load({
    id: PLUGIN_ID,
    factory: function (require) {
      var React = require('react')

      return {
        inject: ['slots', 'connection'],
        apply: function (ctx) {
          var slots = ctx.get('slots')
          var connection = ctx.get('connection')
          if (slots === undefined || connection === undefined) return

          slots.inject('settings.section', function () {
            return slots.register(
              { name: 'settings.section', id: 'about', order: 30, label: '关于' },
              function () {
                var state = React.useState(null)
                var info = state[0]
                var setInfo = state[1]

                React.useEffect(function () {
                  var alive = true
                  try {
                    connection.rpc.call('/api', 'aboutInfo/get', { args: {} })
                      .then(function (result) {
                        if (alive && result && result.ok) setInfo(result.value)
                      })
                      .catch(function () {})
                  } catch (e) {
                    // RPC unavailable — leave the loading state
                  }
                  return function () { alive = false }
                }, [])

                function row(label, value) {
                  return React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                    React.createElement('span', { style: { color: 'var(--dsh-text-secondary, #888)', minWidth: '64px' } }, label),
                    React.createElement('span', null, value),
                  )
                }

                return React.createElement('div', { style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' } },
                  React.createElement('h2', { style: { margin: '0 0 4px' } }, '关于'),
                  row('版本', info ? info.version : '加载中…'),
                  row('构建日期', info ? info.buildDate : '加载中…'),
                )
              },
            )
          })
        },
      }
    },
  })
})()
