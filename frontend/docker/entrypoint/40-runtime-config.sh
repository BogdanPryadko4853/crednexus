#!/bin/sh
set -eu

target=/usr/share/nginx/html/runtime-config.js
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT

# Only public frontend settings are exposed; JSON encoding preserves string values.
printf 'window.__CREDNEXUS_ENV__ = ' > "$temporary"
jq -c -n 'env | with_entries(select(.key | startswith("VITE_")))' >> "$temporary"
printf ';\n' >> "$temporary"
cat "$temporary" > "$target"
