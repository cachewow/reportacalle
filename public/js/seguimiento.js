const forma = document.getElementById('buscar');
const entrada = document.getElementById('folio-buscar');
const error = document.getElementById('error-folio');
const ficha = document.getElementById('ficha');
let mapaFicha = null;
let marcadorFicha = null;

function folioDeLaUrl() {
  const partes = location.pathname.split('/').filter(Boolean);
  if (partes[0] !== 'folio' || !partes[1]) return '';
  return decodeURIComponent(partes[1]).toUpperCase();
}

function medida(valor, unidad) {
  if (valor == null) return '—';
  return `${valor} ${unidad}`;
}

function dibujarLinea(estatus) {
  const linea = document.getElementById('linea');
  linea.replaceChildren();
  const actual = RC.ORDEN.indexOf(estatus);
  RC.ORDEN.forEach((clave, indice) => {
    const item = document.createElement('li');
    item.textContent = RC.ESTATUS[clave];
    if (indice < actual) item.className = 'hecho';
    if (indice === actual) item.className = 'actual';
    linea.appendChild(item);
  });
}

async function mostrar(folio) {
  error.hidden = true;
  ficha.hidden = true;
  const reporte = await RC.json(`/api/reportes/${encodeURIComponent(folio)}`);
  document.getElementById('ficha-folio').textContent = reporte.folio;
  document.getElementById('ficha-tipo').textContent = reporte.categoriaTexto;
  const estado = document.getElementById('ficha-estado');
  estado.textContent = reporte.estatusTexto;
  estado.className = `estado estado-${reporte.estatus}`;
  dibujarLinea(reporte.estatus);
  document.getElementById('ficha-fecha').textContent = `Recibido el ${RC.fecha(reporte.creadoEn)}.`;
  document.getElementById('ficha-desc').textContent = reporte.descripcion;
  const maps = document.getElementById('ficha-mapa');
  maps.href = `https://www.google.com/maps?q=${reporte.lat},${reporte.lng}`;
  RC.galeria(
    document.getElementById('fotos-vecino'),
    reporte.fotos.filter((f) => f.origen === 'vecino'),
    'Foto del reporte'
  );

  const huboInspeccion = reporte.estatus !== 'recibido'
    || reporte.recomendacion
    || reporte.largoCm != null
    || reporte.fotos.some((f) => f.origen === 'inspeccion');
  const bloque = document.getElementById('bloque-inspeccion');
  bloque.hidden = !huboInspeccion;
  ficha.hidden = false;
  if (huboInspeccion) {
    document.getElementById('m-largo').textContent = medida(reporte.largoCm, 'cm');
    document.getElementById('m-ancho').textContent = medida(reporte.anchoCm, 'cm');
    document.getElementById('m-prof').textContent = medida(reporte.profundidadCm, 'cm');
    document.getElementById('m-area').textContent = RC.textoArea(reporte.areaCm2);
    document.getElementById('ficha-recomendacion').textContent = reporte.recomendacion || 'Todavía no hay una recomendación.';
    RC.galeria(
      document.getElementById('fotos-inspeccion'),
      reporte.fotos.filter((f) => f.origen === 'inspeccion'),
      'Foto de la inspección'
    );
    const envio = document.getElementById('ficha-envio');
    envio.textContent = reporte.enviadoEn
      ? `Enviado al municipio el ${RC.fecha(reporte.enviadoEn)}.`
      : '';
  }

  if (typeof L !== 'undefined') {
    if (!mapaFicha) {
      mapaFicha = RC.mapaBase('mapa-folio', reporte.lat, reporte.lng, 16);
      marcadorFicha = L.marker([reporte.lat, reporte.lng], {
        icon: RC.icono(RC.COLORES[reporte.estatus] || '#0c6b4d'),
      }).addTo(mapaFicha);
    } else {
      mapaFicha.setView([reporte.lat, reporte.lng], 16);
      marcadorFicha.setLatLng([reporte.lat, reporte.lng]);
      marcadorFicha.setIcon(RC.icono(RC.COLORES[reporte.estatus] || '#0c6b4d'));
    }
    setTimeout(() => mapaFicha.invalidateSize(), 200);
  }
}

forma.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const folio = entrada.value.trim().toUpperCase();
  if (!folio) return;
  location.assign(`/folio/${encodeURIComponent(folio)}`);
});

const porQuery = new URLSearchParams(location.search).get('folio');
if (!folioDeLaUrl() && porQuery) {
  location.replace(`/folio/${encodeURIComponent(porQuery.trim().toUpperCase())}`);
}

const inicial = folioDeLaUrl();
if (inicial) {
  entrada.value = inicial;
  mostrar(inicial).catch((e) => {
    error.hidden = false;
    error.textContent = e.message;
  });
}
