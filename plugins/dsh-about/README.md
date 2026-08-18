# dsh-about

"About" settings section for DeepSeek Harness web GUI. Registers a "关于" page in the settings panel that shows the running version and build date, read live from the host — zero main-repo changes.

## What it does

- **Host half** (`src/index.ts`): registers the `aboutInfo` Typert Remote service. `aboutInfo/get` reads the running version from `apps/cli/package.json` and the build date from the built CLI's mtime (`apps/cli/lib/bin.js`).
- **Browser half** (`lib/client.js`): registers a "关于" page into the `settings.section` list slot and resolves the data through `connection.rpc.call('/api', 'aboutInfo/get')`.

## Install

From the `dsh-plugins` repo root:

```sh
./install.sh
```

This symlinks the plugin into `$DSH_HOME/plugins/dsh-about` and adds its row to `$DSH_HOME/cordis.patch.yml`. Then restart dsh-web:

```sh
launchctl kickstart -k gui/501/com.lihu.dsh-web
```

## Build

The host half is TypeScript; rebuild it after editing `src/index.ts`:

```sh
cd plugins/dsh-about && ./node_modules/typescript/bin/tsc -p tsconfig.json
```

The browser half (`lib/client.js`) is hand-written plain JS and needs no build.

## Notes

- The repo path is hardcoded to `/Users/lihu/git/deepseek-harness` in `src/index.ts`; adjust it if your checkout lives elsewhere.
- Version and build date are read live on each page open, so they always reflect the currently running build.
