// Bundles the wallet SDKs into single ES module files under ../shared/vendor/.
// Replaces the runtime imports from esm.sh and jsDelivr. Pinned versions live in package.json.
import { build } from 'esbuild';

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
};

for (const [entry, out] of [
  ['sequence-waas.entry.js', '../shared/vendor/sequence-waas.js'],
  ['onramp.entry.js', '../shared/vendor/onramp-web-sdk.js'],
]) {
  await build({ ...common, entryPoints: [entry], outfile: out });
}
