import { describe, expect, it } from 'vitest';
import { DEFAULT_DIALOGUE, dialoguePages, parseDialoguePreferences } from '../src/ui/npc-speech-model';

const columns = (text: string) => Array.from(text).length;

describe('guide dialogue pagination', () => {
  it('normalizes whitespace and keeps words together at the exact width boundary', () => {
    expect(dialoguePages('  one\t two\nthree   four five  ', 9, 2, columns)).toEqual(['one two\nthree', 'four five']);
    expect(dialoguePages('one two', 7, 2, columns)).toEqual(['one two']);
    expect(dialoguePages(' \n\t ', 7, 2, columns)).toEqual(['']);
  });

  it('splits an unbroken name into bounded pages without losing any characters', () => {
    const text = 'abcdefghijklmnopqrstuv';
    const pages = dialoguePages(text, 5, 2, columns);
    expect(pages).toEqual(['abcde\nfghij', 'klmno\npqrst', 'uv']);
    expect(pages.join('').replaceAll('\n', '')).toBe(text);
  });

  it('keeps Unicode code points intact when wrapping very narrow text', () => {
    const pages = dialoguePages('😀🌿📚🦊é', 1, 2, columns);
    expect(pages).toEqual(['😀\n🌿', '📚\n🦊', 'é']);
    expect(pages.join('').replaceAll('\n', '')).toBe('😀🌿📚🦊é');
  });

  it('uses measured glyph widths and applies the chosen two or three line limit', () => {
    const measure = (text: string) => [...text].reduce((sum, char) => sum + (char === 'W' ? 3 : 1), 0);
    for (const limit of [2, 3]) {
      const pages = dialoguePages('WWW iii WWW iii WWW iii WWW iii', 7, limit, measure);
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        expect(page.split('\n').length).toBeLessThanOrEqual(limit);
        for (const line of page.split('\n')) expect(measure(line)).toBeLessThanOrEqual(7);
      }
      expect(pages.join('').replaceAll(/\s/g, '')).toBe('WWWiiiWWWiiiWWWiiiWWWiii');
    }
  });
});

describe('saved guide dialogue preferences', () => {
  it('falls back per field without coercing damaged or older values', () => {
    for (const value of [null, undefined, false, 5, 'large', [], { opacity: NaN, textSize: 'huge', lines: '3', progressive: 'false' }]) {
      expect(parseDialoguePreferences(value)).toEqual(DEFAULT_DIALOGUE);
    }
    expect(parseDialoguePreferences({ textSize: 'large', progressive: false })).toEqual({ ...DEFAULT_DIALOGUE, textSize: 'large', progressive: false });
  });

  it('bounds opacity while preserving all valid preferences', () => {
    expect(parseDialoguePreferences({ opacity: -.2 }).opacity).toBe(.35);
    expect(parseDialoguePreferences({ opacity: 2 }).opacity).toBe(1);
    expect(parseDialoguePreferences({ opacity: Infinity }).opacity).toBe(.9);
    expect(parseDialoguePreferences({ opacity: '0.5' }).opacity).toBe(.9);
    const value = { opacity: .6, textSize: 'large', lines: 3, progressive: false } as const;
    expect(parseDialoguePreferences(value)).toEqual({...value,size:'standard'});
  });

  it('returns an independent preference object and leaves defaults intact', () => {
    const saved = { ...DEFAULT_DIALOGUE };
    const parsed = parseDialoguePreferences(saved);
    parsed.lines = 3;
    parsed.opacity = .4;
    expect(saved).toEqual({ size:'standard', opacity: .9, textSize: 'normal', lines: 2, progressive: true });
    expect(DEFAULT_DIALOGUE).toEqual(saved);
  });
});
