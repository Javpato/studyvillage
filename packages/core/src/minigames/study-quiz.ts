import {z} from 'zod';
import {shuffle,secureRandomInt} from './room';
import { quizDefinitionSchema, type QuizDefinition } from '../study/library';
import { flashcardDeckSchema, type FlashcardDeck } from '../study/library';
import type { RoomEngine } from './room';
export const quizSettingsSchema=z.strictObject({shuffleQuestions:z.boolean().default(false),shuffleChoices:z.boolean().default(false),scoring:z.enum(['speed','accuracy','none']).default('speed'),streakBonus:z.boolean().default(false),showLeaderboard:z.boolean().default(true)});
export type QuizSettings=z.infer<typeof quizSettingsSchema>;
export type QuizAction = { kind: 'leave' } | { kind: 'join'; name: string } | { kind: 'start'; seconds: number; settings?:Partial<QuizSettings> } | { kind: 'answer'; questionId: string; choice: number } | { kind: 'next' };
export interface QuizView {
  phase: 'lobby' | 'question' | 'results' | 'end'; title: string; count: number; index: number;
  question: { id: string; text: string; choices: string[] } | null; remainingMs: number; timed: boolean;
  explanation: string | null; solution: number | null; players: { id: string; name: string; score: number; answered: boolean }[];
  meAnswered: boolean; stopped: boolean; settings:QuizSettings;
}
export class StudyQuiz implements RoomEngine<QuizAction, QuizView> {
  private settings:QuizSettings=quizSettingsSchema.parse({});
  private streaks=new Map<string,number>();
  private deck: FlashcardDeck | null = null;
  private cards: FlashcardDeck['cards'] = [];
  private players = new Map<string, { id: string; name: string; score: number; answered: boolean }>();
  private phase: QuizView['phase'] = 'lobby';
  private index = 0; private started = 0; private seconds = 20; private game = ''; private stopped = false;
  /** The host may be fixed (peer host, solo play) or the current organiser (server mode). */
  constructor(private readonly host: string | (() => string),private readonly random:(max:number)=>number=secureRandomInt) {}
  private get hostId(): string { return typeof this.host === 'function' ? this.host() : this.host; }
  audience(): string[] { return [...this.players.keys()]; }
  setQuiz(raw: QuizDefinition): void {
    const quiz = quizDefinitionSchema.parse(raw);
    this.setDeck({ id: quiz.id, title: quiz.title, topic: 'Estudio', sourceType: 'manual', ownerId: this.hostId, createdAt: quiz.updatedAt, updatedAt: quiz.updatedAt, provider: 'manual', cards: quiz.questions.map(q => ({ id: q.id, question: q.text, answer: q.choices[q.correctChoice], choices: q.choices, correctChoice: q.correctChoice, explanation: q.explanation, topic: 'Estudio', difficulty: 'medium', tags: [] })) });
  }
  setDeck(raw: FlashcardDeck): void {
    if (this.phase === 'question') throw new Error('Termina primero la partida.');
    this.deck = flashcardDeckSchema.parse(raw);
    this.cards = this.deck.cards.filter(c => c.choices && c.correctChoice !== undefined);
    this.phase = 'lobby'; this.index = 0;
  }
  prune(present: ReadonlySet<string>): boolean {
    let changed = false;
    for (const id of this.players.keys()) if (!present.has(id)) { this.players.delete(id); changed = true; }
    if (changed && this.phase === 'question' && [...this.players.values()].every(p=>p.answered)) this.phase = 'results';
    return changed;
  }
  cancel(): void { this.phase = 'lobby'; this.index = 0; this.game = crypto.randomUUID(); this.stopped = true; for (const p of this.players.values()) { p.score = 0; p.answered = false; } }
  apply(actor: string, action: QuizAction, now: number): void {
    if (action.kind === 'leave') { this.players.delete(actor); if (this.phase === 'question' && [...this.players.values()].every(p => p.answered)) this.phase = 'results'; return; }
    if (action.kind === 'join') {
      if (!this.players.has(actor)) this.players.set(actor, { id: actor, name: String(action.name).trim().slice(0, 32) || 'Vecino', score: 0, answered: this.phase === 'question' });
      return;
    }
    if (action.kind === 'start') {
      if (actor !== this.hostId || this.phase === 'question') throw new Error('Solo el anfitrión puede comenzar.');
      if (!this.cards.length) throw new Error('Añade al menos una pregunta al quiz antes de jugar.');
      if (!this.players.size) throw new Error('Espera a que entre al menos un participante.');
      if (![0, 5, 10, 20, 30, 60, 90, 120].includes(action.seconds)) throw new Error('Tiempo inválido.');
      this.settings=quizSettingsSchema.parse(action.settings??{});this.streaks.clear();
      this.cards=structuredClone(this.deck!.cards.filter(c=>c.choices&&c.correctChoice!==undefined));
      if(this.settings.shuffleQuestions)this.cards=shuffle(this.cards,this.random);
      if(this.settings.shuffleChoices)this.cards=this.cards.map(card=>{const order=shuffle(card.choices!.map((_,i)=>i),this.random);return {...card,choices:order.map(i=>card.choices![i]),correctChoice:order.indexOf(card.correctChoice!)};});
      this.seconds = action.seconds; this.index = 0; this.game = crypto.randomUUID(); this.stopped = false;
      for (const p of this.players.values()) p.score = 0;
      this.begin(now); return;
    }
    if (action.kind === 'answer') {
      const p = this.players.get(actor); const card = this.cards[this.index];
      if (!p || p.answered || this.phase !== 'question' || action.questionId !== this.questionId() || (this.seconds && now >= this.started + this.seconds * 1000)) return;
      if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice >= card.choices!.length) throw new Error('Respuesta inválida.');
      p.answered = true;
      const correct=action.choice===card.correctChoice,streak=correct?(this.streaks.get(actor)||0)+1:0;this.streaks.set(actor,streak);
      if(correct&&this.settings.scoring!=='none'){
        const base=this.settings.scoring==='speed'&&this.seconds?Math.round(500+500*Math.max(0,1-Math.max(0,now-this.started)/(this.seconds*1000))):1000;
        p.score+=base+(this.settings.streakBonus?Math.min(500,Math.max(0,streak-1)*100):0);
      }
      if ([...this.players.values()].every(p => p.answered)) this.phase = 'results';
      return;
    }
    if (action.kind === 'next') {
      if (actor !== this.hostId || this.phase !== 'results') throw new Error('Espera al anfitrión.');
      if (++this.index >= this.cards.length) this.phase = 'end'; else this.begin(now);
    }
  }
  tick(now: number): boolean {
    if (this.phase === 'question' && this.seconds > 0 && now >= this.started + this.seconds * 1000) { this.phase = 'results'; return true; }
    return false;
  }
  viewFor(actor: string, now: number): QuizView {
    const card = this.cards[this.index]; const visible = !!card && (this.phase === 'question' || this.phase === 'results');
    return { settings:{...this.settings}, phase: this.phase, title: this.deck?.title ?? '', count: this.cards.length, index: this.index,
      question: visible ? { id: this.questionId(), text: card.question, choices: [...card.choices!] } : null,
      explanation: this.phase === 'results' ? card.explanation || null : null,
      solution: this.phase === 'results' ? card.correctChoice! : null,
      remainingMs: this.phase === 'question' && this.seconds ? Math.max(0, this.started + this.seconds * 1000 - now) : 0,
      timed: this.seconds > 0, meAnswered: this.players.get(actor)?.answered ?? false, stopped: this.stopped,
      players: [...this.players.values()].map(p => ({ ...p })).sort((a,b) => b.score-a.score),
    };
  }
  private questionId(): string { return `${this.game}:${this.index}`; }
  private begin(now: number): void { this.phase = 'question'; this.started = now; for (const p of this.players.values()) p.answered = false; }
}
