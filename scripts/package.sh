#!/usr/bin/env bash
# Build dist/dual-subtitles-translator-<version>.zip: what the Chrome Web Store and Edge Add-ons accept.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
mkdir -p dist
out="dist/dual-subtitles-translator-${version}.zip"
rm -f "$out"
zip -qr "$out" manifest.json _locales background.js capture.js settings.js content.js subtitles.css popup.html popup.js vocabulary.html vocabulary.js icons/*.png LICENSE
echo "$out"
