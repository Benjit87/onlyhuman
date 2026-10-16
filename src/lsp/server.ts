// $LSP: stdio language server for *.human and *.bot. Needs vscode-languageserver (see package.json).
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node.js'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { definitionAt, pointerAt } from '../definition.ts'
import { loadRobot, pointerLineCounter, pointerTargetExists, robotPathFor, siblingExists } from '../files.ts'
import { lint } from '../linter.ts'
import { parseText } from '../parser.ts'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Full,
    definitionProvider: true,
  },
}))

function validate(doc: TextDocument) {
  const parsed = parseText(doc.getText())
  let file
  if (doc.uri.startsWith('file:')) {
    const path = fileURLToPath(doc.uri)
    file = { path, siblingExists: siblingExists(path), lineCount: pointerLineCounter(path) }
  }
  const diagnostics = lint(parsed, { file }).map((d) => ({
    severity: d.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
    // lsp positions are 0-based, ours: line 1-based
    range: {
      start: { line: d.line - 1, character: d.col },
      end: { line: d.line - 1, character: d.col + d.length },
    },
    message: d.message,
    code: d.rule,
    source: 'onlyhuman',
  }))
  connection.sendDiagnostics({ uri: doc.uri, diagnostics })
}

documents.onDidOpen((e) => validate(e.document))
documents.onDidChangeContent((e) => validate(e.document))

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null
  const path = doc.uri.startsWith('file:') ? fileURLToPath(doc.uri) : undefined
  const parsed = parseText(doc.getText())
  const [line, col] = [params.position.line + 1, params.position.character]
  // in a .bot a definition header goes to the code line it points to
  const ptr = path?.endsWith('.bot') ? pointerAt(parsed, line, col) : undefined
  const code = path && ptr ? pointerTargetExists(path, ptr.path) : undefined
  if (ptr && code) {
    const at = { line: ptr.line - 1, character: 0 }
    return { uri: pathToFileURL(code).href, range: { start: at, end: at } }
  }
  const loc = definitionAt(parsed, line, col, path?.endsWith('.human') ? loadRobot(path) : undefined)
  if (!loc) return null
  return {
    uri: loc.file === 'robot' && path ? pathToFileURL(robotPathFor(path)).href : doc.uri,
    range: {
      start: { line: loc.line - 1, character: loc.col },
      end: { line: loc.line - 1, character: loc.col + loc.length },
    },
  }
})

documents.listen(connection)
connection.listen()
