#!/bin/bash

set -euo pipefail

# Allow running from any working directory by resolving paths relative to this file.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Build frontend
cd "${ROOT_DIR}/frontend"
npm install
npm run build

# Return to repo root
cd "${ROOT_DIR}"

# Install backend dependencies
cd "${ROOT_DIR}/backend"
npm install

cd "${ROOT_DIR}"

echo "Build complete! Frontend dist is ready at frontend/dist"
