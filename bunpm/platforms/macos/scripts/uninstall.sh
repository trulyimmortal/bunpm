#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != '--no-path' ]; }; then
  echo 'bunpm: uninstall: usage: uninstall.sh [--no-path]' >&2; exit 1
fi
INSTALL_DIR="$HOME/.bunpm"
if [ "${1:-}" != '--no-path' ]; then
  for profile in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.bashrc"; do
    if [ ! -f "$profile" ]; then continue; fi
    TMP_FILE="$(mktemp)"
    trap 'rm -f "$TMP_FILE"' EXIT
    # Remove only our marked exact line, including the legacy absolute spelling.
    # Drop one empty line immediately preceding the marker if present.
    BUNPM_OLD="export PATH=\"$INSTALL_DIR/bin:\$PATH\"" awk '
      $0 == "# Added by bunpm installer" {
        if (marker) { if (has_prev) print prev; print marker; has_prev=0 }
        marker = $0
        skip_prev = (has_prev && prev == "")
        next
      }
      marker {
        if ($0 != "export PATH=\"$HOME/.bunpm/bin:$PATH\"" && $0 != ENVIRON["BUNPM_OLD"]) {
          if (has_prev) print prev
          print marker
          print
          has_prev = 0
        } else if (skip_prev) {
          has_prev = 0
        }
        marker = ""
        skip_prev = 0
        next
      }
      {
        if (has_prev) { if (!skip_prev) print prev; skip_prev = 0 }
        prev = $0
        has_prev = 1
      }
      END {
        if (has_prev && (marker || !skip_prev)) print prev
        if (marker) print marker
      }
    ' "$profile" > "$TMP_FILE"
    cat "$TMP_FILE" > "$profile"
    rm -f "$TMP_FILE"
    trap - EXIT
  done
fi
rm -rf "$INSTALL_DIR"
echo 'bunpm removed. Restart your terminal; original managers and Bun remain installed.'
