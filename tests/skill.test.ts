import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initSkill } from '../src/skill.ts'

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

test('skill: init copies the project SKILL.md byte-for-byte', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const project = join(root, 'My Project')
  mkdirSync(project)
  const source = '---\nname: my-project\ndescription: Project guidance.\n---\n\n# My Project\n'
  writeFileSync(join(project, 'SKILL.md'), source)
  const target = initSkill(project)
  assert.equal(target, join(project, '.onlyhuman', 'SKILL.md'))
  assert.equal(readFileSync(target, 'utf8'), source)
  rmSync(root, { recursive: true })
})

test('skill: init fails when the project SKILL.md is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  assert.throws(() => initSkill(root), /SKILL\.md does not exist/)
  rmSync(root, { recursive: true })
})

test('skill: init refuses to overwrite unless forced', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const source = 'source contents\n'
  writeFileSync(join(root, 'SKILL.md'), source)
  const target = initSkill(root)
  writeFileSync(target, 'keep me')
  assert.throws(() => initSkill(root), /already exists.*--force/)
  assert.equal(readFileSync(target, 'utf8'), 'keep me')
  initSkill(root, { force: true })
  assert.equal(readFileSync(target, 'utf8'), source)
  rmSync(root, { recursive: true })
})

test('skill: CLI init copies the file and requires --force to replace it', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const project = join(root, 'demo')
  mkdirSync(project)
  const source = 'project skill contents\n'
  writeFileSync(join(project, 'SKILL.md'), source)

  const first = spawnSync(process.execPath, [cli, 'skill', 'init', project], { encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /created .*\.onlyhuman\/SKILL\.md/)
  assert.equal(readFileSync(join(project, '.onlyhuman', 'SKILL.md'), 'utf8'), source)

  const second = spawnSync(process.execPath, [cli, 'skill', 'init', project], { encoding: 'utf8' })
  assert.equal(second.status, 1)
  assert.match(second.stderr, /--force/)

  const forced = spawnSync(process.execPath, [cli, 'skill', 'init', project, '--force'], { encoding: 'utf8' })
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(readFileSync(join(project, '.onlyhuman', 'SKILL.md'), 'utf8'), source)
  rmSync(root, { recursive: true })
})
