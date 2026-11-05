import { pick, secureRandomInt, shuffle, type RoomEngine } from './room';

/**
 * Telephone with drawings, the way Gartic Phone plays it.
 *
 * Everyone writes a sentence. Each book then travels around the table: the
 * next person draws the sentence, the next one describes the drawing, and so
 * on, every person seeing only the step right before theirs. At the end the
 * books are opened one page at a time for everybody.
 *
 * Seats are shuffled at the start, so who receives whose book changes every
 * game. Book `b` is in the hands of seat `(b + round) % n` during `round`.
 */

export type GarticPhase = 'lobby' | 'write' | 'draw' | 'guess' | 'album' | 'end';
export type GarticStepKind = 'write' | 'draw' | 'guess';

/** A stroke as color, width and a flat list of x,y pairs on a 640×400 page. */
export interface DrawStroke { c: string; w: number; p: number[] }
export interface Drawing { strokes: DrawStroke[] }

export const CANVAS_W = 640;
export const CANVAS_H = 400;
export const MAX_DRAWING_POINTS = 4_000;
export const MAX_DRAWING_CHARS = 40_000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const DURATIONS = { write: 45_000, draw: 100_000, guess: 45_000 } as const;
/** Late drawings keep arriving for a moment after the clock hits zero. */
const GRACE_MS = 2_500;

const BOT_NAMES = ['Lupe', 'Bruno', 'Iris', 'Tomás', 'Nora', 'Gael', 'Vera', 'Olmo'];
const BOT_COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#20c997', '#ff922b', '#748ffc'];

export interface GarticPlayer { id: string; name: string; color: string; bot: boolean }

export interface GarticPage {
  kind: GarticStepKind;
  authorId: string;
  text?: string;
  drawing?: Drawing;
}

export type GarticAction =
  | { kind: 'join'; name: string; color: string }
  | { kind: 'leave' }
  | { kind: 'add_bot' }
  | { kind: 'remove_bot'; id: string }
  | { kind: 'start' }
  | { kind: 'submit'; text?: string; drawing?: Drawing }
  | { kind: 'unsubmit' }
  | { kind: 'album_next' }
  | { kind: 'play_again' };

export interface GarticView {
  phase: GarticPhase;
  round: number;
  totalRounds: number;
  remainingMs: number;
  leaderId: string | null;
  aiBotsReady: boolean;
  me: { id: string; seated: boolean; isLeader: boolean; done: boolean };
  players: (GarticPlayer & { done: boolean })[];
  /** What the viewer must work from this round: the sentence to draw or the drawing to describe. */
  task: { kind: GarticStepKind; previous: { kind: GarticStepKind; text?: string; drawing?: Drawing } | null } | null;
  /** The viewer's own submission this round, so editing resumes where they left it. */
  mine: { text?: string; drawing?: Drawing } | null;
  /**
   * The open book. Earlier drawings are sent once, when their page is turned,
   * so `pages` carries a drawing only for the newest page and clients keep the rest.
   */
  album: {
    gameId: string;
    book: number;
    books: number;
    page: number;
    owner: GarticPlayer;
    pages: { kind: GarticStepKind; author: GarticPlayer; text?: string; drawing?: Drawing; key: string }[];
  } | null;
}

export class GarticGame implements RoomEngine<GarticAction, GarticView> {
  phase: GarticPhase = 'lobby';
  players: GarticPlayer[] = [];
  private seats: GarticPlayer[] = [];
  private leaderId: string | null = null;
  private round = 0;
  private totalRounds = 0;
  private deadline = 0;
  private books: (GarticPage | undefined)[][] = [];
  private botAt = new Map<string, number>();
  private albumBook = 0;
  private albumPage = 0;
  private gameId = '';
  private aiBotsEnabled = false;

  constructor(private readonly random: (max: number) => number = secureRandomInt, private readonly authorityId: string | null = null) {}

  cancel(): void {
    this.phase = 'lobby'; this.round = 0; this.deadline = 0; this.books = []; this.seats = []; this.botAt.clear(); this.gameId = crypto.randomUUID();
  }

  setAiBotsEnabled(enabled: boolean): void {
    this.aiBotsEnabled = enabled;
    if (!enabled && this.phase === 'lobby') this.players = this.players.filter(p => !p.bot);
  }
  botJobs(now: number): { key: string; id: string; task: NonNullable<GarticView['task']> }[] {
    if (!this.aiBotsEnabled || !this.isPlaying()) return [];
    return this.seats.filter(p => p.bot && !this.pageOf(p.id)).map(p => ({ key: `${this.gameId}:${this.round}`, id: p.id, task: this.viewFor(p.id, now).task! }));
  }
  submitBot(key: string, id: string, entry: { text?: string; drawing?: Drawing }, now: number): boolean {
    if (!this.aiBotsEnabled || !this.isPlaying() || key !== `${this.gameId}:${this.round}` || !this.seats.some(p => p.id === id && p.bot) || this.pageOf(id)) return false;
    this.apply(id, { kind: 'submit', ...entry }, now); return true;
  }

  audience(): string[] { return this.players.filter((p) => !p.bot).map((p) => p.id); }

  apply(actorId: string, action: GarticAction, now: number): void {
    const actor = this.players.find((p) => p.id === actorId);
    switch (action.kind) {
      case 'join':
        if (actor) return;
        if (this.phase !== 'lobby') throw new Error('La partida ya empezó. Espera a la siguiente.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La sala está llena.');
        this.players.push({ id: actorId, name: cleanName(action.name), color: cleanColor(action.color), bot: false });
        this.leaderId ??= actorId;
        return;
      case 'leave':
        if (!actor) return;
        if (this.phase === 'lobby') this.players = this.players.filter((p) => p.id !== actorId);
        if (this.leaderId === actorId) this.leaderId = this.players.find((p) => !p.bot && p.id !== actorId)?.id ?? null;
        if (!this.leaderId) this.resetAll();
        return;
      case 'add_bot': {
        this.requireLeader(actorId);
        if (!this.aiBotsEnabled) throw new Error('Activa un modelo Ollama compatible en opciones avanzadas.');
        if (this.phase !== 'lobby') return;
        if (this.players.length >= MAX_PLAYERS) throw new Error('La sala está llena.');
        const used = new Set(this.players.map((p) => p.name));
        const name = pick(BOT_NAMES.filter((n) => !used.has(n)), this.random) ?? 'Bot';
        this.players.push({ id: `bot:${this.random(1_000_000_000)}`, name, color: pick(BOT_COLORS, this.random)!, bot: true });
        return;
      }
      case 'remove_bot':
        this.requireLeader(actorId);
        if (this.phase === 'lobby') this.players = this.players.filter((p) => !(p.bot && p.id === action.id));
        return;
      case 'start': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        if (this.players.length < MIN_PLAYERS) throw new Error('Hacen falta al menos 2 jugadores.');
        if (this.players.some(p => p.bot) && !this.aiBotsEnabled) throw new Error('Los bots necesitan Ollama compatible.');
        this.seats = shuffle(this.players, this.random);
        const n = this.seats.length;
        // Every book visits every seat once, and a game is never shorter than write, draw, guess, draw.
        this.totalRounds = Math.max(n, 4);
        this.books = this.seats.map(() => []);
        this.round = 0;
        this.gameId = crypto.randomUUID();
        this.startRound(now);
        return;
      }
      case 'submit': {
        if (!actor || !this.isPlaying()) throw new Error('No hay ninguna ronda en curso.');
        this.submit(actor, action, now);
        return;
      }
      case 'unsubmit': {
        if (!actor || !this.isPlaying()) return;
        const book = this.bookOf(actor.id);
        if (book >= 0) this.books[book][this.round] = undefined;
        return;
      }
      case 'album_next':
        this.requireLeader(actorId);
        if (this.phase !== 'album') return;
        if (this.albumPage + 1 < this.totalRounds) this.albumPage += 1;
        else if (this.albumBook + 1 < this.books.length) { this.albumBook += 1; this.albumPage = 0; }
        else this.phase = 'end';
        return;
      case 'play_again':
        this.requireLeader(actorId);
        if (this.phase !== 'end' && this.phase !== 'album') return;
        this.phase = 'lobby';
        this.books = [];
        return;
    }
  }

  tick(now: number): boolean {
    if (!this.isPlaying()) return false;
    let changed = false;
    if (now >= this.deadline + GRACE_MS) {
      for (const seat of this.seats) if (!this.pageOf(seat.id)) this.submit(seat, this.fallbackEntry(), now, true);
      this.advance(now);
      changed = true;
    }
    return changed;
  }

  viewFor(viewerId: string, now: number): GarticView {
    const me = this.players.find((p) => p.id === viewerId);
    const playing = this.isPlaying();
    const book = playing ? this.bookOf(viewerId) : -1;
    const previous = book >= 0 && this.round > 0 ? this.books[book][this.round - 1] : undefined;
    const mine = book >= 0 ? this.books[book][this.round] : undefined;
    const roster = playing || this.phase === 'album' || this.phase === 'end' ? this.seats : this.players;
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      remainingMs: playing ? Math.max(0, this.deadline - now) : 0,
      leaderId: this.leaderId,
      aiBotsReady: this.aiBotsEnabled,
      me: { id: viewerId, seated: !!me, isLeader: this.leaderId === viewerId || this.authorityId === viewerId, done: !!mine },
      players: roster.map((p) => ({ ...p, done: playing && !!this.pageOf(p.id) })),
      task: book >= 0 ? {
        kind: this.kindOf(this.round),
        previous: previous ? { kind: previous.kind, text: previous.text, drawing: previous.drawing } : null,
      } : null,
      mine: mine ? { text: mine.text, drawing: mine.drawing } : null,
      album: this.phase === 'album' || this.phase === 'end' ? this.albumView() : null,
    };
  }

  private albumView(): GarticView['album'] {
    const book = Math.min(this.albumBook, this.books.length - 1);
    if (book < 0) return null;
    const page = this.phase === 'end' ? this.totalRounds - 1 : this.albumPage;
    const pages = this.books[book].slice(0, page + 1).map((entry, i) => ({
      kind: entry!.kind,
      author: this.player(entry!.authorId),
      text: entry!.text,
      // Only the newest page carries its drawing; earlier ones were sent already.
      drawing: i === page ? entry!.drawing : undefined,
      key: `${this.gameId}:${book}:${i}`,
    }));
    return { gameId: this.gameId, book, books: this.books.length, page, owner: this.seats[book], pages };
  }

  private submit(actor: GarticPlayer, entry: { text?: string; drawing?: Drawing }, now: number, forced = false): void {
    const book = this.bookOf(actor.id);
    if (book < 0) throw new Error('No participas en esta partida.');
    const kind = this.kindOf(this.round);
    const page: GarticPage = { kind, authorId: actor.id };
    if (kind === 'draw') page.drawing = cleanDrawing(entry.drawing);
    else {
      const text = String(entry.text ?? '').trim().slice(0, 120);
      if (!text && !forced) throw new Error(kind === 'write' ? 'Escribe una frase antes de terminar.' : 'Escribe qué crees que es el dibujo.');
      page.text = text || '…';
    }
    this.books[book][this.round] = page;
    if (!forced && this.seats.every((s) => this.pageOf(s.id))) this.advance(now);
  }

  private advance(now: number): void {
    if (this.round + 1 >= this.totalRounds) {
      this.phase = 'album';
      this.albumBook = 0;
      this.albumPage = 0;
      return;
    }
    this.round += 1;
    this.startRound(now);
  }

  private startRound(now: number): void {
    this.phase = this.kindOf(this.round);
    this.deadline = now + DURATIONS[this.phase as GarticStepKind];
    this.botAt.clear();
    const [min, max] = this.phase === 'draw' ? [5_000, 12_000] : [2_500, 7_000];
    for (const seat of this.seats) if (seat.bot) this.botAt.set(seat.id, now + min + this.random(max - min));
  }

  private kindOf(round: number): GarticStepKind { return round === 0 ? 'write' : round % 2 === 1 ? 'draw' : 'guess'; }
  private isPlaying(): boolean { return this.phase === 'write' || this.phase === 'draw' || this.phase === 'guess'; }
  private seatIndex(id: string): number { return this.seats.findIndex((s) => s.id === id); }

  /** The book a seat holds this round. */
  private bookOf(id: string): number {
    const seat = this.seatIndex(id);
    if (seat < 0) return -1;
    const n = this.seats.length;
    return ((seat - this.round) % n + n) % n;
  }

  private pageOf(id: string): GarticPage | undefined {
    const book = this.bookOf(id);
    return book >= 0 ? this.books[book][this.round] : undefined;
  }

  private player(id: string): GarticPlayer {
    return this.seats.find((s) => s.id === id) ?? { id, name: 'Alguien', color: '#868e96', bot: false };
  }

  private fallbackEntry(): { text?: string; drawing?: Drawing } {
    return this.kindOf(this.round) === 'draw' ? { drawing: { strokes: [] } } : { text: '' };
  }

  private resetAll(): void {
    this.players = [];
    this.seats = [];
    this.books = [];
    this.phase = 'lobby';
    this.leaderId = null;
  }

  private requireLeader(actorId: string): void {
    if (actorId !== this.leaderId && actorId !== this.authorityId) throw new Error('Solo quien creó la sala puede hacer eso.');
  }
}

/** Keeps a drawing within the page, the color format and the size limits. */
export function cleanDrawing(raw: Drawing | undefined): Drawing {
  const strokes: DrawStroke[] = [];
  let points = 0;
  for (const s of Array.isArray(raw?.strokes) ? raw!.strokes.slice(0, 600) : []) {
    if (!s || !Array.isArray(s.p)) continue;
    const c = /^#[0-9a-fA-F]{6}$/.test(String(s.c)) ? s.c : '#000000';
    const w = Math.max(1, Math.min(48, Math.round(Number(s.w) || 4)));
    const room = (MAX_DRAWING_POINTS - points) * 2;
    if (room <= 0) break;
    const p: number[] = [];
    for (let i = 0; i + 1 < s.p.length && p.length < room; i += 2) {
      const x = Math.round(Number(s.p[i])); const y = Math.round(Number(s.p[i + 1]));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      p.push(Math.max(0, Math.min(CANVAS_W, x)), Math.max(0, Math.min(CANVAS_H, y)));
    }
    if (p.length < 2) continue;
    points += p.length / 2;
    strokes.push({ c, w, p });
  }
  const drawing = { strokes };
  while (JSON.stringify(drawing).length > MAX_DRAWING_CHARS && drawing.strokes.length) drawing.strokes.pop();
  return drawing;
}

function cleanName(name: string): string { return String(name ?? '').trim().slice(0, 24) || 'Vecino'; }
function cleanColor(color: string): string { return /^#[0-9a-fA-F]{6}$/.test(String(color)) ? color : '#4dabf7'; }
