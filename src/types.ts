// @Token @Tokens @Node @Data types. Erasable syntax only (runs under node type stripping).

export type TokenKind =
  | 'prefix' // @ $ ? #
  | 'comment' // //
  | 'comment_sentence' // the words after //
  | 'arrow' // ->
  | 'plus' // +
  | 'equals' // ==
  | 'bullet' // first - on a line
  | 'dash' // any later -
  | 'percent' // % (*.bot only by convention)
  | 'word'

export interface Token {
  kind: TokenKind
  text: string
  line: number // 1-based
  col: number // 0-based
  length: number
  indent: string // leading whitespace of the token's line
}

export type Tokens = Token[]

export type NodeKind = 'header' | 'child'

export interface Node {
  kind: NodeKind
  token?: Token // first token after the bullet
  tokens: Token[] // all tokens of the line, in order
  line: number
  indent: string
  depth: number
  parent?: Node
  children: Node[]
}

export interface Parsed {
  roots: Node[] // headers, plus orphan children
  nodes: Node[] // every node, source order
  tokens: Tokens
}

export type Severity = 'error' | 'warning'

export interface Diagnostic {
  rule: string
  severity: Severity
  line: number // 1-based
  col: number // 0-based
  length: number
  message: string
}

export interface Location {
  line: number // 1-based
  col: number // 0-based
  length: number
  file?: 'robot' // set when the location is in the sibling .bot, absent = the .human itself
}

export const PREFIXES = ['@', '$', '?', '#']
export const SYMBOL_PREFIXES = ['@', '$', '?']
