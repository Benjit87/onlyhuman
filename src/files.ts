// the only fs access around the pure core: sibling file, project root, pointer targets
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { parseText } from './parser.ts'
import type { Parsed } from './types.ts'

export function robotPathFor(humanPath: string): string {
  return humanPath.replace(/\.human$/, '.bot')
}

export function humanPathFor(robotPath: string): string {
  return robotPath.replace(/\.bot$/, '.human')
}

// x.human <-> x.bot, anything else maps to itself
export function siblingPathFor(path: string): string {
  return path.endsWith('.bot') ? humanPathFor(path) : robotPathFor(path)
}

export function siblingExists(path: string): boolean {
  const sibling = siblingPathFor(path)
  return sibling !== path && existsSync(sibling)
}

export function loadRobot(humanPath: string): Parsed | undefined {
  const path = robotPathFor(humanPath)
  return path !== humanPath && existsSync(path) ? parseText(readFileSync(path, 'utf8')) : undefined
}

export function findProjectRoot(fromPath: string): string | undefined {
  let dir = dirname(resolve(fromPath))
  let specParent: string | undefined
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    if (!specParent && basename(dir) === 'spec') specParent = dirname(dir)
    const up = dirname(dir)
    if (up === dir) return specParent
    dir = up
  }
}

// absolute path a [path] pointer in this file refers to, undefined when there is no project root
export function resolvePointerPath(filePath: string, pointerPath: string): string | undefined {
  const root = findProjectRoot(filePath)
  return root ? join(root, pointerPath) : undefined
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

// line count of the pointed file, undefined if it is missing. Whole function undefined = no project root.
export function pointerLineCounter(filePath: string): ((pointerPath: string) => number | undefined) | undefined {
  if (!findProjectRoot(filePath)) return undefined
  return (pointerPath) => {
    const abs = resolvePointerPath(filePath, pointerPath)
    if (!abs || !isFile(abs)) return undefined
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/)
    if (lines[lines.length - 1] === '') lines.pop()
    return lines.length
  }
}

export function pointerTargetExists(filePath: string, pointerPath: string): string | undefined {
  const abs = resolvePointerPath(filePath, pointerPath)
  return abs && isFile(abs) ? abs : undefined
}

// the spec/ folder an import is resolved under: nearest spec folder above the file, else the file's own folder
export function specDirFor(filePath: string): string {
  const own = dirname(resolve(filePath))
  for (let dir = own; ; dir = dirname(dir)) {
    if (basename(dir) === 'spec') return dir
    if (dirname(dir) === dir) return own
  }
}

// absolute path of the spec an import line names, undefined if it is missing or leaves the spec folder
export function importPathFor(filePath: string, name: string): string | undefined {
  const dir = specDirFor(filePath)
  const abs = resolve(dir, name)
  return abs.startsWith(dir + sep) && isFile(abs) ? abs : undefined
}

export function importResolver(filePath: string): (name: string) => Parsed | undefined {
  return (name) => {
    const abs = importPathFor(filePath, name)
    return abs ? parseText(readFileSync(abs, 'utf8')) : undefined
  }
}
