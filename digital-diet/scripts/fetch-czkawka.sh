#!/usr/bin/env bash
# Download macOS arm64 czkawka_cli into vendor/bin (MIT).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/vendor/bin/czkawka_cli"
VER="${CZKAWKA_VERSION:-12.0.1}"
URL="https://github.com/qarmin/czkawka/releases/download/${VER}/mac_czkawka_cli_arm64"

mkdir -p "$(dirname "$OUT")"
echo "Downloading $URL"
curl -L --fail -o "$OUT" "$URL"
chmod +x "$OUT"
xattr -dr com.apple.quarantine "$OUT" 2>/dev/null || true
"$OUT" --version
echo "Installed → $OUT"
