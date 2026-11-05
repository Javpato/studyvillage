import type {EraserPreferences} from '../../../core/src/whiteboard/eraser';
import {browserKeyValue} from './key-value';
const KEY = 'studyvillage-eraser-v1';
export function loadEraserPreferences(): EraserPreferences {
  try {
    const value = JSON.parse(browserKeyValue.getItem(KEY) || 'null');
    if (value && ['stroke', 'precision'].includes(value.mode) && [8, 16, 32].includes(value.diameter)) return value;
  } catch { /* Defaults also work without browser storage. */ }
  return { mode: 'stroke', diameter: 16 };
}
export function saveEraserPreferences(value: EraserPreferences): void {
  try { browserKeyValue.setItem(KEY, JSON.stringify(value)); } catch { /* Keep the current session's selection. */ }
}

