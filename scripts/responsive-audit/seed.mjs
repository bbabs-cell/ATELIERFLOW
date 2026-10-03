import { launch, context, B } from './lib.mjs';
const browser = await launch();
const ctx = await context(browser, { width: 1280, height: 900 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await p.goto(B + '/clients', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
const clients = [
  ['Mame Diarra Bousso Ndiaye-Sarr épouse Fall', '+221 77 123 45 67'],
  ['Awa Diop', '+221 78 555 44 33'],
  ['Ousmane', '76 000 11 22'],
];
for (const [name, phone] of clients) {
  await p.getByRole('button', { name: 'Nouveau client' }).first().click(); await p.waitForTimeout(300);
  await p.fill('#full_name', name); await p.fill('#phone', phone); await p.fill('#whatsapp', phone);
  await p.getByRole('button', { name: 'Créer le client' }).click(); await p.waitForTimeout(600);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
}
await p.goto(B + '/commandes', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
const orders = [[1, 'URGENT', d(-3), 'Grand boubou bazin riche brodé main avec fil doré et pantalon assorti', '185 000'], [2, 'NORMAL', d(0), 'Robe wax', '25 000'], [3, 'HIGH', d(2), 'Tailleur', '40 000'], [1, 'LOW', d(10), 'Retouche', '5 000']];
for (const [ci, prio, date, desc, price] of orders) {
  await p.getByRole('button', { name: 'Nouvelle commande' }).first().click(); await p.waitForTimeout(500);
  await p.selectOption('#order-customer', { index: ci }); await p.selectOption('#order-priority', prio);
  await p.fill('#order-expected', date);
  await p.locator('input[id$="-desc"]').first().fill(desc); await p.locator('input[id$="-price"]').first().fill(price);
  await p.locator('[role=dialog] button[type=submit]').last().click(); await p.waitForTimeout(900);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
}
// paiement + reçu sur la première commande
await p.goto(B + '/commandes', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
await p.locator('section[aria-label="Enregistrée"] article').first().locator('button').first().click(); await p.waitForTimeout(900);
await p.getByRole('button', { name: /Encaisser/ }).first().click(); await p.waitForTimeout(400);
await p.locator('#pay-amount').fill('100000'); await p.selectOption('#pay-method', 'ORANGE_MONEY'); await p.fill('#pay-note', 'Acompte à la commande');
await p.locator('[role=dialog]').last().getByRole('button', { name: 'Encaisser' }).click(); await p.waitForTimeout(800);
await p.getByRole('button', { name: /^Reçu$/ }).first().click(); await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Fermer' }).last().click(); await p.waitForTimeout(400);
// rendez-vous aujourd'hui et demain
await p.goto(B + '/rdv', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
for (const [day, type, h] of [[0, 'FITTING', '17:30'], [1, 'DELIVERY', '10:00']]) {
  await p.getByRole('button', { name: 'Nouveau rendez-vous' }).click(); await p.waitForTimeout(500);
  await p.selectOption('#appointment-customer', { index: 1 }); await p.waitForTimeout(150);
  await p.selectOption('#appointment-type', type);
  await p.fill('#appointment-starts', `${d(day)}T${h}`);
  await p.fill('#appointment-note', 'Apporter le tissu et les chaussures pour vérifier la longueur du pantalon');
  await p.getByRole('button', { name: 'Planifier' }).last().click(); await p.waitForTimeout(900);
}
// tissu
await p.goto(B + '/stock', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Nouveau tissu' }).first().click(); await p.waitForTimeout(400);
await p.fill('#fabric-name', 'Bazin riche getzner extra brillant'); await p.fill('#fabric-color', 'Bleu nuit'); await p.fill('#fabric-supplier', 'Marché HLM Dakar');
await p.fill('#fabric-price', '7500'); await p.fill('#fabric-initial', '12,5');
await p.locator('[role=dialog] button[type=submit]').last().click(); await p.waitForTimeout(900);
await ctx.storageState({ path: './audit-output/state.json', indexedDB: true });
console.log('seed ok, erreurs:', errs);
await browser.close();
