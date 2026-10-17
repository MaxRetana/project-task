import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { Store } from '../src/store.js';
import { startServer } from '../src/server.js';

let app, base;
before(async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'tm-')), 'tasks.json'));
  app = await startServer(store, { port: 0 });
  base = `http://127.0.0.1:${app.address().port}`;
});
after(() => app.close());

const call = (path, method = 'GET', body, headers = {}) =>
  fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });

test('CRUD completo de tareas', async () => {
  let res = await call('/api/tasks', 'POST', { type: 'task', title: 'Hola', fields: { goal: 'probar' } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).id, 'TASK-1');

  res = await call('/api/tasks/1', 'PATCH', { status: 'in_progress' });
  assert.equal((await res.json()).status, 'in_progress');

  res = await call('/api/tasks?status=in_progress');
  assert.equal((await res.json()).length, 1);

  res = await call('/api/tasks/TASK-1', 'DELETE');
  assert.equal(res.status, 200);
  assert.equal((await call('/api/tasks/TASK-1')).status, 404);
});

test('errores de validación devuelven 400', async () => {
  const res = await call('/api/tasks', 'POST', { type: 'bug', title: 'x', fields: {} });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /obligatorio/);
});

test('exige JSON en escrituras', async () => {
  const res = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
});

test('rechaza Host no local', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: app.address().port, path: '/api/meta', headers: { host: 'evil.example.com' } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('meta describe tipos y estados', async () => {
  const meta = await (await call('/api/meta')).json();
  assert.deepEqual(meta.statuses, ['todo', 'in_progress', 'review', 'done']);
  assert.ok(meta.types.find((t) => t.name === 'bug').fields.summary);
});

test('no permite salir de public/', async () => {
  const res = await fetch(`${base}/..%2Fpackage.json`);
  assert.notEqual(res.status, 200);
});

test('sirve la interfaz web', async () => {
  for (const [path, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/style.css', 'text/css']]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), new RegExp(type));
  }
  assert.match(await (await fetch(base + '/')).text(), /Taskmaster/);
});
