# vendor-build

Builds the wallet SDK bundles that used to be imported at runtime from `esm.sh` and jsDelivr.
Output goes to `../shared/vendor/` and is committed, so deploys need no build step.

| Output file | Package (pinned in `package.json`) | Used by |
|---|---|---|
| `sequence-waas.js` | `@0xsequence/waas` 2.3.44 | `pay`, `pay2`, `pay5`, `identity`, `recovery`, `dashboard` |
| `onramp-web-sdk.js` | `@onramp.money/onramp-web-sdk` 2.0.1 | `pay2` |

## Update a library
1. Change the version in `package.json`, then `npm install` and `npm run build` in this folder.
2. Commit `package.json`, `package-lock.json` and the rebuilt file in `shared/vendor/`.
3. Bump `?v=` on every page that imports the file.
4. Test sign in, send and export on a real login before merging. These bundles hold wallet sessions.

Keep `@0xsequence/waas` on one version for all pages, so every page reads the saved session the same way.
