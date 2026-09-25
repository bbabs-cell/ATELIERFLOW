import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
const raw = fs.readFileSync(envPath, 'utf8');
const get = (k) => { const m = raw.match(new RegExp('^' + k + '=("?)(.*)\\1$', 'm')); return m ? m[2] : null; };
const API = get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL');
const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || get('SUPABASE_ANON_KEY');
const SROLE = get('SUPABASE_SERVICE_ROLE_KEY') || get('SERVICE_ROLE_KEY');

async function req(method, url, { headers = {}, body } = {}) {
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) data = await r.json().catch(() => null);
  return { status: r.status, data };
}

(async () => {
  const ts = Date.now();
  const email = `h${ts}@atelierflow.test`;
  const pass = 'HookTest-1234';

  const H = { apikey: ANON, 'Content-Type': 'application/json' };
  const SH = { apikey: SROLE, Authorization: `Bearer ${SROLE}`, 'Content-Type': 'application/json' };

  const s = await req('POST', `${API}/auth/v1/admin/users`, { headers: SH, body: { email, password: pass, email_confirm: true } });
  console.log('admin create    :', s.status, s.data && (s.data.id || s.data.msg || s.data.error_description) || '');
  const uid = s.data && s.data.id;
  if (!uid) process.exit(2);

  const t0 = await req('POST', `${API}/auth/v1/token?grant_type=password`, { headers: H, body: { email, password: pass } });
  console.log('login           :', t0.status, t0.data && (t0.data.access_token ? 'OK' : JSON.stringify(t0.data)));
  const tokA = t0.data && t0.data.access_token;
  const refTok = t0.data && t0.data.refresh_token;
  if (!tokA) process.exit(2);

  const UH = { apikey: ANON, Authorization: `Bearer ${tokA}`, 'Content-Type': 'application/json' };
  const o = await req('POST', `${API}/rest/v1/rpc/create_owner_tenant`, { headers: UH, body: { p_name: `Atelier Hook ${ts}` } });
  console.log('create tenant   :', o.status, o.status < 300 ? 'OK tid=' + o.data : JSON.stringify(o.data));

  const t2 = await req('POST', `${API}/auth/v1/token?grant_type=refresh_token`, { headers: H, body: { refresh_token: refTok } });
  console.log('refresh (hook)  :', t2.status, t2.data && (t2.data.access_token ? 'OK' : JSON.stringify(t2.data)));
  const token = t2.data && t2.data.access_token;
  if (!token) process.exit(2);

  const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  console.log('JWT claims      : sub=' + payload.sub);
  console.log('JWT tenant_id   :', payload.tenant_id ? 'PRESENT ' + payload.tenant_id : 'ABSENT');
  console.log('JWT membership  :', payload.membership_role ? 'PRESENT ' + payload.membership_role : 'ABSENT');
  console.log('TEST_USER       :', JSON.stringify({ uid, email, pass }));
})();