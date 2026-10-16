/**
 * cthubvip
 * Recebe PageView e Lead da LP do Grupo VIP (CT Hub Fitness) e reenvia
 * server-side para a Meta Conversions API, com o mesmo event_id usado no
 * fbq() do navegador (deduplicação automática).
 *
 * Cada evento leva user_data: IP, navegador, fbp, fbc e external_id (hash).
 * Evento sem nenhum identificador (fbp, fbc, external_id) é recusado.
 *
 * Env vars (wrangler secret / vars):
 *   META_ACCESS_TOKEN -> token da API de Conversões (secret)
 *   PIXEL_ID          -> 1000596334599100 (var)
 *   ALLOWED_ORIGIN    -> domínios da LP, separados por vírgula (var)
 *   TEST_EVENT_CODE   -> opcional, código do Testar eventos
 *   GRAPH_VERSION     -> opcional, versão da Graph API (padrão v24.0)
 */

// Valores padrão: permitem colar este arquivo direto no editor da Cloudflare
// (sem wrangler.toml). Variáveis de ambiente com o mesmo nome têm prioridade.
const DEFAULT_PIXEL_ID = '1000596334599100';
const DEFAULT_ALLOWED_ORIGIN = 'https://cthubfitnessvip.netlify.app,https://claude-funny-allen-fjq6z7--cthubfitnessvip.netlify.app';
const DEFAULT_GRAPH_VERSION = 'v24.0';
const ALLOWED_EVENTS = ['PageView', 'Lead'];
const IDENTIFIER_KEYS = ['fbp', 'fbc', 'external_id'];

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = allowedOrigins(env);
  const allow = list.length === 0 ? '*' : list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/** Log sem dados pessoais: só nome do evento, chaves presentes e resultado. */
function log(entry) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isHashed = (value) => /^[a-f0-9]{64}$/.test(value);
const validFbp = (v) => typeof v === 'string' && /^fb\.\d\.\d+\.\d+$/.test(v);
const validFbc = (v) => typeof v === 'string' && /^fb\.\d\.\d+\.[A-Za-z0-9_-]+$/.test(v) && v.length <= 500;

function cleanUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().slice(0, 1000) : '';
  } catch (e) {
    return '';
  }
}

async function buildUserData(request, fields) {
  const userData = {};
  const ip = request.headers.get('CF-Connecting-IP');
  const ua = request.headers.get('User-Agent');
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;
  if (validFbp(fields.fbp)) userData.fbp = fields.fbp;
  if (validFbc(fields.fbc)) userData.fbc = fields.fbc;
  if (fields.external_id) {
    const id = String(fields.external_id).trim().toLowerCase().slice(0, 100);
    if (id) userData.external_id = isHashed(id) ? id : await sha256Hex(id);
  }
  return userData;
}

async function sendToMeta(env, eventEntry) {
  const version = env.GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  // O token vai no corpo, nunca na URL (URLs aparecem em logs).
  const payload = { data: [eventEntry], access_token: env.META_ACCESS_TOKEN };
  if (env.TEST_EVENT_CODE) payload.test_event_code = env.TEST_EVENT_CODE;

  const metaRes = await fetch(`https://graph.facebook.com/${version}/${env.PIXEL_ID || DEFAULT_PIXEL_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: metaRes.status, data: await metaRes.json() };
}

async function handleEvent(request, env, headers) {
  let body;
  try {
    body = (await request.json()) || {};
  } catch (e) {
    return jsonResponse({ error: 'invalid_json' }, 400, headers);
  }
  const { event_name, event_id } = body;

  if (!ALLOWED_EVENTS.includes(event_name) || typeof event_id !== 'string' || !event_id || event_id.length > 100) {
    return jsonResponse({ error: 'invalid_event_name_or_event_id', allowed: ALLOWED_EVENTS }, 400, headers);
  }
  if (!env.META_ACCESS_TOKEN) {
    return jsonResponse({ error: 'server_not_configured' }, 500, headers);
  }

  const userData = await buildUserData(request, body);
  if (!IDENTIFIER_KEYS.some((k) => userData[k])) {
    log({ event: event_name, rejected: 'no_user_data', keys: Object.keys(userData) });
    return jsonResponse({ error: 'missing_user_data', required_one_of: IDENTIFIER_KEYS }, 422, headers);
  }

  const eventEntry = {
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id,
    action_source: 'website',
    user_data: userData,
  };
  const eventSourceUrl = cleanUrl(body.event_source_url);
  if (eventSourceUrl) eventEntry.event_source_url = eventSourceUrl;
  if (event_name === 'Lead') {
    eventEntry.custom_data = { content_name: 'Grupo VIP Inauguração', value: 1, currency: 'BRL' };
  }

  try {
    const { status, data } = await sendToMeta(env, eventEntry);
    log({ event: event_name, keys: Object.keys(userData), status, received: data && data.events_received });
    return jsonResponse(data, status, headers);
  } catch (err) {
    log({ event: event_name, error: 'meta_request_failed' });
    return jsonResponse({ error: 'meta_request_failed' }, 502, headers);
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname.endsWith('/health')) return new Response('ok', { status: 200, headers });
    if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, headers);
    return handleEvent(request, env, headers);
  },
};
