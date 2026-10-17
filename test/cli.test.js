import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { main } from '../src/cli.js';

const setup = () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'tm-')), 'tasks.json'));
  const lines = [];
  const run = (...argv) => main(argv, { store, out: (s) => lines.push(s) });
  return { store, lines, run };
};

test('add, list, status y show', async () => {
  const { lines, run } = setup();
  await run('add', 'task', 'Preparar', 'demo', '-f', 'goal=Que funcione');
  assert.match(lines.at(-1), /Creada TASK-1: Preparar demo/);
  await run('status', '1', 'review');
  await run('list', '--status', 'review');
  assert.match(lines.at(-1), /TASK-1\s+review/);
  await run('show', 'TASK-1');
  assert.ok(lines.some((l) => l.includes('Que funcione')));
});

test('errores claros por uso incorrecto', async () => {
  const { run } = setup();
  await assert.rejects(run('add', 'bug', 'x'), /obligatorio/);
  await assert.rejects(run('add', 'task', 'x', '-f', 'mal'), /clave=valor/);
  await assert.rejects(run('nope'), /Comando desconocido/);
  await assert.rejects(run('show', '99'), /No existe/);
});

test('pr se vincula por número y URL', async () => {
  const { store, run } = setup();
  await run('add', 'task', 'A', '-f', 'goal=x');
  await run('pr', '1', '12');
  assert.equal(store.get('1').pr.number, 12);
  await run('pr', '1', 'https://github.com/MaxRetana/project-task/pull/13');
  assert.equal(store.get('1').pr.number, 13);
});

test('dos Store sobre el mismo archivo ven los cambios del otro', () => {
  const { store } = setup();
  const other = new Store(store.file);
  other.create({ type: 'task', title: 'Desde otro proceso', fields: { goal: 'x' } });
  assert.equal(store.list().length, 1);
  assert.equal(store.create({ type: 'task', title: 'B', fields: { goal: 'y' } }).id, 'TASK-2');
});

test('serve levanta el servidor con rutas de git y rama/PR', async () => {
  const { store, run } = setup();
  await run('add', 'feature', 'Modo oscuro', '-f', 'problem=p', '-f', 'proposal=q');
  const app = await run('serve', '--port', '0');
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    let res = await post('/api/tasks/1/branch', {});
    assert.equal((await res.json()).branch, 'feat/1-modo-oscuro');
    res = await post('/api/tasks/1/pr', { pr: '5' });
    assert.equal((await res.json()).pr.number, 5);
    res = await post('/api/tasks/1/pr', { pr: 'basura' });
    assert.equal(res.status, 400);
    assert.equal(store.get('1').pr.number, 5);
  } finally {
    app.close();
  }
});
