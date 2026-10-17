// Tipos de tarea y sus campos. Reflejan las plantillas de .github/ISSUE_TEMPLATE.

export const STATUSES = ['todo', 'in_progress', 'review', 'done'];

export const SEVERITIES = [
  'Bloqueante (no puedo continuar)',
  'Alto (funcionalidad importante rota)',
  'Medio (hay workaround)',
  'Bajo (cosmético)',
];

const f = (label, kind = 'textarea', extra = {}) => ({ label, kind, ...extra });

export const TYPES = {
  bug: {
    label: 'Reporte de bug',
    prefix: 'fix',
    labels: ['bug', 'needs-triage'],
    fields: {
      summary: f('¿Qué está pasando?', 'textarea', { required: true }),
      steps: f('Pasos para reproducirlo', 'textarea', { required: true }),
      expected: f('Resultado esperado', 'textarea', { required: true }),
      actual: f('Resultado actual', 'textarea', { required: true }),
      version: f('Versión', 'input', { required: true }),
      severity: f('Impacto', 'select', { options: SEVERITIES, default: SEVERITIES[2] }),
      logs: f('Logs relevantes'),
    },
  },
  feature: {
    label: 'Solicitud de funcionalidad',
    prefix: 'feat',
    labels: ['enhancement', 'needs-triage'],
    fields: {
      problem: f('Problema a resolver', 'textarea', { required: true }),
      proposal: f('Solución propuesta', 'textarea', { required: true }),
      alternatives: f('Alternativas consideradas'),
      acceptance: f('Criterios de aceptación'),
      contribute: f('¿Quieres implementarlo tú?', 'select', {
        options: ['Sí', 'Con ayuda', 'No'],
        default: 'No',
      }),
    },
  },
  task: {
    label: 'Tarea',
    prefix: 'chore',
    labels: ['chore'],
    fields: {
      goal: f('Objetivo', 'textarea', { required: true }),
      checklist: f('Checklist'),
      notes: f('Notas o enlaces relacionados'),
    },
  },
  story: {
    label: 'Historia de usuario',
    prefix: 'feat',
    labels: ['story'],
    fields: {
      story: f('Historia', 'textarea', { required: true }),
      acceptance: f('Criterios de aceptación', 'textarea', { required: true }),
      dod: f('Definition of Done'),
      estimate: f('Estimación (story points)', 'input'),
    },
  },
  epic: {
    label: 'Epic / RFC',
    prefix: 'feat',
    labels: ['epic'],
    fields: {
      context: f('Contexto'),
      goal: f('Objetivo'),
      scope: f('Alcance (incluye / no incluye)'),
      children: f('Historias o tareas derivadas'),
    },
  },
};

export const TYPE_NAMES = Object.keys(TYPES);

// Valida y normaliza los campos de una tarea según su tipo.
export function validateFields(type, input = {}) {
  const def = TYPES[type];
  if (!def) throw new ValidationError(`Tipo desconocido: ${type}. Usa: ${TYPE_NAMES.join(', ')}`);
  const out = {};
  for (const [key, spec] of Object.entries(def.fields)) {
    let value = input[key];
    if (value === undefined || value === null || value === '') value = spec.default ?? '';
    value = String(value);
    if (spec.required && value.trim() === '') {
      throw new ValidationError(`El campo "${key}" (${spec.label}) es obligatorio para ${type}`);
    }
    if (spec.kind === 'select' && value !== '' && !spec.options.includes(value)) {
      throw new ValidationError(`Valor inválido para "${key}". Opciones: ${spec.options.join(' | ')}`);
    }
    out[key] = value;
  }
  return out;
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}
