import {sanitizeBoardAiText} from '../../../core/src/text/sanitize';
export {sanitizeBoardAiText} from '../../../core/src/text/sanitize';
import { z } from 'zod';
import { LIMITS, type FurnitureKind } from '../../../core/src/protocol/types';

/**
 * Security & P2P Protocol Validation Schemas (Item 5):
 * Every AI response is strictly validated with Zod and clamped to StudyVillage
 * P2P protocol limits (LIMITS.boardText = 500, LIMITS.editorChars = 100_000,
 * safe PNG data URL <= 512 KiB, and zero executable fields).
 */
export const aiBoardLatexResponseSchema = z.object({
  latex: z.string().min(1).max(LIMITS.boardText),
  summary: z.string().min(1).max(200),
  provider: z.enum(['gemini', 'ollama', 'local']).optional(),
});

export type AiBoardLatexResponse = z.infer<typeof aiBoardLatexResponseSchema>;

export const aiBoardTutorResponseSchema = z.object({
  steps: z.array(z.string().min(1).max(LIMITS.boardText)).min(1).max(5),
  hint: z.string().min(1).max(LIMITS.boardText),
  provider: z.enum(['gemini', 'ollama', 'local']).optional(),
});

export type AiBoardTutorResponse = z.infer<typeof aiBoardTutorResponseSchema>;

export const aiFlashcardSchema = z.object({
  front: z.string().min(1).max(180),
  back: z.string().min(1).max(280),
});

export const aiQuizQuestionSchema = z.object({
  question: z.string().min(1).max(220),
  options: z.tuple([
    z.string().min(1).max(140),
    z.string().min(1).max(140),
    z.string().min(1).max(140),
    z.string().min(1).max(140),
  ]),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(260),
});

export const aiBookshelfResponseSchema = z.object({
  topic: z.string().min(1).max(100),
  flashcards: z.array(aiFlashcardSchema).min(1).max(6),
  quiz: z.array(aiQuizQuestionSchema).min(1).max(4),
  boardSummary: z.string().min(1).max(LIMITS.boardText),
  provider: z.enum(['gemini', 'ollama', 'local']).optional(),
});

export type AiBookshelfResponse = z.infer<typeof aiBookshelfResponseSchema>;

export const aiDeskPlanResponseSchema = z.object({
  title: z.string().min(1).max(80),
  markdown: z.string().min(1).max(4_000),
  boardSummary: z.string().min(1).max(LIMITS.boardText),
  provider: z.enum(['gemini', 'ollama', 'local']).optional(),
});

export type AiDeskPlanResponse = z.infer<typeof aiDeskPlanResponseSchema>;

export const aiPixelSpriteGridSchema = z.object({
  width: z.literal(16),
  height: z.literal(16),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(16),
  pixels: z.array(z.number().int().min(-1).max(15)).length(256),
  label: z.string().min(1).max(48),
  provider: z.enum(['gemini', 'ollama', 'local']).optional(),
});

export type AiPixelSpriteGrid = z.infer<typeof aiPixelSpriteGridSchema>;

/**
 * StudyVillage official pixel-art palette tokens for AI sprite synthesis.
 */
export const STUDYVILLAGE_SPRITE_PALETTE: readonly string[] = [
  '#231c18', // 0: deep ink outline
  '#df7e6c', // 1: terracotta / coral
  '#5b9a8b', // 2: sage green
  '#e6b566', // 3: warm gold
  '#6c8ebf', // 4: sky blue
  '#7cb369', // 5: leaf green
  '#315f51', // 6: forest shadow
  '#8d5524', // 7: warm wood
  '#c68b59', // 8: light oak
  '#f6eedc', // 9: cream paper
  '#b57ba6', // 10: lavender
  '#d8c39a', // 11: sand
];

// ---------------------------------------------------------------------------
// Deterministic Local-First Fallbacks (work 100% offline & in unit/E2E tests)
// ---------------------------------------------------------------------------

export function localBoardLatexFallback(textContext: string, prompt = ''): AiBoardLatexResponse {
  const combined = `${prompt} ${textContext}`.trim();
  const lower = combined.toLowerCase();

  let latex = '$$f(x) = \\int_{a}^{b} x^2\\,dx = \\frac{b^3 - a^3}{3}$$';
  let summary = 'Integral definida convertida a notación LaTeX.';

  if (lower.includes('cuadr') || lower.includes('x^2') || lower.includes('raíz') || lower.includes('raiz') || lower.includes('ecuac')) {
    latex = '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$';
    summary = 'Fórmula general de segundo grado en LaTeX.';
  } else if (lower.includes('pitag') || lower.includes('triang') || lower.includes('hipotenusa')) {
    latex = '$$c = \\sqrt{a^2 + b^2}$$';
    summary = 'Teorema de Pitágoras en LaTeX.';
  } else if (lower.includes('suma') || lower.includes('serie') || lower.includes('gauss')) {
    latex = '$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$';
    summary = 'Sumatoria de Gauss en LaTeX.';
  } else if (lower.includes('deriv') || lower.includes('limite') || lower.includes('límite')) {
    latex = '$$f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$';
    summary = 'Definición formal de la derivada por límite.';
  } else if (lower.includes('matriz') || lower.includes('sistema') || lower.includes('det')) {
    latex = '$$\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc$$';
    summary = 'Determinante de una matriz 2×2 en LaTeX.';
  } else if (combined.length > 0 && !combined.startsWith('$')) {
    const cleanExpr = sanitizeBoardAiText(combined, 120).replace(/\$/g, '');
    if (/[=+\-*/^]/.test(cleanExpr)) {
      latex = `$${cleanExpr}$`;
      summary = 'Expresión matemática formateada en LaTeX.';
    }
  }

  return {
    latex: sanitizeBoardAiText(latex, LIMITS.boardText),
    summary: sanitizeBoardAiText(summary, 200),
    provider: 'local',
  };
}

export function localBoardTutorFallback(strokesText: string[], prompt = ''): AiBoardTutorResponse {
  const joined = `${prompt} ${strokesText.join(' · ')}`.trim();
  const lower = joined.toLowerCase();

  if (lower.includes('int') || lower.includes('∫')) {
    return {
      steps: [
        'Paso 1 · Identifica el integrando:\n$$\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C$$',
        'Paso 2 · Evalúa en los extremos $[a, b]$ aplicando la regla de Barrow:\n$$F(b) - F(a)$$',
        'Paso 3 · Verifica derivando el resultado para comprobar que recuperas $f(x)$.',
      ].map((s) => sanitizeBoardAiText(s)),
      hint: sanitizeBoardAiText('💡 Pista: Suma 1 al exponente y divide por el nuevo exponente antes de evaluar los límites.'),
      provider: 'local',
    };
  }

  if (lower.includes('sqrt') || lower.includes('x^2') || lower.includes('4ac') || lower.includes('cuadr')) {
    return {
      steps: [
        'Paso 1 · Ordena la ecuación en forma canónica:\n$$ax^2 + bx + c = 0$$',
        'Paso 2 · Calcula el discriminante:\n$$\\Delta = b^2 - 4ac$$',
        'Paso 3 · Sustituye en la fórmula:\n$$x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$$',
      ].map((s) => sanitizeBoardAiText(s)),
      hint: sanitizeBoardAiText('💡 Pista: Si el discriminante $\\Delta = b^2 - 4ac > 0$, obtendrás dos raíces reales distintas.'),
      provider: 'local',
    };
  }

  const topicLabel = joined ? sanitizeBoardAiText(joined, 60) : 'el problema en pizarra';
  return {
    steps: [
      `Paso 1 · Datos e incógnita:\nResume qué variables conocemos en «${topicLabel}».`,
      'Paso 2 · Relación clave:\nPlantea la ecuación o propiedad principal:\n$$f(x) = 0$$',
      'Paso 3 · Comprobación:\nSustituye un caso pequeño ($x = 0$ o $x = 1$) para validar.',
    ].map((s) => sanitizeBoardAiText(s)),
    hint: sanitizeBoardAiText(`💡 Pista sobre «${topicLabel}»: Divide el problema en un caso base sencillo y verifica las unidades o signos.`),
    provider: 'local',
  };
}

export function localBookshelfStudyFallback(content: string, customTopic = ''): AiBookshelfResponse {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const heading = lines.find((l) => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
  const topic = sanitizeBoardAiText(customTopic.trim() || heading || 'Fundamentos de Estudio y Algoritmos', 90);

  const bulletLines = lines
    .filter((l) => /^[-*•\d.]/.test(l))
    .map((l) => l.replace(/^[-*•\d.)+\s]+/, '').trim())
    .filter((l) => l.length >= 6);

  const flashcards = [
    {
      front: `¿Cuál es el concepto central de «${topic}»?`,
      back: bulletLines[0]
        ? sanitizeBoardAiText(bulletLines[0], 260)
        : `Descomponer «${topic}» en invariantes verificables, casos pequeños y práctica activa.`,
    },
    {
      front: `¿Cómo verificar si dominas «${topic}»?`,
      back: bulletLines[1]
        ? sanitizeBoardAiText(bulletLines[1], 260)
        : 'Explicando la idea sin mirar apuntes y resolviendo un ejemplo desde cero en la pizarra.',
    },
    {
      front: '¿Qué estrategia evita errores frecuentes al resolver problemas?',
      back: bulletLines[2]
        ? sanitizeBoardAiText(bulletLines[2], 260)
        : 'Probar primero con un caso límite o pequeño (n = 0, n = 1) antes de generalizar.',
    },
  ];

  const quiz: AiBookshelfResponse['quiz'] = [
    {
      question: `Al estudiar «${topic}», ¿qué paso produce mejor retención a largo plazo?`,
      options: [
        'Releer pasivamente el mismo texto varias veces',
        'Evocación activa: explicar con tus palabras y resolver casos prácticos',
        'Memorizar sin comprobar ejemplos concretos',
        'Saltarse la verificación de casos extremos',
      ],
      correctIndex: 1,
      explanation: 'La evocación activa y la resolución de casos concretos consolidan la comprensión profunda.',
    },
    {
      question: '¿Para qué sirve probar un caso pequeño antes de dar por buena una fórmula o programa?',
      options: [
        'Para detectar errores de signo, condición inicial o complejidad rápidamente',
        'Solo para decorar los apuntes',
        'Para evitar escribir código o ecuaciones',
        'No aporta información sobre la solución general',
      ],
      correctIndex: 0,
      explanation: 'Un caso pequeño permite comprobar de inmediato si la relación matemática o lógica se cumple.',
    },
  ];

  return {
    topic,
    flashcards,
    quiz,
    boardSummary: sanitizeBoardAiText(
      `📚 Resumen (${topic}):\n1. ${flashcards[0].back.slice(0, 120)}\n2. ${flashcards[1].back.slice(0, 120)}`,
      LIMITS.boardText,
    ),
    provider: 'local',
  };
}

export function localDeskPlanFallback(goal: string, currentNotes = ''): AiDeskPlanResponse {
  const cleanGoal = sanitizeBoardAiText(
    goal.trim() || currentNotes.split('\n')[0]?.replace(/^#+\s*/, '') || 'Sesión enfocada de estudio',
    75,
  );
  const title = `Plan 25m · ${cleanGoal}`;
  const markdown = [
    `## ⏱️ ${title}`,
    '',
    '### 1. Enfoque inicial (Minutos 0–5)',
    `- [ ] Definir el objetivo concreto de **${cleanGoal}** en una sola frase.`,
    '- [ ] Preparar la pizarra o archivo de código sin distracciones.',
    '',
    '### 2. Práctica activa (Minutos 5–20)',
    `- [ ] Resolver un ejercicio o implementar un prototipo de **${cleanGoal}**.`,
    '- [ ] Probar con un caso pequeño y anotar cualquier duda exacta.',
    '',
    '### 3. Síntesis y repaso (Minutos 20–25)',
    '- [ ] Escribir la fórmula o conclusión clave con tus propias palabras.',
    '- [ ] Guardar el avance y generar tarjetas de repaso en la librería.',
    '',
  ].join('\n');

  return {
    title,
    markdown,
    boardSummary: sanitizeBoardAiText(
      `⏱️ Pomodoro 25m: ${cleanGoal}\n• 0-5m: Objetivo claro\n• 5-20m: Práctica activa\n• 20-25m: Síntesis final`,
      LIMITS.boardText,
    ),
    provider: 'local',
  };
}

export function localPixelSpriteFallback(kind: FurnitureKind, prompt: string): AiPixelSpriteGrid {
  const lower = `${kind} ${prompt}`.toLowerCase();
  const palette = [...STUDYVILLAGE_SPRITE_PALETTE];
  const pixels = new Array<number>(256).fill(-1);

  const setPx = (x: number, y: number, colorIdx: number) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) {
      pixels[y * 16 + x] = colorIdx;
    }
  };
  const fillRect = (x0: number, y0: number, w: number, h: number, colorIdx: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) setPx(x, y, colorIdx);
    }
  };

  if (lower.includes('gato') || lower.includes('cat') || lower.includes('mascota')) {
    // Cozy pixel cat sitting on cushion
    fillRect(3, 12, 10, 3, 1); // terracotta cushion
    fillRect(5, 6, 6, 7, 3); // gold cat body
    setPx(5, 4, 3); setPx(6, 5, 3); // left ear
    setPx(10, 4, 3); setPx(9, 5, 3); // right ear
    setPx(6, 7, 0); setPx(9, 7, 0); // eyes
    setPx(7, 8, 1); setPx(8, 8, 1); // nose
    fillRect(11, 9, 2, 3, 3); // tail
  } else if (lower.includes('bonsai') || lower.includes('bonsái') || lower.includes('arbol') || lower.includes('árbol') || lower.includes('planta') || lower.includes('flor') || kind === 'plant') {
    // Glowing study bonsai / plant
    fillRect(5, 12, 6, 3, 1); // terracotta pot
    fillRect(4, 11, 8, 1, 7); // pot rim
    fillRect(7, 7, 2, 4, 7); // trunk
    fillRect(4, 3, 8, 4, 5); // leaf canopy
    fillRect(3, 5, 10, 2, 2); // sage mid canopy
    setPx(5, 3, 3); setPx(9, 4, 3); setPx(7, 2, 3); // golden blossoms
  } else if (lower.includes('lampara') || lower.includes('lámpara') || lower.includes('faro') || lower.includes('luz')) {
    // Warm study lantern / lamp
    fillRect(5, 13, 6, 2, 7); // base
    fillRect(7, 8, 2, 5, 8); // stem
    fillRect(4, 3, 8, 5, 3); // golden shade
    fillRect(5, 4, 6, 3, 9); // bright inner glow
  } else if (kind === 'frame' || lower.includes('cuadro') || lower.includes('arte') || lower.includes('estrella')) {
    // Framed pixel-art mountain & starry sky painting
    fillRect(1, 2, 14, 12, 7); // wood frame
    fillRect(2, 3, 12, 10, 4); // sky
    setPx(4, 5, 3); setPx(11, 4, 3); // stars
    fillRect(2, 10, 12, 3, 6); // foreground hills
    fillRect(5, 8, 6, 2, 2); // mountain peak
    setPx(7, 7, 9); setPx(8, 7, 9); // snow cap
  } else {
    // Classic study emblem / trophy book
    fillRect(2, 3, 12, 10, 7); // book cover
    fillRect(3, 4, 5, 8, 9); // left page
    fillRect(8, 4, 5, 8, 9); // right page
    fillRect(7, 4, 1, 8, 11); // spine crease
    fillRect(4, 6, 3, 1, 2); fillRect(9, 6, 3, 1, 1);
    fillRect(4, 8, 3, 1, 4); fillRect(9, 8, 3, 1, 3);
  }

  return {
    width: 16,
    height: 16,
    palette,
    pixels,
    label: sanitizeBoardAiText(prompt.trim() || `Sprite ${kind}`, 48),
    provider: 'local',
  };
}

// ---------------------------------------------------------------------------
// Pure-TypeScript + Canvas 16x16 -> 32x32 PNG Data-URL Encoder
// ---------------------------------------------------------------------------

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b, 255];
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}

/**
 * Converts a validated 16x16 AiPixelSpriteGrid into a crisp 32x32 PNG data URL
 * (`data:image/png;base64,...`) that passes `validateAssetPack` in both browser
 * and Node test environments.
 */
export function renderPixelGridToPngDataUrl(grid: AiPixelSpriteGrid): string {
  const validated = aiPixelSpriteGridSchema.parse(grid);
  const outSize = 32;
  const scale = 2;

  // Prefer HTMLCanvasElement when running in a real browser with 2D context support
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, outSize, outSize);
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const idx = validated.pixels[y * 16 + x];
            if (idx >= 0 && idx < validated.palette.length) {
              ctx.fillStyle = validated.palette[idx];
              ctx.fillRect(x * scale, y * scale, scale, scale);
            }
          }
        }
        const url = canvas.toDataURL('image/png');
        if (url.startsWith('data:image/png;base64,')) return url;
      }
    } catch {
      // Fall through to deterministic binary PNG encoder
    }
  }

  // Deterministic uncompressed PNG encoder (works in Node/Vitest & headless fallback)
  const rawScanlines = new Uint8Array(outSize * (1 + outSize * 4));
  let ptr = 0;
  for (let y = 0; y < outSize; y++) {
    rawScanlines[ptr++] = 0; // Filter type 0 (None)
    const srcY = Math.floor(y / scale);
    for (let x = 0; x < outSize; x++) {
      const srcX = Math.floor(x / scale);
      const colorIdx = validated.pixels[srcY * 16 + srcX];
      if (colorIdx >= 0 && colorIdx < validated.palette.length) {
        const [r, g, b, a] = hexToRgba(validated.palette[colorIdx]);
        rawScanlines[ptr++] = r;
        rawScanlines[ptr++] = g;
        rawScanlines[ptr++] = b;
        rawScanlines[ptr++] = a;
      } else {
        rawScanlines[ptr++] = 0;
        rawScanlines[ptr++] = 0;
        rawScanlines[ptr++] = 0;
        rawScanlines[ptr++] = 0;
      }
    }
  }

  // Wrap rawScanlines in a single uncompressed zlib/DEFLATE block (len <= 65535)
  const len = rawScanlines.length;
  const zlib = new Uint8Array(2 + 5 + len + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  zlib[2] = 0x01; // BFINAL=1, BTYPE=00 (uncompressed)
  zlib[3] = len & 0xff;
  zlib[4] = (len >>> 8) & 0xff;
  const nlen = (~len) & 0xffff;
  zlib[5] = nlen & 0xff;
  zlib[6] = (nlen >>> 8) & 0xff;
  zlib.set(rawScanlines, 7);
  const adler = adler32(rawScanlines);
  const zView = new DataView(zlib.buffer);
  zView.setUint32(7 + len, adler, false);

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, outSize, false);
  ihdrView.setUint32(4, outSize, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const cIhdr = makePngChunk('IHDR', ihdr);
  const cIdat = makePngChunk('IDAT', zlib);
  const cIend = makePngChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(sig.length + cIhdr.length + cIdat.length + cIend.length);
  let offset = 0;
  png.set(sig, offset); offset += sig.length;
  png.set(cIhdr, offset); offset += cIhdr.length;
  png.set(cIdat, offset); offset += cIdat.length;
  png.set(cIend, offset);

  let binary = '';
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i]);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(png).toString('base64');
  return `data:image/png;base64,${base64}`;
}

