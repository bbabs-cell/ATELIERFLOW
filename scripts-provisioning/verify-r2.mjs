// Vérifie le bucket Cloudflare R2 une fois provisionné (étape 05).
// Usage : node --env-file=.env.local scripts-provisioning/verify-r2.mjs
// Lit les mêmes variables que src/infrastructure/files/r2.ts. N'écrit qu'un
// objet sonde sous `_provisioning/` (hors `tenants/`), retiré à la fin.
// N'affiche jamais les identifiants.
import { AwsClient } from 'aws4fetch';

const env = (k) => process.env[k]?.trim() || '';
const accountId = env('R2_ACCOUNT_ID');
const bucket = env('R2_BUCKET');
const accessKeyId = env('R2_ACCESS_KEY_ID');
const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
const endpoint = (env('R2_ENDPOINT') || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');

const missing = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter((k) => !env(k) && !(k === 'R2_ACCOUNT_ID' && env('R2_ENDPOINT')));
if (missing.length) {
  console.log('config           : MANQUANT ' + missing.join(', '));
  process.exit(2);
}

const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
const stamp = Date.now();
const url = `${endpoint}/${bucket}/_provisioning/probe-${stamp}.txt`;
const otherUrl = `${endpoint}/${bucket}/_provisioning/autre-${stamp}.txt`;
const body = `sonde ${new Date().toISOString()}`;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${label.padEnd(17)}: ${ok ? 'PASS' : 'FAIL'}${detail ? ' ' + detail : ''}`);
};

(async () => {
  console.log(`config           : bucket=${bucket} endpoint=${new URL(endpoint).host}`);

  const put = await client.fetch(url, { method: 'PUT', body, headers: { 'content-type': 'text/plain' } });
  check('écriture signée', put.ok, String(put.status));
  if (!put.ok) {
    console.log('                   → jeton sans droit d\'écriture sur ce bucket, ou nom de bucket erroné');
    process.exit(1);
  }

  try {
    const putOther = await client.fetch(otherUrl, { method: 'PUT', body: 'autre', headers: { 'content-type': 'text/plain' } });
    check('écriture 2e objet', putOther.ok, String(putOther.status));

    const signed = await client.sign(`${url}?X-Amz-Expires=600`, { method: 'GET', aws: { signQuery: true } });
    const read = await fetch(signed.url);
    check('lien signé', read.ok && (await read.text()) === body, String(read.status));

    const anon = await fetch(url);
    check('accès anonyme', anon.status === 400 || anon.status === 401 || anon.status === 403, `${anon.status} (refus attendu)`);

    const tampered = new URL(signed.url);
    tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
    const bad = await fetch(tampered);
    check('lien falsifié', bad.status === 403 || bad.status === 400, `${bad.status} (refus attendu)`);

    // Le lien de la sonde, réutilisé pour un AUTRE objet existant : doit être refusé.
    const otherKey = new URL(signed.url);
    otherKey.pathname = new URL(otherUrl).pathname;
    const swapped = await fetch(otherKey);
    check('lien détourné', swapped.status === 403 || swapped.status === 400, `${swapped.status} (un lien ne vaut que pour sa clé)`);
  } finally {
    for (const target of [url, otherUrl]) {
      const del = await client.fetch(target, { method: 'DELETE' });
      check('nettoyage sonde', del.ok || del.status === 404, String(del.status));
    }
  }

  console.log(failed ? `RÉSULTAT         : ${failed} échec(s)` : 'RÉSULTAT         : R2 prêt (bucket privé, liens signés)');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.log('erreur           :', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
