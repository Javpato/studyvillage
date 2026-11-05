import { describe, expect, it } from 'vitest';
import { WORLD_AREAS, closestPortal, DEFAULT_AREA_OBJECTS } from '../src/world/areas';
import {
  InteractiveObjectRegistry,
  isValidCustomSpriteDataUrl,
  sanitizeObjectDisplayName,
} from '../src/world/interactive-objects';
import { EnvironmentController, getLightingProfile, progressToTimeOfDay } from '../src/world/environment';
import { WhiteboardRegistry, houseBoardId } from '../../packages/core/src/whiteboard/boards-registry';
import {
  SecureNotesStore,
  escapeHtmlStrict,
  renderSafeMarkdownWithLatex,
  sanitizeSafeHref,
} from '../../packages/core/src/notes/secure-notes';
import {
  HostOllamaGateway,
  MultiplayerStudySession,
  OLLAMA_NOT_DETECTED_MESSAGE,
  isLoopbackOllamaUrl,
} from '../../packages/runtime/src/ai/ollama-gateway';
import { makeStroke } from '../../packages/core/src/whiteboard/model';

describe('Part 2 & 3 — World Areas & Extensible Interactive Object System', () => {
  it('defines distinct Residential, Community Plaza, and Study Library areas with portals', () => {
    expect(WORLD_AREAS.residential.id).toBe('residential');
    expect(WORLD_AREAS.community.id).toBe('community');
    expect(WORLD_AREAS.study.id).toBe('study');

    // Residential north portal leads to Community Plaza
    const nearEastPortal = closestPortal('residential', { x: 240, y: 60, direction: 'up', moving: false });
    expect(nearEastPortal?.toArea).toBe('community');

    // Residential south portal leads to Study Library
    const nearWestPortal = closestPortal('residential', { x: 240, y: 392, direction: 'down', moving: false });
    expect(nearWestPortal?.toArea).toBe('study');

    // Community south portal returns to Residential Village
    const backFromCommunity = closestPortal('community', { x: 384, y: 395, direction: 'down', moving: false });
    expect(backFromCommunity?.toArea).toBe('residential');
  });

  it('validates custom sprites, object renaming, and view/use/configure permissions', () => {
    const registry = new InteractiveObjectRegistry(DEFAULT_AREA_OBJECTS);
    const communityObjs = registry.listByArea('community', 'alice');
    expect(communityObjs.length).toBeGreaterThanOrEqual(5);

    // Valid PNG data URL accepted
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect(isValidCustomSpriteDataUrl(validPng)).toBe(true);

    // Rejects SVG, HTML, external http, or oversized payloads
    expect(isValidCustomSpriteDataUrl('data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+')).toBe(false);
    expect(isValidCustomSpriteDataUrl('https://evil.example.com/sprite.png')).toBe(false);
    expect(isValidCustomSpriteDataUrl('javascript:alert(1)')).toBe(false);

    // Renaming and custom sprite update enforced by permissions
    const campfire = registry.get('community:campfire-werewolves')!;
    expect(registry.canView(campfire, 'visitor-1')).toBe(true);
    expect(registry.canUse(campfire, 'visitor-1', false)).toBe(true);
    // Visitor cannot configure a host-only object
    expect(registry.canConfigure(campfire, 'visitor-1', false)).toBe(false);
    expect(registry.canConfigure(campfire, 'visitor-1', true)).toBe(true);

    expect(() => registry.renameObject('community:campfire-werewolves', 'Hack', 'visitor-1', false)).toThrow();

    const allowedRename = registry.renameObject('community:campfire-werewolves', '  Hoguera de Invierno  ', 'host-1', true);
    expect(allowedRename.displayName).toBe('Hoguera de Invierno');
    expect(registry.get('community:campfire-werewolves')?.displayName).toBe('Hoguera de Invierno');
    expect(sanitizeObjectDisplayName('   ')).toBe('Objeto');
  });
});

describe('Part 4 — Independent Multi-Whiteboards & Rich Shapes', () => {
  it('maintains separate state per boardId, redo stack, and rich shapes (circle, arrow)', () => {
    const reg = new WhiteboardRegistry();
    expect(reg.getMetadata('board:community-plaza').displayName).toContain('Plaza');
    expect(reg.getMetadata('board:study-library').displayName).toContain('Seminario');

    // Add circle to community board and arrow to study board
    const circleEl = reg.addRichElement(
      'board:community-plaza',
      'alice',
      'Alice',
      'circle',
      '#2e6f5e',
      4,
      [{ x: 100, y: 120 }, { x: 180, y: 200 }],
    );
    expect(circleEl.kind).toBe('circle');

    const arrowEl = reg.addRichElement(
      'board:study-library',
      'bob',
      'Bob',
      'arrow',
      '#b84a39',
      4,
      [{ x: 40, y: 50 }, { x: 160, y: 110 }],
    );
    expect(arrowEl.kind).toBe('arrow');

    // Boards are isolated from each other
    expect(reg.getRichElements('board:community-plaza').some((e) => e.id === circleEl.id)).toBe(true);
    expect(reg.getRichElements('board:study-library').some((e) => e.id === circleEl.id)).toBe(false);
    expect(reg.getRichElements('board:study-library').some((e) => e.id === arrowEl.id)).toBe(true);

    // Move & resize rich element
    const moved = reg.moveRichElement('board:community-plaza', circleEl.id, 25, 15, 'alice', false);
    expect(moved?.points[0].x).toBe(125);
    const resized = reg.resizeRichElement('board:community-plaza', circleEl.id, { x: 240, y: 240 }, 'alice', false);
    expect(resized?.points[1].x).toBe(240);

    // Redo stack per board and author
    const stroke = makeStroke('board:community-plaza', 'alice', 1, 'pen', '#241c17', 2, [{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    reg.pushRedoStroke('board:community-plaza', 'alice', stroke);
    expect(reg.hasRedoStroke('board:community-plaza', 'alice')).toBe(true);
    expect(reg.hasRedoStroke('board:study-library', 'alice')).toBe(false);
    const popped = reg.popRedoStroke('board:community-plaza', 'alice');
    expect(popped?.id).toBe(stroke.id);
    expect(reg.hasRedoStroke('board:community-plaza', 'alice')).toBe(false);

    // Every house whiteboard (even two boards in the same house) has its own independent ID, strokes, name, sprite, and permissions
    const houseBoardA = houseBoardId('own', 'board');
    const houseBoardB = houseBoardId('own', 'board-second');
    expect(houseBoardA).not.toBe(houseBoardB);
    reg.ensureBoard(houseBoardA, 'Pizarra Principal', 'house', 'alice');
    reg.ensureBoard(houseBoardB, 'Pizarra de Física', 'house', 'alice');
    reg.renameBoard(houseBoardB, 'Pizarra de Física Cuántica', 'alice', true);
    const strokeA = makeStroke(houseBoardA, 'alice', 1, 'pen', '#1f5f4a', 4, [{ x: 30, y: 30 }, { x: 80, y: 80 }]);
    reg.saveStroke(houseBoardA, strokeA);
    expect(reg.getStrokes(houseBoardA)).toHaveLength(1);
    expect(reg.getStrokes(houseBoardB)).toHaveLength(0);
    expect(reg.getMetadata(houseBoardA).displayName).toBe('Pizarra Principal');
    expect(reg.getMetadata(houseBoardB).displayName).toBe('Pizarra de Física Cuántica');
  });
});

describe('Part 7 — Environmental Events & Atmosphere', () => {
  it('maps Day/Night progress to lighting profiles and updates weather cleanly', () => {
    expect(progressToTimeOfDay(0.1)).toBe('morning');
    expect(progressToTimeOfDay(0.35)).toBe('afternoon');
    expect(progressToTimeOfDay(0.6)).toBe('sunset');
    expect(progressToTimeOfDay(0.85)).toBe('night');

    const nightProfile = getLightingProfile('night', 'clear');
    expect(nightProfile.lampIntensity).toBeGreaterThan(0.7);

    const env = new EnvironmentController();
    // Default is manual afternoon clear so reduced-motion idle canvas stays static
    expect(env.getState().timeOfDay).toBe('afternoon');
    expect(env.getState().weather).toBe('clear');
    expect(env.getState().cycleMode).toBe('manual');

    env.update({ weather: 'light_rain', timeOfDay: 'night' });
    expect(env.getState().weather).toBe('light_rain');
    expect(env.getState().timeOfDay).toBe('night');
  });
});

describe('Part 9 — Secure Notes System (Strict Non-Executable Guarantee)', () => {
  it('neutralizes XSS payloads (<script>, onerror, javascript: links) while rendering Markdown & LaTeX', () => {
    const malicious = [
      '# Apuntes <script>window.__xss = true;</script>',
      'Texto con <img src=x onerror="alert(1)"> y [enlace](javascript:alert(2))',
      'Enlace seguro: [Docs](https://developer.mozilla.org)',
      'Fórmula inline: $\\alpha + \\beta = \\gamma$',
    ].join('\n');

    const html = renderSafeMarkdownWithLatex(malicious);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://developer.mozilla.org"');
    expect(html).toContain('data-latex="\\alpha + \\beta = \\gamma"');

    expect(sanitizeSafeHref('javascript:evil()')).toBeNull();
    expect(sanitizeSafeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(escapeHtmlStrict('<b>"hola"</b>')).toBe('&lt;b&gt;&quot;hola&quot;&lt;/b&gt;');

    const store = new SecureNotesStore('alice');
    const created = store.createNote({
      title: 'Nota privada de Alice',
      content: 'Secreto',
      ownerId: 'alice',
      visibility: 'private',
    });
    expect(created.title).toBe('Nota privada de Alice');
    // Bob cannot view Alice's private note
    expect(store.listNotes('bob').some((n) => n.id === created.id)).toBe(false);
    // Alice can view her own private note
    expect(store.listNotes('alice').some((n) => n.id === created.id)).toBe(true);
  });
});

describe('Part 10 — Honest Local Ollama Gateway & Manual Flashcards', () => {
  it('shows "Ollama was not detected." with zero fake models when offline, and supports full manual flashcard CRUD', async () => {
    expect(isLoopbackOllamaUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackOllamaUrl('http://localhost:11434')).toBe(true);
    expect(isLoopbackOllamaUrl('http://192.168.1.50:11434')).toBe(false);
    expect(isLoopbackOllamaUrl('https://api.openai.com/v1')).toBe(false);

    const gateway = new HostOllamaGateway();
    expect(gateway.getConfig().enabled).toBe(false);
    // No fake model names or simulated AI content
    expect(gateway.getConfig().selectedModel).toBe('');
    expect(gateway.getStatus().availableModels).toEqual([]);
    expect(gateway.getStatus().activeModel).toBe('');
    expect(gateway.getStatus().error).toBe(OLLAMA_NOT_DETECTED_MESSAGE);
    expect(gateway.isAiReady()).toBe(false);

    // Rejects non-loopback configuration
    expect(() => gateway.configure({ baseUrl: 'https://remote-llm.example.com' }, true)).toThrow();

    // Rejects AI generation when Ollama is not detected (never returns fake/simulated AI flashcards)
    await expect(
      gateway.generateFlashcardDeck({
        requesterId: 'alice',
        isHost: true,
        sourceType: 'note',
        topic: 'Sistemas Distribuidos',
        content: '# Consenso Raft\nRaft elige un líder por término.',
        count: 4,
        difficulty: 'medium',
        style: 'concise',
        includeHints: true,
        includeExplanations: true,
      }),
    ).rejects.toThrow(OLLAMA_NOT_DETECTED_MESSAGE);

    // Full Manual Deck & Flashcard Creation, Editing, Reordering, Deletion & Flip-Card Review without AI
    const manualDeck = gateway.createManualDeck('Mazo Manual de Cálculo', 'alice', 'shared_read');
    expect(manualDeck.title).toBe('Mazo Manual de Cálculo');
    expect(manualDeck.cards).toHaveLength(0);

    gateway.renameDeck(manualDeck.id, 'Cálculo Diferencial e Integral', 'alice', true);
    expect(gateway.getDeck(manualDeck.id)?.title).toBe('Cálculo Diferencial e Integral');

    gateway.addManualCard(
      manualDeck.id,
      {
        question: '¿Cuál es la derivada de sen(x)?',
        answer: 'cos(x)',
        hint: 'Función trigonométrica par',
        tags: ['derivadas', 'trigonometría'],
        explanation: 'd/dx[sen(x)] = cos(x) por definición del límite.',
        difficulty: 'easy',
      },
      'alice',
      true,
    );
    gateway.addManualCard(
      manualDeck.id,
      {
        question: '¿Qué establece el Teorema Fundamental del Cálculo?',
        answer: 'Conecta la derivación con la integración definida.',
        tags: ['integrales', 'teorema'],
        difficulty: 'medium',
      },
      'alice',
      true,
    );

    const deckAfterAdd = gateway.getDeck(manualDeck.id)!;
    expect(deckAfterAdd.cards).toHaveLength(2);
    const firstId = deckAfterAdd.cards[0].id;
    const secondId = deckAfterAdd.cards[1].id;

    // Edit manual card
    gateway.updateCard(
      manualDeck.id,
      firstId,
      { answer: 'cos(x) (coseno de x)', hint: 'Pista actualizada' },
      'alice',
      true,
    );
    expect(gateway.getDeck(manualDeck.id)!.cards[0].answer).toBe('cos(x) (coseno de x)');

    // Reorder cards
    gateway.reorderCard(manualDeck.id, secondId, 'up', 'alice', true);
    expect(gateway.getDeck(manualDeck.id)!.cards[0].id).toBe(secondId);

    // Interactive Flip-Card Multiplayer Study Session synchronization
    const session = new MultiplayerStudySession(gateway.getDeck(manualDeck.id)!, {
      id: 'alice',
      displayName: 'Alice',
      color: '#df8a72',
    });
    session.joinSession({ id: 'bob', displayName: 'Bob', color: '#6c8ebf' });
    expect(session.getState().answerRevealed).toBe(false);
    expect(session.flipCard()).toBe(true);
    expect(session.getState().answerRevealed).toBe(true);
    expect(session.flipCard()).toBe(false);

    const currentCardId = session.getCurrentCard()!.id;
    session.recordSelfAssessment('alice', currentCardId, 'mastered');
    session.recordSelfAssessment('bob', currentCardId, 'review_again');
    expect(session.getUserProgress('alice').mastered).toBe(1);
    expect(session.getState().participants).toHaveLength(2);
    expect(session.nextCard()).not.toBeNull();

    // Delete a card
    gateway.deleteCard(manualDeck.id, secondId, 'alice', true);
    expect(gateway.getDeck(manualDeck.id)!.cards).toHaveLength(1);

  });
});
