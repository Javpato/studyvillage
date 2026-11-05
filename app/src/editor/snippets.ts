export const SNIPPETS = [
  { id: 'notes', label: 'Apuntes', text: '# Tema\n\n## Ideas clave\n- \n\n## Preguntas\n- \n' },
  { id: 'plan', label: 'Plan de estudio', text: 'Objetivo:\n\n1. Leer\n2. Practicar\n3. Repasar\n\nPróximo paso: ' },
] as const;

export function insertAtSelection(source: string, snippet: string, start: number, end: number): { text: string; caret: number } {
  const before = source.slice(0, start);
  const after = source.slice(end);
  const separator = before && !before.endsWith('\n') ? '\n' : '';
  const text = before + separator + snippet + after;
  return { text, caret: (before + separator + snippet).length };
}
