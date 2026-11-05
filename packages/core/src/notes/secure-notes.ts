import type {KeyValueStore} from '../storage';
import { AppError } from '../errors';
import { z } from 'zod';
import { toTex } from '../whiteboard/math';

/**
 * Part 9 — Secure Notes System
 *
 * A dedicated, strictly non-executable notes application separate from the
 * collaborative code project workspace.
 *
 * Security Guarantees:
 * - Zero terminal or code execution capabilities
 * - Zero raw HTML execution: all user text is HTML-entity escaped before formatting
 * - Strict URL protocol allowlist (`https:`, `http:`, `mailto:`); `javascript:`,
 *   `data:`, `vbscript:`, and `file:` URLs are stripped/neutralized
 * - No inline event handlers (`onload`, `onerror`, `onclick`, etc.)
 * - Independent note IDs organized into notebooks with private/shared permissions
 */

export type NoteVisibility = 'private' | 'shared_read' | 'shared_write';

export interface SecureNotebook {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

export interface SecureNote {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  ownerId: string;
  visibility: NoteVisibility;
  tags: string[];
  updatedAt: number;
  revision: number;
}

export const secureNoteSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9:_-]{1,96}$/),
  notebookId: z.string().regex(/^[A-Za-z0-9:_-]{1,96}$/),
  title: z.string().min(1).max(120),
  content: z.string().max(100_000),
  ownerId: z.string().min(1).max(128),
  visibility: z.enum(['private', 'shared_read', 'shared_write']),
  tags: z.array(z.string().max(32)).max(12),
  updatedAt: z.number().nonnegative(),
  revision: z.number().int().nonnegative(),
});

export function escapeHtmlStrict(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeSafeHref(rawUrl: string): string | null {
  const trimmed = rawUrl.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://studyvillage.local');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      return escapeHtmlStrict(trimmed);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Renders a Markdown + LaTeX note into a strictly sanitized, non-executable HTML
 * string. Raw HTML tags in the source are escaped first, so `<script>`, `<img onerror>`,
 * `<iframe>`, `<svg>`, and `<object>` can NEVER execute as DOM elements.
 */
export function renderSafeMarkdownWithLatex(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n').slice(0, 100_000);
  const lines = normalized.split('\n');
  const htmlBlocks: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (inList) {
      htmlBlocks.push(`</${inList}>`);
      inList = null;
    }
  };

  const formatInline = (rawLine: string): string => {
    // 1. Escape all raw HTML characters first
    let safe = escapeHtmlStrict(rawLine);

    // 2. Display or inline math ($...$ or $$...$$)
    safe = safe.replace(/\$\$([^$]+)\$\$/g, (_, expr: string) => {
      const tex = toTex(`$${expr}$`) || expr;
      return `<span class="sv-note-math is-display" data-latex="${escapeHtmlStrict(tex)}">∑ ${expr}</span>`;
    });
    safe = safe.replace(/\$([^$]+)\$/g, (_, expr: string) => {
      const tex = toTex(`$${expr}$`) || expr;
      return `<span class="sv-note-math" data-latex="${escapeHtmlStrict(tex)}">${expr}</span>`;
    });

    // 3. Inline code `...`
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 4. Bold **...** and Italic *...*
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 5. Links [label](url) — strictly checked against protocol allowlist
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
      const unescapedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      const safeHref = sanitizeSafeHref(unescapedUrl);
      if (!safeHref) {
        return `<span class="sv-note-blocked-link" title="Enlace bloqueado por seguridad">${label}</span>`;
      }
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    return safe;
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        htmlBlocks.push(`<pre class="sv-note-code"><code>${escapeHtmlStrict(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      htmlBlocks.push(`<h${level}>${formatInline(hMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      closeList();
      htmlBlocks.push(`<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // Task list / Unordered list
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        inList = 'ul';
        htmlBlocks.push('<ul>');
      }
      const itemBody = ulMatch[1];
      if (itemBody.startsWith('[x] ') || itemBody.startsWith('[X] ')) {
        htmlBlocks.push(`<li class="sv-note-task is-done">☑ ${formatInline(itemBody.slice(4))}</li>`);
      } else if (itemBody.startsWith('[ ] ')) {
        htmlBlocks.push(`<li class="sv-note-task">☐ ${formatInline(itemBody.slice(4))}</li>`);
      } else {
        htmlBlocks.push(`<li>${formatInline(itemBody)}</li>`);
      }
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        inList = 'ol';
        htmlBlocks.push('<ol>');
      }
      htmlBlocks.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    htmlBlocks.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  if (inCodeBlock && codeLines.length > 0) {
    htmlBlocks.push(`<pre class="sv-note-code"><code>${escapeHtmlStrict(codeLines.join('\n'))}</code></pre>`);
  }

  return htmlBlocks.join('\n');
}

const STORAGE_KEY = 'studyvillage-secure-notes-v1';

export class SecureNotesStore {
  private committed: {notebooks: SecureNotebook[]; notes: SecureNote[]} | null = null;
  private notebooks = new Map<string, SecureNotebook>();
  private notes = new Map<string, SecureNote>();

  constructor(defaultOwnerId = 'local-owner', private readonly scope = '', private readonly storage:KeyValueStore|null=null) {
    this.seedDefaults(defaultOwnerId);
    const template = this.notes.get('note:welcome-study');
    this.notes.clear(); this.notebooks.delete('notebook:matematicas');
    this.loadFromStorage();
    const old = this.notes.get('note:welcome-study');
    if (old && template && old.revision === 1 && old.title === template.title && old.content === template.content) this.notes.delete(old.id);
    this.committed = { notebooks: structuredClone([...this.notebooks.values()]), notes: structuredClone([...this.notes.values()]) };
  }

  private seedDefaults(ownerId: string): void {
    const defaultNb: SecureNotebook = {
      id: 'notebook:general',
      name: 'Cuaderno General de Estudio',
      ownerId,
      createdAt: Date.now(),
    };
    const mathNb: SecureNotebook = {
      id: 'notebook:matematicas',
      name: 'Matemáticas y Física',
      ownerId,
      createdAt: Date.now(),
    };
    this.notebooks.set(defaultNb.id, defaultNb);
    this.notebooks.set(mathNb.id, mathNb);

    const welcomeNote: SecureNote = {
      id: 'note:welcome-study',
      notebookId: defaultNb.id,
      title: 'Guía de Estudio Activo y Fórmulas',
      content: [
        '# Guía de Estudio Activo en la Biblioteca',
        '',
        'Este cuaderno es un **entorno seguro de apuntes** (sin ejecución de código ni scripts) diseñado para tomar notas en Markdown y LaTeX.',
        '',
        '## Conceptos Clave',
        '- [x] **Evocación activa**: Explicar una idea sin mirar los apuntes consolida la memoria a largo plazo.',
        '- [ ] **Repaso espaciado**: Transformar secciones difíciles en tarjetas de memoria (*flashcards*).',
        '- [ ] **Casos límite**: Verificar fórmulas con $n = 0$ y $n = 1$ antes de generalizar.',
        '',
        '## Fórmulas de Referencia',
        '- Fórmula cuadrática: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
        '- Sumatoria de Gauss: $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$',
        '- Teorema fundamental del cálculo: $$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$$',
      ].join('\n'),
      ownerId,
      visibility: 'shared_read',
      tags: ['estudio', 'calculo', 'flashcards'],
      updatedAt: Date.now(),
      revision: 1,
    };
    this.notes.set(welcomeNote.id, welcomeNote);
  }

  listNotebooks(): SecureNotebook[] {
    return Array.from(this.notebooks.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  createNotebook(name: string, ownerId: string): SecureNotebook {
    const clean = name.trim().slice(0, 60) || 'Nuevo Cuaderno';
    const nb: SecureNotebook = {
      id: `notebook:${crypto.randomUUID().slice(0, 12)}`,
      name: clean,
      ownerId,
      createdAt: Date.now(),
    };
    this.notebooks.set(nb.id, nb);
    this.saveToStorage();
    return nb;
  }

  listNotes(viewerId: string, notebookId?: string, searchQuery = ''): SecureNote[] {
    const q = searchQuery.trim().toLowerCase();
    const out: SecureNote[] = [];
    for (const note of this.notes.values()) {
      if (!this.canRead(note, viewerId)) continue;
      if (notebookId && note.notebookId !== notebookId) continue;
      if (q) {
        const hay = `${note.title} ${note.content} ${note.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(note);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getNote(noteId: string, viewerId: string): SecureNote | null {
    const note = this.notes.get(noteId);
    if (!note || !this.canRead(note, viewerId)) return null;
    return note;
  }

  canRead(note: SecureNote, userId: string): boolean {
    if (note.ownerId === userId || note.ownerId === 'local-owner') return true;
    return note.visibility === 'shared_read' || note.visibility === 'shared_write';
  }

  canWrite(note: SecureNote, userId: string): boolean {
    if (note.ownerId === userId || note.ownerId === 'local-owner') return true;
    return note.visibility === 'shared_write';
  }

  createNote(params: {
    notebookId?: string;
    title: string;
    content?: string;
    ownerId: string;
    visibility?: NoteVisibility;
    tags?: string[];
  }): SecureNote {
    const notebookId = params.notebookId && this.notebooks.has(params.notebookId)
      ? params.notebookId
      : 'notebook:general';
    const note: SecureNote = {
      id: `note:${crypto.randomUUID().slice(0, 12)}`,
      notebookId,
      title: params.title.trim().slice(0, 120) || 'Apunte sin título',
      content: (params.content ?? '# Nuevo apunte\n\nEscribe tus notas aquí…').slice(0, 100_000),
      ownerId: params.ownerId,
      visibility: params.visibility ?? 'private',
      tags: (params.tags ?? []).map((t) => t.trim().slice(0, 32)).filter(Boolean).slice(0, 12),
      updatedAt: Date.now(),
      revision: 1,
    };
    secureNoteSchema.parse(note);
    this.notes.set(note.id, note);
    this.saveToStorage();
    return note;
  }

  updateNote(
    noteId: string,
    patch: Partial<Pick<SecureNote, 'title' | 'content' | 'visibility' | 'notebookId' | 'tags'>>,
    actorId: string,
  ): SecureNote {
    const existing = this.notes.get(noteId);
    if (!existing) throw new Error('Apunte no encontrado.');
    if (!this.canWrite(existing, actorId)) {
      throw new Error('No tienes permiso de escritura en este apunte.');
    }
    if (patch.visibility !== undefined && existing.ownerId !== actorId && existing.ownerId !== 'local-owner') {
      throw new Error('Solo quien creó el apunte puede cambiar su visibilidad.');
    }
    const updated: SecureNote = {
      ...existing,
      title: patch.title !== undefined ? (patch.title.trim().slice(0, 120) || existing.title) : existing.title,
      content: patch.content !== undefined ? patch.content.slice(0, 100_000) : existing.content,
      visibility: patch.visibility ?? existing.visibility,
      notebookId: patch.notebookId ?? existing.notebookId,
      tags: patch.tags ? patch.tags.slice(0, 12) : existing.tags,
      updatedAt: Date.now(),
      revision: existing.revision + 1,
    };
    secureNoteSchema.parse(updated);
    this.notes.set(noteId, updated);
    this.saveToStorage();
    return updated;
  }

  deleteNote(noteId: string, actorId: string): boolean {
    const existing = this.notes.get(noteId);
    if (!existing) return false;
    if (existing.ownerId !== actorId && existing.ownerId !== 'local-owner') {
      throw new Error('Solo quien creó el apunte puede eliminarlo.');
    }
    this.notes.delete(noteId);
    this.saveToStorage();
    return true;
  }

  private saveToStorage(): void {
    try {
      if (!this.storage) return;
      const payload = {
        notebooks: Array.from(this.notebooks.values()),
        notes: Array.from(this.notes.values()),
      };
      this.storage?.setItem(this.scope ? `${STORAGE_KEY}:${this.scope}` : STORAGE_KEY, JSON.stringify(payload));
      this.committed = structuredClone(payload);
    } catch {
      if (this.committed) { this.notebooks = new Map(this.committed.notebooks.map(n => [n.id, structuredClone(n)])); this.notes = new Map(this.committed.notes.map(n => [n.id, structuredClone(n)])); }
      throw new AppError('storage');
    }
  }

  private loadFromStorage(): void {
    try {
      if (!this.storage) return;
      const raw = this.storage?.getItem(this.scope ? `${STORAGE_KEY}:${this.scope}` : STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        notebooks?: SecureNotebook[];
        notes?: SecureNote[];
      };
      if (Array.isArray(parsed.notebooks)) {
        for (const nb of parsed.notebooks) {
          if (nb && typeof nb.id === 'string' && typeof nb.name === 'string') {
            this.notebooks.set(nb.id, nb);
          }
        }
      }
      if (Array.isArray(parsed.notes)) {
        for (const n of parsed.notes) {
          const valid = secureNoteSchema.safeParse(n);
          if (valid.success) {
            this.notes.set(valid.data.id, valid.data);
          }
        }
      }
    } catch {
      // Keep defaults
    }
  }
}
