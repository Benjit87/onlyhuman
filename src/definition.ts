// @GoToDefinition, plus the symbol collection the linter shares
import type { Location, Node, Parsed, Token } from './types.ts'
import { SYMBOL_PREFIXES } from './types.ts'

export interface SymbolRef {
  key: string // prefix + name, e.g $Token; for a qualified reference the key in the imported spec, e.g @Api or $Order
  location: Location // covers prefix + name, or prefix + alias + . + name when qualified
  isDefinition: boolean // a header, or the @alias of an import line
  qualifier?: string // the import alias of a qualified reference, e.g module in @module.Api
}

const QUALIFIED_RE = /^\.([$?]?)([A-Za-z0-9_]+)/ // .name is @name, .$name and .?name pick the kind

export function collectSymbols(parsed: Parsed): SymbolRef[] {
  const out: SymbolRef[] = []
  const toks = parsed.tokens
  const aliasPrefixes = new Set(importsOf(parsed).flatMap((r) => r.aliasPrefix ?? []))
  for (let i = 0; i < toks.length; i++) {
    const p = toks[i]
    if (p.kind !== 'prefix' || !SYMBOL_PREFIXES.includes(p.text)) continue
    const name = toks[i + 1]
    if (!name || name.kind !== 'word' || name.line !== p.line || name.col !== p.col + 1) continue
    // @alias.name: the word glued right after the name starts with a dot and a name
    const next = toks[i + 2]
    const q =
      p.text === '@' && next && next.kind === 'word' && next.line === p.line && next.col === name.col + name.text.length
        ? QUALIFIED_RE.exec(next.text)
        : null
    if (q) {
      out.push({
        key: (q[1] || '@') + q[2],
        location: { line: p.line, col: p.col, length: 1 + name.text.length + q[0].length },
        isDefinition: false,
        qualifier: name.text,
      })
      continue
    }
    const isDefinition = aliasPrefixes.has(p) || parsed.nodes.some((n) => n.kind === 'header' && n.token === p)
    out.push({
      key: p.text + name.text,
      location: { line: p.line, col: p.col, length: 1 + name.text.length },
      isDefinition,
    })
  }
  return out
}

export interface ImportRef {
  name: string // file name as written, resolved under spec/
  token: Token // the file name word
  alias?: string // the name after `as @`, its definitions are then referenced as @alias.name
  aliasToken?: Token // the alias name word
  aliasPrefix?: Token // the @ before it
}

// the file named by an import line, and its alias when it has `as alias`
export function importOf(node: Node): ImportRef | undefined {
  const i = node.tokens.findIndex((t) => t.kind === 'import')
  const file = i === -1 ? undefined : node.tokens[i + 1]
  if (!file) return undefined
  const [as, at, alias] = node.tokens.slice(i + 2)
  const aliased = as?.kind === 'word' && as.text === 'as' && at?.kind === 'prefix' && at.text === '@' && alias?.kind === 'word'
  return aliased ? { name: file.text, token: file, alias: alias.text, aliasToken: alias, aliasPrefix: at } : { name: file.text, token: file }
}

export function importsOf(parsed: Parsed): ImportRef[] {
  return parsed.nodes.flatMap((n) => importOf(n) ?? [])
}

// cursor on the file name, or on the alias, of an import line -> that file name
export function importAt(parsed: Parsed, line: number, col: number): string | undefined {
  const ref = importsOf(parsed).find((r) => r.token.line === line)
  const on = (t?: Token) => !!t && col >= t.col && col <= t.col + t.length
  return ref && (on(ref.token) || on(ref.aliasPrefix) || on(ref.aliasToken)) ? ref.name : undefined
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
  path: string // relative to the project root: nearest .git, else the parent of spec/
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
// A % child line goes on to the same % child under the same header in the .bot, else it stays put.
export function definitionAt(
  parsed: Parsed,
  line: number,
  col: number,
  robot?: Parsed,
  resolveImport?: (name: string) => Parsed | undefined,
): Location | undefined {
  const imported = importAt(parsed, line, col)
  if (imported) {
    // the file name of an import line opens that file, a missing file stays on the import line
    const ref = importsOf(parsed).find((r) => r.name === imported && r.token.line === line)!
    if (resolveImport?.(imported)) return { line: 1, col: 0, length: 1, importFile: imported }
    return { line, col: ref.token.col, length: ref.token.length }
  }
  const method = methodAt(parsed, line, col)
  if (method) {
    const target = robot && robotMethod(parsed, method.node, robot, method.name)
    return target ? { ...target, file: 'robot' } : method.location
  }
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
  if (sym.qualifier) {
    // the @alias part goes to the import line that defines it
    if (col <= sym.location.col + sym.qualifier.length) return findDefinition(parsed, '@' + sym.qualifier)
    // the .name part goes to the header of name in the file imported as alias
    const ref = importsOf(parsed).find((r) => r.alias === sym.qualifier)
    const spec = ref && resolveImport?.(ref.name)
    const target = spec && findDefinition(spec, sym.key)
    return ref && target ? { ...target, importFile: ref.name } : undefined
  }
  const local = findDefinition(parsed, sym.key)
  if (local || !resolveImport) return local
  // a reference to an imported name goes to its header in the imported file, aliased imports only by alias.name
  for (const ref of importsOf(parsed).filter((r) => !r.alias)) {
    const target = findDefinition(resolveImport(ref.name) ?? { roots: [], nodes: [], tokens: [] }, sym.key)
    if (target) return { ...target, importFile: ref.name }
  }
  return undefined
}

// a % child line, with the cursor on the % or its name
function methodAt(parsed: Parsed, line: number, col: number) {
  const node = parsed.nodes.find((n) => n.kind === 'child' && n.line === line && n.token?.kind === 'percent')
  const percent = node?.token
  if (!node || !percent) return undefined
  const word = node.tokens.find((t) => t.kind === 'word' && t.line === line && t.col === percent.col + 1)
  if (!word || col < percent.col || col > word.col + word.length) return undefined
  return { node, name: word.text, location: { line, col: percent.col, length: 1 + word.length } }
}

// the key of a header node, prefix + name or # + requirement text, same as findDefinition uses
function headerKey(node: Node): string | undefined {
  const first = node.tokens[0]
  if (first?.kind !== 'prefix') return undefined
  if (first.text === '#') return requirementHeader(node)?.key
  const name = node.tokens[1]
  return name?.kind === 'word' && name.line === first.line && name.col === first.col + 1 ? first.text + name.text : undefined
}

// the same % child under the same header in the robot, matched by name, any pointer is ignored
function robotMethod(parsed: Parsed, node: Node, robot: Parsed, name: string): Location | undefined {
  let header = node
  while (header.parent) header = header.parent
  const key = header.kind === 'header' ? headerKey(header) : undefined
  const target = key && robot.roots.find((r) => r.kind === 'header' && headerKey(r) === key)
  if (!target) return undefined
  const stack = [...target.children]
  for (let n = stack.shift(); n; n = stack.shift()) {
    const percent = n.token
    const word = percent?.kind === 'percent' ? n.tokens.find((t) => t.kind === 'word' && t.col === percent.col + 1) : undefined
    if (percent && word?.text === name) return { line: n.line, col: percent.col, length: 1 + word.length }
    stack.unshift(...n.children)
  }
  return undefined
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
