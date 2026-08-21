#!/bin/bash
# dsh-plugins — one-shot installer for every plugin in this monorepo.
#
# For each plugin under ./plugins this script:
#   1. symlinks it into $DSH_HOME/plugins/<name> (source edits take effect
#      immediately through the link);
#   2. wires the two runtime resolution links every @local plugin needs:
#        - $DSH_HOME/profiles/node_modules/@local/<name>  → the @local scope the
#          dsh loader resolves `@local/<name>` through;
#        - <plugin>/node_modules → $DSH_HOME/profiles/node_modules, the module
#          fallback the running dsh heals from its own SDK closure, so the
#          plugin's imports of @deepseek-ai/* and eventsource-parser resolve
#          without any npm install. Both links are machine-local and gitignored.
#   3. guarantees the matching rows live inside the first '- insert:' block of
#      the patch file (idempotent).
#
# Patch target:
#   default            → $DSH_HOME/cordis.patch.yml (home-level, ALL profiles)
#   --profile <name>   → $DSH_HOME/profiles/<name>/cordis.patch.yml (that
#                        profile only). The source links in steps 1-2 are
#                        shared machine infrastructure either way.
#
# After running, restart dsh-web for host-half plugins to take effect.
#
# Usage: ./install.sh [--profile <name>]

set -eu

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PLUGINS_DIR="$DSH_HOME/plugins"
PROFILE_MODULES="$DSH_HOME/profiles/node_modules"
HERE="$(cd "$(dirname "$0")" && pwd)"

# ---- parse args: --profile <name> selects the patch target ----
PROFILE_NAME=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      [ "$#" -ge 2 ] || { echo "error: --profile needs a name" >&2; exit 2; }
      PROFILE_NAME="$2"
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1 (usage: ./install.sh [--profile <name>])" >&2
      exit 2
      ;;
  esac
done

if [ -n "$PROFILE_NAME" ]; then
  PATCH_FILE="$DSH_HOME/profiles/$PROFILE_NAME/cordis.patch.yml"
  mkdir -p "$(dirname "$PATCH_FILE")"
  if [ ! -e "$PATCH_FILE" ]; then
    printf '# Your patch layer for this dsh profile, applied after every bundle layer.\n[]\n' > "$PATCH_FILE"
    echo "created profile patch: $PATCH_FILE"
  fi
  echo "patch target: profile '$PROFILE_NAME' ($PATCH_FILE)"
else
  PATCH_FILE="$DSH_HOME/cordis.patch.yml"
  echo "patch target: global (home-level, all profiles)"
fi

mkdir -p "$PLUGINS_DIR"

# ---- symlink each plugin (source edits take effect immediately) ----
link_plugin () {
  local name="$1"
  local src="$HERE/plugins/$name"
  local dst="$PLUGINS_DIR/$name"
  if [ ! -e "$src" ]; then
    echo "skip: $name (missing $src)"
    return
  fi
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    echo "warn: $dst is a real directory; leaving it untouched"
    return
  fi
  ln -sfn "$src" "$dst"
  echo "linked: $name"
}

# ---- wire runtime resolution links (loader scope + dependency fallback) ----
wire_runtime () {
  local name="$1"
  local src="$HERE/plugins/$name"
  if [ ! -e "$src" ]; then
    return
  fi
  mkdir -p "$PROFILE_MODULES/@local"
  ln -sfn "$PLUGINS_DIR/$name" "$PROFILE_MODULES/@local/$name"
  ln -sfn "$PROFILE_MODULES" "$src/node_modules"
  echo "wired: $name (loader scope + node_modules fallback)"
}

link_plugin dsh-file-ref
link_plugin dsh-lazy-skill
link_plugin dsh-tavily-search
link_plugin dsh-about
link_plugin llm-ollama-cloud
link_plugin dsh-client-usage-stats
link_plugin dsh-task-notify

wire_runtime dsh-file-ref
wire_runtime dsh-lazy-skill
wire_runtime dsh-tavily-search
wire_runtime dsh-about
wire_runtime llm-ollama-cloud
wire_runtime dsh-client-usage-stats
wire_runtime dsh-task-notify

# ---- ensure patch rows (idempotent, YAML-indent-safe) ----
DSH_PLUGINS_HOME="$DSH_HOME" PLUGINS_DIR="$PLUGINS_DIR" PATCH_FILE="$PATCH_FILE" python3 <<'PY'
import os, re

home = os.environ["DSH_PLUGINS_HOME"]
plugins_dir = os.environ["PLUGINS_DIR"]
patch_file = os.environ["PATCH_FILE"]

# rows to guarantee, in order: (row_id, yaml body lines, 1-space offset)
rows = [
    ("dsh-lazy-skill", [
        "  - id: dsh-lazy-skill",
        "    name: '@local/dsh-lazy-skill'",
        "    config:",
        f"      boxesDir: {plugins_dir}/dsh-lazy-skill/boxes",
    ]),
    ("dsh-file-ref", [
        "  - id: dsh-file-ref",
        "    name: '@local/dsh-file-ref'",
    ]),
    ("dsh-tavily-search", [
        "  - id: dsh-tavily-search",
        "    name: '@local/dsh-tavily-search'",
    ]),
    ("dsh-about", [
        "  - id: dsh-about",
        "    name: '@local/dsh-about'",
    ]),
    ("llm-ollama-cloud", [
        "  - id: llm-ollama-cloud",
        "    name: '@local/llm-ollama-cloud'",
        "    config:",
        "      apiKeyEnv: OLLAMA_CLOUD_API_KEY",
        "      baseURL: https://ollama.com/v1",
        "      models:",
        "        - id: deepseek-v4-flash",
        "          name: DeepSeek-V4-Flash",
        "          contextWindow: 800000",
        "        - id: deepseek-v4-pro",
        "          name: DeepSeek-V4-Pro",
        "          contextWindow: 800000",
        "        - id: glm-5.2",
        "          name: GLM-5.2",
        "          contextWindow: 800000",
    ]),
    ("dsh-client-usage-stats", [
        "  - id: dsh-client-usage-stats",
        "    name: '@local/dsh-client-usage-stats'",
    ]),
    ("dsh-task-notify", [
        "  - id: dsh-task-notify",
        "    name: '@local/dsh-task-notify'",
    ]),
]

text = ""
if os.path.exists(patch_file):
    with open(patch_file) as f:
        text = f.read()

# existing top-level '- insert:' list? (match lines like '- insert:' with any indent)
has_insert = bool(re.search(r"^[ \t]*-[ \t]*insert\s*:[ \t]*$", text, re.M))

for row_id, body in rows:
    if re.search(rf"^[ \t]*-?[ \t]*id: {re.escape(row_id)}\s*$", text, re.M):
        print(f"patch ok: {row_id} already present")
        continue

    row_block = "\n".join(body)

    if not has_insert:
        # no insert block yet — replace the empty-array template (`[]`) if
        # present, otherwise append a top-level one. Appending after `[]` would
        # produce two root nodes in one YAML document, which the loader rejects.
        block = f"# Managed by dsh-plugins install.sh\n- insert:\n{row_block}\n"
        empty_array = re.search(r"^[ \t]*\[\][ \t]*$", text, re.M)
        if empty_array is not None:
            text = text[:empty_array.start()] + block + text[empty_array.end():]
        else:
            sep = "" if text == "" else "\n\n"
            text += f"{sep}{block}"
        has_insert = True
        print(f"patch added (new block): {row_id}")
        continue

    # insert into the first top-level '- insert:' block, at its END, matching
    # the indent of the block's existing entries. Inserting at the head with a
    # hardcoded 2-space indent corrupted files whose entries used a different
    # indent (bad indentation of a sequence entry), so the block's own indent
    # is detected and reused.
    lines = text.splitlines()
    insert_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^[ \t]*-[ \t]*insert\s*:[ \t]*$", line):
            insert_idx = i
            break
    if insert_idx is None:
        text += f"\n- insert:\n{row_block}\n"
    else:
        # entry indent = leading whitespace of the first '- ' line after the header
        indent = "  "
        for line in lines[insert_idx + 1:]:
            m = re.match(r"^([ \t]*)- ", line)
            if m:
                indent = m.group(1)
                break
        # re-indent the row block from its 2-space baseline to the detected indent
        def reindent(block: str, base: str) -> list[str]:
            out = []
            for line in block.splitlines():
                stripped = line.lstrip(" ")
                leading = len(line) - len(stripped)
                out.append(" " * (len(base) + max(0, leading - 2)) + stripped)
            return out
        # block end = last line indented deeper than the header (or the header itself)
        block_end = insert_idx
        for j in range(insert_idx + 1, len(lines)):
            if lines[j].strip() == "" or lines[j][0] in " \t":
                block_end = j
            else:
                break
        lines[block_end + 1:block_end + 1] = reindent(row_block, indent)
        text = "\n".join(lines)
    print(f"patch added: {row_id}")

with open(patch_file, "w") as f:
    f.write(text)
    if not text.endswith("\n"):
        f.write("\n")
PY

echo ""
echo "Done."
echo "Restart dsh-web for host-half changes:"
echo "  launchctl kickstart -k gui/501/com.lihu.dsh-web"
