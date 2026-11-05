import { test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
/** Walks the app in English and records every visible string, attribute and canvas text. Audit aid, not part of the suite. */
const OUT = process.env.AUDIT_OUT || '/tmp/audit.json';
const found = new Map<string, Set<string>>();
const errors: string[] = [];
const DENY = /^(Eliminar|Delete|Borrar|Remove|Revoke|Revocar|Salir|Leave|Sign out|Close|×|✕|Clear|Reset|Export|Download|Import|Open my village|Copy|Log out|Lock)/i;
const save = () => writeFileSync(OUT, JSON.stringify({ errors, texts: Object.fromEntries([...found].map(([k, v]) => [k, [...v].slice(0, 3)])) }, null, 1));
type Open = (page: Page) => Promise<void>;
test.setTimeout(40 * 60_000);
// Opt-in: npm run i18n:audit (AUDIT_OUT=… set by the script).
test.skip(!process.env.AUDIT_OUT, 'Run with npm run i18n:audit');

async function boot(page: Page): Promise<void> {
  page.setDefaultTimeout(4000);
  await page.goto('/');
  await page.getByTestId('phone-button').waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}
async function collect(page: Page, where: string): Promise<void> {
  const texts: string[] = await page.evaluate(() => {
    const out = new Set<string>();
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent!.trim(); if (t && n.parentElement && visible(n.parentElement) && !['SCRIPT', 'STYLE'].includes(n.parentElement.tagName)) out.add(t); }
    for (const el of document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) for (const a of ['aria-label', 'title', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v?.trim()) out.add(v.trim()); }
    for (const el of document.querySelectorAll('option')) out.add(el.textContent!.trim());
    for (const el of document.querySelectorAll('input,textarea')) { const v = (el as HTMLInputElement).value; if (v && (el as HTMLInputElement).type !== 'color' && (el as HTMLInputElement).type !== 'password') out.add(`[value] ${v}`); }
    for (const t of (window as unknown as { __canvasText?: Set<string> }).__canvasText ?? []) out.add(`[canvas] ${t}`);
    return [...out];
  });
  for (const t of texts) { if (!found.has(t)) found.set(t, new Set()); found.get(t)!.add(where); }
}
const clickables = (scope: string) => `${scope} button, ${scope} summary, ${scope} [role=tab]`;
async function buttons(page: Page, scope: string): Promise<string[]> {
  return page.evaluate(sel => [...document.querySelectorAll(sel)].filter(b => (b as HTMLElement).offsetParent && !(b as HTMLButtonElement).disabled).map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean), clickables(scope));
}
async function clickLabel(page: Page, scope: string, label: string): Promise<boolean> {
  const ok = await page.evaluate(([sel, label]) => { const b = [...document.querySelectorAll(sel)].find(b => (b as HTMLElement).offsetParent && (b.getAttribute('aria-label') || b.textContent || '').trim() === label) as HTMLElement | undefined; b?.click(); return !!b; }, [clickables(scope), label] as const);
  await page.waitForTimeout(350); return ok;
}
async function explore(page: Page, name: string, open: Open, scope: string, depth: number): Promise<void> {
  const visit = async (path: string[]): Promise<string[]> => {
    try {
      await boot(page); await open(page);
      for (const step of path) if (!await clickLabel(page, scope, step)) return [];
      await collect(page, `${name} > ${path.join(' > ')}`);
      return depth > path.length ? (await buttons(page, scope)).filter(l => !DENY.test(l)) : [];
    } catch (e) { errors.push(`${name} > ${path.join(' > ')}: ${String(e).split('\n')[0]}`); return []; }
  };
  const seen = new Set<string>();
  const walk = async (path: string[], labels: string[]): Promise<void> => {
    for (const label of labels.slice(0, path.length ? 12 : 30)) {
      const next = [...path, label];
      const children = [...new Set(await visit(next))].filter(l => !labels.includes(l) && !seen.has(`${next.length}:${l}`));
      children.forEach(l => seen.add(`${next.length}:${l}`));
      if (next.length < depth) await walk(next, children);
    }
  };
  await walk([], [...new Set(await visit([]))]);
  save();
}
const phone = (tile: string): Open => async page => { await page.getByTestId('phone-button').click(); await page.getByTestId(tile).click(); await page.waitForTimeout(400); };
const go = (area: [number, number], station: [number, number]): Open => async page => {
  const canvas = page.locator('.sv-stage-pane canvas'); let box = (await canvas.boundingBox())!;
  await canvas.dblclick({ position: { x: box.width * area[0] / 768, y: box.height * area[1] / 432 } }); await page.waitForTimeout(800);
  box = (await canvas.boundingBox())!; await canvas.dblclick({ position: { x: box.width * station[0] / 768, y: box.height * station[1] / 432 } }); await page.waitForTimeout(800);
};
const nothing: Open = async () => {};

test('crawl', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('studyvillage-language', 'en');
    // A deck and a quiz someone wrote (their content must stay as typed) so review and play screens have content.
    const now = Date.now();
    if (!localStorage.getItem('studyvillage-flashcard-decks-v1')) localStorage.setItem('studyvillage-flashcard-decks-v1', JSON.stringify([{ id: 'deck:mine', title: 'Mi mazo propio', topic: 'Historia', sourceType: 'manual', ownerId: 'local-host', visibility: 'private', createdAt: now, updatedAt: now, provider: 'manual',
      cards: [{ id: 'c1', question: 'Pregunta escrita por mí', answer: 'Respuesta escrita por mí', hint: 'Pista mía', topic: 'Historia', difficulty: 'easy', tags: [] }, { id: 'c2', question: 'Otra pregunta mía', answer: 'Otra respuesta', topic: 'Historia', difficulty: 'medium', tags: [] }] }]));
    if (!localStorage.getItem('studyvillage-quizzes-v1')) localStorage.setItem('studyvillage-quizzes-v1', JSON.stringify({ version: 1, migrated: [], quizzes: [{ id: 'quiz:mine', title: 'Mi quiz propio', updatedAt: now, questions: [{ id: 'q1', text: 'Mi pregunta de quiz', choices: ['Opción uno', 'Opción dos'], correctChoice: 0, explanation: 'Mi explicación' }] }] }));
    const seen = new Set<string>(); (window as unknown as { __canvasText: Set<string> }).__canvasText = seen;
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, max?: number) { if (String(text).trim()) seen.add(String(text)); return max === undefined ? orig.call(this, text, x, y) : orig.call(this, text, x, y, max); };
  });
  if (process.env.AUDIT_ONLY === 'study') { await explore(page, 'study', phone('phone-study'), '.sv-activity', 4); save(); return; }
  await explore(page, 'village', nothing, 'body', 0);
  for (const tile of ['phone-house', 'phone-village', 'phone-voice', 'phone-contacts']) await explore(page, tile, phone(tile), 'body', 0);
  await explore(page, 'decorate', phone('phone-decorate'), '.sv-phone', 1);
  await explore(page, 'settings', phone('phone-settings'), 'dialog[open]', 1);
  await explore(page, 'study', phone('phone-study'), '.sv-activity', 3);
  await explore(page, 'projects', phone('phone-projects'), '.sv-activity', 1);
  await explore(page, 'plaza', go([240, 50], [600, 380]), 'body', 0);
  await explore(page, 'library', go([240, 392], [400, 380]), 'body', 0);
  await explore(page, 'werewolves', go([240, 50], [384, 210]), '.sv-activity', 1);
  await explore(page, 'gartic', go([240, 50], [169, 110]), '.sv-activity', 1);
  await explore(page, 'ollama', go([240, 392], [625, 119]), '.sv-activity', 1);
  await explore(page, 'wardrobe', async p => { const c = p.locator('.sv-stage-pane canvas'); const b = (await c.boundingBox())!; await c.dblclick({ position: { x: b.width * 644 / 768, y: b.height * 182 / 432 } }); await p.waitForTimeout(900); }, 'body', 1);
  await explore(page, 'house', phone('phone-house'), 'body', 0);
  await explore(page, 'board', async p => {
    await phone('phone-decorate')(p);
    if (!await p.locator('.sv-house-editor > details').evaluate(el => (el as HTMLDetailsElement).open)) await p.locator('.sv-house-editor > details > summary').click();
    await p.locator('.sv-furniture-item').filter({ hasText: /board|Pizarra/i }).first().dblclick(); await p.waitForTimeout(700);
  }, '.sv-board-pane', 1);
  save();
});
