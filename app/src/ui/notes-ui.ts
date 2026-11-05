import { msg, t, defaultText, defaultMsg, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import { errorMessage } from '../errors/messages';
import { downloadLocal } from '../../../packages/runtime/src/local-bridge/files';
import { renderSafeMarkdownWithLatex, type SecureNote, type SecureNotesStore } from '../../../packages/core/src/notes/secure-notes';
import { mathReady } from '../whiteboard/math';
import { monoIcon } from './pixel-icons';
import './study-links.css';

/**
 * Notes as a calm, Notion-like page editor. A page is a list of blocks
 * (text, headings, lists, to-dos, quotes, code, formulas, dividers) edited in
 * place; it is stored as plain Markdown so older notes open unchanged.
 */

export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'todo' | 'quote' | 'code' | 'math' | 'divider';
export interface Block { type: BlockType; text: string; done?: boolean }

const BLOCK_MENU: { type: BlockType; label: DisplayText; hint: DisplayText; keys: string }[] = [
  { type: 'p', label: msg('Texto'), hint: msg('Un párrafo normal'), keys: 'texto parrafo' },
  { type: 'h1', label: msg('Título 1'), hint: msg('Encabezado grande'), keys: 'titulo h1 encabezado' },
  { type: 'h2', label: msg('Título 2'), hint: msg('Encabezado mediano'), keys: 'titulo h2 subtitulo' },
  { type: 'h3', label: msg('Título 3'), hint: msg('Encabezado pequeño'), keys: 'titulo h3' },
  { type: 'todo', label: msg('Lista de tareas'), hint: msg('Casillas para marcar'), keys: 'tarea todo check casilla' },
  { type: 'bullet', label: msg('Lista'), hint: msg('Lista con viñetas'), keys: 'lista viñeta bullet' },
  { type: 'number', label: msg('Lista numerada'), hint: '1, 2, 3…', keys: 'numerada numero' },
  { type: 'quote', label: msg('Cita'), hint: msg('Resaltar una idea'), keys: 'cita quote' },
  { type: 'math', label: msg('Fórmula'), hint: msg('LaTeX en bloque'), keys: 'formula latex ecuacion math' },
  { type: 'code', label: msg('Código'), hint: msg('Texto monoespaciado'), keys: 'codigo code' },
  { type: 'divider', label: msg('Separador'), hint: msg('Línea horizontal'), keys: 'separador linea divider' },
];

const SHORTCUTS: [RegExp, BlockType, boolean?][] = [
  [/^### $/, 'h3'], [/^## $/, 'h2'], [/^# $/, 'h1'], [/^\[\] $|^- \[ \] $/, 'todo'], [/^\[x\] $/i, 'todo', true],
  [/^[-*] $/, 'bullet'], [/^1[.)] $/, 'number'], [/^> $/, 'quote'], [/^```$/, 'code'], [/^\$\$$/, 'math'], [/^---$/, 'divider'],
];

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const body: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) body.push(lines[i]);
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) continue;
    let m: RegExpExecArray | null;
    if ((m = /^\$\$(.*)\$\$\s*$/.exec(line.trim()))) blocks.push({ type: 'math', text: m[1].trim() });
    else if ((m = /^(#{1,3}) (.*)$/.exec(line))) blocks.push({ type: (`h${m[1].length}`) as BlockType, text: m[2] });
    else if ((m = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(line))) blocks.push({ type: 'todo', text: m[2], done: m[1] !== ' ' });
    else if ((m = /^\s*[-*] (.*)$/.exec(line))) blocks.push({ type: 'bullet', text: m[1] });
    else if ((m = /^\s*\d+[.)] (.*)$/.exec(line))) blocks.push({ type: 'number', text: m[1] });
    else if ((m = /^> ?(.*)$/.exec(line))) blocks.push({ type: 'quote', text: m[1] });
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) blocks.push({ type: 'divider', text: '' });
    else blocks.push({ type: 'p', text: line });
  }
  return blocks.length ? blocks : [{ type: 'p', text: '' }];
}

export function serializeBlocks(blocks: readonly Block[]): string {
  let number = 0;
  const out: string[] = [];
  for (const b of blocks) {
    number = b.type === 'number' ? number + 1 : 0;
    const text = b.type === 'code' ? b.text : b.text.replace(/\n/g, ' ');
    switch (b.type) {
      case 'h1': out.push(`# ${text}`); break;
      case 'h2': out.push(`## ${text}`); break;
      case 'h3': out.push(`### ${text}`); break;
      case 'bullet': out.push(`- ${text}`); break;
      case 'number': out.push(`${number}. ${text}`); break;
      case 'todo': out.push(`- [${b.done ? 'x' : ' '}] ${text}`); break;
      case 'quote': out.push(`> ${text}`); break;
      case 'code': out.push('```', text, '```'); break;
      case 'math': out.push(`$$${text}$$`); break;
      case 'divider': out.push('---'); break;
      default: out.push(text);
    }
  }
  return out.join('\n');
}

/**
 * The Markdown renderer only marks formulas; this draws them with the same
 * MathJax engine as the whiteboard. A formula that fails keeps its source text.
 */
function typesetMath(container: HTMLElement, color = '#37352f'): void {
  for (const span of container.querySelectorAll<HTMLElement>('.sv-note-math[data-latex]')) {
    // The sanitizer escaped the source before tagging it; a textarea decodes
    // entities without ever parsing markup.
    const decoder = document.createElement('textarea');
    decoder.innerHTML = span.dataset.latex ?? '';
    const tex = decoder.value;
    const display = span.classList.contains('is-display');
    span.textContent = tex;
    void mathReady(tex, display ? 19 : 16, color, display, 2).then((math) => {
      if (math === 'error' || !span.isConnected) return;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(math.width * 2);
      canvas.height = Math.ceil(math.height * 2);
      canvas.style.width = `${math.width}px`;
      canvas.style.height = `${math.height}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', tex);
      canvas.getContext('2d')?.drawImage(math.image, 0, 0, canvas.width, canvas.height);
      span.replaceChildren(canvas);
    });
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text: DisplayText = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) setDisplayText(node, text);
  return node;
}
function btn(label: DisplayText, className: string): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

/** Plain-text editing where supported, so pasted styles never enter a note. */
function makeEditable(node: HTMLElement, on: boolean): void {
  if (!on) { node.contentEditable = 'false'; return; }
  try { node.contentEditable = 'plaintext-only'; } catch { node.contentEditable = 'true'; }
}

function caretOffset(node: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !node.contains(sel.anchorNode)) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(node);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return range.toString().length;
}

function placeCaret(node: HTMLElement, offset: number): void {
  node.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text) {
    const len = text.textContent?.length ?? 0;
    if (remaining <= len) { range.setStart(text, remaining); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); return; }
    remaining -= len;
    text = walker.nextNode();
  }
  range.selectNodeContents(node);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function timeAgo(ms: number): DisplayText {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return msg('ahora mismo');
  if (min < 60) return msg('hace {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return msg('hace {n} h', { n: h });
  return formatDate(ms, { dateStyle: 'medium' });
}

export interface NotesPanelContext {
  store: SecureNotesStore;
  actorId(): string;
  close(): void;
  notify(message: string): void;
  makeDeck(note: SecureNote): void;
  makeAiDeck: ((note: SecureNote) => void) | null;
  linkedDecks?(noteId:string):{id:string;title:string}[];
  openLinkedDeck?(deckId:string):void;
}

export class NotesPanel {
  readonly root = el('section', 'nb');
  private noteId: string | null = null;
  private notebookId = 'notebook:general';
  private query = '';
  private blocks: Block[] = [];
  private blockEls: HTMLElement[] = [];
  private drafts = new Map<string, {title:string;content:string}>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private menu: { index: number; filter: string; active: number; el: HTMLElement } | null = null;
  private pageMenuOpen = false;
  private sidebar = el('nav', 'nb-sidebar');
  private page = el('article', 'nb-page');

  constructor(private readonly ctx: NotesPanelContext) {
    setDisplayAttribute(this.root, 'aria-label', msg('Apuntes'));
    this.root.append(this.sidebar, this.page);
  }

  openNotebook(id: string): void { this.flush(); this.notebookId = id; this.noteId = this.ctx.store.listNotes(this.ctx.actorId(), id)[0]?.id ?? null; }

  /** Opening a backlink uses this store only and preserves pending edits before switching. */
  openNote(id:string):boolean {
    const note=this.ctx.store.getNote(id,this.ctx.actorId());if(!note||!this.flush())return false;
    this.noteId=note.id;this.notebookId=note.notebookId;this.query='';this.pageMenuOpen=false;return true;
  }
  savePending():boolean{return this.flush();}

  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    const notes = this.ctx.store.listNotes(this.ctx.actorId(), this.notebookId);
    if (!this.noteId || !this.ctx.store.getNote(this.noteId, this.ctx.actorId())) this.noteId = notes[0]?.id ?? null;
    if (this.noteId) this.notebookId = this.ctx.store.getNote(this.noteId, this.ctx.actorId())!.notebookId;
    this.renderSidebar();
    this.renderPage();
  }

  unmount(): void { this.flush(); this.root.remove(); }

  private note(): SecureNote | null { return this.noteId ? this.ctx.store.getNote(this.noteId, this.ctx.actorId()) : null; }

  private open(noteId: string): void {
    this.flush();
    this.noteId = noteId;
    this.pageMenuOpen = false;
    this.renderSidebar();
    this.renderPage();
  }

  private renderSidebar(): void {
    const actor = this.ctx.actorId();
    this.sidebar.replaceChildren();
    const head = el('div', 'nb-side-head');
    head.append(el('strong', '', msg('Apuntes')), el('span', 'nb-local', msg('En este equipo')));
    const search = el('label', 'nb-search');
    const input = el('input');
    input.type = 'search';
    setDisplayAttribute(input, "placeholder", msg('Buscar'));
    input.value = this.query;
    setDisplayAttribute(input, 'aria-label', msg('Buscar apuntes'));
    input.addEventListener('input', () => { this.query = input.value; this.renderTree(tree); });
    search.append(monoIcon('search', 12), input);
    const tree = el('div', 'nb-tree');
    this.renderTree(tree);
    const addBook = btn('', 'nb-side-action');
    addBook.append(monoIcon('plus', 10), el('span', '', msg('Nuevo cuaderno')));
    addBook.addEventListener('click', () => {
      const row = el('div', 'nb-new-book');
      const name = el('input');
      setDisplayAttribute(name, "placeholder", msg('Nombre del cuaderno'));
      name.maxLength = 60;
      const commit = () => {
        if (name.value.trim()) {
          try { const book = this.ctx.store.createNotebook(name.value, actor);
          this.notebookId = book.id; this.createPage(book.id); } catch (error) { this.ctx.notify(errorMessage(error)); }
        } else this.renderSidebar();
      };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') this.renderSidebar(); });
      name.addEventListener('blur', commit, { once: true });
      row.append(name);
      addBook.replaceWith(row);
      name.focus();
    });
    this.sidebar.append(head, search, tree, addBook);
  }

  private renderTree(tree: HTMLElement): void {
    const actor = this.ctx.actorId();
    tree.replaceChildren();
    for (const book of this.ctx.store.listNotebooks()) {
      const notes = this.ctx.store.listNotes(actor, book.id, this.query);
      if (this.query && !notes.length) continue;
      const group = el('div', 'nb-book');
      const title = el('div', 'nb-book-title');
      title.append(el('span', '', defaultMsg(book.name)));
      const add = btn('', 'nb-icon-btn');
      add.append(monoIcon('plus', 10));
      setDisplayAttribute(add, "title", msg('Nueva página'));
      setDisplayAttribute(add, 'aria-label', msg("Nueva página en {p0}", { p0: defaultText(book.name) }));
      add.addEventListener('click', () => this.createPage(book.id));
      title.append(add);
      group.append(title);
      for (const note of notes) {
        const row = btn('', 'nb-page-row');
        row.classList.toggle('is-active', note.id === this.noteId);
        row.append(monoIcon('notes', 12), el('span', '', note.title ? defaultMsg(note.title) : msg('Sin título')));
        row.addEventListener('click', () => this.open(note.id));
        group.append(row);
      }
      if (!notes.length) group.append(el('p', 'nb-empty-book', msg('Sin páginas')));
      tree.append(group);
    }
  }

  private createPage(notebookId: string): void {
    try {
      const note = this.ctx.store.createNote({ notebookId, title: 'Sin título', content: '', ownerId: 'local-owner' });
      this.notebookId = notebookId; this.open(note.id);
      queueMicrotask(() => { const t = this.page.querySelector<HTMLElement>('.nb-title'); if (t) { t.focus(); document.getSelection()?.selectAllChildren(t); } });
    } catch (error) { this.ctx.notify(errorMessage(error)); }
  }

  private renderPage(): void {
    this.page.replaceChildren();
    const note = this.note();
    if (!note) {
      const empty = el('div', 'nb-blank');
      empty.append(el('h2', '', msg('Aún no hay páginas')), el('p', '', msg('Crea una página en un cuaderno para empezar.')));
      const create = btn(msg('Nueva página'), 'nb-primary');
      create.addEventListener('click', () => this.createPage(this.notebookId));
      empty.append(create);
      const close = this.closeButton();
      this.page.append(close, empty);
      return;
    }
    const canWrite = this.ctx.store.canWrite(note, this.ctx.actorId());
    const book = this.ctx.store.listNotebooks().find((b) => b.id === note.notebookId);
    const top = el('div', 'nb-topbar');
    const crumbs = el('div', 'nb-crumbs');
    crumbs.append(el('span', '', book ? defaultMsg(book.name) : msg('Cuaderno')), el('span', 'nb-sep', '/'), el('span', '', note.title ? defaultMsg(note.title) : msg('Sin título')));
    const actions = el('div', 'nb-top-actions');
    actions.append(el('span', 'nb-edited', msg("Editado {p0}", { p0: timeAgo(note.updatedAt) })));
    const more = btn('', 'nb-icon-btn');
    more.append(el('span', 'nb-dots', '•••'));
    setDisplayAttribute(more, 'aria-label', msg('Más opciones de la página'));
    more.setAttribute('aria-expanded', String(this.pageMenuOpen));
    more.addEventListener('click', () => { if(!this.flush())return;this.pageMenuOpen = !this.pageMenuOpen; this.renderPage(); });
    actions.append(more, this.closeButton());
    top.append(crumbs, actions);
    if (this.pageMenuOpen) top.append(this.pageMenu(note, canWrite));

    const body = el('div', 'nb-body');
    const title = el('h1', 'nb-title');
    makeEditable(title, canWrite);
    const draft = this.drafts.get(note.id);
    title.textContent = draft?.title ?? (note.title === 'Sin título' ? '' : defaultText(note.title));
    setDisplayAttribute(title, "data-placeholder", msg('Sin título'));
    setDisplayAttribute(title, 'aria-label', msg('Título de la página'));
    title.dataset.testid = 'secure-note-title';
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.focusBlock(0, 0); }
    });
    title.addEventListener('input', () => this.scheduleSave());

    if (draft) { const warning = el('p', 'sv-feedback is-error', msg('Hay cambios sin guardar. Puedes reintentar sin perder este borrador.')); const retry = btn(msg('Volver a guardar'), 'nb-btn'); retry.onclick = () => { if (this.saveTimer) clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flush(), 0); }; body.append(warning, retry); }
    // Lines that are still the app's sample text follow the language; lines someone wrote stay as written.
    this.blocks = parseBlocks(draft?.content ?? note.content.split('\n').map(defaultText).join('\n'));
    const list = el('div', 'nb-blocks');
    list.dataset.testid = 'secure-note-content-input';
    this.blockEls = this.blocks.map((block, i) => this.blockElement(block, i, canWrite));
    list.append(...this.blockEls);
    list.addEventListener('click', (e) => {
      if (e.target === list && canWrite) {
        const last = this.blocks.length - 1;
        if (this.blocks[last].type !== 'p' || this.blocks[last].text) this.insertBlock(last + 1, { type: 'p', text: '' });
        else this.focusBlock(last, 0);
      }
    });
    body.append(title);
    const decks=this.ctx.linkedDecks?.(note.id)??[];
    if(decks.length&&this.ctx.openLinkedDeck){
      const links=el('nav','sv-note-deck-links');setDisplayAttribute(links,'aria-label',msg('Flashcards vinculadas'));
      const label=el('span','sv-study-link-label');label.append(monoIcon('cards',14),el('span','',msg('Flashcards vinculadas')));links.append(label);
      for(const deck of decks){const link=btn(deck.title,'sv-study-reference');setDisplayAttribute(link,'aria-label',msg('Abrir mazo: {title}',{title:deck.title}));link.addEventListener('click',()=>{if(this.flush())this.ctx.openLinkedDeck?.(deck.id);});links.append(link);}
      body.append(links);
    }
    body.append(list);
    if (canWrite) body.append(el('p', 'nb-hint', msg('Escribe «/» para elegir un tipo de bloque. Atajos: # título, - lista, [] tarea, > cita, $$ fórmula.')));
    this.page.append(top, body);
  }

  private closeButton(): HTMLButtonElement {
    const close = btn('', 'nb-icon-btn');
    close.append(monoIcon('close', 12));
    setDisplayAttribute(close, 'aria-label', msg('Cerrar apuntes'));
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    return close;
  }

  private pageMenu(note: SecureNote, canWrite: boolean): HTMLElement {
    const menu = el('div', 'nb-popover');
    const item = (label: string, action: () => void, disabled = false) => {
      const b = btn(msg(label), 'nb-menu-item');
      b.disabled = disabled;
      b.addEventListener('click', () => { this.pageMenuOpen = false; action(); });
      menu.append(b);
    };
    item('Crear tarjetas de repaso', () => { if(!this.flush())return;const current=this.note();if(current)try{this.ctx.makeDeck(current);}catch(error){this.ctx.notify(errorMessage(error));} });
    if (this.ctx.makeAiDeck) item('Generar tarjetas con IA', () => { if(!this.flush())return;const current=this.note();if(current)try{this.ctx.makeAiDeck!(current);}catch(error){this.ctx.notify(errorMessage(error));} });
    item('Exportar como Markdown', () => {
      this.flush();
      const current = this.note()!;
      const blob = new Blob([`# ${current.title}\n\n${current.content}`], { type: 'text/markdown' });
      downloadLocal(`${current.title.replace(/[^\w\-áéíóúñ ]+/gi, '').trim() || 'apunte'}.md`, blob);
    });
    item('Borrar página', () => {
      try {
        this.ctx.store.deleteNote(note.id, this.ctx.actorId());
        if(this.saveTimer)clearTimeout(this.saveTimer);this.saveTimer=null;this.drafts.delete(note.id);
        this.noteId = this.ctx.store.listNotes(this.ctx.actorId())[0]?.id ?? null;
        this.renderSidebar();
        this.renderPage();
      } catch (e) { this.ctx.notify(errorMessage(e, 'No se pudo borrar el apunte.')); }
    }, !canWrite);
    return menu;
  }

  private blockElement(block: Block, index: number, canWrite: boolean): HTMLElement {
    const row = el('div', `nb-block is-${block.type}`);
    if (block.type === 'divider') {
      row.append(el('hr'));
      row.tabIndex = 0;
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this.removeBlock(index, index - 1); }
        if (e.key === 'Enter') { e.preventDefault(); this.insertBlock(index + 1, { type: 'p', text: '' }); }
      });
      return row;
    }
    if (block.type === 'todo') {
      const box = el('input', 'nb-check');
      box.type = 'checkbox';
      box.checked = !!block.done;
      box.disabled = !canWrite;
      setDisplayAttribute(box, 'aria-label', msg('Hecho'));
      box.addEventListener('change', () => { block.done = box.checked; row.classList.toggle('is-done', box.checked); this.scheduleSave(); });
      row.classList.toggle('is-done', !!block.done);
      row.append(box);
    } else if (block.type === 'bullet') row.append(el('span', 'nb-marker', '•'));
    else if (block.type === 'number') {
      let n = 1;
      for (let i = index - 1; i >= 0 && this.blocks[i].type === 'number'; i--) n++;
      row.append(el('span', 'nb-marker', `${n}.`));
    }
    const text: HTMLElement = el(block.type === 'code' ? 'pre' : 'div', 'nb-text');
    makeEditable(text, canWrite);
    text.spellcheck = block.type !== 'code' && block.type !== 'math';
    setDisplayAttribute(text, "data-placeholder", index === 0 && this.blocks.length === 1 ? msg('Escribe algo, o «/» para ver bloques…') : block.type === 'math' ? msg('Fórmula LaTeX') : block.type.startsWith('h') ? msg('Título') : '');
    const showRendered = () => {
      if (block.type === 'math' && block.text.trim()) {
        text.innerHTML = renderSafeMarkdownWithLatex(`$$${block.text}$$`);
        typesetMath(text);
        row.classList.add('is-rendered');
      } else if (block.type !== 'code' && /\$[^$]+\$|\*\*[^*]+\*\*|\*[^*]+\*/.test(block.text)) {
        text.innerHTML = renderSafeMarkdownWithLatex(block.text).replace(/^<p>|<\/p>\s*$/g, '');
        typesetMath(text);
        row.classList.add('is-rendered');
      } else {
        text.textContent = block.text;
        row.classList.remove('is-rendered');
      }
    };
    showRendered();
    text.addEventListener('focus', () => {
      if (row.classList.contains('is-rendered')) {
        text.textContent = block.text;
        row.classList.remove('is-rendered');
        placeCaret(text, block.text.length);
      }
    });
    text.addEventListener('blur', () => { if (!this.menu) showRendered(); });
    text.addEventListener('input', () => this.onInput(index, text));
    text.addEventListener('keydown', (e) => this.onKey(e, index, text));
    row.append(text);
    return row;
  }

  private onInput(index: number, text: HTMLElement): void {
    const block = this.blocks[index];
    block.text = text.textContent ?? '';
    if (block.type !== 'code') {
      for (const [pattern, type, done] of SHORTCUTS) {
        if (pattern.test(block.text) && block.type !== type) {
          this.replaceBlock(index, { type, text: '', done: !!done });
          if (type === 'divider') this.insertBlock(index + 1, { type: 'p', text: '' });
          return;
        }
      }
    }
    if (block.text.startsWith('/') && !block.text.includes(' ')) this.openMenu(index, block.text.slice(1));
    else this.closeMenu();
    this.scheduleSave();
  }

  private onKey(e: KeyboardEvent, index: number, text: HTMLElement): void {
    const block = this.blocks[index];
    if (this.menu && this.menu.index === index) {
      const options = this.menuOptions();
      if (e.key === 'ArrowDown') { e.preventDefault(); this.menu.active = (this.menu.active + 1) % Math.max(1, options.length); this.paintMenu(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.menu.active = (this.menu.active - 1 + options.length) % Math.max(1, options.length); this.paintMenu(); return; }
      if (e.key === 'Enter') { e.preventDefault(); const chosen = options[this.menu.active]; if (chosen) this.applyMenu(chosen.type); return; }
      if (e.key === 'Escape') { e.preventDefault(); this.closeMenu(); return; }
    }
    const offset = caretOffset(text);
    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      const listy = block.type === 'bullet' || block.type === 'number' || block.type === 'todo';
      if (listy && !block.text) { this.replaceBlock(index, { type: 'p', text: '' }); return; }
      const before = block.text.slice(0, offset);
      const after = block.text.slice(offset);
      block.text = before;
      text.textContent = before;
      this.insertBlock(index + 1, { type: listy || block.type === 'quote' ? block.type : 'p', text: after }, 0);
      return;
    }
    if (e.key === 'Enter' && block.type === 'code' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.insertBlock(index + 1, { type: 'p', text: '' });
      return;
    }
    if (e.key === 'Backspace' && offset === 0 && !window.getSelection()?.toString()) {
      if (block.type !== 'p') { e.preventDefault(); this.replaceBlock(index, { type: 'p', text: block.text }, 0); return; }
      if (index > 0) {
        e.preventDefault();
        const prev = this.blocks[index - 1];
        if (prev.type === 'divider') { this.removeBlock(index - 1, index - 1, 0); return; }
        const join = prev.text.length;
        prev.text += block.text;
        this.removeBlock(index, index - 1, join);
      }
      return;
    }
    if (e.key === 'ArrowUp' && offset === 0 && index > 0) { e.preventDefault(); this.focusBlock(index - 1, Infinity); }
    if (e.key === 'ArrowDown' && offset === block.text.length && index < this.blocks.length - 1) { e.preventDefault(); this.focusBlock(index + 1, 0); }
  }

  private menuOptions(): typeof BLOCK_MENU {
    const f = (this.menu?.filter ?? '').toLowerCase();
    return BLOCK_MENU.filter((o) => !f || t(o.label).toLowerCase().includes(f) || o.keys.includes(f));
  }

  private openMenu(index: number, filter: string): void {
    if (!this.menu || this.menu.index !== index) {
      this.closeMenu();
      const menuEl = el('div', 'nb-slash');
      menuEl.setAttribute('role', 'listbox');
      this.menu = { index, filter, active: 0, el: menuEl };
      this.blockEls[index]?.append(menuEl);
    }
    this.menu.filter = filter;
    this.menu.active = Math.min(this.menu.active, Math.max(0, this.menuOptions().length - 1));
    this.paintMenu();
  }

  private paintMenu(): void {
    if (!this.menu) return;
    const options = this.menuOptions();
    this.menu.el.replaceChildren(el('div', 'nb-slash-title', msg('Bloques')));
    if (!options.length) this.menu.el.append(el('p', 'nb-slash-none', msg('Sin resultados')));
    options.forEach((o, i) => {
      const item = btn('', 'nb-slash-item');
      item.setAttribute('role', 'option');
      item.classList.toggle('is-active', i === this.menu!.active);
      item.append(el('strong', '', o.label), el('span', '', o.hint));
      item.addEventListener('mousedown', (e) => { e.preventDefault(); this.applyMenu(o.type); });
      this.menu!.el.append(item);
    });
  }

  private applyMenu(type: BlockType): void {
    if (!this.menu) return;
    const index = this.menu.index;
    this.closeMenu();
    this.replaceBlock(index, { type, text: '' });
    if (type === 'divider') this.insertBlock(index + 1, { type: 'p', text: '' });
  }

  private closeMenu(): void {
    this.menu?.el.remove();
    this.menu = null;
  }

  private rebuild(focus: number, caret: number): void {
    const note = this.note();
    if (!note) return;
    const canWrite = this.ctx.store.canWrite(note, this.ctx.actorId());
    const list = this.page.querySelector('.nb-blocks');
    if (!list) return;
    this.blockEls = this.blocks.map((block, i) => this.blockElement(block, i, canWrite));
    list.replaceChildren(...this.blockEls);
    this.focusBlock(focus, caret);
    this.scheduleSave();
  }

  private replaceBlock(index: number, block: Block, caret = 0): void { this.blocks[index] = block; this.rebuild(index, caret); }
  private insertBlock(index: number, block: Block, caret = 0): void { this.blocks.splice(index, 0, block); this.rebuild(index, caret); }
  private removeBlock(index: number, focus: number, caret = Infinity): void {
    this.blocks.splice(index, 1);
    if (!this.blocks.length) this.blocks.push({ type: 'p', text: '' });
    this.rebuild(Math.max(0, Math.min(focus, this.blocks.length - 1)), caret);
  }

  private focusBlock(index: number, caret: number): void {
    const row = this.blockEls[index];
    if (!row) return;
    const text = row.querySelector<HTMLElement>('.nb-text');
    if (!text) { row.focus(); return; }
    text.focus();
    placeCaret(text, Math.min(caret, this.blocks[index].text.length));
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 400);
  }

  private flush(): boolean {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; } else return !this.noteId||!this.drafts.has(this.noteId);
    const note = this.note();
    if (!note || !this.ctx.store.canWrite(note, this.ctx.actorId())) return true;
    const titleEl = this.page.querySelector<HTMLElement>('.nb-title');
    const title = titleEl?.textContent?.trim() || 'Sin título';
    try {
      this.ctx.store.updateNote(note.id, { title, content: serializeBlocks(this.blocks) }, this.ctx.actorId()); this.drafts.delete(note.id);
      const active = this.sidebar.querySelector('.nb-page-row.is-active span');
      if (active && active.textContent !== title) active.textContent = title;
      const crumb = this.page.querySelector('.nb-crumbs span:last-child');
      if (crumb) crumb.textContent = title;
      const edited = this.page.querySelector('.nb-edited');
      if (edited) setDisplayText(edited, msg('Editado ahora mismo'));
      return true;
    } catch (e) {
      this.drafts.set(note.id, { title, content: serializeBlocks(this.blocks) });
      const edited = this.page.querySelector('.nb-edited'); if (edited) setDisplayText(edited, msg('Sin guardar · vuelve a editar para reintentar'));
      this.ctx.notify(errorMessage(e, 'No se pudo guardar el apunte. Conservamos tus cambios para que puedas reintentarlo.'));
      return false;
    }
  }
}
