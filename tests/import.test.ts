import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { completeAt } from '../src/autocomplete.ts'
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

test('tokenizer: import accepts one @alias after as, the @ is required', () => {
  assert.deepEqual(kinds('import a.human as @a'), ['import:import', 'word:a.human', 'word:as', 'prefix:@', 'word:a'])
  assert.deepEqual(kinds('- import a.human as @b // why'), ['bullet:-', 'import:import', 'word:a.human', 'word:as', 'prefix:@', 'word:b', 'comment://', 'comment_sentence:why'])
  assert.equal(kinds('import a.human as a')[0], 'word:import') // a bare alias is plain text
  assert.equal(kinds('import a.human as @')[0], 'word:import')
  assert.equal(kinds('import a.human as @b c')[0], 'word:import')
  assert.equal(kinds('import a.human as @b.c')[0], 'word:import')
  assert.equal(kinds('import a.human by @b')[0], 'word:import')
  assert.deepEqual(kinds('- @m.Api'), ['bullet:-', 'prefix:@', 'word:m', 'word:.Api'])
})

const aliasRun = (text: string) =>
  lint(parseText(text), { file: { path: 'f.human', siblingExists: true, resolveImport: resolve } }).map((d) => `${d.rule}:${d.message}`).sort()
const noUnusedPage = (text: string) => aliasRun(text).filter((r) => r !== 'unused-definition:@Page is defined but never referenced')

test('linter: an @alias is an @ definition, names are reachable only as @alias.name', () => {
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.Api -> $Order\n'), ['undefined-reference:$Order is not defined'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.Api\n'), [])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @Api\n'), ['undefined-reference:@Api is not defined', 'unused-definition:@be is defined but never referenced'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.Nope\n'), ['undefined-reference:@be.Nope is not defined'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @xx.Api\n'), ['undefined-reference:@xx.Api is not defined', 'unused-definition:@be is defined but never referenced'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- import backend.human as @be\n- @be.Api\n'), ['duplicate-definition:@be is already defined'])
  assert.deepEqual(noUnusedPage('@be\n- x\n@Page\n- import backend.human as @be\n- @be.Api\n'), ['duplicate-definition:@be is already defined'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- import backend.human\n- @Api @be.Api\n'), [])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be\n- @be.Api\n'), []) // a bare @be refers to the alias
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as be\n- x\n'), []) // a bare alias is plain text
  assert.deepEqual(noUnusedPage('@Page\n- @Page.\n- x\n'), []) // a trailing dot is not a qualifier
  // the prefix after the dot picks the kind, none means @
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.Api -> @be.$Order\n'), [])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.Order\n'), ['undefined-reference:@be.Order is not defined'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.$Nope\n'), ['undefined-reference:@be.$Nope is not defined'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.?Order\n'), ['undefined-reference:@be.?Order is not defined'])
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.$Order\n'), []) // the alias counts as used
  assert.deepEqual(noUnusedPage('@Page\n- import backend.human as @be\n- @be.#Order\n'), []) // # is not read after the dot, @be alone is the alias
})

test('go-to-definition: @alias.name, the alias, and the import line', () => {
  const p = parseText('@Page\n- import backend.human as @be\n- @be.Api -> $be.Order\n- @Api\n- @be\n')
  // line 3: "- @be.Api" the @ is col 2, be 3-4, the dot col 5, Api 6-8
  assert.deepEqual(definitionAt(p, 3, 3, undefined, resolve), { line: 2, col: 26, length: 3 }) // @be part: the import line
  assert.deepEqual(definitionAt(p, 3, 7, undefined, resolve), { line: 1, col: 0, length: 4, importFile: 'backend.human' }) // .Api part
  assert.equal(definitionAt(p, 4, 4, undefined, resolve), undefined) // unqualified name of an aliased import
  const q = parseText('@Page\n- import backend.human as @be\n- @be.$Order\n')
  assert.deepEqual(definitionAt(q, 3, 8, undefined, resolve), { line: 3, col: 0, length: 6, importFile: 'backend.human' }) // .$Order part
  assert.deepEqual(definitionAt(q, 3, 3, undefined, resolve), { line: 2, col: 26, length: 3 }) // @be part
  assert.deepEqual(definitionAt(p, 5, 3, undefined, resolve), { line: 2, col: 26, length: 3 }) // a bare @be
  assert.equal(importAt(p, 2, 28), 'backend.human') // on the alias
  assert.deepEqual(definitionAt(p, 2, 28, undefined, resolve), { line: 1, col: 0, length: 1, importFile: 'backend.human' })
  assert.deepEqual(definitionAt(p, 2, 12, undefined, resolve), { line: 1, col: 0, length: 1, importFile: 'backend.human' }) // on the file name
})

test('autocomplete: aliases and names after @, @alias. and $ ?', () => {
  const text = '@Page\n- import backend.human as @be\n$Local\n- x\n?State\n- x\n- @\n- @be.\n- @be.Ap\n- $\n- ?\n- @xx.\n- // @\n- @be.$\n- @be.$Or\n- @be.?\n'
  const p = parseText(text)
  const at = (line: number) => completeAt(p, line, p.nodes.find((n) => n.line === line)!.tokens.at(-1)!.col + p.nodes.find((n) => n.line === line)!.tokens.at(-1)!.length, resolve).map((i) => `${i.kind}:${i.label}${i.source ? '@' + i.source : ''}`)
  assert.deepEqual(at(7), ['alias:be@backend.human', 'service:Page']) // after @
  assert.deepEqual(at(8), ['service:Api@backend.human']) // after @be.
  assert.deepEqual(at(9), ['service:Api@backend.human']) // after @be.Ap
  assert.deepEqual(at(10), ['entity:Local']) // after $
  assert.deepEqual(at(11), ['state:State']) // after ?
  assert.deepEqual(at(12), []) // unknown alias
  assert.deepEqual(at(13), []) // inside a comment
  assert.deepEqual(at(14), ['entity:Order@backend.human']) // after @be.$
  assert.deepEqual(at(15), ['entity:Order@backend.human']) // after @be.$Or
  assert.deepEqual(at(16), []) // after @be.? the imported spec has no ? names
  assert.deepEqual(completeAt(p, 8, 6), []) // no resolver, no names to offer
  assert.deepEqual(completeAt(p, 7, 2, resolve), []) // the cursor is not right after a prefix
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
