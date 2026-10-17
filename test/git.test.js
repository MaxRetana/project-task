import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { slugify, branchName, parsePr, createBranch, assertValidBranch, findPr } from '../src/git.js';
import { ValidationError } from '../src/schema.js';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

test('slugify quita acentos y símbolos', () => {
  assert.equal(slugify('Núcleo de tareas: ¡ID y JSON!'), 'nucleo-de-tareas-id-y-json');
  assert.equal(slugify('a'.repeat(60)).length, 40);
});

test('branchName usa prefijo del tipo, número y título', () => {
  assert.equal(branchName({ type: 'bug', number: 4, title: 'No guarda' }), 'fix/4-no-guarda');
  assert.equal(branchName({ type: 'feature', number: 7, title: 'Modo oscuro' }), 'feat/7-modo-oscuro');
  assert.equal(branchName({ type: 'task', number: 2, title: 'Limpiar' }), 'chore/2-limpiar');
});

test('parsePr acepta número, #número y URL; rechaza el resto', () => {
  assert.deepEqual(parsePr('12'), { number: 12, url: null });
  assert.deepEqual(parsePr('#12'), { number: 12, url: null });
  assert.equal(parsePr('https://github.com/MaxRetana/project-task/pull/9').number, 9);
  assert.throws(() => parsePr('https://evil.com/pull/1'), ValidationError);
  assert.throws(() => parsePr('abc'), ValidationError);
});

test('rechaza nombres de rama peligrosos', async () => {
  await assert.rejects(assertValidBranch('--upload-pack=x'), ValidationError);
  await assert.rejects(assertValidBranch('mala rama'), ValidationError);
  await assert.rejects(assertValidBranch(''), ValidationError);
});

test('createBranch crea la rama desde la base y es idempotente', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'tm-git-'));
  git(cwd, 'init', '-q', '-b', 'develop');
  git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-q', '-m', 'init');
  const task = { type: 'feature', number: 1, title: 'Hola mundo' };
  assert.equal(await createBranch(task, { cwd }), 'feat/1-hola-mundo');
  assert.equal(git(cwd, 'branch', '--show-current'), 'feat/1-hola-mundo');
  git(cwd, 'checkout', '-q', 'develop');
  assert.equal(await createBranch(task, { cwd }), 'feat/1-hola-mundo');
  assert.equal(git(cwd, 'branch', '--show-current'), 'feat/1-hola-mundo');
});

test('findPr usa gh y tolera que no exista', async () => {
  const ok = await findPr('x', { exec: async () => '{"number":3,"url":"u","state":"OPEN","title":"t"}' });
  assert.equal(ok.number, 3);
  assert.equal(await findPr('x', { exec: async () => { throw new Error('no gh'); } }), null);
});
