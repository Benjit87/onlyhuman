// thin client: starts ../src/lsp/server.ts over stdio for *.human and *.bot
const path = require('path')
const { LanguageClient, TransportKind } = require('vscode-languageclient/node')

let client

exports.activate = () => {
  const module = path.join(__dirname, '..', 'src', 'lsp', 'server.ts')
  client = new LanguageClient(
    'onlyhuman',
    'onlyhuman',
    {
      run: { command: 'node', args: [module, '--stdio'], transport: TransportKind.stdio },
      debug: { command: 'node', args: [module, '--stdio'], transport: TransportKind.stdio },
    },
    { documentSelector: [{ language: 'human' }, { language: 'onlyhuman-robot' }] },
  )
  return client.start()
}

exports.deactivate = () => (client ? client.stop() : undefined)
