/**
 * dsh-file-ref — independent `@file` plugin (BROWSER half).
 *
 * Plain-JS client bundle served as `/plugins/@local/dsh-file-ref/client.js`.
 * Registers the `@` file source on the composer trigger pipeline and resolves
 * candidates through the host's runtime Typert Remote endpoint
 * `fileRefFinder/find` via the generic `/api` RPC channel — no generated
 * artifacts, no main-repo changes.
 *
 * To avoid the pending-flash on every keystroke (each refinement resets the
 * group to pending in the shared trigger reducer), candidates resolve a
 * refined query SYNCHRONOUSLY from a settled cache filtered client-side, and
 * refresh the cache in the background. The first `@` still hits the RPC (one
 * initial settle), but every subsequent keystroke settles immediately.
 */
(function () {
  // The registration id MUST equal the boot graph row id (loader entry name
  // == package name). The host composes rows from the cordis patch `name`.
  const PLUGIN_ID = '@local/dsh-file-ref'

  /** When true the pick inserts the absolute path; else the workspace-relative path. */
  var INSERT_ABSOLUTE = true

  window.__ModuleLoader__.load({
    id: PLUGIN_ID,
    factory: function (require) {
      // ---- helpers (mirror the host's basename-over-path scoring) ----

      /** Client-side refinement: a query that extends the last fetched one can be answered from the settled cache. */
      function isRefinement(query, queriedFor) {
        return queriedFor.length > 0 && query.startsWith(queriedFor)
      }

      /** Filter the settled cache by a refined query, mirroring host scoring. */
      function filterCached(cands, query) {
        var ql = query.toLowerCase()
        var scored = cands
          .map(function (c) {
            var nlower = c.name.toLowerCase()
            var rlower = c.relPath.toLowerCase()
            var score = nlower.includes(ql) ? 100 : rlower.includes(ql) ? 60 : -1
            return { c: c, score: score }
          })
          .filter(function (x) { return x.score >= 0 })
          .sort(function (a, b) { return b.score - a.score })
        return scored.map(function (x) { return x.c })
      }

      /** Candidate menu row projection of one file. */
      function toRows(cands, insertAbsolute) {
        return cands.map(function (c) {
          return {
            name: c.relPath,
            description: c.name,
            hint: insertAbsolute ? c.path : c.relPath,
          }
        })
      }

      // ---- plugin body ----

      return {
        inject: ['inputTriggers', 'connection'],
        apply: function (ctx) {
          var inputTriggers = ctx.get('inputTriggers')
          var connection = ctx.get('connection')
          if (inputTriggers === undefined || connection === undefined) return
          var caches = new Map()

          var fetchRemote = function (sessionId, query) {
            try {
              // Generic /api channel to the host Typert Gateway: the same
              // transport generated Remote namespaces ride, addressed as
              // <namespace>/<method> with a single plain-object args field.
              return connection.rpc.call('/api', 'fileRefFinder/find', { args: { sessionId: sessionId, query: query } })
                .then(function (result) {
                  if (!result.ok) return []
                  var candidates = result.value
                  caches.set(sessionId, { settled: candidates, queriedFor: query })
                  return candidates
                })
                .catch(function () { return [] })
            } catch (e) {
              return Promise.resolve([])
            }
          }

          var source = {
            trigger: '@',
            name: 'file',
            order: 30,
            candidates: function (session, ctx2) {
              var sid = session.sessionId
              var q = (ctx2 && ctx2.query) || ''
              // Fast path: a refined query is answered from the settled cache
              // (no network, no pending flash); the cache refresh fires
              // behind it. The menu group is set to pending by the shared
              // trigger reducer on every hit, but resolving with cached rows
              // settles it in the same microtask — no visible blink.
              var cached = caches.get(sid)
              if (cached !== undefined && isRefinement(q, cached.queriedFor)) {
                fetchRemote(sid, q)
                return Promise.resolve(toRows(filterCached(cached.settled, q), INSERT_ABSOLUTE))
              }
              // First query (or a non-refinement jump): hit the RPC, awaiting it.
              return fetchRemote(sid, q).then(function (cands) {
                return toRows(cands, INSERT_ABSOLUTE)
              })
            },
            // Hot name roll for plain-text reference decoration: 'read' in the
            // lexicon means a draft token `@read` (as inserted on pick) renders
            // highlighted in the composer — the same scan-derived decoration the
            // skill/subagent sources use. 'read' is a fixed marker; it never
            // waits on the file search and is always settled.
            lexicon: function () {
              return ['read']
            },
            onPick: function (pick) {
              var hint = pick && pick.candidate && pick.candidate.hint
              if (!hint) return undefined
              // Insert '@read:' + the file path as plain text (trailing space
              // closes the token). The '@read' marker tells the model this text
              // is a file reference it should read, and the lexicon lets the
              // composer highlight the leading '@read' token.
              return { text: '@read:' + hint + ' ' }
            },
          }

          ctx.effect(function () {
            return inputTriggers.registerSource(source)
          }, 'dsh-file-ref: @ source')
        },
      }
    },
  })
})()