#!/usr/bin/env node
/**
 * Audit mobile à 375 px — débordements horizontaux et boutons écrasés.
 *
 * Usage :
 *   node audit-debordement.mjs <url-de-base> <chemin> [<chemin>…]
 *   node audit-debordement.mjs http://localhost:3000 /dashboard /dashboard/commandes
 *
 * Options (variables d'environnement) :
 *   AUDIT_COOKIE   « nom=valeur » de la session, pour les pages connectées
 *                  (le copier depuis le navigateur ou une connexion scriptée)
 *   AUDIT_WIDTH    largeur d'écran (375 par défaut)
 *   AUDIT_SHOTS    dossier où écrire une capture pleine page par chemin
 *   CHROMIUM_PATH  exécutable Chromium (/opt/pw-browsers/chromium par défaut
 *                  s'il existe, sinon celui de Playwright)
 *
 * Code de sortie 1 s'il y a au moins un problème : utilisable en CI.
 *
 * Pourquoi « boutons écrasés » en plus du débordement : sur MagyaPro, quatre
 * boutons coincés dans une cellule de tableau mobile ne débordaient pas — ils
 * rétrécissaient jusqu'à ce que leur texte se casse lettre par lettre. Un
 * audit de débordement seul les déclarait conformes.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  ({ chromium } = await import('playwright'));
}

const [base, ...paths] = process.argv.slice(2);
if (!base || paths.length === 0) {
  console.error('Usage : node audit-debordement.mjs <url-de-base> <chemin> [<chemin>…]');
  process.exit(2);
}

const width = Number(process.env.AUDIT_WIDTH ?? 375);
const shots = process.env.AUDIT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({
  viewport: { width, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
if (process.env.AUDIT_COOKIE) {
  const [name, ...rest] = process.env.AUDIT_COOKIE.split('=');
  await context.addCookies([{ name, value: rest.join('='), url: base }]);
}

let problems = 0;
for (const path of paths) {
  const page = await context.newPage();
  const url = new URL(path, base).toString();
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    if (response && response.status() >= 400) {
      console.log(`✗ ${path} — HTTP ${response.status()}`);
      problems += 1;
      continue;
    }
    const finalPath = new URL(page.url()).pathname;
    const redirected = finalPath !== new URL(url).pathname ? ` (redirigé vers ${finalPath})` : '';

    const issues = await page.evaluate((vw) => {
      const out = [];
      // Pas `innerWidth` : en émulation mobile, une page trop large fait
      // dézoomer le navigateur, et `innerWidth` grandit avec elle.
      const describe = (el) => {
        const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : '';
        return `<${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}> « ${text} »`;
      };
      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      // Ignore ce qui est dans un conteneur à défilement horizontal voulu.
      const inScroller = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
        }
        return false;
      };

      const sw = document.documentElement.scrollWidth;
      if (sw > vw + 1) out.push(`défilement horizontal de la page : ${sw}px pour ${vw}px`);

      const seen = new Set();
      for (const el of document.body.querySelectorAll('*')) {
        if (!visible(el) || inScroller(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
          // Ne signaler que l'élément le plus haut qui déborde.
          let p = el.parentElement;
          let parentOverflows = false;
          while (p) {
            const pr = p.getBoundingClientRect();
            if (pr.right > vw + 1 || pr.left < -1) { parentOverflows = true; break; }
            p = p.parentElement;
          }
          if (!parentOverflows && !seen.has(el)) {
            seen.add(el);
            out.push(`dépasse l'écran (${Math.round(r.left)}→${Math.round(r.right)}px) : ${describe(el)}`);
          }
        }
      }

      for (const el of document.querySelectorAll('button, a[class*="rounded"], [role="button"]')) {
        if (!visible(el)) continue;
        const s = getComputedStyle(el);
        const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.4;
        const pad = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom);
        const r = el.getBoundingClientRect();
        const lines = (r.height - pad) / lh;
        const text = (el.innerText || '').trim();
        // Plus de deux lignes pour un libellé court, ou un bouton plus étroit
        // que son plus long mot : le texte se casse.
        const longestWord = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
        if (text && ((lines > 2.2 && text.length < 40) || (longestWord > 3 && r.width < 28))) {
          out.push(`bouton écrasé (${Math.round(r.width)}×${Math.round(r.height)}px, ~${lines.toFixed(1)} lignes) : ${describe(el)}`);
        }
      }
      return out;
    }, width);

    if (shots) {
      await page.screenshot({ path: join(shots, `${path.replace(/[^a-z0-9]+/gi, '_') || 'accueil'}.png`), fullPage: true });
    }
    if (issues.length === 0) {
      console.log(`✓ ${path}${redirected}`);
    } else {
      problems += issues.length;
      console.log(`✗ ${path}${redirected}`);
      for (const issue of issues) console.log(`    – ${issue}`);
    }
  } catch (error) {
    problems += 1;
    console.log(`✗ ${path} — ${error.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(problems === 0 ? `\nAucun problème à ${width}px.` : `\n${problems} problème(s) à ${width}px.`);
process.exit(problems === 0 ? 0 : 1);
