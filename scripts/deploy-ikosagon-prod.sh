#!/usr/bin/env bash
# Production deploy of ikosagon.com from a clean clone of one commit, without ever pulling env vars to disk.
#
# Why: `vercel link` and `vercel env pull` (and `vercel dev`) can write .env.local with production secrets. This
# script never runs them. It picks the project by id instead: the CLI reads VERCEL_ORG_ID and VERCEL_PROJECT_ID from the
# environment, so no link step and no .vercel/ folder are needed. Production env vars stay on Vercel and are applied
# by Vercel's own build. The clone is deleted afterwards.
#
# Usage:  bash scripts/deploy-ikosagon-prod.sh <full-commit-sha>      (DRY_RUN=1 to check everything but the deploy)
# Needs:  a logged-in Vercel CLI (`vercel whoami`). Free on Hobby: one production build.
# The ids are not secrets; override them with the env vars of the same name if the project ever moves.
set -euo pipefail

SHA="${1:?usage: bash scripts/deploy-ikosagon-prod.sh <full-commit-sha>}"
REPO="${IKOSAGON_REPO:-https://github.com/shawncres/ikosagon.git}"
export VERCEL_ORG_ID="${VERCEL_ORG_ID:-team_CX0zMP5T1vlNgZkliw8Q5AGl}"        # Shawn Cooper's projects
export VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-prj_v3hZaXzBLA9WX874VYIIUVoiA4Um}" # ikosagon
VERCEL="${VERCEL_BIN:-vercel}"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Give the full 40-character commit sha." >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ikosagon-deploy.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

git clone --quiet --no-tags "$REPO" "$WORK/src"
cd "$WORK/src"
git -c advice.detachedHead=false checkout --quiet "$SHA"
[ "$(git rev-parse HEAD)" = "$SHA" ] || { echo "Checkout is not $SHA." >&2; exit 1; }

# A clean clone has no env files. Refuse to go on if one appears anywhere (nothing secret is ever uploaded or kept).
if find . -name ".env*" -not -name ".env.example" -not -path "./node_modules/*" | grep -q .; then
  echo "Found an .env file in the deploy tree; refusing to deploy." >&2
  exit 1
fi

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "DRY_RUN: would run: $VERCEL deploy --prod --yes (org $VERCEL_ORG_ID, project $VERCEL_PROJECT_ID) in a clean clone of $SHA"
else
  "$VERCEL" deploy --prod --yes
fi

# Belt and braces: the deploy must not have written env files.
if find . -name ".env*" -not -name ".env.example" -not -path "./node_modules/*" | grep -q .; then
  echo "An .env file appeared during deploy; it is deleted with the clone." >&2
fi
[ "${DRY_RUN:-}" = "1" ] && echo "Dry run done; nothing deployed." || echo "Deployed $SHA to production."
