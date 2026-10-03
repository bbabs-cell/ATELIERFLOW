const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
export const B = process.env.AUDIT_BASE_URL ?? 'http://localhost:3104';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function session() {
  const now = Math.floor(Date.now() / 1000);
  const owner = { sub: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'proprietaire.atelier@exemple-couture.sn', tenant_id: 'bbbbbbbb-0000-4000-8000-000000000099', membership_role: 'OWNER', exp: now + 7200 };
  return JSON.stringify({ access_token: `${b64({ alg: 'HS256' })}.${b64(owner)}.sig`, refresh_token: 'r', token_type: 'bearer', expires_in: 7200, expires_at: now + 7200, user: { id: owner.sub, email: owner.email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
}
export async function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}
export async function context(browser, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width <= 1024, isMobile: viewport.width <= 480, deviceScaleFactor: 1, storageState: opts.storageState, timezoneId: 'Africa/Dakar', locale: 'fr-FR' });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('atelier-auth')) localStorage.setItem('atelier-auth', s); }, session());
  const team = { can_manage: true, invitations: [{ id: 'i1', email: 'invitee.tres.longue.adresse@exemple-couture.sn', role: 'EMPLOYEE', status: 'PENDING', expires_at: new Date(Date.now() + 5 * 864e5).toISOString(), created_at: new Date().toISOString() }], members: [
    { id: 'm1', profile_id: 'aaaaaaaa-0000-4000-8000-000000000001', full_name: 'Abdou Diop', email: 'proprietaire.atelier@exemple-couture.sn', role: 'OWNER', status: 'ACTIVE', joined_at: null, is_self: true },
    { id: 'm2', profile_id: 'eeeeeeee-0000-4000-8000-000000000002', full_name: 'Mame Diarra Bousso Ndiaye-Sarr', email: 'mame.diarra@exemple-couture.sn', role: 'EMPLOYEE', status: 'ACTIVE', joined_at: null, is_self: false } ] };
  await ctx.route('**/rest/v1/rpc/list_team**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(team) }));
  await ctx.route('**/rest/v1/tenants**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ name: 'Top Couture chez Abdou — Haute couture africaine', settings: { receipt: { phone: '+221 33 820 00 00', address: 'Médina, rue 6 angle rue 11 — Dakar, Sénégal', footer: null } } }]) }));
  await ctx.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('**/api/sync', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"OFFLINE_TEST"}}' }));
  await ctx.route('**/api/files**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }));
  return ctx;
}

/** Mesures dans la page : débordements, texte coupé, petites cibles tactiles. */
export async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const desc = (el) => {
      const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 4).join('.');
      const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` « ${txt} »` : ''}`;
    };
    const hiddenDeco = (el) => el.closest('[aria-hidden="true"]') !== null || el.closest('.sr-only') !== null;
    const clippedByAncestor = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible') return true;
      }
      return false;
    };
    const overflow = [], clipped = [], small = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || hiddenDeco(el)) continue;
      if ((r.right > vw + 1 || r.left < -1) && !clippedByAncestor(el) && s.position !== 'fixed') {
        const d = desc(el); if (!seen.has('o' + d)) { seen.add('o' + d); overflow.push(`${d} [${Math.round(r.left)}→${Math.round(r.right)} / ${vw}]`); }
      }
      // Texte réellement coupé : la zone du texte dépasse l'ancêtre qui le rogne (overflow hidden/clip),
      // sans points de suspension voulus.
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (hasText && !['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(el.tagName) && s.textOverflow !== 'ellipsis') {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === 'hidden' || ps.overflowX === 'clip' || ps.overflowY === 'hidden' || ps.overflowY === 'clip') {
            const pr = p.getBoundingClientRect();
            const bl = parseFloat(ps.borderLeftWidth) || 0, br = parseFloat(ps.borderRightWidth) || 0;
            if (tr.right > pr.right - br + 1.5 || tr.left < pr.left + bl - 1.5) {
              const d = desc(el); if (!seen.has('c' + d)) { seen.add('c' + d); clipped.push(`${d} (texte ${Math.round(tr.width)}px dans ${Math.round(pr.width)}px)`); }
            }
            break;
          }
          if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') break;
        }
      }
      if (hasText && s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && r.width < 48) {
        const d = desc(el); if (!seen.has('e' + d)) { seen.add('e' + d); clipped.push('quasi illisible (' + Math.round(r.width) + 'px) ' + d); }
      }
      const interactive = el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary');
      if (interactive && !el.closest('.sr-only')) {
        const inlineLink = el.tagName === 'A' && s.display === 'inline';
        const target = el.matches('input[type=checkbox], input[type=radio]') ? el.parentElement.getBoundingClientRect() : r;
        if (!inlineLink && (target.height < 40 || target.width < 40) && r.right > 0 && r.left < vw) {
          const d = desc(el); if (!seen.has('s' + d)) { seen.add('s' + d); small.push(`${d} (${Math.round(target.width)}×${Math.round(target.height)})`); }
        }
      }
    }
    return { vw, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, overflow, clipped, small };
  });
}
