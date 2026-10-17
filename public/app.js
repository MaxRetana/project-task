// Interfaz de Taskmaster. Todo el contenido dinámico se inserta con textContent (sin innerHTML).
const STATUS_LABEL = { todo: 'Por hacer', in_progress: 'En progreso', review: 'En revisión', done: 'Hecho' };
let meta, tasks = [];

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

async function api(path, method = 'GET', body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function load() {
  const params = new URLSearchParams();
  if ($('#search').value) params.set('q', $('#search').value);
  if ($('#filter-type').value) params.set('type', $('#filter-type').value);
  tasks = await api(`/tasks?${params}`);
  renderBoard();
}

function renderBoard() {
  const board = $('#board');
  board.replaceChildren();
  for (const status of meta.statuses) {
    const col = el('section', { className: 'col' }, el('h2', {}, STATUS_LABEL[status] ?? status));
    col.dataset.status = status;
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      if (id) { await api(`/tasks/${id}`, 'PATCH', { status }); load(); }
    });
    for (const t of tasks.filter((x) => x.status === status)) col.append(card(t));
    board.append(col);
  }
}

function card(t) {
  const meta_ = el('div', { className: 'meta' }, el('span', { className: 'tag' }, t.type));
  if (t.branch) meta_.append(el('span', { className: 'tag', title: t.branch }, '⎇ rama'));
  if (t.pr) meta_.append(el('span', { className: 'tag' }, `PR #${t.pr.number}`));
  const c = el('article', { className: 'card', draggable: true },
    el('div', { className: 'id' }, t.id), el('div', {}, t.title), meta_);
  c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', t.id));
  c.addEventListener('click', () => openDetail(t.id));
  return c;
}

function fieldInput(key, spec) {
  const label = el('label', {}, spec.label, spec.required ? ' *' : '');
  let input;
  if (spec.kind === 'select') {
    input = el('select', { name: key });
    for (const o of spec.options) input.append(el('option', { value: o, selected: o === spec.default }, o));
  } else if (spec.kind === 'input') {
    input = el('input', { name: key });
  } else {
    input = el('textarea', { name: key });
  }
  label.append(input);
  return label;
}

function renderCreateFields() {
  const type = meta.types.find((t) => t.name === $('#create-type').value);
  $('#create-fields').replaceChildren(...Object.entries(type.fields).map(([k, s]) => fieldInput(k, s)));
}

async function openDetail(id) {
  const t = await api(`/tasks/${id}`);
  const def = meta.types.find((x) => x.name === t.type);
  const box = $('#detail');
  const err = el('p', { className: 'error', role: 'alert' });
  const status = el('select', {}, ...meta.statuses.map((s) => el('option', { value: s, selected: s === t.status }, STATUS_LABEL[s] ?? s)));
  status.addEventListener('change', async () => { await api(`/tasks/${id}`, 'PATCH', { status: status.value }); load(); });

  const act = (fn) => async () => {
    try { err.textContent = ''; await fn(); await load(); await openDetail(id); }
    catch (e) { err.textContent = e.message; }
  };

  const branchInput = el('input', { value: t.branch ?? '', placeholder: 'rama (vacío = automática)' });
  const prInput = el('input', { placeholder: 'número o URL del PR' });
  const row = (...c) => el('div', { className: 'row' }, ...c);

  box.replaceChildren(
    el('h2', {}, `${t.id} · ${t.title}`),
    el('div', { className: 'field' }, el('b', {}, 'Tipo'), `${def.label} · ${t.labels.join(', ')}`),
    el('div', { className: 'field' }, el('b', {}, 'Estado'), status),
    ...Object.entries(def.fields).filter(([k]) => t.fields[k]).map(([k, s]) =>
      el('div', { className: 'field' }, el('b', {}, s.label), el('pre', {}, t.fields[k]))),
    el('div', { className: 'field' }, el('b', {}, 'Rama de git'),
      row(branchInput,
        el('button', { onclick: act(() => api(`/tasks/${id}/branch`, 'POST', { name: branchInput.value || undefined })) }, 'Vincular'),
        el('button', { onclick: act(() => api(`/tasks/${id}/branch`, 'POST', { name: branchInput.value || undefined, create: true })) }, 'Crear rama'))),
    el('div', { className: 'field' }, el('b', {}, 'Pull request'),
      t.pr ? el('div', {}, t.pr.url ? el('a', { href: t.pr.url, target: '_blank', rel: 'noopener noreferrer' }, `#${t.pr.number}`) : `#${t.pr.number}`, t.pr.state ? ` · ${t.pr.state}` : '') : el('div', {}, 'Sin PR'),
      row(prInput,
        el('button', { onclick: act(() => api(`/tasks/${id}/pr`, 'POST', { pr: prInput.value })) }, 'Vincular'),
        el('button', { onclick: act(() => api(`/tasks/${id}/pr`, 'POST', { sync: true })) }, 'Buscar con gh'))),
    err,
    el('div', { className: 'actions' }, el('button', {
      onclick: async () => { if (confirm(`¿Eliminar ${t.id}?`)) { await api(`/tasks/${id}`, 'DELETE'); $('#detail-dialog').close(); load(); } },
    }, 'Eliminar')),
  );
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
}

async function init() {
  meta = await api('/meta');
  for (const t of meta.types) {
    $('#filter-type').append(el('option', { value: t.name }, t.label));
    $('#create-type').append(el('option', { value: t.name }, t.label));
  }
  renderCreateFields();
  $('#create-type').addEventListener('change', renderCreateFields);
  $('#new-task').addEventListener('click', () => { $('#create-error').textContent = ''; $('#create-dialog').showModal(); });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#search').addEventListener('input', load);
  $('#filter-type').addEventListener('change', load);

  $('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const { type, title, ...fields } = Object.fromEntries(data);
    try {
      await api('/tasks', 'POST', { type, title, fields });
      e.target.reset();
      renderCreateFields();
      $('#create-dialog').close();
      load();
    } catch (err) { $('#create-error').textContent = err.message; }
  });
  load();
}
init();
