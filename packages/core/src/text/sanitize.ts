import {LIMITS} from '../protocol/types';
const FORBIDDEN_PATTERNS = /<\s*\/?\s*(script|iframe|object|embed|svg|onload|onerror)/gi;

export function sanitizeBoardAiText(raw: string, maxLen: number = LIMITS.boardText): string {
  const cleaned = raw
    .replace(FORBIDDEN_PATTERNS, '')
    .replace(/javascript:/gi, '')
    .replace(/\u0000/g, '')
    .trim();
  return cleaned.slice(0, maxLen);
}

