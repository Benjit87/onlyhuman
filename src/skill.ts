// $Skill: init -> write .onlyhuman/SKILL.md
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export interface InitSkillOptions {
  force?: boolean
}

export function skillName(directory: string): string {
  const raw = basename(resolve(directory))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (raw || 'project').slice(0, 64).replace(/-+$/g, '') || 'project'
}

export function renderSkillTemplate(name: string, displayName: string): string {
  return `---
name: ${name}
description: "Project-specific guidance for an LLM working in ${name}. Use when changing, explaining, or reviewing this project."
---

# ${displayName}

- Replace this starter guidance with project-specific details before relying on the skill.

## Purpose
- State what this project does and the outcome it provides.

## Constraints
- Record project-specific rules and invariants that must not be broken.
- Note generated files or directories that must not be edited by hand.

## Workflow
- Read the relevant files and existing patterns before editing.
- Make changes in small steps and verify each step.
- Run the project checks before handing work back.

## Commands
- Add the exact install, test, lint and build commands for this project.

## References
- Link only the documents needed for a specific task.
`
}

export function initSkill(directory = '.', options: InitSkillOptions = {}): string {
  const root = resolve(directory)
  const target = join(root, '.onlyhuman', 'SKILL.md')
  if (existsSync(target) && !options.force) {
    throw new Error(`${target} already exists; use --force to overwrite`)
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderSkillTemplate(skillName(root), basename(root) || 'Project'), 'utf8')
  return target
}
