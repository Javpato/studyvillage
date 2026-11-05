import { z } from 'zod';
import { flashcardItemSchema, quizQuestionSchema } from '../../../core/src/study/library';
import { aiBoardLatexResponseSchema, aiBoardTutorResponseSchema, aiPixelSpriteGridSchema } from './study-ai';

export const aiFeatureSchema = z.enum(['flashcards', 'quizzes', 'board', 'boardVision', 'sprites', 'gartic']);
export type AiFeature = z.infer<typeof aiFeatureSchema>;
export const cardsResponse = z.object({ cards: z.array(z.object({ question:flashcardItemSchema.shape.question, answer:flashcardItemSchema.shape.answer, hint:flashcardItemSchema.shape.hint, explanation:flashcardItemSchema.shape.explanation, difficulty:flashcardItemSchema.shape.difficulty, tags:flashcardItemSchema.shape.tags })).min(1).max(12) });
export const questionsResponse = z.object({ questions: z.array(z.object({ text:quizQuestionSchema.shape.text, choices:quizQuestionSchema.shape.choices, correctChoice:quizQuestionSchema.shape.correctChoice, explanation:quizQuestionSchema.shape.explanation }).refine(q => q.correctChoice < q.choices.length && new Set(q.choices).size === q.choices.length)).min(1).max(12) });
export const drawingResponse = z.object({ drawing: z.object({ strokes: z.array(z.object({ c:z.string().regex(/^#[0-9a-f]{6}$/i), w:z.number().min(1).max(48), p:z.array(z.number().min(0).max(640)).min(4).max(1000).refine(p => p.length % 2 === 0 && p.every((v,i) => i % 2 === 0 || v <= 400)) })).min(1).max(100) }) });
export const botResponse = z.object({ text:z.string().trim().min(1).max(120).optional(), drawing:drawingResponse.shape.drawing.optional() }).refine(v => !!v.text || !!v.drawing);
export const aiResults: Record<AiFeature,z.ZodType> = { flashcards:cardsResponse, quizzes:questionsResponse, board:aiBoardTutorResponseSchema, boardVision:aiBoardLatexResponseSchema, sprites:aiPixelSpriteGridSchema, gartic:botResponse };
export const aiInputSchema = z.strictObject({ feature:aiFeatureSchema, prompt:z.string().min(1).max(12000), images:z.array(z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(30000)).max(1).default([]) });
export type AiInput = z.infer<typeof aiInputSchema>;
const requestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const aiWireSchema = z.discriminatedUnion('t', [
  z.strictObject({ t:z.literal('status'), id:requestId }),
  z.strictObject({ t:z.literal('generate'), id:requestId, input:aiInputSchema }),
  z.strictObject({ t:z.literal('cancel'), id:requestId }),
]);
export type AiWire = z.infer<typeof aiWireSchema>;
export const aiStatusSchema = z.strictObject({ features:z.array(aiFeatureSchema).max(6), model:z.string().max(160) });
export type AiStatus = z.infer<typeof aiStatusSchema>;
export const aiErrorSchema = z.enum(['ai-unavailable','ai-busy','ai-response','cancelled']);
export type AiErrorCode = z.infer<typeof aiErrorSchema>;
export class AiError extends Error { constructor(readonly code:AiErrorCode){super(code);} }
export type AiReply = { t:'result'; id:string; value:unknown } | { t:'error'; id:string; code:AiErrorCode };
export interface AiProvider {
  status():Promise<AiStatus>;
  generate(person:string, id:string, input:AiInput):Promise<unknown>;
  cancel(person:string, id?:string):void;
}
