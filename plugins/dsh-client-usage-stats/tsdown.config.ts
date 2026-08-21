/**
 * dsh-client-usage-stats — self-contained tsdown config.
 * Emits the browser client bundle at lib/client.js: a CJS closure factory
 * calling window.__ModuleLoader__.load({id, factory}). Externals are the
 * platform module table (react, cordis, slots, web-react, primitives…) resolved
 * at runtime by the loader; this plugin imports only types from the runtime,
 * so no extra externals are needed.
 *
 * Mirrors the sibling dsh-client-ui-terminal config for standalone @local
 * plugins; intentionally avoids the repo's shared tsdown.client.ts helper.
 */

const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment', '@deepseek-ai/dsh-client-schema-form',
]

const CLIENT_EXTERNALS = [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client']

const ID = '@local/dsh-client-usage-stats'

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
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
