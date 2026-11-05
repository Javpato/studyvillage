#!/bin/sh
set -eu
# Current archives are replaced atomically; previous releases are never accumulated.
rm -f deliverables/windows-current/.StudyVillage-windows-x64.zip deliverables/macos-current/.StudyVillage-macos-intel.zip deliverables/macos-current/.StudyVillage-macos-arm64.zip
tar -C deliverables/linux-current -czf deliverables/linux-current/.StudyVillage-linux-x64.tar.gz StudyVillage
mv deliverables/linux-current/.StudyVillage-linux-x64.tar.gz deliverables/linux-current/StudyVillage-linux-x64.tar.gz
(cd deliverables/windows-current && zip -q -r .StudyVillage-windows-x64.zip StudyVillage-win32-x64)
mv deliverables/windows-current/.StudyVillage-windows-x64.zip deliverables/windows-current/StudyVillage-windows-x64.zip
(cd deliverables/macos-current && zip -q -r -y .StudyVillage-macos-intel.zip StudyVillage-darwin-x64)
mv deliverables/macos-current/.StudyVillage-macos-intel.zip deliverables/macos-current/StudyVillage-macos-intel.zip
(cd deliverables/macos-current && zip -q -r -y .StudyVillage-macos-arm64.zip StudyVillage-darwin-arm64)
mv deliverables/macos-current/.StudyVillage-macos-arm64.zip deliverables/macos-current/StudyVillage-macos-arm64.zip
