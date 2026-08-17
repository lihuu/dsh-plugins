/**
 * dsh-client-ui-terminal — self-contained tsdown config.
 * Emits the browser client bundle at lib/client.js: a CJS closure factory
 * calling window.__ModuleLoader__.load({id, factory}). Externals are the
 * platform module table (react, cordis, slots, web-react, primitives…) resolved
 * at runtime by the loader; xterm + addons inline. xterm.css is injected as a
 * style tag by the css plugin below.
 *
 * This config intentionally avoids the repo's shared tsdown.client.ts helper
 * (deep repo-relative coupling); it replicates the essential client-config
 * logic for a standalone @local plugin.
 */

import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

// Resolve bare package css (e.g. "xterm/css/xterm.css") through node_modules
// anchored at this config file, and relative css against the importer.
const localRequire = createRequire(import.meta.url)

const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment', '@deepseek-ai/dsh-client-schema-form',
]

const CLIENT_EXTERNALS = [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client']

const ID = '@local/dsh-client-ui-terminal'

/** Inline a plain .css import as an injected <style data-plugin> tag. */
function cssInjectPlugin() {
  return {
    name: 'dsh-client-css-inject',
    resolveId(source, importer) {
      if (!source.endsWith('.css')) return null
      // Resolve a bare package css (e.g. "xterm/css/xterm.css") through
      // node_modules, else a relative specifier against its importer.
      let abs
      try {
        abs = localRequire.resolve(source)
      } catch {
        const base = importer === undefined ? process.cwd() : dirname(importer)
        abs = resolve(base, source)
      }
      // The .mjs suffix keeps the virtual id clear of tsdown's own css-guard
      // (which matches ids ending in .css); load() strips it back.
      return `\0dsh-css:${abs}.mjs`
    },
    async load(id) {
      if (!id.startsWith('\0dsh-css:')) return null
      const fs = await import('node:fs/promises')
      const css = await fs.readFile(id.slice('\0dsh-css:'.length, -'.mjs'.length), 'utf8')
      return [
        `const css = ${JSON.stringify(css)};`,
        'if (typeof document !== \'undefined\' && !document.querySelector(\'style[data-plugin-css="dsh-client-ui-terminal/xterm"]\')) {',
        '  const tag = document.createElement(\'style\');',
        '  tag.dataset.plugin = \'@local/dsh-client-ui-terminal\';',
        '  tag.dataset.pluginCss = \'dsh-client-ui-terminal/xterm\';',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        'export default {};',
      ].join('\n')
    },
  }
}

export default {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: true,
  external: CLIENT_EXTERNALS,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  noExternal: id => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [cssInjectPlugin()],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
