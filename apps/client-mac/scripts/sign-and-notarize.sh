#!/usr/bin/env bash
#
# apps/client-mac/scripts/sign-and-notarize.sh
#
# Sign, notarize, and DMG-package the Prism.app Mac client for distribution
# via GitHub Releases under the indie distribution model.
# See docs/distribution-model.md and docs/prism-client-app.md.
#
# DRIFT NOTICE
# ------------
# This script is a near-copy of:
#   apps/server-mac/scripts/sign-and-notarize.sh
#
# The cryptographic and signing logic is intentionally kept identical so a
# security fix in one script can be propagated to the other by simple diff.
# Only the following pieces differ between the two scripts:
#
#   * App bundle name        : Prism.app                vs. Prism Server.app
#   * DMG filename           : Prism-v${V}.dmg          vs. Prism-Server-v${V}.dmg
#   * DMG volume name        : "Prism ${V}"             vs. "Prism Server ${V}"
#   * Output dist directory  : apps/client-mac/dist     vs. apps/server-mac/dist
#   * Notarization handling  : this script captures the submission ID,
#                              runs `xcrun notarytool log` on failure, and
#                              applies a 30-minute wait timeout. The server
#                              script does not yet do this; the diagnostics
#                              should be back-ported when the two scripts
#                              are unified into a single shared
#                              scripts/sign-and-notarize-app.sh.
#   * Post-staple validation : this script runs `xcrun stapler validate`
#                              after stapling. The server script does not.
#
# When you change anything else, update both scripts in lockstep.

set -euo pipefail

APP_PATH="${1:?Usage: sign-and-notarize.sh <Prism.app> <version>}"
VERSION="${2:?Usage: sign-and-notarize.sh <Prism.app> <version>}"
IDENTITY="${DEVELOPER_ID_APPLICATION:?Set DEVELOPER_ID_APPLICATION, e.g. 'Developer ID Application: Name (TEAMID)'}"
APPLE_ID="${APPLE_NOTARYTOOL_APPLE_ID:?Set APPLE_NOTARYTOOL_APPLE_ID}"
TEAM_ID="${APPLE_TEAM_ID:?Set APPLE_TEAM_ID}"
PASSWORD="${APPLE_NOTARYTOOL_APP_SPECIFIC_PASSWORD:?Set APPLE_NOTARYTOOL_APP_SPECIFIC_PASSWORD}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/../dist"
DMG_PATH="${DIST_DIR}/Prism-v${VERSION}.dmg"
STAGING_DIR="${DIST_DIR}/dmg-staging"
NOTARY_LOG="${DIST_DIR}/notarytool-submit.log"

rm -rf "${DIST_DIR}"
mkdir -p "${STAGING_DIR}"

echo "Signing nested executable content..."
find "${APP_PATH}/Contents/Resources" -type f -perm -111 -print0 | while IFS= read -r -d '' executable; do
  codesign --force --timestamp --options runtime --sign "${IDENTITY}" "${executable}"
done

echo "Signing app bundle..."
codesign --force --deep --timestamp --options runtime --sign "${IDENTITY}" "${APP_PATH}"
codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

ditto "${APP_PATH}" "${STAGING_DIR}/Prism.app"
ln -s /Applications "${STAGING_DIR}/Applications"

echo "Creating DMG..."
hdiutil create \
  -volname "Prism ${VERSION}" \
  -srcfolder "${STAGING_DIR}" \
  -ov \
  -format UDZO \
  "${DMG_PATH}"

echo "Signing DMG..."
codesign --force --timestamp --sign "${IDENTITY}" "${DMG_PATH}"

echo "Submitting DMG for notarization (wait timeout: 30m)..."
set +e
xcrun notarytool submit "${DMG_PATH}" \
  --apple-id "${APPLE_ID}" \
  --team-id "${TEAM_ID}" \
  --password "${PASSWORD}" \
  --wait \
  --timeout 30m \
  | tee "${NOTARY_LOG}"
NOTARY_EXIT="${PIPESTATUS[0]}"
set -e

# Pull the submission ID and final status from the human-readable text output.
SUBMISSION_ID="$(grep -E '^[[:space:]]+id:' "${NOTARY_LOG}" | tail -n 1 | awk '{print $2}')"
NOTARY_STATUS="$(grep -E '^[[:space:]]+status:' "${NOTARY_LOG}" | tail -n 1 | awk '{print $2}')"

if [ "${NOTARY_EXIT}" -ne 0 ] || [ "${NOTARY_STATUS}" != "Accepted" ]; then
  echo "Notarization did not succeed."
  echo "  exit code: ${NOTARY_EXIT}"
  echo "  status:    ${NOTARY_STATUS:-unknown}"
  echo "  id:        ${SUBMISSION_ID:-none}"
  if [ -n "${SUBMISSION_ID:-}" ]; then
    echo "Fetching notarytool diagnostic log for submission ${SUBMISSION_ID}..."
    xcrun notarytool log "${SUBMISSION_ID}" \
      --apple-id "${APPLE_ID}" \
      --team-id "${TEAM_ID}" \
      --password "${PASSWORD}" || true
  fi
  exit 1
fi

echo "Stapling notarization ticket..."
xcrun stapler staple "${DMG_PATH}"
xcrun stapler validate "${DMG_PATH}"

echo "Signed and notarized DMG: ${DMG_PATH}"
