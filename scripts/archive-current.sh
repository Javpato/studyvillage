#!/bin/sh
set -eu
# Run on each target OS; there are no release ZIP/tar folders to recompress.
case "$(uname -s)" in
  Linux) node scripts/build-installer.mjs linux ;;
  Darwin) node scripts/build-installer.mjs macos ;;
  *) echo "Use npm run windows:build on Windows." >&2; exit 1 ;;
esac
