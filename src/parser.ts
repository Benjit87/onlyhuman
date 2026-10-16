// @Tokens + @Structure -> parser -> ?Parsed. Never throws.
import { tokenize } from './tokenizer.ts'
import type { Node, Parsed, Token, Tokens } from './types.ts'

// 2 spaces per level, a tab counts as one level so depth stays sane; bad-indent is a lint matter
function indentLevel(indent: string): number {
  let level = 0
  let spaces = 0
  for (const ch of indent) {
    if (ch === '\t') level++
    else spaces++
  }
  return level + Math.floor(spaces / 2)
}

export function parse(tokens: Tokens): Parsed {
  const byLine = new Map<number, Token[]>()
  for (const t of tokens) {
    const arr = byLine.get(t.line)
    if (arr) arr.push(t)
    else byLine.set(t.line, [t])
  }

  const roots: Node[] = []
  const nodes: Node[] = []
  const stack: Node[] = []

  for (const [line, toks] of byLine) {
    const bullet = toks[0].kind === 'bullet'
    const node: Node = {
      kind: bullet ? 'child' : 'header',
      token: bullet ? toks[1] : toks[0],
      tokens: toks,
      line,
      indent: toks[0].indent,
      depth: indentLevel(toks[0].indent) + (bullet ? 1 : 0),
      children: [],
    }
    while (stack.length && stack[stack.length - 1].depth >= node.depth) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent && node.kind === 'child') {
      node.parent = parent
      parent.children.push(node)
    } else {
      roots.push(node)
    }
    nodes.push(node)
    stack.push(node)
  }
  return { roots, nodes, tokens }
}

export function parseText(text: string): Parsed {
  return parse(tokenize(text))
}
