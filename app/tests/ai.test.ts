import { describe, expect, it } from 'vitest';
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
} from '../../packages/runtime/src/ai/study-ai';
import { validateAssetPack } from '../src/assets/custom-assets';
import { LIMITS } from '../../packages/core/src/protocol/types';

describe('StudyVillage AI capabilities & security boundaries (Items 1, 3, 5)', () => {
  it('sanitizes AI text outputs to respect P2P board limits and strip script tags', () => {
    const raw = '<script>evil()</script> $$\\sum_{i=1}^{n} i$$ javascript:alert(1)';
    const clean = sanitizeBoardAiText(raw);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('$$\\sum_{i=1}^{n} i$$');
    expect(sanitizeBoardAiText('x'.repeat(800)).length).toBe(LIMITS.boardText);
  });

  it('converts whiteboard context into validated LaTeX and step-by-step tutor notes', () => {
    const latex = aiBoardLatexResponseSchema.parse(localBoardLatexFallback('ecuación cuadrática', 'raíces'));
    expect(latex.latex).toContain('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');

    const tutor = aiBoardTutorResponseSchema.parse(localBoardTutorFallback(['$\\int x^2 dx$'], 'integral'));
    expect(tutor.steps).toHaveLength(3);
    expect(tutor.hint).toContain('Pista');
  });

  it('generates bookshelf flashcards/quiz and desk 25m Pomodoro plans from local notes', () => {
    const pack = aiBookshelfResponseSchema.parse(
      localBookshelfStudyFallback('# Recursión\n- Caso base detiene la llamada\n- Paso recursivo reduce el problema', 'Recursión'),
    );
    expect(pack.flashcards.length).toBeGreaterThanOrEqual(3);
    expect(pack.quiz.length).toBeGreaterThanOrEqual(2);

    const plan = aiDeskPlanResponseSchema.parse(localDeskPlanFallback('Recursión y árboles'));
    expect(plan.markdown).toContain('Minutos 0–5');
    expect(plan.markdown).toContain('Minutos 5–20');
  });

  it('synthesizes 16x16 pixel-art grids and encodes valid 32x32 PNG data URLs accepted by validateAssetPack', () => {
    const grid = aiPixelSpriteGridSchema.parse(localPixelSpriteFallback('plant', 'Bonsái luminoso'));
    expect(grid.pixels).toHaveLength(256);
    const dataUrl = renderPixelGridToPngDataUrl(grid);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    const validated = validateAssetPack({
      schemaVersion: 1,
      name: 'Pack Pixel IA',
      author: 'Local',
      license: 'CC-BY-4.0',
      furnitureSprites: { plant: dataUrl },
    });
    expect(validated.furnitureSprites?.plant).toBe(dataUrl);
  });
});
