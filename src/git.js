import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TYPES, ValidationError } from './schema.js';

const execFileP = promisify(execFile);

// Ejecuta un comando sin shell (sin riesgo de inyección). Inyectable para pruebas.
export async function run(cmd, args, { cwd } = {}) {
  const { stdout } = await execFileP(cmd, args, { cwd, timeout: 30_000, windowsHide: true });
  return stdout.trim();
}

export function slugify(text, max = 40) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

// feat/3-vincular-rama-y-pr-de-git
export function branchName(task) {
  const prefix = TYPES[task.type]?.prefix ?? 'chore';
  return `${prefix}/${task.number}-${slugify(task.title)}`;
}

export async function assertValidBranch(name, exec = run) {
  if (!name || name.startsWith('-')) throw new ValidationError(`Nombre de rama inválido: ${name}`);
  try {
    await exec('git', ['check-ref-format', '--branch', name]);
  } catch {
    throw new ValidationError(`Nombre de rama inválido: ${name}`);
  }
}

// Acepta 12, "#12" o https://github.com/owner/repo/pull/12
export function parsePr(input) {
  const s = String(input ?? '').trim();
  const url = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)\/?$/.exec(s);
  if (url) return { number: Number(url[1]), url: s.replace(/\/$/, '') };
  const num = /^#?(\d+)$/.exec(s);
  if (num) return { number: Number(num[1]), url: null };
  throw new ValidationError('PR inválido: usa un número o una URL https://github.com/<owner>/<repo>/pull/<n>');
}

export async function createBranch(task, { name, base = 'develop', cwd, exec = run } = {}) {
  const branch = name || task.branch || branchName(task);
  await assertValidBranch(branch, (c, a) => exec(c, a, { cwd }));
  try {
    await exec('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd });
    await exec('git', ['checkout', branch], { cwd });
  } catch {
    await exec('git', ['checkout', '-b', branch, base], { cwd });
  }
  return branch;
}

// Busca el PR de la rama con gh. Devuelve null si no hay PR o gh no está disponible.
export async function findPr(branch, { cwd, exec = run } = {}) {
  try {
    const out = await exec('gh', ['pr', 'view', branch, '--json', 'number,url,state,title'], { cwd });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// Rutas extra para el servidor: vincular/crear rama y vincular/sincronizar PR.
export function gitRoutes({ cwd = process.cwd(), exec = run } = {}) {
  const reply = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
    return true;
  };
  return async (req, res, url, store, body) => {
    const m = /^\/api\/tasks\/([^/]+)\/(branch|pr)$/.exec(url.pathname);
    if (!m || req.method !== 'POST') return false;
    const [, id, kind] = m;
    const task = store.get(id);

    if (kind === 'branch') {
      let branch = body.name || branchName(task);
      if (body.create) branch = await createBranch(task, { name: body.name, base: body.base, cwd, exec });
      else await assertValidBranch(branch, (c, a) => exec(c, a, { cwd }));
      return reply(res, 200, store.update(id, { branch }));
    }

    // kind === 'pr'
    let pr;
    if (body.sync || body.pr === undefined) {
      if (!task.branch) throw new ValidationError('La tarea no tiene rama vinculada');
      const found = await findPr(task.branch, { cwd, exec });
      if (!found) throw new ValidationError(`No se encontró un PR para la rama ${task.branch} (¿está gh instalado y autenticado?)`);
      pr = found;
    } else {
      pr = parsePr(body.pr);
    }
    return reply(res, 200, store.update(id, { pr }));
  };
}
