import { describe, expect, it } from 'vitest';
import { insertAtSelection, SNIPPETS } from '../src/editor/snippets';

describe('local snippet editor', () => {
  it('inserts at the caret without discarding surrounding text', () => {
    const result = insertAtSelection('before\nafter', SNIPPETS[0].text, 7, 7);
    expect(result.text.startsWith('before\n# Tema')).toBe(true);
    expect(result.text.endsWith('after')).toBe(true);
    expect(result.text.slice(result.caret)).toBe('after');
  });

  it('replaces an explicit selection', () => {
    const result = insertAtSelection('one two three', 'dos', 4, 7);
    expect(result.text).toBe('one \ndos three');
  });
});

describe('asset packs', () => {
  it('validates declarative JSON asset packs and rejects executable payloads', async () => {
    const { validateAssetPack } = await import('../src/assets/custom-assets');
    const valid = validateAssetPack({
      schemaVersion: 1,
      name: 'Pack seguro',
      author: 'Javi',
      license: 'CC-BY-4.0',
      avatar: { hairStyle: 'curly', hairColor: '#2a2018', skinTone: '#c98f63', accessory: 'glasses' },
      furnitureColors: { desk: '#8a5a36' },
      furnitureSprites: {},
    });
    expect(valid.name).toBe('Pack seguro');
    expect(() => validateAssetPack({ schemaVersion: 2, name: 'Invalido' })).toThrow();
    expect(() => validateAssetPack({
      schemaVersion: 1,
      name: 'Inyeccion SVG',
      furnitureSprites: { desk: 'data:image/svg+xml;base64,PHN2Zz4=' },
    })).toThrow();
    expect(() => validateAssetPack({
      schemaVersion: 1,
      name: 'Script malicioso',
      scripts: 'alert(1)',
    })).toThrow();
  });
});

