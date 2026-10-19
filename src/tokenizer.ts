// $Data -> tokenize -> $Tokens
import type { Token, TokenKind, Tokens } from './types.ts'

const PREFIX_RE = /^([@$?#])([A-Za-z0-9_]*)(.*)$/
const PERCENT_RE = /^%([A-Za-z0-9_]*)(.*)$/

export function tokenize(text: string): Tokens {
  const tokens: Tokens = []
  const lines = text.split(/\r\n|\n/)
  lines.forEach((raw, i) => {
    const line = i + 1
    const indent = /^[ \t]*/.exec(raw)![0]
    let pos = indent.length
    let first = true
    const push = (kind: TokenKind, s: string, col: number) =>
      tokens.push({ kind, text: s, line, col, length: s.length, indent })

    while (pos < raw.length) {
      if (raw[pos] === ' ' || raw[pos] === '\t') {
        pos++
        continue
      }
      let end = pos
      while (end < raw.length && raw[end] !== ' ' && raw[end] !== '\t') end++
      const run = raw.slice(pos, end)

      if (run.startsWith('//')) {
        push('comment', '//', pos)
        const rest = raw.slice(pos + 2).trim()
        if (rest) push('comment_sentence', rest, raw.indexOf(rest, pos + 2))
        break // comment runs to end of line
      }
      if (run === '->') push('arrow', run, pos)
      else if (run === '+') push('plus', run, pos)
      else if (run === '==') push('equals', run, pos)
      else if (run === '-') push(first ? 'bullet' : 'dash', run, pos)
      else {
        const m = PREFIX_RE.exec(run)
        if (m && (m[2] !== '' || m[3] === '')) {
          push('prefix', m[1], pos)
          if (m[2]) push('word', m[2], pos + 1)
          if (m[3]) push('word', m[3], pos + 1 + m[2].length)
        } else if (PERCENT_RE.test(run)) {
          const [, name, rest] = PERCENT_RE.exec(run)!
          push('percent', '%', pos)
          if (name) push('word', name, pos + 1)
          if (rest) push('word', rest, pos + 1 + name.length)
        } else {
          push('word', run, pos)
        }
      }
      first = false
      pos = end
    }
  })
  return tokens
}
