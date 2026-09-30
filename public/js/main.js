(function () {
  // =====================================================================
  // CONFIGURACIÓN: todo lo que puede cambiar vive acá.
  // =====================================================================
  var CONFIG = {
    eventStart: '2026-11-20T20:00:00-03:00',   // fecha y hora de inicio
    eventEnd:   '2026-11-21T05:00:00-03:00',   // fin estimado, para el evento del calendario
    title: 'Casamiento de Ale & Luli',
    details: 'Sin ceremonia, solo fiesta. Dress code cocktail. Confirmá tu asistencia en la invitación.',

    // Lugar. name y address se muestran en la página. location va al evento del calendario.
    // mapsDestination fuerza el destino en Google Maps: coordenadas, porque hay otra calle
    // Olaguer y Feliú en CABA y con el texto solo Google Maps puede elegir esa.
    venue: {
      name: 'Olaguer y Feliú 3180',
      address: 'Olivos, Provincia de Buenos Aires',
      location: 'Virrey Olaguer y Feliú 3180, B1602 Olivos, Provincia de Buenos Aires, Argentina',
      mapsDestination: '-34.5258148,-58.5046753'
    },

    rsvpDeadline: '20 de octubre de 2026',

    // Adónde se envían las confirmaciones. Por defecto es el Worker de este mismo sitio
    // (src/index.js), que reenvía a n8n usando el secreto N8N_WEBHOOK_URL.
    // También puede ser directamente la URL del webhook de n8n (en ese caso, habilitar CORS en n8n).
    rsvpEndpoint: '/api/rsvp'
  };

  var $ = function (s) { return document.querySelector(s); };

  // ---------- Cuenta regresiva ----------
  var target = new Date(CONFIG.eventStart).getTime();
  var cd = $('#countdown');
  function unit(n, one, many) { return '<b>' + n + '</b> ' + (n === 1 ? one : many); }
  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) { cd.textContent = 'Hoy nos casamos'; return; }
    var d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, m = Math.floor(diff / 6e4) % 60, s = Math.floor(diff / 1e3) % 60;
    cd.innerHTML = 'Faltan ' + unit(d, 'día', 'días') + ', ' + unit(h, 'hora', 'horas') + ', ' + unit(m, 'minuto', 'minutos') + ' y ' + unit(s, 'segundo', 'segundos');
    setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();

  // ---------- Calendario ----------
  function toUTC(iso) { return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  var locationText = CONFIG.venue.location || [CONFIG.venue.name, CONFIG.venue.address].filter(Boolean).join(', ');

  var params = new URLSearchParams({
    action: 'TEMPLATE',
    text: CONFIG.title,
    dates: toUTC(CONFIG.eventStart) + '/' + toUTC(CONFIG.eventEnd),
    details: CONFIG.details
  });
  if (locationText) params.set('location', locationText);
  $('#gcal-link').href = 'https://calendar.google.com/calendar/render?' + params.toString();

  // Archivo .ics para Apple Calendar, Outlook y otros. En los textos hay que escapar \ , ; y saltos de línea.
  function icsText(t) { return String(t).replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n'); }
  var ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ale y Luli//Casamiento//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:casamiento-alejandro-lucila-20261120@invitacion',
    'DTSTAMP:' + toUTC(new Date().toISOString()),
    'DTSTART:' + toUTC(CONFIG.eventStart),
    'DTEND:' + toUTC(CONFIG.eventEnd),
    'SUMMARY:' + icsText(CONFIG.title),
    'DESCRIPTION:' + icsText(CONFIG.details),
    'LOCATION:' + icsText(locationText),
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  $('#ics-link').href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));

  // ---------- Lugar ----------
  var v = CONFIG.venue, maps = $('#maps-link');
  if (v.name) {
    $('#venue-name').textContent = v.name;
    $('#venue-note').textContent = v.address;
    maps.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(v.mapsDestination || v.address || v.name);
    maps.removeAttribute('aria-disabled');
    $('#venue-help').hidden = true;
  }
  $('#rsvp-deadline').textContent = CONFIG.rsvpDeadline;

  // ---------- Modal de dress code ----------
  var dlg = $('#dc-dialog');
  $('#dc-open').addEventListener('click', function () { dlg.showModal(); });
  $('#dc-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  // ---------- Formulario ----------
  var form = $('#rsvp-form'), btn = $('#submit-btn'), formError = $('#form-error');
  var optionalOnAttend = [['restricciones', 'field-restricciones'], ['cancion', 'field-cancion']];
  var isLocal = !location.hostname || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  function setInvalid(id, invalid) {
    var input = $('#' + id), err = $('#err-' + id);
    var field = id === 'asistencia' ? $('#field-asistencia') : input.closest('.field');
    field.classList.toggle('invalid', invalid);
    err.hidden = !invalid;
    if (input) input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }
  $('#nombre').addEventListener('input', function () { if (this.value.trim()) setInvalid('nombre', false); });
  // Si no viene, restricciones y canción no aplican: se bloquean y se vacían.
  form.querySelectorAll('input[name="asistencia"]').forEach(function (r) {
    r.addEventListener('change', function () {
      setInvalid('asistencia', false);
      var attending = this.value === 'si';
      optionalOnAttend.forEach(function (p) {
        var input = $('#' + p[0]);
        input.disabled = !attending;
        if (!attending) input.value = '';
        $('#' + p[1]).classList.toggle('off', !attending);
      });
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formError.hidden = true;
    var data = {
      nombre: $('#nombre').value.trim(),
      asistencia: (form.querySelector('input[name="asistencia"]:checked') || {}).value || '',
      restricciones: $('#restricciones').value.trim(),
      cancion: $('#cancion').value.trim(),
      mensaje: $('#mensaje').value.trim()
    };
    var firstInvalid = null;
    [['nombre', !data.nombre], ['asistencia', !data.asistencia]].forEach(function (p) {
      setInvalid(p[0], p[1]);
      if (p[1] && !firstInvalid) firstInvalid = p[0];
    });
    if (firstInvalid) {
      (firstInvalid === 'asistencia' ? $('#asistencia-si') : $('#' + firstInvalid)).focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando…';

    var send;
    if ($('#website').value) {
      send = Promise.resolve(); // honeypot: los bots reciben éxito sin que se envíe nada
    } else if (CONFIG.rsvpEndpoint) {
      send = fetch(CONFIG.rsvpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, data, { enviado_en: new Date().toISOString(), origen: location.hostname }))
      }).then(function (r) {
        if (r.ok) return;
        return r.json().catch(function () { return {}; }).then(function (info) {
          throw new Error('HTTP ' + r.status + (info && info.error ? ': ' + info.error : ''));
        });
      });
    } else if (isLocal) {
      console.warn('RSVP: rsvpEndpoint vacío; en local se simula el envío.');
      send = new Promise(function (r) { setTimeout(r, 900); });
    } else {
      // En producción sin endpoint no simulamos: el invitado tiene que enterarse.
      send = Promise.reject(new Error('rsvpEndpoint no configurado'));
    }

    send.then(function () {
      form.hidden = true;
      $('#success-title').textContent = '¡Gracias, ' + data.nombre.split(/\s+/)[0] + '!';
      $('#success-text').textContent = data.asistencia === 'si'
        ? 'Ya anotamos que venís. Nos vemos el 20 de noviembre.'
        : 'Ya anotamos que no vas a poder venir. Gracias por avisarnos.';
      var ok = $('#rsvp-success');
      ok.hidden = false;
      ok.setAttribute('tabindex', '-1');
      ok.focus();
    }).catch(function (err) {
      console.error(err);
      formError.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Enviar confirmación';
    });
  });
})();
