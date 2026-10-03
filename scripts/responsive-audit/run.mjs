import fs from 'node:fs';
import { launch, context, measure, B } from './lib.mjs';
const [, , label, wStr, hStr] = process.argv;
const viewport = { width: Number(wStr), height: Number(hStr) };
const open = (re) => async (p) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(700); };
const go = (path, wait = 1200) => async (p) => { await p.goto(B + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(wait); };
const openOrder = async (p) => { await go('/commandes')(p); await p.getByRole('tab', { name: /Atelier/ }).click(); await p.waitForTimeout(600); await p.locator('section[role=listitem] article').first().locator('button').first().click(); await p.waitForTimeout(1200); };
const scenarios = [
  ['tableau-de-bord', go('/dashboard', 2500)],
  ['recherche', async (p) => { await go('/dashboard', 2000)(p); await p.getByPlaceholder(/Rechercher/).fill('Diarra'); await p.waitForTimeout(1200); }],
  ['clients', go('/clients')],
  ['fiche-client', async (p) => { await go('/clients')(p); await p.getByText('Mame Diarra').first().click(); await p.waitForTimeout(1500); }],
  ['form-client', async (p) => { await go('/clients')(p); await open(/Nouveau client/)(p); }],
  ['kanban', async (p) => { await go('/commandes', 1200)(p); await p.getByRole('tab', { name: /Atelier/ }).click(); await p.waitForTimeout(800); }],
  ['liste-commandes', async (p) => { await go('/commandes')(p); await p.getByRole('tab', { name: /Liste/ }).click(); await p.waitForTimeout(900); }],
  ['detail-commande', openOrder],
  ['encaisser', async (p) => { await openOrder(p); await open(/Encaisser/)(p); }],
  ['recu', async (p) => { await openOrder(p); await p.getByRole('button', { name: /Voir/ }).first().click(); await p.waitForTimeout(1500); }],
  ['form-commande', async (p) => { await go('/commandes')(p); await open(/Nouvelle commande/)(p); }],
  ['rendez-vous', go('/rdv', 1500)],
  ['form-rdv', async (p) => { await go('/rdv')(p); await open(/Nouveau rendez-vous/)(p); }],
  ['whatsapp', async (p) => { await go('/rdv')(p); await p.getByRole('button', { name: /Préparer le rappel/ }).first().click(); await p.waitForTimeout(800); }],
  ['stock', go('/stock')],
  ['fiche-tissu', async (p) => { await go('/stock')(p); await p.getByText('Bazin riche').first().click(); await p.waitForTimeout(1200); }],
  ['equipe', go('/equipe', 1500)],
  ['abonnement', go('/abonnement', 1500)],
  ...(viewport.width >= 820 ? [] : [['menu-mobile', async (p) => { await go('/dashboard', 1500)(p); await p.getByRole('button', { name: /menu/i }).first().click(); await p.waitForTimeout(800); }]]),
];
const browser = await launch();
const ctx = await context(browser, viewport, { storageState: './audit-output/state.json' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const results = [];
for (const [name, setup] of scenarios) {
  let res;
  try { await setup(page); res = await measure(page); } catch (e) { res = { error: e.message.split('\n')[0] }; }
  const bad = res.error || res.pageOverflow > 0 || res.overflow?.length || res.clipped?.length;
  if (bad || name === 'kanban' || name === 'recu' || name === 'tableau-de-bord') {
    await page.screenshot({ path: `./audit-output/shots/${label}-${name}.png`, fullPage: false }).catch(() => {});
  }
  results.push({ name, ...res });
}
// Page de connexion (sans session)
const anon = await browser.newContext({ viewport, hasTouch: viewport.width <= 1024 });
const ap = await anon.newPage();
await ap.goto(B + '/connexion', { waitUntil: 'networkidle' }); await ap.waitForTimeout(1200);
results.push({ name: 'connexion', ...(await measure(ap)) });
fs.writeFileSync(`./audit-output/out/${label}.json`, JSON.stringify({ label, viewport, results, errors }, null, 1));
await browser.close();
console.log(label, 'ok');
