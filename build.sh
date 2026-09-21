#!/bin/sh
# Rebuilds shared/netlink-trails.js (Trails widget bundled for plain HTML pages).
# Run in an empty folder that contains entry.jsx. Versions are pinned on purpose.
set -e
npm init -y >/dev/null
npm i 0xtrails@0.18.6 react@19 react-dom@19 esbuild --no-audit --no-fund
NODE_ENV=production npx esbuild entry.jsx --bundle --minify --format=iife --platform=browser \
  --target=es2020 --define:process.env.NODE_ENV='"production"' --define:global=window \
  --loader:.js=jsx --outfile=netlink-trails.js
echo "Done: copy netlink-trails.js to shared/ and bump the ?v= in pay pages."
