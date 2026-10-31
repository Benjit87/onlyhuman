import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initSkill } from '../src/skill.ts'

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

const librarySource = readFileSync(fileURLToPath(new URL('../onlyhuman/SKILL.md', import.meta.url)), 'utf8')

test('skill: init copies the library SKILL.md byte-for-byte and ignores the project SKILL.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const project = join(root, 'My Project')
  mkdirSync(project)
  writeFileSync(join(project, 'SKILL.md'), 'project skill, must not be used\n')
  const target = initSkill(project)
  assert.equal(target, join(project, 'onlyhuman', 'SKILL.md'))
  assert.equal(readFileSync(target, 'utf8'), librarySource)
  assert.equal(readFileSync(join(project, 'SKILL.md'), 'utf8'), 'project skill, must not be used\n')
  rmSync(root, { recursive: true })
})

test('skill: init works when the project has no SKILL.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const target = initSkill(root)
  assert.equal(readFileSync(target, 'utf8'), librarySource)
  rmSync(root, { recursive: true })
})

test('skill: init refuses to overwrite unless forced', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const target = initSkill(root)
  writeFileSync(target, 'keep me')
  assert.throws(() => initSkill(root), /already exists.*--force/)
  assert.equal(readFileSync(target, 'utf8'), 'keep me')
  initSkill(root, { force: true })
  assert.equal(readFileSync(target, 'utf8'), librarySource)
  rmSync(root, { recursive: true })
})

test('skill: CLI init copies the library file and requires --force to replace it', () => {
  const root = mkdtempSync(join(tmpdir(), 'oh-skill-'))
  const project = join(root, 'demo')
  mkdirSync(project)
  writeFileSync(join(project, 'SKILL.md'), 'project skill contents\n')

  const first = spawnSync(process.execPath, [cli, 'skill', 'init', project], { encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /created .*onlyhuman\/SKILL\.md/)
  assert.equal(readFileSync(join(project, 'onlyhuman', 'SKILL.md'), 'utf8'), librarySource)

  const second = spawnSync(process.execPath, [cli, 'skill', 'init', project], { encoding: 'utf8' })
  assert.equal(second.status, 1)
  assert.match(second.stderr, /--force/)

  const forced = spawnSync(process.execPath, [cli, 'skill', 'init', project, '--force'], { encoding: 'utf8' })
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(readFileSync(join(project, 'onlyhuman', 'SKILL.md'), 'utf8'), librarySource)
  rmSync(root, { recursive: true })
})
