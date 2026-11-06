// @Init: library skills/onlyhuman/SKILL.md -> copy -> <directory>/skills/onlyhuman/SKILL.md
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface InitSkillOptions {
  force?: boolean
}

// src/skill.ts and dist/cli.js both sit one folder below the package root that holds skills/
const librarySkill = fileURLToPath(new URL('../skills/onlyhuman/SKILL.md', import.meta.url))

export function initSkill(directory = '.', options: InitSkillOptions = {}): string {
  const root = resolve(directory)
  const target = join(root, 'skills', 'onlyhuman', 'SKILL.md')
  if (!existsSync(librarySkill)) {
    throw new Error(`${librarySkill} does not exist; the onlyhuman package is missing its skills/onlyhuman/SKILL.md`)
  }
  if (existsSync(target) && !options.force) {
    throw new Error(`${target} already exists; use --force to overwrite`)
  }
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(librarySkill, target)
  return target
}
