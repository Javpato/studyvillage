import { describe, expect, it } from 'vitest';
import type { PublicHouse } from '../../packages/core/src/protocol/types';
import { normalizeAppearance } from '../src/assets/appearance';
import { installWardrobe } from '../src/house/wardrobe';

const empty = (): PublicHouse => ({ ownerId: 'owner', revision: 1, name: 'Casa', access: 'ask', theme: 'mint', furniture: [] });

describe('wardrobe', () => {
  it('installs one wardrobe and never a second', () => {
    const once = installWardrobe(empty());
    expect(once.furniture.filter(f => f.kind === 'cabinet')).toHaveLength(1);
    expect(once.revision).toBe(2);
    expect(installWardrobe(once)).toBe(once);
  });
  it('keeps old hat and glasses accessories when reading legacy looks', () => {
    expect(normalizeAppearance({ accessory: 'hat' })).toMatchObject({ headwear: 'explorer', eyewear: 'none' });
    expect(normalizeAppearance({ accessory: 'glasses' })).toMatchObject({ eyewear: 'square', headwear: 'none' });
    expect(normalizeAppearance({ hairStyle: 'beanie' }).headwear).toBe('beanie');
  });
  it('defaults old looks to the masculine body and keeps a feminine choice', () => {
    expect(normalizeAppearance({accessory:'headphones'}).headphonesColor).toBe('#cf6f3c');
    expect(normalizeAppearance({headphonesColor:'#123456'}).headphonesColor).toBe('#123456');
    expect(normalizeAppearance({ outfit: 'suit' }).body).toBe('masculine');
    expect(normalizeAppearance({ body: 'feminine', hairStyle: 'ponytail' })).toMatchObject({ body: 'feminine', hairStyle: 'ponytail' });
    expect(normalizeAppearance({ body: 'robot' }).body).toBe('masculine');
  });
  it('drops invalid garments instead of rejecting the whole look', () => {
    const look = normalizeAppearance({ headwear: 'tophat', eyewear: 'round', outfit: 'suit', jacket: 'coat', jacketColor: 'red' });
    expect(look).toMatchObject({ headwear: 'none', eyewear: 'round', outfit: 'suit', jacket: 'coat' });
    expect(look.jacketColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
