import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const grammar = JSON.parse(readFileSync(new URL('../vscode/syntaxes/human.tmLanguage.json', import.meta.url), 'utf8'))
const repo = grammar.repository

// minimal textmate emulation for one line: leftmost match wins, ties go to pattern order
function scopes(line: string): string[] {
  const rules = grammar.patterns.map((p: { include: string }) => repo[p.include.slice(1)])
  const out: string[] = []
  let pos = 0
  while (pos < line.length) {
    let best: { start: number; end: number; name: string } | undefined
    for (const r of rules) {
      let start = -1
      let end = -1
      if (r.match) {
        const re = new RegExp(r.match, 'g')
        re.lastIndex = pos
        const m = re.exec(line)
        if (m) [start, end] = [m.index, m.index + m[0].length]
      } else {
        const b = new RegExp(r.begin, 'g')
        b.lastIndex = pos
        const m = b.exec(line)
        if (m) {
          const e = new RegExp(r.end, 'g')
          e.lastIndex = m.index + m[0].length
          const em = e.exec(line)
          ;[start, end] = [m.index, em ? em.index : line.length]
        }
      }
      if (start >= 0 && (!best || start < best.start)) best = { start, end: Math.max(end, start + 1), name: r.name }
    }
    if (!best) break
    out.push(`${best.name.replace(/\.human$/, '')}:${line.slice(best.start, best.end)}`)
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
  assert.deepEqual(scopes('@Token'), ['entity.name.type:@Token'])
  assert.deepEqual(scopes('?Data'), ['variable.other.constant:?Data'])
  assert.deepEqual(scopes('$Parser'), ['entity.name.function:$Parser'])
  assert.deepEqual(scopes('#implementation'), ['markup.heading:#implementation'])
  assert.deepEqual(scopes('#req // note'), ['markup.heading:#req ', 'comment.line.double-slash:// note'])
  assert.deepEqual(scopes('- @A -> x + ?B == y'), [
    'punctuation.definition.list.begin:-',
    'entity.name.type:@A',
    'keyword.operator:->',
    'keyword.operator:+',
    'variable.other.constant:?B',
    'keyword.operator:==',
  ])
})

test('comment swallows everything after //, bullets and bare prefixes handled', () => {
  assert.deepEqual(scopes('- - // @X -> y'), [
    'punctuation.definition.list.begin:-',
    'punctuation.definition.list.begin:-',
    'comment.line.double-slash:// @X -> y',
  ])
  assert.deepEqual(scopes('- @'), ['punctuation.definition.list.begin:-', 'punctuation.definition.prefix:@'])
  assert.deepEqual(scopes('- ->'), ['punctuation.definition.list.begin:-', 'keyword.operator:->'])
  assert.deepEqual(scopes('- a@b http://x'), ['punctuation.definition.list.begin:-'])
  assert.deepEqual(scopes('- "//" a//b \\// x'), ['punctuation.definition.list.begin:-'])
})
