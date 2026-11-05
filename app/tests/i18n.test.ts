import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ES, EN } from '../src/i18n/catalogue';
import { msg, t, setLanguage, getLanguage, getLocale, defaultText } from '../src/i18n';
import { SERVER_AUTHORITY } from '../../packages/runtime/src/server/contracts';
import { REMOTE_AUTHORITY } from '../../packages/core/src/minigames/room';

const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(m => m[1]).sort().join('|');
function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sources(join(folder, e.name)) : e.name.endsWith('.ts') ? [join(folder, e.name)] : []);
}
/** Literal first arguments of msg()/t() in the app sources. */
function explicitMessages(): { text: string; file: string }[] {
  const found: { text: string; file: string }[] = [];
  for (const file of sources('app/src')) {
    if (file.includes('/i18n')) continue;
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/(?<![\w.$])(?:msg|t)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")\s*[,)]/g)) {
      const raw = m[1] !== undefined ? m[1] : m[2];
      const text = m[1] !== undefined ? JSON.parse(`"${raw.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) : JSON.parse(`"${raw}"`);
      if (text.trim() && !/^\{\w+\}$/.test(text)) found.push({ text, file });
    }
  }
  return found;
}

afterEach(() => setLanguage('es'));

describe('Spanish/English catalogue', () => {
  const es = ES as Record<string, string>, en = EN as Record<string, string>;
  it('has the same keys in both languages, no empty texts and the same named parameters', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    const problems: string[] = [];
    for (const key of Object.keys(es)) {
      if (!es[key].trim() || !en[key]?.trim()) problems.push(`empty: ${key}`);
      else if (placeholders(es[key]) !== placeholders(en[key])) problems.push(`parameters: ${key}`);
    }
    expect(problems).toEqual([]);
  });
  it('covers every explicit interface message in the source code', () => {
    const missing = [...new Set(explicitMessages().filter(m => !(m.text in es)).map(m => `${m.file.replace('app/src/', '')}: ${m.text}`))];
    expect(missing).toEqual([]);
  });
  it('is really translated, not copied: most English texts differ from Spanish', () => {
    // Spanish sentences only: internal English errors, CSS and model prompts are not interface text.
    const keys = Object.keys(es).filter(k => /\b(de|la|el|los|las|tu|tus|una|con|para|que|del|en|sin|esta|este)\b/i.test(k) && /\s/.test(k) && !/^(Genera|Devuelve|Eres|Responde)\b/.test(k));
    const same = keys.filter(k => en[k] === es[k]);
    expect(same.length / keys.length).toBeLessThan(0.05);
  });
});

describe('message formatting', () => {
  it('fills named parameters, translates nested messages and never translates raw parameter values', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(getLocale()).toBe('en-GB');
    expect(t('Idioma')).toBe('Language');
    // A person called "Cerrar" keeps the name they chose.
    expect(t('{count} persona(s) aquí', { count: 3 })).toMatch(/^3 /);
    expect(t('Privado con {name}', { name: 'Cerrar' })).toContain('Cerrar');
    expect(t('Barrio {n} →', { n: msg('Idioma') })).toContain('Language');
    setLanguage('es');
    expect(t('Idioma')).toBe('Idioma');
  });
  it('leaves unknown keys and missing parameters visible instead of failing', () => {
    expect(t('Texto que no existe {x}')).toBe('Texto que no existe {x}');
  });
  it('ignores an unknown language', () => {
    setLanguage('de' as never);
    expect(getLanguage()).toBe('es');
  });
});

describe('default names follow the language only while unchanged', () => {
  it('translates app defaults both ways and leaves typed names alone', () => {
    setLanguage('en');
    expect(defaultText('Mi rincón de estudio')).toBe('My study nook');
    expect(defaultText('Explorador')).toBe('Explorer');
    expect(defaultText('Casa de Ana')).toBe('Casa de Ana');
    expect(defaultText('Pregunta escrita por mí')).toBe('Pregunta escrita por mí');
    setLanguage('es');
    // Saved while in English without changes: still a default, so it comes back in Spanish.
    expect(defaultText('My study nook')).toBe('Mi rincón de estudio');
    expect(defaultText('Mi armario')).toBe('Mi armario');
  });
});

describe('protocol values stay language independent', () => {
  it('the server is the same virtual host for rooms and contracts', () => { expect(SERVER_AUTHORITY).toBe(REMOTE_AUTHORITY); });
});
