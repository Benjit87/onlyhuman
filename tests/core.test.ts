import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findProjectRoot, pointerLineCounter } from '../src/files.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { definitionAt, findDefinition, pointerAt } from '../src/definition.ts'
import { lint } from '../src/linter.ts'
import { parseText } from '../src/parser.ts'
import { tokenize } from '../src/tokenizer.ts'

const kinds = (s: string) => tokenize(s).map((t) => `${t.kind}:${t.text}`)
const rules = (s: string) => lint(parseText(s)).map((d) => d.rule)

test('tokenizer: prefix + name, operators, bullet vs dash, comment', () => {
  assert.deepEqual(kinds('$Token'), ['prefix:$', 'word:Token'])
  assert.deepEqual(kinds('- @'), ['bullet:-', 'prefix:@'])
  assert.deepEqual(kinds('- - // a b'), ['bullet:-', 'dash:-', 'comment://', 'comment_sentence:a b'])
  assert.deepEqual(kinds('- $A -> x + ?B == y'), [
    'bullet:-', 'prefix:$', 'word:A', 'arrow:->', 'word:x', 'plus:+', 'prefix:?', 'word:B', 'equals:==', 'word:y',
  ])
  assert.deepEqual(kinds('- *.human file'), ['bullet:-', 'word:*.human', 'word:file'])
})

test('tokenizer: percent is its own token, with or without a name', () => {
  assert.deepEqual(kinds('  - %parse // x'), ['bullet:-', 'percent:%', 'word:parse', 'comment://', 'comment_sentence:x'])
  assert.deepEqual(kinds('- %'), ['bullet:-', 'percent:%'])
  assert.deepEqual(rules('$A\n- %m\n- x'), ['unused-definition'])
})

test('tokenizer: comment text is never tokenized, positions are right', () => {
  const t = tokenize('- a // see $X -> y')
  assert.equal(t.at(-1)!.kind, 'comment_sentence')
  assert.equal(t.at(-1)!.text, 'see $X -> y')
  assert.equal(t.at(-1)!.col, 7)
})

test('tokenizer: // inside quotes or after a character is a word, not a comment', () => {
  assert.deepEqual(kinds('- @ $ ? # "//" -> + == - each get'), [
    'bullet:-', 'prefix:@', 'prefix:$', 'prefix:?', 'prefix:#', 'word:"//"',
    'arrow:->', 'plus:+', 'equals:==', 'dash:-', 'word:each', 'word:get',
  ])
  assert.deepEqual(kinds('- a//b \\// c'), ['bullet:-', 'word:a//b', 'word:\\//', 'word:c'])
  assert.deepEqual(kinds('- "// x"'), ['bullet:-', 'word:"//', 'word:x"'])
})

test('parser: unlimited depth by 2-space indent + bullet', () => {
  const p = parseText('$A\n- b\n  - c\n    - d\n- e\n$F')
  assert.equal(p.roots.length, 2)
  assert.equal(p.roots[0].children.length, 2)
  assert.equal(p.roots[0].children[0].children[0].children[0].depth, 3)
})

test('linter: clean file', () => {
  assert.deepEqual(rules('$A\n- $A\n'), [])
})

test('linter rules', () => {
  assert.ok(rules('Parser\n').includes('no-prefix'))
  assert.ok(rules('- x\n').includes('orphan-child'))
  assert.ok(rules('$A\n - x\n').includes('bad-indent'))
  assert.ok(rules('$A\n\t- x\n').includes('bad-indent'))
  assert.ok(rules('$A\n    - x\n').includes('indent-jump'))
  assert.ok(rules('$A\n- - x\n').includes('repeated-bullet'))
  assert.ok(!rules('$A\n- - // dash token\n').includes('repeated-bullet'))
  assert.ok(rules('$A\n- $Nodee\n').includes('undefined-reference'))
  assert.ok(rules('$A\n$A\n').includes('duplicate-definition'))
  assert.ok(rules('$A\n- x ->\n').includes('dangling-operator'))
  assert.ok(rules('$A\n- +\n').includes('dangling-operator') === false) // lone operator = listing
  assert.ok(rules('$A\n- + x y\n').includes('dangling-operator'))
  assert.ok(rules('$A\n').includes('unused-definition'))
})

test('linter: not flagged', () => {
  assert.deepEqual(rules('$A\n- $\n- ->\n- bare words\n- // $Nope -> x\n#req\n- $A\n'), [])
  assert.deepEqual(rules('$Data\n- $Data\n?Data\n- ?Data\n'), []) // per-prefix namespaces
})

test('linter: missing-robot only with file info', () => {
  const p = parseText('$A\n- $A\n')
  assert.deepEqual(lint(p), [])
  assert.deepEqual(
    lint(p, { file: { path: 'x.human', siblingExists: false } }).map((d) => d.rule),
    ['missing-robot'],
  )
  assert.deepEqual(lint(p, { file: { path: 'x.human', siblingExists: true } }), [])
})

test('go-to-definition', () => {
  const p = parseText('$A\n- x\n\n@B\n- $A -> y // @B\n- ?C\n')
  assert.deepEqual(findDefinition(p, '$A'), { line: 1, col: 0, length: 2 })
  assert.equal(findDefinition(p, '?C'), undefined)
  assert.deepEqual(definitionAt(p, 5, 3), { line: 1, col: 0, length: 2 }) // on prefix
  assert.deepEqual(definitionAt(p, 5, 4), { line: 1, col: 0, length: 2 }) // on name
  assert.deepEqual(definitionAt(p, 1, 0), { line: 1, col: 0, length: 2 }) // itself
  assert.equal(definitionAt(p, 5, 15), undefined) // in comment
  assert.equal(definitionAt(p, 5, 9), undefined) // on a word
})

test('go-to-definition: definition header jumps to the same header in the robot', () => {
  const human = parseText('$A\n- x\n\n@B\n- $A -> y\n#req\n')
  const robot = parseText('$A [./src/a.ts][3]\n- detail\n\n@B [./src/b.ts][9]\n')
  // definition header -> robot
  assert.deepEqual(definitionAt(human, 1, 1, robot), { line: 1, col: 0, length: 2, file: 'robot' })
  assert.deepEqual(definitionAt(human, 4, 1, robot), { line: 4, col: 0, length: 2, file: 'robot' })
  // reference -> its .human header, not the robot
  assert.deepEqual(definitionAt(human, 5, 3, robot), { line: 1, col: 0, length: 2 })
  // no robot, or header missing in it: stay on the definition
  assert.deepEqual(definitionAt(human, 1, 1), { line: 1, col: 0, length: 2 })
  assert.deepEqual(definitionAt(human, 1, 1, parseText('@B\n')), { line: 1, col: 0, length: 2 })
  // # headers without a matching robot header stay on the human header
  assert.deepEqual(definitionAt(human, 6, 2, robot), { line: 6, col: 0, length: 4 })
  // name form is unchanged, always the .human header
  assert.deepEqual(findDefinition(human, '$A'), { line: 1, col: 0, length: 2 })
})

test('go-to-definition: # requirement headers match their robot header and pointer', () => {
  const human = parseText('#implementation\n#vscode deployment\n')
  const robot = parseText('#implementation [./src/a.ts][3]\n#vscode deployment [./src/b.ts][9]\n')
  assert.deepEqual(definitionAt(human, 1, 3, robot), { line: 1, col: 0, length: 15, file: 'robot' })
  assert.deepEqual(definitionAt(human, 2, 10, robot), { line: 2, col: 0, length: 18, file: 'robot' })
  assert.deepEqual(definitionAt(human, 1, 3), { line: 1, col: 0, length: 15 })
  assert.deepEqual(findDefinition(robot, '#vscode deployment'), { line: 2, col: 0, length: 18 })
  assert.equal(pointerAt(robot, 1, 3)?.path, './src/a.ts')
  assert.equal(pointerAt(robot, 1, 20), undefined)
})

test('linter: missing-human and broken-pointer on a robot', () => {
  const p = parseText('$A [./src/a.ts][3]\n- @B\n@B [./nope.ts][1]\n- $A\n#req [./src/a.ts][99]\n')
  const lineCount = (path: string) => (path === './src/a.ts' ? 10 : undefined)
  const r = lint(p, { file: { path: 'x.bot', siblingExists: false, lineCount } })
  assert.deepEqual(r.map((d) => d.rule).sort(), ['broken-pointer', 'broken-pointer', 'missing-human'])
  assert.ok(r.find((d) => d.message.includes('does not exist')))
  assert.ok(r.find((d) => d.message.includes('10 lines, no line 99')))
  // a .human never gets pointer checks or missing-human
  const h = lint(p, { file: { path: 'x.human', siblingExists: true, lineCount } })
  assert.ok(!h.some((d) => d.rule === 'broken-pointer' || d.rule === 'missing-human'))
  // no lineCount (no project root): pointers are skipped
  assert.ok(!lint(p, { file: { path: 'x.bot', siblingExists: true } }).some((d) => d.rule === 'broken-pointer'))
})

test('go-to-definition in a robot: header -> its pointer, reference -> its header', () => {
  const robot = parseText('$A [./src/a.ts][3]\n- x\n@B\n- $A\n')
  const ptr = pointerAt(robot, 1, 1)
  assert.equal(ptr?.path, './src/a.ts')
  assert.equal(ptr?.line, 3)
  assert.equal(pointerAt(robot, 3, 1), undefined) // header without a pointer
  assert.equal(pointerAt(robot, 4, 3), undefined) // a reference has no pointer
  assert.deepEqual(definitionAt(robot, 4, 3), { line: 1, col: 0, length: 2 })
})

test('files: pointer base prefers nearest .git, then parent of spec/', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-'))
  mkdirSync(join(root, 'spec'))
  writeFileSync(join(root, 'a.ts'), 'l1\nl2\nl3\n')
  assert.equal(findProjectRoot(join(root, 'spec', 'x.bot')), root)
  const count = pointerLineCounter(join(root, 'spec', 'x.bot'))!
  assert.equal(count('./a.ts'), 3) // trailing newline is not an extra line
  assert.equal(count('./nope.ts'), undefined)
  mkdirSync(join(root, 'spec', 'nested'))
  writeFileSync(join(root, 'spec', '.git'), '')
  assert.equal(findProjectRoot(join(root, 'spec', 'nested', 'x.bot')), join(root, 'spec'))
  assert.equal(findProjectRoot(join(root, 'other', 'x.bot')), undefined)
  rmSync(root, { recursive: true })
})

test('go-to-definition in a robot: a % child line goes to its pointer', () => {
  const robot = parseText('@Parser [./a.ts][1]\n- %parse(x): Y [./a.ts][5] // note\n')
  assert.equal(pointerAt(robot, 2, 3)?.line, 5) // on %
  assert.equal(pointerAt(robot, 2, 5)?.line, 5) // on the name
  assert.equal(pointerAt(robot, 2, 40), undefined) // elsewhere on the line
})
