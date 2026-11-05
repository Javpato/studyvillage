import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiBoardLatexResponseSchema,
  aiBoardTutorResponseSchema,
  aiBookshelfResponseSchema,
  aiDeskPlanResponseSchema,
  aiPixelSpriteGridSchema,
  localBoardLatexFallback,
  localBoardTutorFallback,
  localBookshelfStudyFallback,
  localDeskPlanFallback,
  localPixelSpriteFallback,
  renderPixelGridToPngDataUrl,
  sanitizeBoardAiText,
} from './study-ai';
import { validateAssetPack } from '../../../../app/src/assets/custom-assets';
import { LIMITS } from '../../../core/src/protocol/types';

test('sanitizeBoardAiText strips executable HTML/script patterns and respects LIMITS.boardText', () => {
  const dirty = '<script>alert(1)</script> $$x = \\frac{-b}{2a}$$ javascript:evil()';
  const cleaned = sanitizeBoardAiText(dirty);
  assert.equal(cleaned.includes('<script'), false);
  assert.equal(cleaned.includes('javascript:'), false);
  assert.equal(cleaned.includes('$$x = \\frac{-b}{2a}$$'), true);

  const oversized = 'A'.repeat(900);
  assert.equal(sanitizeBoardAiText(oversized).length, LIMITS.boardText);
});

test('localBoardLatexFallback and localBoardTutorFallback produce valid Zod-checked P2P board payloads', () => {
  const latexRes = localBoardLatexFallback('ecuación cuadrática x^2 + bx + c = 0', 'fórmula general');
  const parsedLatex = aiBoardLatexResponseSchema.parse(latexRes);
  assert.equal(parsedLatex.latex.includes('\\sqrt{b^2 - 4ac}'), true);

  const tutorRes = localBoardTutorFallback(['$$\\int x^2 dx$$'], 'integral');
  const parsedTutor = aiBoardTutorResponseSchema.parse(tutorRes);
  assert.equal(parsedTutor.steps.length, 3);
  assert.equal(parsedTutor.hint.length > 10, true);
});

test('localBookshelfStudyFallback and localDeskPlanFallback produce valid flashcards, quiz, and Pomodoro checklists', () => {
  const studyPack = localBookshelfStudyFallback('# Estructuras de Datos\n- Árboles binarios de búsqueda\n- Complejidad O(log n)', 'Árboles');
  const parsedStudy = aiBookshelfResponseSchema.parse(studyPack);
  assert.equal(parsedStudy.flashcards.length, 3);
  assert.equal(parsedStudy.quiz.length, 2);
  assert.equal(parsedStudy.boardSummary.length <= LIMITS.boardText, true);

  const plan = localDeskPlanFallback('Grafos y Dijkstra', '# Grafos');
  const parsedPlan = aiDeskPlanResponseSchema.parse(plan);
  assert.equal(parsedPlan.markdown.includes('Minutos 0–5'), true);
  assert.equal(parsedPlan.markdown.includes('Minutos 5–20'), true);
  assert.equal(parsedPlan.markdown.includes('Minutos 20–25'), true);
});

test('localPixelSpriteFallback and renderPixelGridToPngDataUrl produce a valid PNG accepted by validateAssetPack', () => {
  const grid = localPixelSpriteFallback('plant', 'Bonsái luminoso');
  const parsedGrid = aiPixelSpriteGridSchema.parse(grid);
  assert.equal(parsedGrid.pixels.length, 256);

  const dataUrl = renderPixelGridToPngDataUrl(parsedGrid);
  assert.equal(dataUrl.startsWith('data:image/png;base64,'), true);

  const pack = validateAssetPack({
    schemaVersion: 1,
    name: 'Pack IA Seguro',
    author: 'Local',
    license: 'CC-BY-4.0',
    furnitureSprites: { plant: dataUrl },
  });
  assert.equal(pack.furnitureSprites?.plant, dataUrl);
});
