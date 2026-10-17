// $Linter: ?Parsed -> lint -> diagnostics
import { collectSymbols, pointerOf } from './definition.ts'
import type { Diagnostic, Node, Parsed, Severity, Token } from './types.ts'
import { PREFIXES } from './types.ts'

export interface LintOptions {
  // pass when the file is on disk: enables missing-robot, missing-human and broken-pointer
  file?: {
    path: string
    siblingExists: boolean // x.human <-> x.bot
    // line count of the file a [path] points to, undefined if it is missing.
    // leave out when there is no project root, broken-pointer is then skipped
    lineCount?: (pointerPath: string) => number | undefined
  }
}

const OPERATORS = ['arrow', 'plus', 'equals']

export function lint(parsed: Parsed, options: LintOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = []
  const add = (rule: string, severity: Severity, t: { line: number; col: number; length: number }, message: string) =>
    out.push({ rule, severity, line: t.line, col: t.col, length: t.length, message })

  for (const node of parsed.nodes) {
    const first = node.tokens[0]
    const span = { line: node.line, col: 0, length: Math.max(first.col + first.length, 1) }

    if (/\t/.test(node.indent) || node.indent.length % 2 !== 0) {
      add('bad-indent', 'error', { line: node.line, col: 0, length: node.indent.length }, 'indent must be 2 spaces per level')
    } else if (node.parent && node.depth > node.parent.depth + 1) {
      add('indent-jump', 'error', span, `indented ${node.depth - node.parent.depth} levels under its parent, expected 1`)
    }

    if (node.kind === 'header') {
      const ok = (first.kind === 'prefix' && PREFIXES.includes(first.text)) || first.kind === 'comment'
      if (!ok) add('no-prefix', 'error', first, 'line has no - and no prefix (@ $ ? # //)')
    } else if (!node.parent) {
      add('orphan-child', 'error', first, '- line has no header above it')
    }

    if (node.kind === 'child' && node.tokens[1]?.kind === 'dash') {
      const content = node.tokens.slice(2).filter((t) => t.kind !== 'comment' && t.kind !== 'comment_sentence')
      if (content.length) add('repeated-bullet', 'error', node.tokens[1], 'nest children with 2-space indentation; a listed dash must stand alone')
    }

    checkOperators(node, add)
  }

  const symbols = collectSymbols(parsed)
  const defs = new Map<string, number>()
  const referenced = new Set<string>()
  for (const s of symbols) {
    if (s.isDefinition) {
      defs.set(s.key, (defs.get(s.key) ?? 0) + 1)
      if (defs.get(s.key)! > 1) add('duplicate-definition', 'error', s.location, `${s.key} is already defined`)
    } else {
      referenced.add(s.key)
    }
  }
  for (const s of symbols) {
    if (!s.isDefinition && !defs.has(s.key)) add('undefined-reference', 'error', s.location, `${s.key} is not defined`)
  }
  const reported = new Set<string>()
  for (const s of symbols) {
    if (s.isDefinition && !referenced.has(s.key) && !reported.has(s.key)) {
      reported.add(s.key)
      add('unused-definition', 'warning', s.location, `${s.key} is defined but never referenced`)
    }
  }

  const file = options.file
  if (file && !file.siblingExists) {
    const top = { line: 1, col: 0, length: 1 }
    if (file.path.endsWith('.human')) add('missing-robot', 'warning', top, 'no sibling .bot file found')
    if (file.path.endsWith('.bot')) add('missing-human', 'warning', top, 'no sibling .human file found')
  }

  if (file?.lineCount && file.path.endsWith('.bot')) {
    for (const node of parsed.nodes) {
      if (node.kind !== 'header') continue
      const ptr = pointerOf(node)
      if (!ptr) continue
      const count = file.lineCount(ptr.path)
      if (count === undefined) add('broken-pointer', 'warning', ptr.token, `${ptr.path} does not exist`)
      else if (ptr.line < 1 || ptr.line > count) {
        add('broken-pointer', 'warning', ptr.token, `${ptr.path} has ${count} lines, no line ${ptr.line}`)
      }
    }
  }

  return out.sort((a, b) => a.line - b.line || a.col - b.col)
}

function checkOperators(
  node: Node,
  add: (rule: string, severity: Severity, t: Token, message: string) => void,
) {
  // only the part before a comment counts
  const ci = node.tokens.findIndex((t) => t.kind === 'comment')
  const toks = ci === -1 ? node.tokens : node.tokens.slice(0, ci)
  const isOperand = (t?: Token) => !!t && t.kind !== 'bullet' && !OPERATORS.includes(t.kind)
  // an operator alone on its line is a listing of the operator, e.g `- ->` under @Token
  if (toks.filter((t) => t.kind !== 'bullet').length === 1) return
  toks.forEach((t, i) => {
    if (!OPERATORS.includes(t.kind)) return
    if (!isOperand(toks[i - 1])) add('dangling-operator', 'error', t, `${t.text} has no left operand`)
    else if (!isOperand(toks[i + 1])) add('dangling-operator', 'error', t, `${t.text} has no right operand`)
  })
}
