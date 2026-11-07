import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import { test, expect } from '@playwright/test';

// Browser-only evidence for the local village shell. These checks exercise the
// Canvas/UI and local persistence paths that run without signaling, capture or a
// second host. They are NOT evidence of real microphone/screen capture, Tauri
// WebKitGTK behaviour, or two-host operation; those remain UNVERIFIED.

type Page = import('@playwright/test').Page;

/** Everything is reached from the phone, the way the player does it. */
async function phoneApp(page: Page, app: string) {
  await page.getByTestId('phone-button').click();
  await openPhoneApp(page,app);
  if (app === 'decorate' && !await page.locator('.sv-house-editor > details').evaluate(el => (el as HTMLDetailsElement).open)) await page.locator('.sv-house-editor > details > summary').click();
}

async function openHouseWhiteboard(page: Page, index = 0) {
  await phoneApp(page, 'decorate');
  const boardItem = page.locator('.sv-furniture-item', { hasText: 'Pizarra' }).nth(index);
  await expect(boardItem).toBeVisible();
  await boardItem.dblclick();
}

const place = (page: Page) => page.locator('.sv-hud-place h1');

test('the village shell loads offline and contacts no external host', async ({ page,baseURL }) => {
  const external: string[] = [];
  page.on('request', req => {
    if (new URL(req.url()).origin !== new URL(baseURL!).origin) external.push(req.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'La aldea', exact: true })).toBeVisible();
  await phoneApp(page, 'village');
  await expect(page.locator('.sv-session-card')).toContainText('Sin sesión');
  await expect(page.getByRole('button', { name: 'Abrir mi aldea a otras personas' })).toBeVisible();
  expect(external).toEqual([]);
});

test('the declared favicon resolves instead of falling back to a 404', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('./favicon.svg');
  const res = await page.request.get('/favicon.svg');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
});

test('the phone opens every place and app, and nothing else crowds the village', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sv-sidebar, .sv-inspector, .sv-nav-item')).toHaveCount(0);
  await phoneApp(page, 'house');
  await expect(place(page)).toHaveText('Mi rincón de estudio');
  await phoneApp(page, 'house');
  await expect(place(page)).toHaveText('La aldea');
  await phoneApp(page, 'contacts');
  await expect(page.getByRole('heading', { name: 'Personas de confianza' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sv-phone')).toBeHidden();
  // M toggles the phone from the keyboard.
  await page.keyboard.press('m');
  await expect(page.locator('.sv-phone')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.locator('.sv-phone')).toBeHidden();
});

test('a saved display name survives a reload through local persistence', async ({ page }) => {
  await page.goto('/');
  await phoneApp(page, 'settings');
  const name = page.getByLabel('Nombre visible', { exact: true });
  await expect(name).toHaveValue('Explorador');
  await name.fill('Vecina Ada');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByLabel('Nombre visible', { exact: true })).toHaveValue('Vecina Ada');

  await page.reload();
  await phoneApp(page, 'settings');
  await expect(page.getByLabel('Nombre visible', { exact: true })).toHaveValue('Vecina Ada');
});

test('drawing on the board marks the canvas and undo reverts exactly that stroke', async ({ page }) => {
  await page.goto('/');
  await openHouseWhiteboard(page, 0);
  const canvas = page.locator('.sv-board-wrap canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const blank = await canvas.screenshot();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(box.x + 100 + i * 15, box.y + 100 + i * 10);
  }
  await page.mouse.up();

  await expect.poll(async () => Buffer.compare(blank, await canvas.screenshot()) !== 0).toBe(true);

  await page.getByRole('button', { name: /Deshacer/ }).click();
  // No ink is left where the stroke was (byte-identical screenshots also catch 1-level anti-aliasing noise at the border).
  const darkInStroke = () => page.evaluate(() => {
    const el = document.querySelector('.sv-board-wrap canvas') as HTMLCanvasElement;
    const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
    let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300) dark += 1;
    return dark;
  });
  await expect.poll(darkInStroke).toBe(0);
  await expect(page.locator('.sv-board-pane').getByText('0 trazos en esta pizarra')).toBeAttached();
});

test.describe('with decorative motion suppressed', () => {
  // The village animates on its own (tree sway, drifting motes, lamp flicker),
  // so a still frame is only guaranteed under reduced motion. Asking for it
  // here both exercises that accessibility path and restores a clean control
  // for the movement assertion below.
  test.use({ reducedMotion: 'reduce' });

  test('the scene holds completely still and only input moves the character', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas:visible').first();
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 400, y: 400 } });

    // Control: with decorative motion off and no input, nothing may repaint.
    const idleStart = await canvas.screenshot();
    await page.waitForTimeout(1_000);
    expect(Buffer.compare(idleStart, await canvas.screenshot())).toBe(0);

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(110);
      await page.keyboard.up('KeyA');
    }

    await expect
      .poll(async () => Buffer.compare(idleStart, await canvas.screenshot()) !== 0)
      .toBe(true);
  });
});

test('decorative motion runs when reduced motion is not requested', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas:visible').first();
  await expect(canvas).toBeVisible();
  // Without the preference the scene is alive even with no input at all.
  const first = await canvas.screenshot();
  await expect
    .poll(async () => Buffer.compare(first, await canvas.screenshot()) !== 0, { timeout: 4_000 })
    .toBe(true);
});

test('opening the board from a room offers a way back into that same room', async ({ page }) => {
  await page.goto('/');
  await openHouseWhiteboard(page, 0);
  const back = page.getByRole('button', { name: '← Volver a mi casa' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(place(page)).toHaveText('Mi rincón de estudio');

  // Escape from the board also steps back into the room, not out to the village.
  await openHouseWhiteboard(page, 0);
  await page.keyboard.press('Escape');
  await expect(place(page)).toHaveText('Mi rincón de estudio');
});

test('E only leaves a room from the doorway', async ({ page }) => {
  await page.goto('/');
  await phoneApp(page, 'house');
  await expect(place(page)).toHaveText('Mi rincón de estudio');
  // At the spawn point, in the middle of the floor, E must do nothing.
  await page.keyboard.press('e');
  await expect(place(page)).toHaveText('Mi rincón de estudio');

  // Walk down onto the doormat, then E leaves to the village.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('e');
  await expect(place(page)).toHaveText('La aldea');
});

test.describe('whiteboard tools', () => {
  const openBoard = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    await openHouseWhiteboard(page, 0);
    const canvas = page.locator('.sv-board-wrap canvas');
    await expect(canvas).toBeVisible();
    const tool = async (name: string) => {
      const target = page.locator('.sv-segment-button', { hasText: name }).first();
      if (!await target.isVisible()) {
        const more = page.getByRole('button', { name: 'Opciones avanzadas', exact: true });
        if (await more.getAttribute('aria-expanded') === 'false') await more.click();
        await page.locator('.sv-board-category > summary', { hasText: name === 'Mano' ? 'Vista' : 'Formas' }).click();
      }
      await target.click();
    };
    const undo = page.getByRole('button', { name: '↶ Deshacer' });
    const line = async (yLogic: number) => {
      const currentBox = (await canvas.boundingBox())!;
      const py = currentBox.y + currentBox.width * (yLogic / 768);
      const pxStart = currentBox.x + currentBox.width * (100 / 768);
      await page.mouse.move(pxStart, py);
      await page.mouse.down();
      for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(
          currentBox.x + currentBox.width * ((100 + i * 20) / 768),
          py,
        );
      }
      await page.mouse.up();
    };
    const box = (await canvas.boundingBox())!;
    return { canvas, box, tool, undo, line };
  };

  // Share of non-paper pixels in a region of the board canvas.
  const ink = (page: import('@playwright/test').Page, x: number, y: number, w: number, h: number) => page.evaluate(([rx, ry, rw, rh]) => {
    const el = document.querySelector('.sv-board-wrap canvas') as HTMLCanvasElement;
    const sx = el.width / 768;
    const d = el.getContext('2d')!.getImageData(rx * sx, ry * sx, rw * sx, rh * sx).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 500) dark += 1;
    return dark / (d.length / 4);
  }, [x, y, w, h]);

  test('the eraser removes your own stroke', async ({ page }) => {
    const { tool, undo, line } = await openBoard(page);
    await tool('Lápiz');
    await line(300);
    await expect(undo).toBeEnabled();
    await tool('Borrador');
    const { box } = await openBoardBox(page);
    const eraseX = box.x + box.width * (200 / 768);
    await page.mouse.move(eraseX, box.y + box.height * (280 / 432));
    await page.mouse.down();
    await page.mouse.move(eraseX, box.y + box.height * (320 / 432), { steps: 6 });
    await page.mouse.up();
    await expect(page.getByText('0 trazos en esta pizarra')).toBeAttached();
    // Erasing is itself one undoable gesture.
    await undo.click();
    await expect(page.getByText('1 trazos en esta pizarra')).toBeAttached();
  });

  test('"Borrar lo mío" asks once more, then clears every stroke of yours', async ({ page }) => {
    const { tool, undo, line } = await openBoard(page);
    await tool('Lápiz');
    await line(150);
    await line(250);
    await page.getByRole('button', { name: 'Opciones avanzadas', exact: true }).click();
    await page.locator('.sv-board-category > summary', { hasText: 'Trazo y edición' }).click();
    await page.getByRole('button', { name: 'Borrar lo mío' }).click();
    // First click only arms it; nothing is deleted yet.
    await expect(undo).toBeEnabled();
    await page.getByRole('button', { name: '¿Borrar todo lo tuyo?' }).click();
    await expect(page.getByText('0 trazos en esta pizarra')).toBeAttached();
    await expect(page.locator('.sv-notice')).toContainText('Se borraron 2 trazo(s) tuyos');
  });

  test('a text note renders LaTeX as ink on the board', async ({ page }) => {
    const { box, tool } = await openBoard(page);
    // Wait for the empty paper to be painted before measuring.
    await expect.poll(() => ink(page, 400, 150, 300, 120), { timeout: 5_000 }).toBe(0);
    await tool('Texto');
    await page.mouse.click(box.x + box.width * (420 / 768), box.y + box.width * (160 / 768));
    await page.locator('.sv-board-text').fill('$\\frac{a}{b} + \\sqrt{x}$');
    await page.keyboard.press('Enter');
    await expect(page.locator('.sv-board-text')).toHaveCount(0);
    // Empty paper measures exactly 0; a small rendered formula covers ~0.5%.
    await expect.poll(() => ink(page, 400, 150, 300, 120), { timeout: 8_000 }).toBeGreaterThan(0.002);
  });

  test('zoom controls and ctrl+wheel change the view', async ({ page }) => {
    const { box } = await openBoard(page);
    await page.getByRole('button', { name: 'Opciones avanzadas', exact: true }).click();
    await page.locator('.sv-board-category > summary', { hasText: 'Vista' }).click();
    const label = page.locator('.sv-zoom-label');
    await expect(label).toHaveText('100%');
    await page.getByRole('button', { name: 'Acercar' }).click();
    await expect(label).toHaveText('125%');
    await page.getByRole('button', { name: 'Alejar' }).click();
    await expect(label).toHaveText('100%');
    const boardCanvas = page.locator('.sv-board-wrap canvas');
    await boardCanvas.scrollIntoViewIfNeeded();
    const currentBox = (await boardCanvas.boundingBox())!;
    await page.mouse.move(currentBox.x + currentBox.width / 2, currentBox.y + currentBox.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(async () => parseInt(await label.innerText(), 10)).toBeGreaterThan(100);
  });
});

async function openBoardBox(page: import('@playwright/test').Page) {
  const box = (await page.locator('.sv-board-wrap canvas').boundingBox())!;
  return { box };
}

test.describe('Mobile phone touch controls & responsive experience', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('displays mobile touch controller HUD with D-pad and Action button on phones', async ({ page }) => {
    await page.goto('/');
    // Check that D-pad and Action button are visible on phone viewport
    const touchControls = page.locator('.sv-touch-controls');
    await expect(touchControls).toBeVisible();

    const dpad = page.locator('.sv-dpad');
    await expect(dpad).toBeVisible();
    await expect(page.locator('.sv-dpad-up')).toBeVisible();
    await expect(page.locator('.sv-dpad-down')).toBeVisible();
    await expect(page.locator('.sv-dpad-left')).toBeVisible();
    await expect(page.locator('.sv-dpad-right')).toBeVisible();

    const actionBtn = page.locator('[data-testid="touch-action-btn"]');
    await expect(actionBtn).toBeVisible();
    await expect(actionBtn).toContainText('Usar');

    // Tap D-pad button
    await page.locator('.sv-dpad-up').dispatchEvent('pointerdown');
    await page.waitForTimeout(50);
    await page.locator('.sv-dpad-up').dispatchEvent('pointerup');

    // Tap action button
    await expect(actionBtn).toBeDisabled();

    // The phone stays reachable next to the touch controls.
    await expect(page.getByTestId('phone-button')).toBeVisible();
  });
});

test.describe('Multiplayer pixel-art world expansion', () => {
  test('navigates between Residential, Community Plaza, and Study Library areas and opens minigames & study tools', async ({ page }) => {
    await page.goto('/');

    await page.locator('.sv-stage-pane canvas').focus();
    const walkUntil = async (key: string, label: string) => {
      await page.keyboard.down(key);
      await expect(page.locator('.sv-touch-btn-label').last()).toContainText(label, { timeout: 10000 });
      await page.keyboard.up(key);
    };
    await walkUntil('w', 'Ir a Plaza Comunitaria');
    await page.keyboard.press('e');
    await walkUntil('w', 'Hombres Lobo');
    await page.keyboard.press('e');
    const activity = page.getByTestId('expansion-modal-overlay');
    await expect(activity).toBeVisible();
    await expect(page.getByRole('heading', { name: 'La mesa de la hoguera' })).toBeVisible();
    await page.getByRole('button', { name: 'Sentarme a la mesa' }).click();
    for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Añadir bot' }).click();
    await page.getByRole('button', { name: 'Repartir cartas' }).click();
    await expect(page.getByRole('heading', { name: 'Mira tu carta' })).toBeVisible();
    await expect(page.locator('.ww-card-team')).toHaveText(/Equipo (aldea|lobos)/);
    // Other players' cards stay face down for a villager; a wolf may see no other wolf at four players.
    await expect(page.locator('.ww-seat:not(.is-me) [aria-label="Carta oculta"]')).toHaveCount(3);
    await page.getByTestId('expansion-modal-close').click();
    await expect(activity).toBeHidden();

    await walkUntil('s', 'Volver al Barrio Residencial');
    await page.keyboard.press('e');
    await walkUntil('s', 'Ir a Biblioteca de Estudio');
    await page.keyboard.press('e');
    await walkUntil('s', 'Mesa de estudio');
    await page.keyboard.press('e');
    const study = page.getByRole('region', { name: 'Estudio', exact: true });
    await expect(study).toBeVisible();
    await expect(study.getByRole('button', { name: /^Flashcards/ })).toBeVisible();
    await expect(study.getByRole('button', { name: 'Detectar Ollama' })).not.toBeVisible();
    await study.getByRole('button', { name: 'Cerrar', exact: true }).click();

    // The desk opens the group's VS Code projects, not an in-app code editor.
    await phoneApp(page, 'decorate');
    await page.locator('.sv-furniture-item', { hasText: 'Escritorio' }).first().dblclick();
    await expect(page.getByRole('heading', { name: 'Proyectos del grupo' })).toBeVisible();
    await expect(page.locator('.sv-editor-area')).toHaveCount(0);
  });

  test('every whiteboard inside a house is independent and persists its own name and strokes across reopening', async ({ page }) => {
    await page.goto('/');
    await phoneApp(page, 'decorate');

    // Add a second whiteboard furniture item inside the house
    await page.locator('.sv-house-editor select').last().selectOption('board');
    await page.getByRole('button', { name: '+ Añadir' }).click();
    const boardItems = page.locator('.sv-furniture-item', { hasText: 'Pizarra' });
    await expect(boardItems).toHaveCount(2);

    // Open Whiteboard #1, rename it, and draw a stroke
    await boardItems.nth(0).dblclick();
    await page.getByRole('button', { name: 'Opciones avanzadas', exact: true }).click();
    await page.locator('.sv-board-category > summary', { hasText: 'Pizarra y archivo' }).click();
    const renameInput = page.getByTestId('board-rename-input');
    await renameInput.fill('Pizarra Álgebra');
    await renameInput.dispatchEvent('change');
    await page.getByRole('button', { name: 'Opciones avanzadas', exact: true }).click();
    const canvas = page.locator('.sv-board-wrap canvas');
    const box1 = (await canvas.boundingBox())!;
    await page.mouse.move(box1.x + 80, box1.y + 80);
    await page.mouse.down();
    await page.mouse.move(box1.x + 220, box1.y + 140, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: '↶ Deshacer' })).toBeEnabled();

    // Return to house and open Whiteboard #2 -> must be completely empty and have its own independent name!
    await page.getByRole('button', { name: '← Volver a mi casa' }).click();
    await phoneApp(page, 'decorate');
    await boardItems.nth(1).dblclick();
    await expect(page.getByRole('button', { name: '↶ Deshacer' })).toBeDisabled();
    await expect(page.getByTestId('board-rename-input')).not.toHaveValue('Pizarra Álgebra');

    // Return to house and reopen Whiteboard #1 -> its stroke and name persisted!
    await page.getByRole('button', { name: '← Volver a mi casa' }).click();
    await phoneApp(page, 'decorate');
    await boardItems.nth(0).dblclick();
    await expect(page.getByTestId('board-rename-input')).toHaveValue('Pizarra Álgebra');
    await expect(page.getByRole('button', { name: '↶ Deshacer' })).toBeEnabled();
  });
});
