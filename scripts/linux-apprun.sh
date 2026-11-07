#!/bin/sh
set -eu
studyvillage_dir=${APPDIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}
export LD_LIBRARY_PATH="$studyvillage_dir/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# Reuse a correctly installed helper when user namespaces are restricted.
# Never turn off Chromium's sandbox to work around missing host support.
if [ -z "${CHROME_DEVEL_SANDBOX:-}" ] && [ -u /opt/google/chrome/chrome-sandbox ]; then
  export CHROME_DEVEL_SANDBOX=/opt/google/chrome/chrome-sandbox
fi
exec "$studyvillage_dir/studyvillage" "$@"
