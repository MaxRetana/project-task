import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotFoundError } from './store.js';
import { STATUSES, TYPES, TYPE_NAMES, ValidationError } from './schema.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new ValidationError('Cuerpo demasiado grande');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('JSON inválido');
  }
}

// `extra` permite que otros módulos (git) agreguen rutas: (req, res, url, store, body) => boolean
export function createApp(store, { extraRoutes = [] } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      // Mitiga DNS rebinding: solo se acepta Host local.
      const host = (req.headers.host || '').replace(/:\d+$/, '');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return json(res, 403, { error: 'Host no permitido' });

      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, store, extraRoutes);
      return await serveStatic(res, url.pathname);
    } catch (err) {
      if (err instanceof ValidationError) return json(res, 400, { error: err.message });
      if (err instanceof NotFoundError) return json(res, 404, { error: err.message });
      console.error(err);
      return json(res, 500, { error: 'Error interno' });
    }
  });
}

async function handleApi(req, res, url, store, extraRoutes) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'tasks', id?]
  const method = req.method;

  if (parts[1] === 'meta' && method === 'GET') {
    return json(res, 200, { statuses: STATUSES, types: TYPE_NAMES.map((name) => ({ name, ...TYPES[name] })) });
  }

  if (parts[1] === 'tasks') {
    // Los métodos con cuerpo exigen JSON, para que otras páginas web no puedan
    // escribir con un formulario (CSRF simple).
    const hasBody = ['POST', 'PATCH', 'PUT'].includes(method);
    if (hasBody && !(req.headers['content-type'] || '').includes('application/json')) {
      return json(res, 415, { error: 'Content-Type debe ser application/json' });
    }
    const body = hasBody ? await readBody(req) : {};

    for (const route of extraRoutes) {
      if (await route(req, res, url, store, body)) return;
    }

    const id = parts[2];
    if (!id) {
      if (method === 'GET') {
        return json(res, 200, store.list({
          type: url.searchParams.get('type') || undefined,
          status: url.searchParams.get('status') || undefined,
          q: url.searchParams.get('q') || undefined,
        }));
      }
      if (method === 'POST') return json(res, 201, store.create(body));
    } else if (parts.length === 3) {
      if (method === 'GET') return json(res, 200, store.get(id));
      if (method === 'PATCH') return json(res, 200, store.update(id, body));
      if (method === 'DELETE') return json(res, 200, store.delete(id));
    }
  }
  return json(res, 404, { error: 'Ruta no encontrada' });
}

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname);
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + sep)) return json(res, 403, { error: 'Prohibido' });
  try {
    const data = await readFile(file);
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'No encontrado' });
  }
}

export function startServer(store, { port = 4780, extraRoutes } = {}) {
  const app = createApp(store, { extraRoutes });
  return new Promise((resolve, reject) => {
    app.once('error', reject);
    // Solo loopback: el servidor nunca se expone a la red.
    app.listen(port, '127.0.0.1', () => resolve(app));
  });
}
