# llm-ollama-cloud

Ollama cloud chat-completions adapter for DeepSeek Harness, installed as an
`@local` plugin. It ships as a **single-file bundle** with exactly **one
runtime external**: `@deepseek-ai/dsh-llm` — the harness's own LLM seam
contract, which the running dsh provides (it must be the same module instance,
because error classification relies on `instanceof LlmError`).

Everything else is inlined into the bundle or hand-rolled:

- `eventsource-parser` — inlined at build time
- `@deepseek-ai/cordis` — type-only (erased at build)
- no settings section (config is static from the mount)
- no credential seam (the key comes from `process.env`)
- no telemetry id, no schema library, built-in idle watchdog

## Mount

In `~/.dsh/cordis.patch.yml`:

```yaml
- insert:
  - id: llm-ollama-cloud
    name: '@local/llm-ollama-cloud'
    config:
      apiKeyEnv: OLLAMA_CLOUD_API_KEY
      baseURL: https://ollama.com/v1
      models:
        - id: deepseek-v4-flash
          name: DeepSeek-V4-Flash
          contextWindow: 800000
        - id: deepseek-v4-pro
          name: DeepSeek-V4-Pro
          contextWindow: 800000
        - id: glm-5.2
          name: GLM-5.2
          contextWindow: 800000
```

The plugin registers the single provider route `ollama-cloud-direct` (distinct
from a pi-ai `ollama-cloud` route so both can coexist). Select it with
`provider: ollama-cloud-direct`.

## Behavior

- **Cloud only**: base URL defaults to `https://ollama.com/v1`.
- **Model naming**: a requested id without a `:cloud` suffix is sent as
  `id:cloud` (e.g. `deepseek-v4-flash` → `deepseek-v4-flash:cloud`).
- **Thinking**: harness effort maps to the Ollama wire value
  (`off` → `none`, `low` → `low`, `high` → `high`, `max` → `max`); an omitted
  effort sends nothing so the server auto-enables thinking.
- **Reasoning passback**: assistant-history reasoning is written as the
  `reasoning` field only for models whose wire id contains `deepseek`.
- **Default output cap**: 65,536 tokens.
- **Image input**: rejected with `UNSUPPORTED_CONTENT` (deferred).

## Build

```sh
npm run build     # tsc (types into lib/) + esbuild (single file into dist/)
```

`build.mjs` locates esbuild from `$ESBUILD_BIN`, `$DSH_REPO/node_modules/.bin/esbuild`,
or PATH. Example:

```sh
DSH_REPO=$HOME/git/deepseek-harness npm run build
```

Outputs:

- `dist/index.js` — the loadable bundle; its only external import is
  `@deepseek-ai/dsh-llm`
- `lib/index.d.ts` — TypeScript declarations

## Runtime dependency resolution

The single external (`@deepseek-ai/dsh-llm`) resolves through the plugin's
`node_modules` symlink to `~/.dsh/profiles/node_modules` — the SDK dependency
closure the running dsh heals from its own dependency graph on every launch
(no `npm install` needed). The loader-scope link
(`~/.dsh/profiles/node_modules/@local/llm-ollama-cloud`) makes `@local/...`
resolvable. Both machine-specific links are created by `../install.sh` in the
[dsh-plugins](https://github.com/lihuu/dsh-plugins) repo; on a fresh machine:
clone, run `./install.sh`, restart dsh-web.
