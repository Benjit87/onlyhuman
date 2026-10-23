import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const grammar = JSON.parse(readFileSync(new URL('../vscode/syntaxes/human.tmLanguage.json', import.meta.url), 'utf8'))
const repo = grammar.repository

// minimal textmate emulation for one line: leftmost match wins, ties go to pattern order.
// A rule with captures scopes every named capture in order, an unnamed capture (the bullet) is skipped.
function scopes(line: string): string[] {
  const rules = grammar.patterns.map((p: { include: string }) => repo[p.include.slice(1)])
  const out: string[] = []
  let pos = 0
  while (pos < line.length) {
    let best: { start: number; end: number; segs: { name: string; value: string }[] } | undefined
    for (const r of rules) {
      let start = -1
      let end = -1
      let segs: { name: string; value: string }[] = []
      if (r.match) {
        const re = new RegExp(r.match, 'g')
        re.lastIndex = pos
        const m = re.exec(line)
        if (m) {
          ;[start, end] = [m.index, m.index + m[0].length]
          const named = Object.entries(r.captures ?? {}).filter(([i, c]) => (c as { name?: string }).name && m[Number(i)])
          segs = named.length
            ? named.map(([i, c]) => ({ name: (c as { name: string }).name, value: m[Number(i)] }))
            : [{ name: r.name, value: m[0] }]
        }
      } else {
        const b = new RegExp(r.begin, 'g')
        b.lastIndex = pos
        const m = b.exec(line)
        if (m) {
          const e = new RegExp(r.end, 'g')
          e.lastIndex = m.index + m[0].length
          const em = e.exec(line)
          ;[start, end] = [m.index, em ? em.index : line.length]
          segs = [{ name: r.name, value: line.slice(start, end) }]
        }
      }
      if (start >= 0 && (!best || start < best.start)) best = { start, end: Math.max(end, start + 1), segs }
    }
    if (!best) break
    for (const seg of best.segs) out.push(`${seg.name.replace(/\.human$/, '')}:${seg.value}`)
    pos = best.end
  }
  return out
}

test('grammar json is well formed and every regex compiles', () => {
  assert.equal(grammar.scopeName, 'source.human')
  for (const r of Object.values(repo) as { match?: string; begin?: string; end?: string }[]) {
    for (const s of [r.match, r.begin, r.end]) if (s) new RegExp(s)
  }
})

test('scopes per token', () => {
  assert.deepEqual(scopes('$Token'), ['entity.name.type:$Token'])
  assert.deepEqual(scopes('?Data'), ['variable.other.constant:?Data'])
  assert.deepEqual(scopes('@Parser'), ['entity.name.function:@Parser'])
  assert.deepEqual(scopes('#implementation'), ['markup.heading:#implementation'])
  assert.deepEqual(scopes('#req // note'), ['markup.heading:#req ', 'comment.line.double-slash:// note'])
  assert.deepEqual(scopes('- $A -> x + ?B == y'), [
    'punctuation.definition.list.begin:-',
    'entity.name.type:$A',
    'keyword.operator.arrow:->',
    'string.unquoted.word:x',
    'keyword.operator.plus:+',
    'variable.other.constant:?B',
    'keyword.operator.equals:==',
    'string.unquoted.word:y',
  ])
})

test('comment swallows everything after //, bullets and bare prefixes handled', () => {
  assert.deepEqual(scopes('- - // @X -> y'), [
    'punctuation.definition.list.begin:-',
    'punctuation.definition.dash:-',
    'comment.line.double-slash:// @X -> y',
  ])
  assert.deepEqual(scopes('- @'), ['punctuation.definition.list.begin:-', 'punctuation.definition.prefix:@'])
  assert.deepEqual(scopes('- ->'), ['punctuation.definition.list.begin:-', 'keyword.operator.arrow:->'])
  assert.deepEqual(scopes('- a@b http://x'), ['punctuation.definition.list.begin:-', 'string.unquoted.word:a@b', 'string.unquoted.word:http://x'])
  assert.deepEqual(scopes('- "//" a//b \\// x'), ['punctuation.definition.list.begin:-', 'string.unquoted.word:"//"', 'string.unquoted.word:a//b', 'string.unquoted.word:\\//', 'string.unquoted.word:x'])
})

test('import is a keyword only as the first word, with exactly one file name', () => {
  assert.deepEqual(scopes('import a.human'), ['keyword.control.import:import', 'string.unquoted.word:a.human'])
  // the emulation above ignores capture 1, which scopes the bullet of an import line
  assert.deepEqual(scopes('- import a.human // why'), [
    'keyword.control.import:import',
    'string.unquoted.word:a.human',
    'comment.line.double-slash:// why',
  ])
  assert.deepEqual(scopes('- import *.human all'), [
    'punctuation.definition.list.begin:-',
    'string.unquoted.word:import',
    'string.unquoted.word:*.human',
    'string.unquoted.word:all',
  ])
  assert.deepEqual(scopes('- a import b.human'), [
    'punctuation.definition.list.begin:-',
    'string.unquoted.word:a',
    'string.unquoted.word:import',
    'string.unquoted.word:b.human',
  ])
})

test('import with as @alias, and qualified names', () => {
  assert.deepEqual(scopes('import a.human as @b'), [
    'keyword.control.import:import',
    'string.unquoted.word:a.human',
    'string.unquoted.word:as',
    'variable.other.alias:@b',
  ])
  assert.deepEqual(scopes('- import a.human as @b // why'), [
    'keyword.control.import:import',
    'string.unquoted.word:a.human',
    'string.unquoted.word:as',
    'variable.other.alias:@b',
    'comment.line.double-slash:// why',
  ])
  assert.deepEqual(scopes('import a.human as b'), ['string.unquoted.word:import', 'string.unquoted.word:a.human', 'string.unquoted.word:as', 'string.unquoted.word:b'])
  assert.deepEqual(scopes('@b.Api'), ['variable.other.alias:@b', 'entity.name.function:.Api'])
  assert.deepEqual(scopes('$b.Order'), ['entity.name.type:$b']) // only an @ alias qualifies
  assert.deepEqual(scopes('@b.$Order'), ['variable.other.alias:@b', 'entity.name.type:.$Order'])
  assert.deepEqual(scopes('@b.?State'), ['variable.other.alias:@b', 'variable.other.constant:.?State'])
  assert.deepEqual(scopes('@Api'), ['entity.name.function:@Api'])
})
