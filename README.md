# Invitación de casamiento: Ale & Luli

Página de una sola vista servida desde **Cloudflare Workers** (assets estáticos + un Worker mínimo). El Worker sirve los archivos de `public/` y expone `POST /api/rsvp`, que valida cada confirmación y la reenvía al webhook de n8n. La URL del webhook queda guardada como secreto en Cloudflare, nunca en el navegador.

## Estructura

```
public/             Sitio estático (lo que se sirve)
  index.html
  css/styles.css
  js/main.js        Cuenta regresiva, calendario, lugar, modal y formulario (bloque CONFIG al inicio)
  img/              Fotos optimizadas y og.jpg (preview para WhatsApp y redes)
  _headers          Cabeceras de seguridad para los assets
src/index.js        Worker: sirve assets y proxy /api/rsvp -> n8n
wrangler.jsonc      Configuración de Cloudflare Workers
source/             Archivos originales (fotos en alta y paleta). No se publican.
```

## Configuración de la invitación

Todo lo que cambia está en el bloque `CONFIG` al inicio de `public/js/main.js`:

| Campo | Qué es |
|---|---|
| `eventStart` / `eventEnd` | Inicio y fin del evento, con zona horaria. Mueven la cuenta regresiva y el evento del calendario. |
| `venue.name` / `venue.address` | Nombre y dirección del lugar. Mientras `name` esté vacío, la página muestra "A confirmar" y el link de Google Maps queda desactivado. |
| `venue.location` | Dirección completa que se usa en el evento del calendario. |
| `venue.mapsDestination` | Destino en Google Maps. Hoy son coordenadas, porque también existe una calle Olaguer y Feliú en CABA. |
| `rsvpDeadline` | Fecha límite de confirmación, tal como se muestra en el texto. |
| `rsvpEndpoint` | Adónde se envían las confirmaciones. Por defecto `/api/rsvp` (el Worker). |

Además, en `public/index.html`:

- La línea del horario ("A partir de las 20:00 hs.") y el lugar dentro de la sección "Cuándo y dónde" (el HTML trae los mismos valores que `CONFIG` para que se vean sin JavaScript).
- Las etiquetas `og:url` y `og:image` en el `<head>`: reemplazá `https://TU-DOMINIO` por la URL real del sitio para que el preview en WhatsApp muestre la foto.

## Formulario y n8n

El Worker recibe el formulario en `/api/rsvp`, valida los campos, descarta bots (campo honeypot `website`) y hace un `POST` con JSON al webhook:

```json
{
  "nombre": "Ana",
  "apellido": "Pérez",
  "asistencia": "si",
  "restricciones": "Sin TACC",
  "cancion": "Tema y artista",
  "mensaje": "…",
  "enviado_en": "2026-10-01T18:22:10.000Z",
  "origen": "alejandro-y-lucila.tu-cuenta.workers.dev"
}
```

Si `asistencia` es `"no"`, `restricciones` y `cancion` llegan vacíos.

En n8n, nodo **Webhook**:

1. HTTP Method: `POST`.
2. Respond: `Immediately`.
3. No hace falta configurar CORS: la llamada la hace el Worker, no el navegador.
4. Conectá lo que quieras después: Google Sheets (Append row), Notion, un mail o un mensaje de Telegram por cada confirmación.
5. Copiá la **Production URL** del webhook y guardala como secreto del Worker (ver abajo). Activá el workflow.

### Secreto `N8N_WEBHOOK_URL`

En producción:

```bash
npx wrangler secret put N8N_WEBHOOK_URL
```

O desde el dashboard: Workers & Pages > alejandro-y-lucila > Settings > Variables & Secrets.

Sin el secreto, el Worker responde 503 y el formulario muestra un error en vez de un falso éxito.

En local, copiá `.dev.vars.example` a `.dev.vars` y completá la URL (podés usar la Test URL de n8n).

## Desarrollo local

Wrangler necesita Node 22 o superior. Hay un `.node-version` en la raíz: con nvm, `nvm use` alcanza.

```bash
npm install
npm run dev        # http://localhost:8787, con el Worker y /api/rsvp funcionando
npm run check      # valida la configuración y arma el bundle sin deployar
```

## Deploy automático

El repo está conectado a Cloudflare con **Workers Builds** (Workers & Pages > Create > Import a repository):

- Cada push a `main` deploya. Las otras ramas generan previews (`preview_urls` está activado en `wrangler.jsonc`).
- Build command vacío y deploy command `npx wrangler deploy` (el default). Usa la versión de wrangler del `package.json`.
- El `name` de `wrangler.jsonc` tiene que coincidir con el nombre del Worker en el dashboard.
- El secreto `N8N_WEBHOOK_URL` se carga en Settings > Variables & Secrets.

### Deploy manual

```bash
npx wrangler login
npm run deploy
```

## Dominio propio

Cuando tengan dominio, descomentá `routes` en `wrangler.jsonc` con el subdominio elegido (la zona tiene que estar en Cloudflare) y volvé a deployar. Después actualizá `og:url` y `og:image` en `public/index.html`.
