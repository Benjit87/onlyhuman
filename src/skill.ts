// $Skill: ./SKILL.md -> copy -> .onlyhuman/SKILL.md
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface InitSkillOptions {
  force?: boolean
}

export function initSkill(directory = '.', options: InitSkillOptions = {}): string {
  const root = resolve(directory)
  const source = join(root, 'SKILL.md')
  const target = join(root, '.onlyhuman', 'SKILL.md')
  if (!existsSync(source)) {
    throw new Error(`${source} does not exist; create the project SKILL.md first`)
  }
  if (existsSync(target) && !options.force) {
    throw new Error(`${target} already exists; use --force to overwrite`)
  }
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  return target
}
