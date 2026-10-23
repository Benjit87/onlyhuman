// @AutoComplete: ?Parsed + cursor -> names to offer after @, $, ? and @alias.
import { collectSymbols, importsOf } from './definition.ts'
import type { Parsed, Token } from './types.ts'

export interface CompletionItem {
  label: string // the name only, the prefix (and the alias) are already typed
  kind: 'alias' | 'service' | 'entity' | 'state'
  source?: string // the imported file the name comes from, none for this spec
}

const KIND = { '@': 'service', $: 'entity', '?': 'state' } as const

function definitions(parsed: Parsed, prefix: '@' | '$' | '?', skip: Set<string>, source?: string): CompletionItem[] {
  return collectSymbols(parsed)
    .filter((s) => s.isDefinition && s.key[0] === prefix && !skip.has(s.key))
    .map((s) => ({ label: s.key.slice(1), kind: KIND[prefix], source }))
}

// the symbol being typed: a prefix, then optionally a name, then optionally .partial, all glued, ending at col
function typed(parsed: Parsed, line: number, col: number): { prefix: Token; name?: Token; dot?: Token } | undefined {
  const toks = parsed.tokens.filter((t) => t.line === line)
  if (toks.some((t) => t.kind === 'comment' && t.col < col)) return undefined
  const before = toks.filter((t) => t.col + t.length <= col).slice(-3)
  const at = before.findIndex((t) => t.kind === 'prefix' && '@$?'.includes(t.text))
  if (at === -1) return undefined
  const chain = before.slice(at)
  for (let i = 1; i < chain.length; i++) if (chain[i - 1].col + chain[i - 1].length !== chain[i].col) return undefined
  const last = chain[chain.length - 1]
  if (last.col + last.length !== col) return undefined
  const [prefix, name, dot] = chain
  if (name && name.kind !== 'word') return undefined
  if (dot && (prefix.text !== '@' || dot.kind !== 'word' || !dot.text.startsWith('.'))) return undefined
  return { prefix, name, dot }
}

// line 1-based, col 0-based, the cursor sits right after what has been typed.
// After @ the aliases of this spec's imports, then its @ definitions. After $ or ? its definitions of that prefix.
// After @alias. the @ definitions of the spec imported as alias, found through resolveImport; after @alias.$ or @alias.? its $ or ? ones.
export function completeAt(
  parsed: Parsed,
  line: number,
  col: number,
  resolveImport?: (name: string) => Parsed | undefined,
): CompletionItem[] {
  const t = typed(parsed, line, col)
  if (!t) return []
  const prefix = t.prefix.text as '@' | '$' | '?'
  const imports = importsOf(parsed)
  const items: CompletionItem[] = []
  if (t.dot) {
    const ref = imports.find((r) => r.alias === t.name?.text)
    const spec = ref && resolveImport?.(ref.name)
    // the prefix typed after the dot picks the kind, none means @
    const kind = t.dot.text[1] === '$' || t.dot.text[1] === '?' ? (t.dot.text[1] as '$' | '?') : '@'
    if (spec) items.push(...definitions(spec, kind, new Set(), ref.name))
  } else if (prefix === '@') {
    const aliases = new Set(imports.flatMap((r) => (r.alias ? ['@' + r.alias] : [])))
    for (const r of imports) if (r.alias) items.push({ label: r.alias, kind: 'alias', source: r.name })
    items.push(...definitions(parsed, '@', aliases))
  } else {
    items.push(...definitions(parsed, prefix, new Set()))
  }
  return items.filter((it, i) => items.findIndex((o) => o.label === it.label && o.kind === it.kind) === i)
}
