// bundles the language server and the client into dist/, so the .vsix needs no src/ or node_modules/
import { build } from 'esbuild'

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node18', sourcemap: false, logLevel: 'info' }

await build({ ...common, entryPoints: ['../src/lsp/server.ts'], outfile: 'dist/server.js' })
await build({ ...common, entryPoints: ['extension.js'], outfile: 'dist/extension.js', external: ['vscode'] })
