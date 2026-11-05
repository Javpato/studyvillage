import type {KeyValueStore} from '../storage';
import { z } from 'zod';
import { sanitizeBoardAiText } from '../text/sanitize';
import { AppError } from '../errors';

export type FlashcardDifficulty = 'easy' | 'medium' | 'hard';
export type FlashcardStyle = 'concise' | 'detailed' | 'exam' | 'conceptual';
export type DeckVisibility = 'private' | 'shared_read' | 'shared_write';

export interface FlashcardItem {
  id: string;
  question: string;
  answer: string;
  hint?: string;
  explanation?: string;
  sourceRef?: string;
  choices?: string[];
  correctChoice?: number;
  topic: string;
  difficulty: FlashcardDifficulty;
  tags: string[];
}

export interface FlashcardDeck {
  id: string;
  title: string;
  topic: string;
  sourceType: 'note' | 'selection' | 'topic' | 'manual';
  sourceNoteId?: string;
  ownerId: string;
  visibility?: DeckVisibility;
  cards: FlashcardItem[];
  createdAt: number;
  updatedAt: number;
  provider: 'ollama' | 'manual' | 'local';
}

export const flashcardItemSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string().min(1).max(260),
  answer: z.string().min(1).max(400),
  hint: z.string().max(220).optional(),
  explanation: z.string().max(320).optional(),
  sourceRef: z.string().max(120).optional(),
  choices: z.array(z.string().trim().min(1).max(120)).min(2).max(4).optional(),
  correctChoice: z.number().int().min(0).max(3).optional(),
  topic: z.string().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string().min(1).max(32)).max(8),
}).refine(c => c.choices ? c.correctChoice !== undefined && c.correctChoice < c.choices.length && new Set(c.choices).size === c.choices.length : c.correctChoice === undefined, 'Opciones de concurso inválidas.');

export const flashcardDeckSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  topic: z.string().min(1).max(100),
  sourceType: z.enum(['note', 'selection', 'topic', 'manual']),
  sourceNoteId: z.string().max(96).optional(),
  ownerId: z.string().min(1).max(128),
  visibility: z.enum(['private', 'shared_read', 'shared_write']).optional(),
  cards: z.array(flashcardItemSchema).min(0).max(100),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  provider: z.enum(['ollama', 'manual', 'local']),
});


const DECKS_STORAGE_KEY = 'studyvillage-flashcard-decks-v1';
/** Storage key for one scope: '' is the village-wide library, a room scope keeps that room's own copy. */
export const scopedKey = (key: string, scope: string): string => scope ? `${key}:${scope}` : key;
export class FlashcardLibrary {
  private decks = new Map<string, FlashcardDeck>();
  private committed: FlashcardDeck[] = [];
  constructor(readonly scope = '', protected readonly storage:KeyValueStore|null=null) {
    this.seedDefaultDeck();
    const template = this.decks.get('deck:starter-studyvillage');
    this.decks.clear();
    this.loadDecksFromStorage();
    const old = this.decks.get('deck:starter-studyvillage');
    if (old && template && old.title === template.title && JSON.stringify(old.cards) === JSON.stringify(template.cards)) this.decks.delete(old.id);
    this.committed = structuredClone([...this.decks.values()]);
  }

  private seedDefaultDeck(): void {
    const now = Date.now();
    const starter: FlashcardDeck = {
      id: 'deck:starter-studyvillage',
      title: 'Mazo Manual · Fundamentos de Estudio',
      topic: 'Algoritmos y Cálculo',
      sourceType: 'manual',
      ownerId: 'local-host',
      visibility: 'shared_write',
      cards: [
        {
          id: 'card:manual-1',
          question: '¿Cuál es la complejidad temporal de la búsqueda binaria en un arreglo ordenado?',
          answer: 'O(log n), ya que divide el espacio de búsqueda a la mitad en cada comparación.',
          hint: 'Piensa en cuántas veces puedes dividir n entre 2 hasta llegar a 1.',
          explanation: 'El invariante mantiene el elemento buscado dentro del subintervalo [low, high].',
          topic: 'Algoritmos y Cálculo',
          difficulty: 'easy',
          tags: ['algoritmos', 'busqueda'],
        },
        {
          id: 'card:manual-2',
          question: '¿Qué establece el Teorema Fundamental del Cálculo?',
          answer: 'Conecta la derivación y la integración definida: ∫_a^b f(x) dx = F(b) - F(a), donde F\'(x) = f(x).',
          hint: 'Relaciona el área bajo la curva con la antiderivada en los extremos.',
          explanation: 'Permite evaluar integrales definidas sin calcular sumas de Riemann al límite.',
          topic: 'Algoritmos y Cálculo',
          difficulty: 'medium',
          tags: ['calculo', 'integrales'],
        },
      ],
      createdAt: now,
      updatedAt: now,
      provider: 'manual',
    };
    this.decks.set(starter.id, starter);
  }

  canViewDeck(deck: FlashcardDeck, userId: string, isHost = false): boolean {
    if (isHost || deck.ownerId === userId || deck.ownerId === 'local-host') return true;
    return (deck.visibility ?? 'shared_write') !== 'private';
  }

  canEditDeck(deck: FlashcardDeck, userId: string, isHost = false): boolean {
    if (isHost || deck.ownerId === userId || deck.ownerId === 'local-host') return true;
    return (deck.visibility ?? 'shared_write') === 'shared_write';
  }

  createManualDeck(
    titleOrParams:
      | string
      | {
          title: string;
          topic?: string;
          ownerId: string;
          visibility?: DeckVisibility;
          /** Reference inside this library's scope; never grants access to the source note. */
          sourceNoteId?: string;
        },
    ownerIdArg = 'local-host',
    visibilityArg: DeckVisibility = 'shared_write',
  ): FlashcardDeck {
    const params =
      typeof titleOrParams === 'string'
        ? { title: titleOrParams, ownerId: ownerIdArg, visibility: visibilityArg }
        : titleOrParams;
    const cleanTitle = sanitizeBoardAiText(params.title.trim() || 'Nuevo Mazo Manual', 110);
    const cleanTopic = sanitizeBoardAiText((params.topic || params.title).trim() || 'Estudio General', 90);
    const now = Date.now();
    const deck = flashcardDeckSchema.parse({
      id: `deck:manual:${crypto.randomUUID().slice(0, 8)}`,
      title: cleanTitle,
      topic: cleanTopic,
      sourceType: params.sourceNoteId ? 'note' : 'manual',
      ...(params.sourceNoteId ? {sourceNoteId:params.sourceNoteId} : {}),
      ownerId: params.ownerId || 'local-host',
      visibility: params.visibility ?? 'shared_write',
      cards: [],
      createdAt: now,
      updatedAt: now,
      provider: 'manual',
    });
    this.decks.set(deck.id, deck);
    this.saveDecksToStorage();
    return deck;
  }

  renameDeck(deckId: string, newTitle: string, actorId: string, isHost = false): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para renombrar este mazo.');
    }
    const cleanTitle = sanitizeBoardAiText(newTitle.trim() || deck.title, 110);
    const updated: FlashcardDeck = {
      ...deck,
      title: cleanTitle,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updated);
    this.decks.set(deckId, updated);
    this.saveDecksToStorage();
    return updated;
  }

  setDeckVisibility(deckId: string, visibility: DeckVisibility, actorId: string, isHost = false): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar los permisos de este mazo.');
    }
    const updated: FlashcardDeck = {
      ...deck,
      visibility,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updated);
    this.decks.set(deckId, updated);
    this.saveDecksToStorage();
    return updated;
  }

  addManualCard(
    deckId: string,
    input: {
      question: string;
      answer: string;
      hint?: string;
      explanation?: string;
      tags?: string[];
      difficulty?: FlashcardDifficulty;
    },
    actorId: string,
    isHost = false,
  ): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para añadir tarjetas a este mazo.');
    }
    const q = sanitizeBoardAiText(input.question.trim(), 240);
    const a = sanitizeBoardAiText(input.answer.trim(), 360);
    if (!q || !a) {
      throw new Error('La pregunta y la respuesta son obligatorias.');
    }
    const hint = input.hint?.trim() ? sanitizeBoardAiText(input.hint.trim(), 200) : undefined;
    const explanation = input.explanation?.trim() ? sanitizeBoardAiText(input.explanation.trim(), 280) : undefined;
    const tags = (input.tags ?? [])
      .map((t) => sanitizeBoardAiText(t.trim(), 28))
      .filter(Boolean)
      .slice(0, 8);
    const card: FlashcardItem = flashcardItemSchema.parse({
      id: `card:${crypto.randomUUID().slice(0, 8)}`,
      question: q,
      answer: a,
      ...(hint ? { hint } : {}),
      ...(explanation ? { explanation } : {}),
      topic: deck.topic,
      difficulty: input.difficulty ?? 'medium',
      tags: tags.length > 0 ? tags : [deck.topic.toLowerCase().split(/\s+/)[0] || 'estudio'],
    });
    const updated: FlashcardDeck = {
      ...deck,
      cards: [...deck.cards, card],
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updated);
    this.decks.set(deckId, updated);
    this.saveDecksToStorage();
    return updated;
  }

  updateCard(
    deckId: string,
    cardId: string,
    patch: {
      question?: string;
      answer?: string;
      hint?: string;
      explanation?: string;
      tags?: string[];
      difficulty?: FlashcardDifficulty;
    },
    actorId: string,
    isHost = false,
  ): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para editar tarjetas de este mazo.');
    }
    const idx = deck.cards.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error('Tarjeta no encontrada.');
    const current = deck.cards[idx];
    const nextQuestion = patch.question !== undefined ? sanitizeBoardAiText(patch.question.trim(), 240) : current.question;
    const nextAnswer = patch.answer !== undefined ? sanitizeBoardAiText(patch.answer.trim(), 360) : current.answer;
    if (!nextQuestion || !nextAnswer) {
      throw new Error('La pregunta y la respuesta no pueden quedar vacías.');
    }
    const nextHint =
      patch.hint !== undefined
        ? patch.hint.trim()
          ? sanitizeBoardAiText(patch.hint.trim(), 200)
          : undefined
        : current.hint;
    const nextExp =
      patch.explanation !== undefined
        ? patch.explanation.trim()
          ? sanitizeBoardAiText(patch.explanation.trim(), 280)
          : undefined
        : current.explanation;
    const nextTags =
      patch.tags !== undefined
        ? patch.tags.map((t) => sanitizeBoardAiText(t.trim(), 28)).filter(Boolean).slice(0, 8)
        : current.tags;

    const updatedCard: FlashcardItem = flashcardItemSchema.parse({
      ...current,
      question: nextQuestion,
      answer: nextAnswer,
      hint: nextHint,
      explanation: nextExp,
      difficulty: patch.difficulty ?? current.difficulty,
      tags: nextTags.length > 0 ? nextTags : current.tags,
    });
    const nextCards = [...deck.cards];
    nextCards[idx] = updatedCard;
    const updatedDeck: FlashcardDeck = {
      ...deck,
      cards: nextCards,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updatedDeck);
    this.decks.set(deckId, updatedDeck);
    this.saveDecksToStorage();
    return updatedDeck;
  }

  deleteCard(deckId: string, cardId: string, actorId: string, isHost = false): FlashcardDeck | null {
    const deck = this.decks.get(deckId);
    if (!deck) return null;
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para eliminar tarjetas de este mazo.');
    }
    const nextCards = deck.cards.filter((c) => c.id !== cardId);
    if (nextCards.length === deck.cards.length) return deck;
    const updatedDeck: FlashcardDeck = {
      ...deck,
      cards: nextCards,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updatedDeck);
    this.decks.set(deckId, updatedDeck);
    this.saveDecksToStorage();
    return updatedDeck;
  }

  reorderCard(
    deckId: string,
    cardId: string,
    direction: 'up' | 'down',
    actorId: string,
    isHost = false,
  ): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para reordenar tarjetas de este mazo.');
    }
    const idx = deck.cards.findIndex((c) => c.id === cardId);
    if (idx < 0) return deck;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= deck.cards.length) return deck;
    const nextCards = [...deck.cards];
    const [moved] = nextCards.splice(idx, 1);
    nextCards.splice(targetIdx, 0, moved);
    const updatedDeck: FlashcardDeck = {
      ...deck,
      cards: nextCards,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updatedDeck);
    this.decks.set(deckId, updatedDeck);
    this.saveDecksToStorage();
    return updatedDeck;
  }

  saveDeck(deck: FlashcardDeck): FlashcardDeck {
    const validated = flashcardDeckSchema.parse(deck);
    this.decks.set(validated.id, validated);
    this.saveDecksToStorage();
    return validated;
  }

  listDecks(viewerId?: string, isHost = true): FlashcardDeck[] {
    return Array.from(this.decks.values())
      .filter((d) => !viewerId || this.canViewDeck(d, viewerId, isHost))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Backlinks are derived, so deleting a deck never leaves a second stale index. */
  listDecksForNote(noteId:string,viewerId:string):FlashcardDeck[]{
    return this.listDecks(viewerId,false).filter(deck=>deck.sourceNoteId===noteId);
  }

  getDeck(deckId: string): FlashcardDeck | null {
    return this.decks.get(deckId) ?? null;
  }

  deleteDeck(deckId: string, actorId = 'local-host', isHost = true): boolean {
    const deck = this.decks.get(deckId);
    if (!deck || !this.canEditDeck(deck, actorId, isHost)) return false;
    const deleted = this.decks.delete(deckId);
    if (deleted) this.saveDecksToStorage();
    return deleted;
  }

  private saveDecksToStorage(): void {
    try {
      if (!this.storage) return;
      this.storage?.setItem(scopedKey(DECKS_STORAGE_KEY, this.scope), JSON.stringify(Array.from(this.decks.values())));
      this.committed = structuredClone([...this.decks.values()]);
    } catch {
      this.decks = new Map(this.committed.map(deck => [deck.id, structuredClone(deck)]));
      throw new AppError('storage');
    }
  }

  private loadDecksFromStorage(): void {
    try {
      if (!this.storage) return;
      const raw = this.storage?.getItem(scopedKey(DECKS_STORAGE_KEY, this.scope));
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const valid = flashcardDeckSchema.safeParse(item);
          if (valid.success) this.decks.set(valid.data.id, valid.data);
        }
      }
    } catch {
      // Keep default deck
    }
  }
}

export const quizQuestionSchema = z.object({
  id: z.string().min(1).max(80), text: z.string().trim().min(1).max(260),
  choices: z.array(z.string().trim().min(1).max(120)).min(2).max(4),
  correctChoice: z.number().int().min(0).max(3), explanation: z.string().max(400).optional(),
}).refine(q => q.correctChoice < q.choices.length && new Set(q.choices).size === q.choices.length);
export const quizDefinitionSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().trim().min(1).max(110),
  questions: z.array(quizQuestionSchema).max(100), updatedAt: z.number().nonnegative(),
  sourceDeckId: z.string().optional(),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizDefinition = z.infer<typeof quizDefinitionSchema>;
const QUIZZES_KEY = 'studyvillage-quizzes-v1';
export class StudyLibrary extends FlashcardLibrary {
  private quizzes = new Map<string, QuizDefinition>();
  private migrated = new Set<string>();
  loadError: string | null = null;
  constructor(scope = '', storage:KeyValueStore|null=null) {
    super(scope,storage);
    try {
      const raw = !this.storage ? null : this.storage?.getItem(scopedKey(QUIZZES_KEY, this.scope));
      if (raw) {
        const data = z.object({ version: z.literal(1), quizzes: z.array(quizDefinitionSchema), migrated: z.array(z.string()) }).parse(JSON.parse(raw));
        for (const quiz of data.quizzes) this.quizzes.set(quiz.id, quiz);
        this.migrated = new Set(data.migrated);
      }
      const legacy = this.listDecks().filter(deck => !this.migrated.has(deck.id) && deck.cards.some(c => c.choices));
      if (legacy.length) {
        const next = new Map(this.quizzes); const migrated = new Set(this.migrated);
        for (const deck of legacy) {
          const quiz = quizDefinitionSchema.parse({ id: `quiz:${deck.id}`, title: deck.title, updatedAt: deck.updatedAt, sourceDeckId: deck.id,
            questions: deck.cards.filter(c => c.choices && c.correctChoice !== undefined).map(c => ({ id: c.id, text: c.question, choices: c.choices, correctChoice: c.correctChoice, explanation: c.explanation })) });
          next.set(quiz.id, quiz); migrated.add(deck.id);
        }
        this.persistQuizzes(next, migrated);
        this.quizzes = next; this.migrated = migrated;
      }
    } catch { this.loadError = 'No se pudo abrir o migrar la biblioteca de quizzes. Tus datos originales se conservan; revisa el almacenamiento antes de volver a intentarlo.'; }
  }
  listQuizzes(): QuizDefinition[] { return [...this.quizzes.values()].map(q => structuredClone(q)).sort((a,b) => b.updatedAt-a.updatedAt); }
  getQuiz(id: string): QuizDefinition | null { const quiz = this.quizzes.get(id); return quiz ? structuredClone(quiz) : null; }
  saveQuiz(raw: QuizDefinition): QuizDefinition {
    if (this.loadError) throw new AppError('storage', this.loadError);
    const quiz = quizDefinitionSchema.parse(raw); const next = new Map(this.quizzes); next.set(quiz.id, quiz);
    this.persistQuizzes(next, this.migrated); this.quizzes = next; return structuredClone(quiz);
  }
  deleteQuiz(id: string): void {
    if (this.loadError) throw new AppError('storage', this.loadError);
    const next = new Map(this.quizzes); next.delete(id); this.persistQuizzes(next, this.migrated); this.quizzes = next;
  }
  private persistQuizzes(quizzes: Map<string,QuizDefinition>, migrated: Set<string>): void {
    try { if (this.storage) this.storage?.setItem(scopedKey(QUIZZES_KEY, this.scope), JSON.stringify({ version: 1, quizzes: [...quizzes.values()], migrated: [...migrated] })); }
    catch { throw new AppError('storage'); }
  }
}
