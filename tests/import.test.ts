import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { definitionAt, importAt } from '../src/definition.ts'
import { importPathFor, importResolver } from '../src/files.ts'
import { lint } from '../src/linter.ts'
import { parseText } from '../src/parser.ts'
import { tokenize } from '../src/tokenizer.ts'

const kinds = (s: string) => tokenize(s).map((t) => `${t.kind}:${t.text}`)
const backend = parseText('@Api\n- GET /orders -> $Order\n$Order\n- id\n')
const resolve = (name: string) => (name === 'backend.human' ? backend : undefined)
const run = (text: string, withFile = true) =>
  lint(parseText(text), withFile ? { file: { path: 'f.human', siblingExists: true, resolveImport: resolve } } : {}).map((d) => d.rule).sort()

test('tokenizer: import is a keyword only with exactly one file name', () => {
  assert.deepEqual(kinds('import a.human'), ['import:import', 'word:a.human'])
  assert.deepEqual(kinds('- import a.human // why'), ['bullet:-', 'import:import', 'word:a.human', 'comment://', 'comment_sentence:why'])
  assert.deepEqual(kinds('- import *.human import all'), ['bullet:-', 'word:import', 'word:*.human', 'word:import', 'word:all'])
  assert.deepEqual(kinds('- import file.human , goes there'), ['bullet:-', 'word:import', 'word:file.human', 'word:,', 'word:goes', 'word:there'])
  assert.deepEqual(kinds('- "import"'), ['bullet:-', 'word:"import"'])
  assert.deepEqual(kinds('- a import b.human'), ['bullet:-', 'word:a', 'word:import', 'word:b.human'])
  assert.deepEqual(kinds('- import'), ['bullet:-', 'word:import'])
})

test('linter: imported definitions count as defined, a bare import line needs no prefix', () => {
  assert.deepEqual(run('import backend.human\n@Page\n- @Api GET -> $Order\n'), ['unused-definition'])
  assert.deepEqual(run('@Page\n- import backend.human\n- @Api -> $Order\n'), ['unused-definition'])
  assert.deepEqual(run('@Page\n- @Api\n'), ['undefined-reference', 'unused-definition']) // no import
  assert.deepEqual(run('@Page\n- import backend.human\n- ?Nope\n'), ['undefined-reference', 'unused-definition'])
  assert.deepEqual(run('@Page\n- import backend.human\n- @Api\n', false), ['undefined-reference', 'unused-definition']) // no file info
})

test('linter: unresolved-import, local definition wins, imports are one level', () => {
  assert.deepEqual(run('@Page\n- import nope.human\n- x\n'), ['unresolved-import', 'unused-definition'])
  assert.deepEqual(run('$Order\n- local\n@Page\n- import backend.human\n- $Order\n'), ['unused-definition']) // no duplicate-definition
  const chained = parseText('import backend.human\n$Mid\n- x\n')
  const rules = lint(parseText('@Page\n- import mid.human\n- @Api\n'), {
    file: { path: 'f.human', siblingExists: true, resolveImport: (n) => (n === 'mid.human' ? chained : undefined) },
  }).map((d) => d.rule)
  assert.ok(rules.includes('undefined-reference')) // @Api is two levels away
})

test('go-to-definition: file name opens the file, imported reference jumps into it', () => {
  const text = '@Page\n- import backend.human\n- @Api -> $Order\n'
  const p = parseText(text)
  assert.equal(importAt(p, 2, 12), 'backend.human')
  assert.equal(importAt(p, 2, 3), undefined) // on the keyword
  assert.deepEqual(definitionAt(p, 2, 12, undefined, resolve), { line: 1, col: 0, length: 1, importFile: 'backend.human' })
  assert.deepEqual(definitionAt(p, 2, 12), { line: 2, col: 9, length: 13 }) // no resolver: stays put
  assert.deepEqual(definitionAt(p, 3, 4, undefined, resolve), { line: 1, col: 0, length: 4, importFile: 'backend.human' })
  assert.deepEqual(definitionAt(p, 3, 14, undefined, resolve), { line: 3, col: 0, length: 6, importFile: 'backend.human' })
  const missing = parseText('@A\n- import gone.human\n')
  assert.deepEqual(definitionAt(missing, 2, 12, undefined, resolve), { line: 2, col: 9, length: 10 })
})

test('files: imports resolve under spec/ and cannot leave it', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-'))
  mkdirSync(join(root, 'spec', 'sub'), { recursive: true })
  writeFileSync(join(root, 'spec', 'backend.human'), '@Api\n- x\n')
  writeFileSync(join(root, 'secret.human'), '@Secret\n- x\n')
  const from = join(root, 'spec', 'sub', 'front.human')
  assert.equal(importPathFor(from, 'backend.human'), join(root, 'spec', 'backend.human'))
  assert.equal(importPathFor(from, '../secret.human'), undefined)
  assert.equal(importPathFor(from, '../../secret.human'), undefined)
  assert.equal(importPathFor(from, 'nope.human'), undefined)
  assert.ok(importResolver(from)('backend.human'))
  assert.equal(importResolver(from)('../secret.human'), undefined)
  rmSync(root, { recursive: true })
})
