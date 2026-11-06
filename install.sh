#!/usr/bin/env bash
# One-time setup: installs the `scribblr` command for Linux / macOS.
set -euo pipefail
APP_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$APP_DIR/bin/scribblr"
mkdir -p "$HOME/.local/bin"
ln -sf "$APP_DIR/bin/scribblr" "$HOME/.local/bin/scribblr"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
       [ -f "$rc" ] && ! grep -q 'scribblr-path' "$rc" && \
         printf '\nexport PATH="$HOME/.local/bin:$PATH" # scribblr-path\n' >>"$rc"
     done
     echo "[scribblr] Open a new terminal (or run: export PATH=\"\$HOME/.local/bin:\$PATH\")" ;;
esac
"$APP_DIR/bin/scribblr" --prepare
echo "[scribblr] Installed. Run: scribblr"
