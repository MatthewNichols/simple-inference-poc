#!/usr/bin/env bash
# Builds the API server image and pushes it to GHCR.
#
# One-time setup: `docker login ghcr.io -u <github-username>` with a PAT
# that has `write:packages` scope.
#
# Usage:
#   ./scripts/docker-build-push.sh            # tags :latest and :<git-sha>
#   ./scripts/docker-build-push.sh v1.2.0      # also tags :v1.2.0
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE="ghcr.io/matthewnichols/simple-inference-poc"
SHA="$(git rev-parse --short HEAD)"

TAGS=(-t "$IMAGE:latest" -t "$IMAGE:$SHA")
if [[ "${1:-}" != "" ]]; then
  TAGS+=(-t "$IMAGE:$1")
fi

docker build "${TAGS[@]}" .

for tag in "${TAGS[@]}"; do
  [[ "$tag" == "-t" ]] && continue
  docker push "$tag"
done
