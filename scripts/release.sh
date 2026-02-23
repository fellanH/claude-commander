#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/release.sh               # bump patch, build on GitHub Actions (default)
#   ./scripts/release.sh --local       # bump patch, build locally and upload
#   ./scripts/release.sh minor         # bump minor, build on GitHub Actions
#   ./scripts/release.sh minor --local # bump minor, build locally
#   ./scripts/release.sh 1.2.3 --local # set exact version, build locally

# ── Parse args ───────────────────────────────────────────────────────────────
BUMP="patch"
LOCAL=false

for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=true ;;
    major|minor|patch) BUMP="$arg" ;;
    [0-9]*.[0-9]*.[0-9]*) BUMP="$arg" ;;
    *)
      echo "Error: unknown argument '$arg'. Use: major | minor | patch | x.y.z | --local"
      exit 1
      ;;
  esac
done

# ── Resolve current version from tauri.conf.json ─────────────────────────────
CURRENT=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)

case "$BUMP" in
  major) NEXT="$((MAJOR + 1)).0.0" ;;
  minor) NEXT="${MAJOR}.$((MINOR + 1)).0" ;;
  patch) NEXT="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  [0-9]*.[0-9]*.[0-9]*) NEXT="$BUMP" ;;
esac

echo "Releasing $CURRENT → $NEXT (local=$LOCAL)"

# ── Guard: ensure working tree is clean ──────────────────────────────────────
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: working tree has uncommitted changes. Commit or stash them first."
  git status --short
  exit 1
fi

# ── Guard: ensure we're on main ──────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: releases must be cut from main (currently on '$BRANCH')."
  exit 1
fi

# ── Guard: ensure tag doesn't already exist ──────────────────────────────────
if git rev-parse "v${NEXT}" &>/dev/null; then
  echo "Error: tag v${NEXT} already exists."
  exit 1
fi

# ── Bump version in all three files ──────────────────────────────────────────
sed -i '' "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEXT}\"/" src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEXT}\"/" package.json
sed -i '' "s/^version = \"${CURRENT}\"/version = \"${NEXT}\"/" src-tauri/Cargo.toml

# Update Cargo.lock
cargo update --manifest-path src-tauri/Cargo.toml --package claude-commander 2>/dev/null

echo "  ✓ Bumped package.json, tauri.conf.json, Cargo.toml, Cargo.lock"

# ── Commit, tag, push ────────────────────────────────────────────────────────
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to ${NEXT}"
git push origin main

git tag "v${NEXT}"
git push origin "v${NEXT}"

# ── Local build path ─────────────────────────────────────────────────────────
if [[ "$LOCAL" == false ]]; then
  echo ""
  echo "  Released v${NEXT} — GitHub Actions build triggered."
  echo "  https://github.com/fellanH/claude-commander/actions"
  exit 0
fi

echo ""
echo "  Building universal macOS binary locally…"

# Ensure both arch targets are present
rustup target add aarch64-apple-darwin x86_64-apple-darwin 2>/dev/null

npm install
TAURI_SIGNING_PRIVATE_KEY_PATH="${HOME}/.tauri/claude-commander.key" \
  npm run tauri build -- --target universal-apple-darwin

# ── Locate artifacts ─────────────────────────────────────────────────────────
BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
DMG=$(ls "${BUNDLE_DIR}/dmg/"*.dmg 2>/dev/null | head -1)
UPDATER_GZ=$(ls "${BUNDLE_DIR}/macos/"*.app.tar.gz 2>/dev/null | head -1)
UPDATER_SIG="${UPDATER_GZ}.sig"

if [[ -z "$DMG" || -z "$UPDATER_GZ" || ! -f "$UPDATER_SIG" ]]; then
  echo "Error: expected build artifacts not found in ${BUNDLE_DIR}"
  ls -R "${BUNDLE_DIR}" 2>/dev/null || true
  exit 1
fi

echo "  ✓ Build complete"
echo "    DMG:     $DMG"
echo "    Updater: $UPDATER_GZ"

# ── Generate latest.json for tauri-plugin-updater ────────────────────────────
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
GZ_FILENAME=$(basename "$UPDATER_GZ")
SIG_CONTENT=$(cat "$UPDATER_SIG")
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${NEXT}/${GZ_FILENAME}"

cat > /tmp/latest.json <<EOF
{
  "version": "v${NEXT}",
  "notes": "",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "darwin-universal": {
      "signature": "${SIG_CONTENT}",
      "url": "${DOWNLOAD_URL}"
    }
  }
}
EOF

echo "  ✓ Generated latest.json"

# ── Create GitHub release and upload ─────────────────────────────────────────
echo "  Uploading to GitHub release v${NEXT}…"

gh release create "v${NEXT}" \
  --title "Claude Commander v${NEXT}" \
  --notes "" \
  "$DMG" \
  "$UPDATER_GZ" \
  "$UPDATER_SIG" \
  /tmp/latest.json

echo ""
echo "  Released v${NEXT} locally → GitHub release created."
echo "  https://github.com/${REPO}/releases/tag/v${NEXT}"

rm /tmp/latest.json
