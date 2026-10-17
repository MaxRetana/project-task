import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { STATUSES, TYPES, ValidationError, validateFields } from './schema.js';

export class NotFoundError extends Error {
  constructor(id) {
    super(`No existe la tarea ${id}`);
    this.name = 'NotFoundError';
  }
}

export function defaultDataFile() {
  return process.env.TASKMASTER_DATA || join(homedir(), '.taskmaster', 'tasks.json');
}

// Normaliza "task-3", "TASK-3" o "3" a "TASK-3".
export function normalizeId(id) {
  const m = /^(?:task-)?(\d+)$/i.exec(String(id).trim());
  return m ? `TASK-${Number(m[1])}` : String(id).trim().toUpperCase();
}

export class Store {
  constructor(file = defaultDataFile()) {
    this.file = file;
    this.data = { nextId: 1, tasks: [] };
    if (existsSync(file)) {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
    }
  }

  // Escritura atómica: archivo temporal + rename, para no corromper datos.
  #save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  create({ type, title, fields, labels, status = 'todo' }) {
    if (!title || !String(title).trim()) throw new ValidationError('El título es obligatorio');
    if (!STATUSES.includes(status)) throw new ValidationError(`Estado inválido: ${status}`);
    const now = new Date().toISOString();
    const number = this.data.nextId++;
    const task = {
      id: `TASK-${number}`,
      number,
      type,
      title: String(title).trim(),
      status,
      fields: validateFields(type, fields),
      labels: labels ?? [...TYPES[type].labels],
      branch: null,
      pr: null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.tasks.push(task);
    this.#save();
    return task;
  }

  get(id) {
    const nid = normalizeId(id);
    const task = this.data.tasks.find((t) => t.id === nid);
    if (!task) throw new NotFoundError(nid);
    return task;
  }

  list({ type, status, q } = {}) {
    const needle = q?.toLowerCase();
    return this.data.tasks.filter(
      (t) =>
        (!type || t.type === type) &&
        (!status || t.status === status) &&
        (!needle || `${t.id} ${t.title}`.toLowerCase().includes(needle)),
    );
  }

  update(id, patch) {
    const task = this.get(id);
    if (patch.title !== undefined) {
      if (!String(patch.title).trim()) throw new ValidationError('El título es obligatorio');
      task.title = String(patch.title).trim();
    }
    if (patch.status !== undefined) {
      if (!STATUSES.includes(patch.status)) throw new ValidationError(`Estado inválido: ${patch.status}`);
      task.status = patch.status;
    }
    if (patch.fields !== undefined) task.fields = validateFields(task.type, { ...task.fields, ...patch.fields });
    if (patch.labels !== undefined) task.labels = patch.labels;
    if (patch.branch !== undefined) task.branch = patch.branch;
    if (patch.pr !== undefined) task.pr = patch.pr;
    task.updatedAt = new Date().toISOString();
    this.#save();
    return task;
  }

  delete(id) {
    const task = this.get(id);
    this.data.tasks = this.data.tasks.filter((t) => t !== task);
    this.#save();
    return task;
  }
}
