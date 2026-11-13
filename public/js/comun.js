// Utilidades compartidas del navegador.
// Los textos de categoría y estatus deben coincidir con src/catalogo.js.
const RC = {
  CENTRO: { lat: 20.9986, lng: -100.3843, zoom: 15 },
  CATEGORIAS: {
    bache: 'Bache',
    fuga: 'Fuga de agua',
    alumbrado: 'Alumbrado',
    coladera: 'Coladera',
    otro: 'Otro',
  },
  ESTATUS: {
    recibido: 'Recibido',
    inspeccionado: 'Inspeccionado',
    enviado: 'Enviado al municipio',
    reparado: 'Reparado',
  },
  ORDEN: ['recibido', 'inspeccionado', 'enviado', 'reparado'],
  COLORES: {
    recibido: '#d97706',
    inspeccionado: '#1d4ed8',
    enviado: '#7c3aed',
    reparado: '#15803d',
  },
  fecha(iso) {
    if (!iso) return '';
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return '';
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Mexico_City',
    }).format(fecha);
  },
  textoArea(cm2) {
    if (cm2 == null || Number.isNaN(Number(cm2))) return '—';
    const n = Number(cm2);
    const fmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
    return `${fmt.format(n)} cm² (${fmt.format(n / 10000)} m²)`;
  },
  numero(valor) {
    const texto = String(valor ?? '').trim();
    if (!texto) return null;
    const n = Number(texto.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  },
  icono(color) {
    return L.divIcon({
      className: 'marcador',
      html: `<span class="marcador-punto" style="background:${color}"></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12],
    });
  },
  async json(url, opciones = {}) {
    const headers = { ...(opciones.headers || {}) };
    if (opciones.body && !(opciones.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const respuesta = await fetch(url, { ...opciones, headers });
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(cuerpo.error || 'No se pudo completar la acción.');
    }
    return cuerpo;
  },
  galeria(contenedor, fotos, textoAlt) {
    contenedor.replaceChildren();
    if (!fotos.length) {
      const vacio = document.createElement('p');
      vacio.className = 'ayuda';
      vacio.textContent = 'Sin fotos.';
      contenedor.appendChild(vacio);
      return;
    }
    fotos.forEach((foto) => {
      const enlace = document.createElement('a');
      enlace.href = foto.url;
      enlace.target = '_blank';
      enlace.rel = 'noopener';
      const img = document.createElement('img');
      img.src = foto.url;
      img.alt = textoAlt;
      enlace.appendChild(img);
      contenedor.appendChild(enlace);
    });
  },
  mapaBase(id, lat, lng, zoom) {
    const mapa = L.map(id, { scrollWheelZoom: false, zoomControl: false }).setView([lat, lng], zoom || 16);
    L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    setTimeout(() => mapa.invalidateSize(), 150);
    return mapa;
  },
};
