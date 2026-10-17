import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, NotFoundError, normalizeId } from '../src/store.js';
import { ValidationError } from '../src/schema.js';

const newStore = () => new Store(join(mkdtempSync(join(tmpdir(), 'tm-')), 'tasks.json'));

test('genera IDs secuenciales', () => {
  const s = newStore();
  const a = s.create({ type: 'task', title: 'A', fields: { goal: 'x' } });
  const b = s.create({ type: 'task', title: 'B', fields: { goal: 'y' } });
  assert.equal(a.id, 'TASK-1');
  assert.equal(b.id, 'TASK-2');
});

test('los IDs no se reutilizan tras borrar', () => {
  const s = newStore();
  s.create({ type: 'task', title: 'A', fields: { goal: 'x' } });
  s.delete('TASK-1');
  assert.equal(s.create({ type: 'task', title: 'B', fields: { goal: 'y' } }).id, 'TASK-2');
});

test('valida campos obligatorios por tipo', () => {
  const s = newStore();
  assert.throws(() => s.create({ type: 'bug', title: 'Falla', fields: {} }), ValidationError);
  assert.throws(() => s.create({ type: 'nope', title: 'x' }), ValidationError);
  assert.throws(() => s.create({ type: 'task', title: '  ', fields: { goal: 'x' } }), ValidationError);
});

test('aplica defaults y labels del tipo', () => {
  const s = newStore();
  const bug = s.create({
    type: 'bug',
    title: 'Falla',
    fields: { summary: 's', steps: '1', expected: 'e', actual: 'a', version: '1.0' },
  });
  assert.equal(bug.fields.severity, 'Medio (hay workaround)');
  assert.deepEqual(bug.labels, ['bug', 'needs-triage']);
  assert.equal(bug.status, 'todo');
});

test('persiste y recarga desde disco', () => {
  const s = newStore();
  s.create({ type: 'task', title: 'A', fields: { goal: 'x' } });
  const again = new Store(s.file);
  assert.equal(again.list().length, 1);
  assert.equal(JSON.parse(readFileSync(s.file, 'utf8')).nextId, 2);
});

test('update, filtros y búsqueda', () => {
  const s = newStore();
  s.create({ type: 'task', title: 'Alpha', fields: { goal: 'x' } });
  s.create({ type: 'story', title: 'Beta', fields: { story: 'x', acceptance: 'y' } });
  s.update('1', { status: 'done' });
  assert.equal(s.list({ status: 'done' }).length, 1);
  assert.equal(s.list({ type: 'story' })[0].id, 'TASK-2');
  assert.equal(s.list({ q: 'alp' })[0].id, 'TASK-1');
  assert.throws(() => s.update('1', { status: 'raro' }), ValidationError);
});

test('tarea inexistente y normalización de id', () => {
  const s = newStore();
  assert.throws(() => s.get('TASK-99'), NotFoundError);
  assert.equal(normalizeId('task-7'), 'TASK-7');
  assert.equal(normalizeId('7'), 'TASK-7');
});
