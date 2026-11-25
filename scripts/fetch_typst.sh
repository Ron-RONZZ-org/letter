#!/usr/bin/env bash
set -euo pipefail

version="${TYPST_VERSION:-0.15.1}"
case "$(uname -m)" in
  x86_64|amd64) arch=x86_64 ;;
  aarch64|arm64) arch=aarch64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/vendor/typst"
mkdir -p "$dest"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 \
  -o "$tmp/typst.tar.xz" \
  "https://github.com/typst/typst/releases/download/v${version}/typst-${arch}-unknown-linux-musl.tar.xz"
tar -xJf "$tmp/typst.tar.xz" -C "$tmp" --strip-components=1
install -m 0755 "$tmp/typst" "$dest/typst"
"$dest/typst" --version
