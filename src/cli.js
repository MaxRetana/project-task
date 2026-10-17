import { parseArgs } from 'node:util';
import { Store, defaultDataFile } from './store.js';
import { startServer } from './server.js';
import { run, gitRoutes, branchName, createBranch, findPr, parsePr, assertValidBranch } from './git.js';
import { STATUSES, TYPES, TYPE_NAMES, ValidationError } from './schema.js';

const HELP = `Taskmaster: tareas locales con rama y PR de git vinculados

Uso: taskmaster <comando> [opciones]

  serve [--port 4780]              Inicia el tablero web en http://localhost:4780
  add <tipo> <título> [-f k=v]…    Crea una tarea (tipos: ${TYPE_NAMES.join(', ')})
  types [tipo]                     Muestra los campos de cada tipo
  list [--type t] [--status s]     Lista tareas
  show <id>                        Muestra una tarea (id: TASK-3 o 3)
  status <id> <estado>             Estados: ${STATUSES.join(', ')}
  branch <id> [--create] [--name]  Vincula (o crea) la rama de git de la tarea
  pr <id> [número|URL]             Vincula un PR; sin argumento lo busca con gh
  delete <id>                      Elimina una tarea

Opciones globales:
  --data <archivo>   Archivo de datos (por defecto ~/.taskmaster/tasks.json o $TASKMASTER_DATA)
  --repo <carpeta>   Repositorio git donde operan branch/pr (por defecto el directorio actual)
`;

const line = (t) => `${t.id.padEnd(8)} ${t.status.padEnd(12)} ${t.type.padEnd(8)} ${t.title}${t.branch ? `  ⎇ ${t.branch}` : ''}${t.pr ? `  PR #${t.pr.number}` : ''}`;

export async function main(argv, { out = console.log, store } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      data: { type: 'string' }, repo: { type: 'string' }, port: { type: 'string' },
      type: { type: 'string' }, status: { type: 'string' }, name: { type: 'string' },
      field: { type: 'string', short: 'f', multiple: true }, create: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, ...args] = positionals;
  if (!cmd || values.help || cmd === 'help') return out(HELP);

  store ??= new Store(values.data || defaultDataFile());
  const cwd = values.repo || process.cwd();
  const need = (v, what) => { if (!v) throw new ValidationError(`Falta ${what}. Mira: taskmaster help`); return v; };

  switch (cmd) {
    case 'serve': {
      const port = Number(values.port ?? 4780);
      const app = await startServer(store, { port, extraRoutes: [gitRoutes({ cwd })] });
      out(`Taskmaster en http://localhost:${app.address().port}  (datos: ${store.file})`);
      return app;
    }
    case 'types': {
      const names = args[0] ? [args[0]] : TYPE_NAMES;
      for (const n of names) {
        const def = need(TYPES[n], `un tipo válido (${TYPE_NAMES.join(', ')})`);
        out(`${n} (${def.label})`);
        for (const [k, s] of Object.entries(def.fields)) out(`  ${k}${s.required ? '*' : ''}: ${s.label}`);
      }
      return;
    }
    case 'add': {
      const fields = Object.fromEntries((values.field ?? []).map((kv) => {
        const i = kv.indexOf('=');
        if (i < 1) throw new ValidationError(`Campo inválido "${kv}": usa -f clave=valor`);
        return [kv.slice(0, i), kv.slice(i + 1)];
      }));
      const task = store.create({ type: need(args[0], 'el tipo'), title: need(args.slice(1).join(' '), 'el título'), fields });
      return out(`Creada ${task.id}: ${task.title}`);
    }
    case 'list': {
      const tasks = store.list({ type: values.type, status: values.status });
      return out(tasks.length ? tasks.map(line).join('\n') : 'Sin tareas');
    }
    case 'show': {
      const t = store.get(need(args[0], 'el id'));
      out(`${line(t)}\nEtiquetas: ${t.labels.join(', ')}\nPR: ${t.pr ? (t.pr.url ?? `#${t.pr.number}`) : '-'}`);
      for (const [k, v] of Object.entries(t.fields)) if (v) out(`\n[${TYPES[t.type].fields[k].label}]\n${v}`);
      return;
    }
    case 'status':
      return out(line(store.update(need(args[0], 'el id'), { status: need(args[1], 'el estado') })));
    case 'branch': {
      const t = store.get(need(args[0], 'el id'));
      const branch = values.create
        ? await createBranch(t, { name: values.name, cwd })
        : (values.name || t.branch || branchName(t));
      if (!values.create) await assertValidBranch(branch, (c, a) => run(c, a, { cwd }));
      return out(line(store.update(t.id, { branch })));
    }
    case 'pr': {
      const t = store.get(need(args[0], 'el id'));
      let pr;
      if (args[1]) pr = parsePr(args[1]);
      else {
        need(t.branch, 'una rama vinculada (taskmaster branch)');
        pr = need(await findPr(t.branch, { cwd }), `un PR para ${t.branch} (¿gh instalado y autenticado?)`);
      }
      return out(line(store.update(t.id, { pr })));
    }
    case 'delete':
      return out(`Eliminada ${store.delete(need(args[0], 'el id')).id}`);
    default:
      throw new ValidationError(`Comando desconocido: ${cmd}. Mira: taskmaster help`);
  }
}
