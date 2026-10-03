import { launch, context, B } from './lib.mjs';
const b = await launch();
const ctx = await context(b, { width: 1280, height: 900 }, { storageState: './audit-output/state.json' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const active = () => p.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return { txt: (a.innerText || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 30), inDialog: !!a.closest('[role=dialog]'), ring: s.outlineStyle !== 'none' || s.boxShadow !== 'none' }; });
await p.goto(B + '/clients', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
let found = false, noRing = [];
for (let i = 0; i < 25 && !found; i++) { await p.keyboard.press('Tab'); const a = await active(); if (!a.ring) noRing.push(a.txt); if (/Nouveau client/.test(a.txt)) found = true; }
console.log('Tab atteint « Nouveau client » :', found, '| éléments sans repère visuel de focus :', noRing.length ? noRing : 'aucun');
await p.keyboard.press('Enter'); await p.waitForTimeout(600);
let escaped = false;
for (let i = 0; i < 30; i++) { await p.keyboard.press('Tab'); if (!(await active()).inDialog) escaped = true; }
for (let i = 0; i < 10; i++) { await p.keyboard.press('Shift+Tab'); if (!(await active()).inDialog) escaped = true; }
console.log('focus resté dans la fenêtre (30 Tab + 10 Maj+Tab) :', !escaped);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
console.log('Échap ferme :', (await p.locator('[role=dialog]').count()) === 0, '| focus rendu à :', (await active()).txt);
// fenêtres empilées : commande (tiroir) puis reçu (fenêtre)
await p.goto(B + '/commandes', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
await p.getByRole('tab', { name: /Atelier/ }).click(); await p.waitForTimeout(500);
await p.locator('section[role=listitem] article').first().locator('button').first().click(); await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Voir/ }).first().click(); await p.waitForTimeout(1200);
const before = await p.locator('[role=dialog]').count();
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
const after1 = await p.locator('[role=dialog]').count();
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
const after2 = await p.locator('[role=dialog]').count();
console.log(`fenêtres ouvertes : ${before} → Échap → ${after1} → Échap → ${after2}`);
console.log('erreurs :', errs);
await b.close();
