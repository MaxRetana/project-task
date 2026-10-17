# Taskmaster

Gestor de tareas local, tipo Jira / issues de GitHub. Corre en tu computadora (Mac, Linux o Windows) como un servidor local con tablero web y CLI. Cada tarea tiene un ID (`TASK-1`), los mismos campos que las plantillas de issues del repo, y se puede vincular con su rama de git y su pull request.

Sin dependencias: solo necesita [Node.js](https://nodejs.org) 20 o superior. `git` y [`gh`](https://cli.github.com) son opcionales (para crear ramas y buscar PRs).

## Uso rápido

```bash
git clone git@github.com:MaxRetana/project-task.git
cd project-task
npm start            # tablero en http://localhost:4780
```

Opcional, para tener el comando `taskmaster` disponible en todo el sistema: `npm link`.

## Tablero web

- Columnas por estado (por hacer, en progreso, en revisión, hecho); arrastra las tarjetas para cambiar el estado.
- Búsqueda por ID o título y filtro por tipo.
- Al crear una tarea el formulario cambia según el tipo (bug, feature, task, story, epic).
- En el detalle: vincular o crear la rama de git, vincular el PR por número o URL, o buscarlo con `gh`.

## CLI

```bash
taskmaster add bug "No guarda" -f summary="..." -f steps="1. ..." -f expected="..." -f actual="..." -f version=1.0
taskmaster types bug             # campos de un tipo (* = obligatorio)
taskmaster list --status todo
taskmaster status 3 in_progress
taskmaster branch 3 --create     # crea y cambia a fix/3-no-guarda desde develop
taskmaster pr 3                  # busca el PR de la rama con gh
taskmaster pr 3 42               # o lo vincula a mano (número o URL)
taskmaster show 3
```

`taskmaster help` muestra todos los comandos. Sin `npm link`, usa `node bin/taskmaster.js …`.

## Tipos de tarea

Reflejan `.github/ISSUE_TEMPLATE`:

| Tipo | Campos obligatorios |
|------|--------------------|
| `bug` | summary, steps, expected, actual, version |
| `feature` | problem, proposal |
| `task` | goal |
| `story` | story, acceptance |
| `epic` | (ninguno) |

## Dónde se guardan los datos

En `~/.taskmaster/tasks.json`. Cámbialo con `--data <archivo>` o la variable `TASKMASTER_DATA`. La escritura es atómica y el CLI y el servidor pueden usarse al mismo tiempo.

## API

Solo escucha en `127.0.0.1`. Las escrituras exigen `Content-Type: application/json`.

| Método | Ruta | |
|--------|------|-|
| GET | `/api/meta` | Tipos, campos y estados |
| GET / POST | `/api/tasks` | Listar (`?type=&status=&q=`) / crear |
| GET / PATCH / DELETE | `/api/tasks/:id` | Leer / editar / borrar |
| POST | `/api/tasks/:id/branch` | `{create?, name?}` vincula o crea la rama |
| POST | `/api/tasks/:id/pr` | `{pr}` vincula; `{sync:true}` busca con gh |

## Desarrollo y flujo de ramas

```bash
npm test             # pruebas con node:test, sin dependencias
```

- Ramas: `main`, `test`, `develop`. Los cambios entran a `develop` solo con PR desde una rama (`feat/…`, `fix/…`, `chore/…`, `ci/…`); `main` y `test` solo los toca el dueño.
- CI: las pruebas corren en Ubuntu, macOS y Windows con Node 20 y 22.
- Al mergear a `develop`, un workflow mantiene abierto el PR `develop → main`.
