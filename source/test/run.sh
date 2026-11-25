#!/bin/sh
cd "$(dirname "$0")/.." && npx esbuild test/sim.jsx --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --outfile=test/out/sim.mjs --log-level=warning && timeout 900 node test/out/sim.mjs
