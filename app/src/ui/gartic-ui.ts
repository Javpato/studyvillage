import { msg, t, defaultText, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import {
  CANVAS_H, CANVAS_W, MAX_DRAWING_POINTS, MIN_PLAYERS,
  type DrawStroke, type Drawing, type GarticAction, type GarticView,
} from '../../../packages/core/src/minigames/gartic-phone';
import { monoIcon } from './pixel-icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text: DisplayText = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) setDisplayText(node, text);
  return node;
}
function btn(label: DisplayText, className = 'gp-btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

const PALETTE = [
  '#000000', '#666666', '#0050cd', '#ffffff', '#aaaaaa', '#26c9ff',
  '#017420', '#990000', '#964112', '#11b03c', '#ff0013', '#ff7829',
  '#b0701c', '#99004e', '#cb5a57', '#ffc126', '#ff008f', '#feafa8',
];
const SIZES = [3, 7, 14, 26];

export function paintDrawing(ctx: CanvasRenderingContext2D, drawing: Drawing | undefined, scale = 1): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of drawing?.strokes ?? []) paintStroke(ctx, s);
  ctx.restore();
}

function paintStroke(ctx: CanvasRenderingContext2D, s: DrawStroke): void {
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w;
  if (s.p.length === 2) {
    ctx.beginPath();
    ctx.arc(s.p[0], s.p[1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(s.p[0], s.p[1]);
  for (let i = 2; i + 1 < s.p.length; i += 2) ctx.lineTo(s.p[i], s.p[i + 1]);
  ctx.stroke();
}

function drawingCanvas(drawing: Drawing | undefined, className = 'gp-paper'): HTMLCanvasElement {
  const canvas = el('canvas', className);
  canvas.width = CANVAS_W * 2;
  canvas.height = CANVAS_H * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) paintDrawing(ctx, drawing, 2);
  return canvas;
}

export interface GarticPanelContext {
  send(action: GarticAction): void;
  close(): void;
  me(): { name: string; color: string };
  aiReady?(): boolean;
  advanced?(container: HTMLElement): void;
}

/** Per-round working state that must survive re-renders. */
interface Draft {
  key: string;
  text: HTMLInputElement;
  canvas: HTMLCanvasElement;
  strokes: DrawStroke[];
  undone: DrawStroke[];
  color: string;
  size: number;
  autoSent: boolean;
}

export class GarticPanel {
  readonly root = el('section', 'gp');
  private view: GarticView | null = null;
  private receivedAt = 0;
  private errorText = '';
  private draft: Draft | null = null;
  private timerEl: HTMLElement | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private editing = false;
  private advancedOpen = false;
  /** Album drawings arrive once, when their page is turned; keep them. */
  private albumCache = new Map<string, Drawing>();
  private activePointer: number | null = null;

  constructor(private readonly ctx: GarticPanelContext) {
    setDisplayAttribute(this.root, 'aria-label', msg('Gartic Phone'));
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    this.clock ??= setInterval(() => this.onClock(), 250);
    this.render();
  }

  unmount(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.root.remove();
  }

  update(view: GarticView | null, error: string | null): void {
    if (view) view = { ...view, players: view.players.map(p => ({ ...p, name: defaultText(p.name) })) };
    if (view) {
      this.view = view;
      this.receivedAt = Date.now();
      if (view.album) for (const page of view.album.pages) if (page.drawing) this.albumCache.set(page.key, page.drawing);
      // "Editar" unlocks right away; once the host confirms, the flag is no longer needed.
      if (!view.me.done) this.editing = false;
    }
    this.errorText = error ?? '';
    // Never rebuild the page under a pen that is still drawing.
    if (this.activePointer === null) this.render();
  }

  private remaining(): number {
    return this.view ? Math.max(0, this.view.remainingMs - (Date.now() - this.receivedAt)) : 0;
  }

  private onClock(): void {
    const v = this.view;
    if (!v || !this.timerEl) return;
    const ms = this.remaining();
    const s = Math.ceil(ms / 1000);
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('is-low', s <= 10);
    // Like the real game: when time runs out, whatever is on the page is sent.
    if (ms < 1_200 && this.draft && !this.draft.autoSent && v.task && !v.me.done) {
      this.draft.autoSent = true;
      this.submit(true);
    }
  }

  private ensureDraft(v: GarticView): Draft {
    const key = `${v.round}:${v.task?.kind}`;
    if (this.draft?.key === key) return this.draft;
    const text = el('input', 'gp-input');
    text.maxLength = 120;
    text.autocomplete = 'off';
    setDisplayAttribute(text, "placeholder", v.task?.kind === 'write' ? msg('Escribe tu frase') : msg('Describe el dibujo'));
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submit(false); } });
    if (v.mine?.text) text.value = v.mine.text;
    const canvas = el('canvas', 'gp-paper gp-paper-live');
    canvas.width = CANVAS_W * 2;
    canvas.height = CANVAS_H * 2;
    setDisplayAttribute(canvas, 'aria-label', msg('Hoja de dibujo'));
    this.draft = { key, text, canvas, strokes: v.mine?.drawing?.strokes.map((s) => ({ ...s, p: [...s.p] })) ?? [], undone: [], color: '#000000', size: 7, autoSent: false };
    this.bindCanvas(this.draft);
    this.repaint();
    return this.draft;
  }

  private points(): number { return this.draft?.strokes.reduce((n, s) => n + s.p.length / 2, 0) ?? 0; }

  private bindCanvas(draft: Draft): void {
    const canvas = draft.canvas;
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [Math.round((e.clientX - r.left) * CANVAS_W / r.width), Math.round((e.clientY - r.top) * CANVAS_H / r.height)] as const;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (this.view?.me.done && !this.editing) return;
      if (this.points() >= MAX_DRAWING_POINTS) { this.errorText = t('La hoja está llena: deshaz algún trazo.'); this.render(); return; }
      this.activePointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      draft.strokes.push({ c: draft.color, w: draft.size, p: [x, y] });
      draft.undone = [];
      this.repaint();
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.activePointer !== e.pointerId) return;
      const stroke = draft.strokes[draft.strokes.length - 1];
      const [x, y] = at(e);
      const lx = stroke.p[stroke.p.length - 2]; const ly = stroke.p[stroke.p.length - 1];
      if (Math.hypot(x - lx, y - ly) < 2.5 || this.points() >= MAX_DRAWING_POINTS) return;
      stroke.p.push(x, y);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.strokeStyle = stroke.c; ctx.lineWidth = stroke.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
      }
    });
    const end = (e: PointerEvent) => {
      if (this.activePointer !== e.pointerId) return;
      this.activePointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      this.render();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private repaint(): void {
    const ctx = this.draft?.canvas.getContext('2d');
    if (ctx && this.draft) paintDrawing(ctx, { strokes: this.draft.strokes }, 2);
  }

  private submit(auto: boolean): void {
    const v = this.view;
    const d = this.draft;
    if (!v?.task || !d) return;
    this.editing = false;
    if (v.task.kind === 'draw') this.ctx.send({ kind: 'submit', drawing: { strokes: d.strokes } });
    else {
      const text = d.text.value.trim();
      if (auto && !text) return;
      if (!text) { this.errorText = t('Escribe algo antes de pulsar ¡Listo!'); this.render(); return; }
      d.text.value = text;
      this.ctx.send({ kind: 'submit', text });
    }
  }

  private render(): void {
    const v = this.view;
    this.root.replaceChildren();
    this.root.dataset.phase = v?.phase ?? 'lobby';
    this.root.append(this.header(v));
    const stage = el('div', 'gp-stage');
    if (!v) stage.append(this.card(msg('Conectando…'), el('p', 'gp-muted', msg('Buscando la sala de dibujo de la aldea.'))));
    else if (v.phase === 'lobby') stage.append(this.lobby(v));
    else if (v.phase === 'album' || v.phase === 'end') stage.append(this.album(v));
    else if (!v.task) stage.append(this.card(msg('Partida en curso'), el('p', 'gp-muted', msg('Podrás unirte a la siguiente. Mientras, mira cómo dibujan los demás.'))), this.roster(v));
    else stage.append(this.task(v));
    if (this.errorText) stage.append(el('p', 'gp-error', this.errorText));
    this.root.append(stage);
    this.onClock();
  }

  private header(v: GarticView | null): HTMLElement {
    const head = el('header', 'gp-head');
    const logo = el('div', 'gp-logo');
    logo.append(el('span', 'gp-logo-top', msg('GARTIC')), el('span', 'gp-logo-bottom', msg('PHONE')));
    head.append(logo);
    if (v && v.task && v.phase !== 'lobby') {
      head.append(el('span', 'gp-step', `${v.round + 1}/${v.totalRounds}`));
      const timer = el('span', 'gp-timer');
      this.timerEl = el('span', '');
      timer.append(el('span', 'gp-clock-face'), this.timerEl);
      head.append(timer);
    } else this.timerEl = null;
    const close = btn('', 'gp-close');
    close.append(monoIcon('close', 14));
    setDisplayAttribute(close, 'aria-label', msg('Cerrar'));
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    head.append(close);
    return head;
  }

  private card(title: DisplayText, ...children: HTMLElement[]): HTMLElement {
    const card = el('div', 'gp-card');
    card.append(el('h2', 'gp-title', title), ...children);
    return card;
  }

  private avatar(p: { name: string; color: string }, size = 'md'): HTMLElement {
    const a = el('span', `gp-avatar is-${size}`, p.name.slice(0, 1).toUpperCase());
    a.style.backgroundColor = p.color;
    return a;
  }

  private roster(v: GarticView): HTMLElement {
    const list = el('ul', 'gp-roster');
    for (const p of v.players) {
      const li = el('li', p.done ? 'is-done' : '');
      li.append(this.avatar(p, 'sm'), el('span', '', p.name + (p.bot ? ' · bot' : '')));
      if (p.done) { const ok = el('span', 'gp-done'); ok.append(monoIcon('check', 12)); li.append(ok); }
      list.append(li);
    }
    return list;
  }

  private lobby(v: GarticView): HTMLElement {
    const wrap = el('div', 'gp-lobby');
    const left = el('div', 'gp-card gp-players');
    left.append(el('h2', 'gp-title', msg("Jugadores {p0}/8", { p0: v.players.length })));
    const list = el('ul', 'gp-player-list');
    for (const p of v.players) {
      const li = el('li');
      li.append(this.avatar(p), el('strong', '', p.name), el('span', 'gp-muted', p.id === v.leaderId ? msg('anfitrión') : p.bot ? msg('bot') : ''));
      if (p.bot && v.me.isLeader) {
        const x = btn('', 'gp-mini');
        x.append(monoIcon('close', 10));
        setDisplayAttribute(x, 'aria-label', msg("Quitar a {p0}", { p0: p.name }));
        x.addEventListener('click', () => this.ctx.send({ kind: 'remove_bot', id: p.id }));
        li.append(x);
      }
      list.append(li);
    }
    for (let i = v.players.length; i < Math.max(MIN_PLAYERS, v.players.length + 1) && i < 8; i++) {
      const li = el('li', 'is-empty');
      li.append(el('span', 'gp-avatar is-md is-empty'), el('span', 'gp-muted', msg('Vacío')));
      list.append(li);
    }
    left.append(list);

    const right = el('div', 'gp-card gp-howto');
    right.append(el('h2', 'gp-title', msg('Cómo se juega')));
    const steps = el('ol', 'gp-steps');
    for (const [icon, title, text] of [
      ['notes', msg('Escribe'), msg('Una frase absurda para que alguien la dibuje.')],
      ['brush', msg('Dibuja'), msg('Recibes la frase de otra persona y la dibujas.')],
      ['chat', msg('Adivina'), msg('Describes el dibujo que te llega… sin ver la frase.')],
    ] as const) {
      const li = el('li');
      const badge = el('span', 'gp-step-icon');
      badge.append(monoIcon(icon, 22));
      li.append(badge, el('strong', '', title), el('span', '', text));
      steps.append(li);
    }
    right.append(steps, el('p', 'gp-muted', msg('Al final se abren los álbumes y se ve cómo cambió cada frase.')));
    const actions = el('div', 'gp-actions');
    if (!v.me.seated) {
      const join = btn(msg('Entrar'), 'gp-btn gp-btn-go');
      join.addEventListener('click', () => this.ctx.send({ kind: 'join', ...this.ctx.me() }));
      actions.append(join);
    } else {
      const leave = btn(msg('Salir'), 'gp-btn');
      leave.addEventListener('click', () => this.ctx.send({ kind: 'leave' }));
      actions.append(leave);
      if (v.me.isLeader) {
        const bot = btn(msg('Añadir bot Ollama'), 'gp-btn');
        bot.disabled = v.players.length >= 8 || !v.aiBotsReady;
        bot.addEventListener('click', () => this.ctx.send({ kind: 'add_bot' }));
        const start = btn(msg('Empezar'), 'gp-btn gp-btn-go');
        start.disabled = v.players.length < MIN_PLAYERS;
        setDisplayAttribute(start, "title", v.players.length < MIN_PLAYERS ? msg("Mínimo {p0} jugadores", { p0: MIN_PLAYERS }) : '');
        start.addEventListener('click', () => this.ctx.send({ kind: 'start' }));
        const advanced = el('details'); advanced.open = this.advancedOpen; advanced.addEventListener('toggle', () => { if (advanced.isConnected) this.advancedOpen = advanced.open; }); advanced.append(el('summary', '', msg('Opciones avanzadas · bots con Ollama')));
        this.ctx.advanced?.(advanced); advanced.append(bot); actions.append(start); if (this.ctx.aiReady?.()) actions.append(advanced);
      } else actions.append(el('p', 'gp-muted', msg('Esperando a que el anfitrión empiece…')));
    }
    right.append(actions);
    wrap.append(left, right);
    return wrap;
  }

  private task(v: GarticView): HTMLElement {
    const t = v.task!;
    const d = this.ensureDraft(v);
    const locked = v.me.done && !this.editing;
    const wrap = el('div', 'gp-task');
    const done = () => {
      const row = el('div', 'gp-actions');
      const b = btn(locked ? msg('Editar') : msg('¡Listo!'), locked ? 'gp-btn' : 'gp-btn gp-btn-go');
      if (!locked) b.prepend(monoIcon('check', 14));
      b.addEventListener('click', () => {
        if (locked) { this.editing = true; this.ctx.send({ kind: 'unsubmit' }); this.render(); }
        else this.submit(false);
      });
      row.append(b);
      if (locked) row.append(el('span', 'gp-muted', msg("Esperando: {p0}", { p0: v.players.filter((p) => !p.done).map((p) => p.name).join(', ') || '…' })));
      return row;
    };

    if (t.kind === 'write') {
      const card = this.card(msg('¡Escribe una frase!'));
      card.append(el('p', 'gp-muted', msg('Algo raro, divertido o difícil de dibujar.')));
      d.text.disabled = locked;
      card.append(d.text, done());
      wrap.append(card);
      queueMicrotask(() => { if (!locked && document.activeElement !== d.text) d.text.focus(); });
    } else if (t.kind === 'guess') {
      const card = this.card(msg('¿Qué es este dibujo?'));
      card.append(drawingCanvas(t.previous?.drawing, 'gp-paper gp-paper-view'));
      d.text.disabled = locked;
      card.append(d.text, done());
      wrap.append(card);
    } else {
      const banner = el('div', 'gp-prompt');
      banner.append(el('span', 'gp-prompt-label', msg('Dibuja:')), el('strong', '', t.previous?.text ?? msg('¡Lo que quieras!')));
      const board = el('div', 'gp-board');
      board.classList.toggle('is-locked', locked);
      const palette = el('div', 'gp-palette');
      setDisplayAttribute(palette, 'aria-label', msg('Colores'));
      for (const color of PALETTE) {
        const sw = btn('', 'gp-swatch');
        sw.style.backgroundColor = color;
        setDisplayAttribute(sw, 'aria-label', msg("Color {p0}", { p0: color }));
        sw.classList.toggle('is-active', d.color === color);
        sw.addEventListener('click', () => { d.color = color; this.render(); });
        palette.append(sw);
      }
      const tools = el('div', 'gp-tools');
      for (const size of SIZES) {
        const b = btn('', 'gp-size');
        const dot = el('span', 'gp-size-dot');
        dot.style.width = dot.style.height = `${Math.max(4, size * 0.9)}px`;
        b.append(dot);
        setDisplayAttribute(b, 'aria-label', msg("Grosor {p0}", { p0: size }));
        b.classList.toggle('is-active', d.size === size);
        b.addEventListener('click', () => { d.size = size; this.render(); });
        tools.append(b);
      }
      const eraser = btn(msg('Goma'), 'gp-tool');
      eraser.classList.toggle('is-active', d.color === '#ffffff');
      eraser.addEventListener('click', () => { d.color = '#ffffff'; this.render(); });
      const undo = btn(msg('Deshacer'), 'gp-tool');
      undo.disabled = !d.strokes.length;
      undo.addEventListener('click', () => { const s = d.strokes.pop(); if (s) d.undone.push(s); this.repaint(); this.render(); });
      const redo = btn(msg('Rehacer'), 'gp-tool');
      redo.disabled = !d.undone.length;
      redo.addEventListener('click', () => { const s = d.undone.pop(); if (s) d.strokes.push(s); this.repaint(); this.render(); });
      const clear = btn(msg('Borrar'), 'gp-tool');
      clear.addEventListener('click', () => { d.undone = [...d.strokes].reverse(); d.strokes = []; this.repaint(); this.render(); });
      tools.append(eraser, undo, redo, clear);
      const paperWrap = el('div', 'gp-paper-wrap');
      paperWrap.append(d.canvas);
      board.append(palette, paperWrap, tools);
      wrap.append(banner, board, done());
    }
    wrap.append(this.roster(v));
    return wrap;
  }

  private album(v: GarticView): HTMLElement {
    const a = v.album!;
    const card = el('div', 'gp-card gp-album');
    const head = el('div', 'gp-album-head');
    head.append(this.avatar(a.owner), el('h2', 'gp-title', msg("Álbum de {p0}", { p0: a.owner.name })), el('span', 'gp-step', `${a.book + 1}/${a.books}`));
    card.append(head);
    const feed = el('ol', 'gp-feed');
    for (const page of a.pages) {
      const li = el('li', `gp-bubble is-${page.kind}`);
      li.append(this.avatar(page.author, 'sm'));
      const body = el('div', 'gp-bubble-body');
      body.append(el('span', 'gp-bubble-name', page.author.name));
      if (page.kind === 'draw') body.append(drawingCanvas(page.drawing ?? this.albumCache.get(page.key), 'gp-paper gp-paper-album'));
      else body.append(el('p', 'gp-bubble-text', page.text ?? '…'));
      li.append(body);
      feed.append(li);
    }
    card.append(feed);
    const actions = el('div', 'gp-actions');
    if (v.me.isLeader) {
      if (v.phase === 'album') {
        const last = a.page + 1 >= v.totalRounds;
        const next = btn(last ? (a.book + 1 < a.books ? msg('Siguiente álbum') : msg('Terminar')) : msg('Siguiente'), 'gp-btn gp-btn-go');
        next.addEventListener('click', () => this.ctx.send({ kind: 'album_next' }));
        actions.append(next);
      }
      const again = btn(msg('Volver a la sala'), 'gp-btn');
      again.addEventListener('click', () => { this.albumCache.clear(); this.ctx.send({ kind: 'play_again' }); });
      actions.append(again);
    } else actions.append(el('p', 'gp-muted', msg('El anfitrión pasa las páginas.')));
    card.append(actions);
    queueMicrotask(() => { feed.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    return card;
  }
}
