/**
 * Worker de la invitación.
 *
 * - Sirve los archivos estáticos de `public/` (binding ASSETS).
 * - Expone `POST /api/rsvp`, que valida la confirmación y la reenvía al webhook de n8n.
 *   La URL del webhook vive en el secreto N8N_WEBHOOK_URL, nunca en el navegador,
 *   y como la llamada es servidor a servidor no hace falta configurar CORS en n8n.
 */

const MAX_BODY_BYTES = 8 * 1024;
const LIMITS = { nombre: 120, restricciones: 300, cancion: 200, mensaje: 1000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/rsvp') return handleRsvp(request, env, url);
    if (url.pathname.startsWith('/api/')) return json({ error: 'No encontrado' }, 404);

    return env.ASSETS.fetch(request);
  }
};

async function handleRsvp(request, env, url) {
  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405, { Allow: 'POST' });
  }

  // Solo aceptamos envíos desde la propia página.
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) {
    return json({ error: 'Origen no permitido' }, 403);
  }

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY_BYTES) return json({ error: 'Cuerpo demasiado grande' }, 413);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Cuerpo demasiado grande' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: 'JSON inválido' }, 400);

  // Honeypot: si un bot completó el campo oculto, respondemos OK sin reenviar nada.
  if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true });

  const asistencia = body.asistencia === 'si' ? 'si' : body.asistencia === 'no' ? 'no' : '';
  const data = {
    nombre: clean(body.nombre, LIMITS.nombre),
    asistencia,
    restricciones: asistencia === 'si' ? clean(body.restricciones, LIMITS.restricciones) : '',
    cancion: asistencia === 'si' ? clean(body.cancion, LIMITS.cancion) : '',
    mensaje: clean(body.mensaje, LIMITS.mensaje)
  };
  if (!data.nombre || !data.asistencia) {
    return json({ error: 'Faltan nombre o asistencia' }, 400);
  }

  if (!env.N8N_WEBHOOK_URL) {
    console.error('Falta el secreto N8N_WEBHOOK_URL');
    return json({ error: 'El formulario todavía no está conectado' }, 503);
  }

  const payload = { ...data, enviado_en: new Date().toISOString(), origen: url.hostname };

  let upstream;
  try {
    upstream = await fetch(env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('No se pudo contactar a n8n', err);
    return json({ error: 'No se pudo contactar a n8n' }, 502);
  }
  if (!upstream.ok) {
    console.error('n8n respondió ' + upstream.status);
    return json({ error: 'n8n respondió ' + upstream.status }, 502);
  }

  return json({ ok: true });
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}
