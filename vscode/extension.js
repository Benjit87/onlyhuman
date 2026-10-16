// thin client: starts the bundled server (dist/server.js) on vscode's own node, for *.human and *.bot
const { LanguageClient, TransportKind } = require('vscode-languageclient/node')

let client

exports.activate = (context) => {
  const module = context.asAbsolutePath('dist/server.js')
  client = new LanguageClient(
    'onlyhuman',
    'onlyhuman',
    {
      run: { module, transport: TransportKind.ipc },
      debug: { module, transport: TransportKind.ipc },
    },
    { documentSelector: [{ language: 'human' }, { language: 'onlyhuman-robot' }] },
  )
  return client.start()
}

exports.deactivate = () => (client ? client.stop() : undefined)
