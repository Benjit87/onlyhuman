// $Data -> tokenize -> $Tokens
import type { Token, TokenKind, Tokens } from './types.ts'

const PREFIX_RE = /^([@$?#])([A-Za-z0-9_]*)(.*)$/
export const ALIAS_RE = /^[A-Za-z0-9_]+$/
const PERCENT_RE = /^%([A-Za-z0-9_]*)(.*)$/

export function tokenize(text: string): Tokens {
  const tokens: Tokens = []
  const lines = text.split(/\r\n|\n/)
  lines.forEach((raw, i) => {
    const line = i + 1
    const indent = /^[ \t]*/.exec(raw)![0]
    const lineStart = tokens.length
    let pos = indent.length
    let first = true
    const push = (kind: TokenKind, s: string, col: number) =>
      tokens.push({ kind, text: s, line, col, length: s.length, indent })
    const classify = (s: string, col: number) => {
      if (s === '->') push('arrow', s, col)
      else if (s === '+') push('plus', s, col)
      else if (s === '==') push('equals', s, col)
      else if (s === '-') push(first ? 'bullet' : 'dash', s, col)
      else {
        const m = PREFIX_RE.exec(s)
        if (m && (m[2] !== '' || m[3] === '')) {
          push('prefix', m[1], col)
          if (m[2]) push('word', m[2], col + 1)
          if (m[3]) push('word', m[3], col + 1 + m[2].length)
        } else if (PERCENT_RE.test(s)) {
          const [, name, rest] = PERCENT_RE.exec(s)!
          push('percent', '%', col)
          if (name) push('word', name, col + 1)
          if (rest) push('word', rest, col + 1 + name.length)
        } else {
          push('word', s, col)
        }
      }
      first = false
    }

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
      const quoted = run[0] === '"' || run[0] === "'"
      if (!quoted && (run.includes('(') || run.includes(')'))) {
        let offset = 0
        while (offset < run.length) {
          const ch = run[offset]
          if (ch === '(' || ch === ')') {
            push('word', ch, pos + offset)
            first = false
            offset++
            continue
          }
          let next = offset
          while (next < run.length && run[next] !== '(' && run[next] !== ')') next++
          classify(run.slice(offset, next), pos + offset)
          offset = next
        }
      } else classify(run, pos)
      pos = end
    }
    markImport(tokens.slice(lineStart))
  })
  return tokens
}

// `import x.human` or `import x.human as @alias` as the first words of a line: import + exactly one file name (no *)
// + optional `as` and one @alias (the @ is required) + optional comment.
// Anything else, e.g. `import all the things` or `import *.human`, is plain words describing an import.
function markImport(line: Token[]) {
  const [keyword, file, ...rest] = line[0]?.kind === 'bullet' ? line.slice(1) : line
  if (keyword?.kind !== 'word' || keyword.text !== 'import') return
  if (file?.kind !== 'word' || file.text.includes('*')) return
  const [as, at, alias, ...tail] = rest
  const aliased =
    as?.kind === 'word' && as.text === 'as' && at?.kind === 'prefix' && at.text === '@' &&
    alias?.kind === 'word' && alias.col === at.col + 1 && ALIAS_RE.test(alias.text)
  if ((aliased ? tail : rest).every((t) => t.kind === 'comment' || t.kind === 'comment_sentence')) keyword.kind = 'import'
}
