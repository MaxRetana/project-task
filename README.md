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

## Tiene front

Sí. El servidor entrega un tablero web (kanban) escrito en HTML, CSS y JavaScript simple, sin build ni dependencias. Está en [`public/`](public) y se abre en el navegador en `http://localhost:4780` al correr `npm start`. Todo lo que hace la interfaz también se puede hacer desde el CLI o la API.

## Cómo probarlo en cada sistema

Necesitas [Node.js](https://nodejs.org) 20 o superior (incluye `npm`) y `git`. La prueba es la misma en los tres sistemas: instalar, correr las pruebas, abrir el tablero y probar el CLI.

### 1. Instalar Node y git

| Sistema | Comandos |
|---------|----------|
| macOS | `brew install node git` |
| Windows (PowerShell) | `winget install OpenJS.NodeJS.LTS Git.Git` y después abre una terminal nueva |
| Ubuntu / Debian | `sudo apt install git` y Node 20+ con [NodeSource](https://github.com/nodesource/distributions) o `nvm` (el `nodejs` de `apt` suele ser más viejo) |

Comprueba con `node -v` (debe ser v20 o mayor).

### 2. Descargar y correr las pruebas

```bash
git clone https://github.com/MaxRetana/project-task.git
cd project-task
npm test
```

Resultado esperado: al final `# fail 0` y todas las pruebas en `pass`. No hay nada que instalar con `npm install`.

### 3. Probar el tablero web

```bash
npm start
```

Deberías ver `Taskmaster en http://localhost:4780`. Abre esa dirección en el navegador y:

1. Pulsa **+ Nueva tarea**, elige un tipo (por ejemplo *Tarea*), escribe un título y el objetivo, y crea.
2. La tarjeta aparece en **Por hacer** con su ID (`TASK-1`). Arrástrala a **En progreso**.
3. Ábrela: en **Rama de git** pulsa **Vincular** (o **Crear rama** si ejecutaste `npm start` dentro de un repo git con rama `develop`).
4. En **Pull request** escribe un número y pulsa **Vincular**. La tarjeta muestra la rama y `PR #n`.
5. Detén el servidor con `Ctrl + C`, vuelve a arrancarlo y comprueba que la tarea sigue ahí.

### 4. Probar el CLI

Con el servidor abierto o cerrado, en otra terminal dentro de la carpeta del proyecto:

```bash
node bin/taskmaster.js add task "Probar el CLI" -f goal="Ver que funciona"
node bin/taskmaster.js list
node bin/taskmaster.js status 1 done
```

Resultado esperado: `Creada TASK-N: Probar el CLI`, luego la tarea en la lista y su estado `done`. Si el servidor está abierto, recarga el navegador y verás los mismos cambios (comparten el archivo de datos).

### Notas por sistema

- **Windows:** funciona en PowerShell y cmd. Los datos quedan en `%USERPROFILE%\.taskmaster\tasks.json`. Para otro archivo en PowerShell: `$env:TASKMASTER_DATA="C:\ruta\tasks.json"; npm start`.
- **macOS y Ubuntu:** los datos quedan en `~/.taskmaster/tasks.json`. Otro archivo: `TASKMASTER_DATA=/ruta/tasks.json npm start`.
- **Puerto ocupado:** usa `npm start -- --port 4800`.
- **Probar sin tocar tus datos:** agrega `--data ./prueba.json` a cualquier comando.
- La CI de GitHub ya corre `npm test` en Ubuntu, macOS y Windows con Node 20 y 22 en cada PR.

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
