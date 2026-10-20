#!/usr/bin/env node
// @CLI: onlyhuman lint <file> | onlyhuman def <name> <file> | onlyhuman def <file>:<line>:<col> | onlyhuman skill init
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { definitionAt, findDefinition, pointerAt } from './definition.ts'
import {
  importPathFor,
  importResolver,
  loadRobot,
  pointerLineCounter,
  pointerTargetExists,
  robotPathFor,
  siblingExists,
} from './files.ts'
import { lint } from './linter.ts'
import { parseText } from './parser.ts'
import { initSkill } from './skill.ts'

const USAGE = `usage:
  onlyhuman lint <file>             *.human or *.bot
  onlyhuman def <name> <file>        e.g. onlyhuman def '$Token' spec.human
  onlyhuman def <file>:<line>:<col>  1-based line and col
  onlyhuman skill init [directory] [--force]  write onlyhuman-skill/SKILL.md`

function load(file: string) {
  return parseText(readFileSync(file, 'utf8'))
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv

  if (cmd === 'skill' && rest[0] === 'init') {
    const args = rest.slice(1)
    const paths = args.filter((a) => a !== '--force')
    if (paths.length > 1) {
      console.error(USAGE)
      return 2
    }
    try {
      const target = initSkill(paths[0] ?? '.', { force: args.includes('--force') })
      console.log(`created ${target}`)
      return 0
    } catch (e) {
      console.error((e as Error).message)
      return 1
    }
  }

  if (cmd === 'lint' && rest.length === 1) {
    const file = rest[0]
    const diags = lint(load(file), {
      file: {
        path: file,
        siblingExists: siblingExists(file),
        lineCount: pointerLineCounter(file),
        resolveImport: importResolver(file),
      },
    })
    for (const d of diags) console.log(`${file}:${d.line}:${d.col + 1} ${d.severity} ${d.rule} ${d.message}`)
    return diags.some((d) => d.severity === 'error') ? 1 : 0
  }

  if (cmd === 'def' && rest.length === 2) {
    const [name, file] = rest
    const loc = findDefinition(load(file), name)
    if (!loc) return notFound(name)
    console.log(`${file}:${loc.line}:${loc.col + 1}`)
    return 0
  }

  if (cmd === 'def' && rest.length === 1) {
    const m = /^(.*):(\d+):(\d+)$/.exec(rest[0])
    if (m) {
      const parsed = load(m[1])
      const [line, col] = [Number(m[2]), Number(m[3]) - 1]
      // in a .bot a definition header goes to the code line it points to
      const ptr = m[1].endsWith('.bot') ? pointerAt(parsed, line, col) : undefined
      const code = ptr && pointerTargetExists(m[1], ptr.path)
      if (ptr && code) {
        console.log(`${relative(process.cwd(), code)}:${ptr.line}:1`)
        return 0
      }
      const loc = definitionAt(parsed, line, col, loadRobot(m[1]), importResolver(m[1]))
      if (!loc) return notFound(rest[0])
      const where = loc.importFile
        ? relative(process.cwd(), importPathFor(m[1], loc.importFile)!)
        : loc.file === 'robot'
          ? robotPathFor(m[1])
          : m[1]
      console.log(`${where}:${loc.line}:${loc.col + 1}`)
      return 0
    }
  }

  console.error(USAGE)
  return 2
}

function notFound(what: string): number {
  console.error(`no definition for ${what}`)
  return 1
}

try {
  process.exit(main(process.argv.slice(2)))
} catch (e) {
  console.error((e as Error).message)
  process.exit(2)
}
