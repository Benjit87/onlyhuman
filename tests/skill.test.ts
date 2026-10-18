import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initSkill, skillName } from '../src/skill.ts'

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

test('skill: init writes .onlyhuman/SKILL.md with a valid template', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const project = join(root, 'My Project')
  mkdirSync(project)
  const target = initSkill(project)
  assert.equal(target, join(project, '.onlyhuman', 'SKILL.md'))
  const text = readFileSync(target, 'utf8')
  assert.match(text, /^---\nname: my-project\ndescription: /)
  assert.match(text, /# My Project/)
  assert.match(text, /## Purpose/)
  assert.match(text, /## Workflow/)
  rmSync(root, { recursive: true })
})

test('skill: name is a lowercase hyphenated folder name', () => {
  assert.equal(skillName('/tmp/My Project'), 'my-project')
})

test('skill: init refuses to overwrite unless forced', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const target = initSkill(root)
  writeFileSync(target, 'keep me')
  assert.throws(() => initSkill(root), /already exists.*--force/)
  assert.equal(readFileSync(target, 'utf8'), 'keep me')
  initSkill(root, { force: true })
  assert.match(readFileSync(target, 'utf8'), /^---/)
  rmSync(root, { recursive: true })
})

test('skill: CLI init writes the file and requires --force to replace it', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const project = join(root, 'demo')
  mkdirSync(project)

  const first = spawnSync(process.execPath, [cli, 'skill', 'init', project], { encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /created .*\.onlyhuman\/SKILL\.md/)
  assert.ok(existsSync(join(project, '.onlyhuman', 'SKILL.md')))

  const second = spawnSync(process.execPath, [cli, 'skill', 'init', project], { encoding: 'utf8' })
  assert.equal(second.status, 1)
  assert.match(second.stderr, /--force/)

  const forced = spawnSync(process.execPath, [cli, 'skill', 'init', project, '--force'], { encoding: 'utf8' })
  assert.equal(forced.status, 0, forced.stderr)
  rmSync(root, { recursive: true })
})
