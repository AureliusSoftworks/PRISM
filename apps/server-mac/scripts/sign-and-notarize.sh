#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:?Usage: sign-and-notarize.sh <Prism Server.app> <version>}"
VERSION="${2:?Usage: sign-and-notarize.sh <Prism Server.app> <version>}"
IDENTITY="${DEVELOPER_ID_APPLICATION:?Set DEVELOPER_ID_APPLICATION, e.g. 'Developer ID Application: Name (TEAMID)'}"
APPLE_ID="${APPLE_NOTARYTOOL_APPLE_ID:?Set APPLE_NOTARYTOOL_APPLE_ID}"
TEAM_ID="${APPLE_TEAM_ID:?Set APPLE_TEAM_ID}"
PASSWORD="${APPLE_NOTARYTOOL_APP_SPECIFIC_PASSWORD:?Set APPLE_NOTARYTOOL_APP_SPECIFIC_PASSWORD}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/../dist"
DMG_PATH="${DIST_DIR}/Prism-Server-v${VERSION}.dmg"
STAGING_DIR="${DIST_DIR}/dmg-staging"

rm -rf "${DIST_DIR}"
mkdir -p "${STAGING_DIR}"

echo "Signing nested executable content..."
find "${APP_PATH}/Contents/Resources" -type f -perm -111 -print0 | while IFS= read -r -d '' executable; do
  codesign --force --timestamp --options runtime --sign "${IDENTITY}" "${executable}"
done

echo "Signing app bundle..."
codesign --force --deep --timestamp --options runtime --sign "${IDENTITY}" "${APP_PATH}"
codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

ditto "${APP_PATH}" "${STAGING_DIR}/Prism Server.app"
ln -s /Applications "${STAGING_DIR}/Applications"

echo "Creating DMG..."
hdiutil create \
  -volname "Prism Server ${VERSION}" \
  -srcfolder "${STAGING_DIR}" \
  -ov \
  -format UDZO \
  "${DMG_PATH}"

echo "Signing DMG..."
codesign --force --timestamp --sign "${IDENTITY}" "${DMG_PATH}"

echo "Submitting DMG for notarization..."
xcrun notarytool submit "${DMG_PATH}" \
  --apple-id "${APPLE_ID}" \
  --team-id "${TEAM_ID}" \
  --password "${PASSWORD}" \
  --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "${DMG_PATH}"

echo "Signed and notarized DMG: ${DMG_PATH}"
