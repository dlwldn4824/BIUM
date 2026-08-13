#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/mac-arm64/Digital Diet.app"
DEST="/Applications/Digital Diet.app"
DESKTOP="$HOME/Desktop/Digital Diet.app"

if [[ ! -d "$SRC" ]]; then
  echo "Build missing: $SRC" >&2
  exit 1
fi

# Quit running instances
pkill -f "Digital Diet.app/Contents/MacOS" 2>/dev/null || true
pkill -f "디지털 다이어트.app/Contents/MacOS" 2>/dev/null || true
sleep 0.4

rm -rf "$DEST" "/Applications/디지털 다이어트.app"
cp -R "$SRC" "$DEST"
xattr -cr "$DEST"

# Keep a Desktop shortcut too
rm -rf "$DESKTOP" "$HOME/Desktop/디지털 다이어트.app"
cp -R "$SRC" "$DESKTOP"
xattr -cr "$DESKTOP"

echo "Installed: $DEST"
open "$DEST"
echo "Look for the house icon in the macOS menu bar (top-right)."
