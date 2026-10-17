// $GoToDefinition, plus the symbol collection the linter shares
import type { Location, Node, Parsed, Token } from './types.ts'
import { SYMBOL_PREFIXES } from './types.ts'

export interface SymbolRef {
  key: string // prefix + name, e.g @Token
  location: Location // covers prefix + name
  isDefinition: boolean
}

export function collectSymbols(parsed: Parsed): SymbolRef[] {
  const out: SymbolRef[] = []
  const toks = parsed.tokens
  for (let i = 0; i < toks.length; i++) {
    const p = toks[i]
    if (p.kind !== 'prefix' || !SYMBOL_PREFIXES.includes(p.text)) continue
    const name = toks[i + 1]
    if (!name || name.kind !== 'word' || name.line !== p.line || name.col !== p.col + 1) continue
    const isDefinition = parsed.nodes.some((n) => n.kind === 'header' && n.token === p)
    out.push({
      key: p.text + name.text,
      location: { line: p.line, col: p.col, length: 1 + name.text.length },
      isDefinition,
    })
  }
  return out
}

export function findDefinition(parsed: Parsed, key: string): Location | undefined {
  if (key.startsWith('#')) return parsed.nodes.map(requirementHeader).find((h) => h?.key === key)?.location
  return collectSymbols(parsed).find((s) => s.isDefinition && s.key === key)?.location
}

function requirementHeader(node: Node): { key: string; location: Location } | undefined {
  if (node.kind !== 'header' || node.tokens[0]?.kind !== 'prefix' || node.tokens[0].text !== '#') return undefined
  const content = node.tokens.slice(1).filter((t) => t.kind !== 'comment' && t.kind !== 'comment_sentence' && !parsePointer(t))
  if (!content.length) return undefined
  const first = node.tokens[0]
  const last = content.at(-1)!
  return {
    key: '#' + content.map((t) => t.text).join(' '),
    location: { line: node.line, col: first.col, length: last.col + last.length - first.col },
  }
}

function requirementAt(parsed: Parsed, line: number, col: number) {
  const node = parsed.nodes.find((n) => n.line === line)
  const header = node && requirementHeader(node)
  return header && col >= header.location.col && col <= header.location.col + header.location.length ? header : undefined
}

function tokenAt(parsed: Parsed, line: number, col: number): Token | undefined {
  return parsed.tokens.find((t) => t.line === line && col >= t.col && col <= t.col + t.length)
}

export interface Pointer {
  path: string // relative to the folder that holds .onlyhuman
  line: number // 1-based
  token: Token // the [path][line] word, for diagnostics
}

// `[./src/types.ts][14]`, the glued-together pointer a .bot header may end with
export function parsePointer(token: Token): Pointer | undefined {
  if (token.kind !== 'word') return undefined
  const m = /^\[(.+)\]\[(\d+)\]$/.exec(token.text)
  return m ? { path: m[1], line: Number(m[2]), token } : undefined
}

export function pointerOf(node: Node): Pointer | undefined {
  for (const t of node.tokens) {
    const p = parsePointer(t)
    if (p) return p
  }
  return undefined
}

function symbolAt(parsed: Parsed, line: number, col: number): SymbolRef | undefined {
  const sym = collectSymbols(parsed).find(
    (s) => s.location.line === line && col >= s.location.col && col <= s.location.col + s.location.length,
  )
  if (!sym) return undefined
  const tok = tokenAt(parsed, line, col)
  if (tok && (tok.kind === 'comment' || tok.kind === 'comment_sentence')) return undefined
  return sym
}

// line 1-based, col 0-based. Cursor on either the prefix or the name resolves the symbol.
// A reference goes to its header in the same file. In a .human, a definition header goes on to
// the same header in the sibling .bot, when one is passed and has it, else it stays put.
export function definitionAt(
  parsed: Parsed,
  line: number,
  col: number,
  robot?: Parsed,
): Location | undefined {
  const requirement = requirementAt(parsed, line, col)
  if (requirement) {
    const target = robot && findDefinition(robot, requirement.key)
    return target ? { ...target, file: 'robot' } : requirement.location
  }
  const sym = symbolAt(parsed, line, col)
  if (!sym) return undefined
  if (sym.isDefinition && robot) {
    const target = findDefinition(robot, sym.key)
    if (target) return { ...target, file: 'robot' }
  }
  return findDefinition(parsed, sym.key)
}

// In a .bot: cursor on a definition header or a % child line -> the [path][line] it ends with, if any.
// The caller checks the file exists and falls back to definitionAt when it does not.
export function pointerAt(parsed: Parsed, line: number, col: number): Pointer | undefined {
  const method = parsed.nodes.find((n) => n.kind === 'child' && n.line === line && n.token?.kind === 'percent')
  if (method) {
    // cursor on the % or the method name that follows it
    const [percent, name] = method.tokens.filter((t) => t.kind !== 'bullet')
    const on = (t?: Token) => t && col >= t.col && col <= t.col + t.length
    return on(percent) || on(name) ? pointerOf(method) : undefined
  }
  if (requirementAt(parsed, line, col)) {
    const node = parsed.nodes.find((n) => n.kind === 'header' && n.line === line)
    return node ? pointerOf(node) : undefined
  }
  const sym = symbolAt(parsed, line, col)
  if (!sym?.isDefinition) return undefined
  const node = parsed.nodes.find((n) => n.kind === 'header' && n.line === line)
  return node ? pointerOf(node) : undefined
}
