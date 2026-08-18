#!/bin/bash
# dsh-plugins — one-shot installer for every plugin in this monorepo.
#
# Symlinks each plugin under ./plugins into $DSH_HOME/plugins and guarantees
# the matching rows live inside the first '- insert:' block of
# $DSH_HOME/cordis.patch.yml (idempotent). After running, restart dsh-web for
# host-half plugins to take effect.
#
# Usage: ./install.sh

set -eu

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PLUGINS_DIR="$DSH_HOME/plugins"
PATCH_FILE="$DSH_HOME/cordis.patch.yml"
HERE="$(cd "$(dirname "$0")" && pwd)"

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

link_plugin dsh-file-ref
link_plugin dsh-lazy-skill
link_plugin dsh-tavily-search
link_plugin dsh-about

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
        # no insert block yet — append a top-level one
        sep = "" if text == "" else "\n\n"
        text += f"{sep}# Managed by dsh-plugins install.sh\n- insert:\n{row_block}\n"
        has_insert = True
        print(f"patch added (new block): {row_id}")
        continue

    # insert into the first top-level '- insert:' block, before its terminator.
    # Splice after the header line: find index of the '- insert:' regex.
    lines = text.splitlines()
    insert_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^[ \t]*-[ \t]*insert\s*:[ \t]*$", line):
            insert_idx = i
            break
    if insert_idx is None:
        text += f"\n- insert:\n{row_block}\n"
    else:
        # insert after the header line
        lines[insert_idx + 1:insert_idx + 1] = row_block.splitlines()
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
