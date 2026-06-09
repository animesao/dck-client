#!/usr/bin/env bash
set -euo pipefail

echo "=== Building dck Panel ==="

echo "[1/3] Building frontend..."
cd "$(dirname "$0")"
npm ci 2>/dev/null || true
npm run build

echo "[2/3] Copying frontend to server..."
rm -rf server/dist
cp -r dist server/dist

echo "[3/3] Building Go backend..."
cd server
go build -o dck-panel -ldflags="-s -w" .
cd ..

echo ""
echo "=== Build complete ==="
echo "Binary: server/dck-panel"
echo "Run: sudo ./server/dck-panel --port 8080"
