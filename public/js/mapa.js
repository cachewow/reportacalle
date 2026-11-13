const lista = document.getElementById('lista-reportes');
const error = document.getElementById('error-mapa');

function tarjeta(reporte) {
  const enlace = document.createElement('a');
  enlace.className = 'item';
  enlace.href = `/folio/${reporte.folio}`;
  const titulo = document.createElement('strong');
  titulo.textContent = `${reporte.folio} · ${reporte.categoriaTexto}`;
  const estado = document.createElement('p');
  estado.textContent = reporte.estatusTexto;
  enlace.append(titulo, estado);
  return enlace;
}

function popup(reporte) {
  const nodo = document.createElement('div');
  nodo.className = 'popup';
  const tipo = document.createElement('strong');
  tipo.textContent = reporte.categoriaTexto;
  const folio = document.createElement('p');
  folio.textContent = reporte.folio;
  const estado = document.createElement('p');
  estado.textContent = reporte.estatusTexto;
  const enlace = document.createElement('a');
  enlace.href = `/folio/${reporte.folio}`;
  enlace.textContent = 'Ver seguimiento';
  nodo.append(tipo, folio, estado, enlace);
  return nodo;
}

async function iniciar() {
  let reportes = [];
  try {
    reportes = await RC.json('/api/reportes');
  } catch (e) {
    error.hidden = false;
    error.textContent = e.message;
    return;
  }

  lista.replaceChildren();
  if (!reportes.length) {
    const vacio = document.createElement('p');
    vacio.className = 'ayuda';
    vacio.textContent = 'Aún no hay reportes. Cuando alguien envíe el primero, aparecerá aquí.';
    lista.appendChild(vacio);
  } else {
    reportes.forEach((reporte) => lista.appendChild(tarjeta(reporte)));
  }

  if (typeof L === 'undefined') {
    error.hidden = false;
    return;
  }

  const mapa = RC.mapaBase('mapa', RC.CENTRO.lat, RC.CENTRO.lng, 14);
  const limites = [];
  const repetidos = new Map();
  reportes.forEach((reporte) => {
    const color = RC.COLORES[reporte.estatus] || '#0c6b4d';
    const clave = `${Number(reporte.lat).toFixed(5)},${Number(reporte.lng).toFixed(5)}`;
    const vez = repetidos.get(clave) || 0;
    repetidos.set(clave, vez + 1);
    const angulo = vez * 0.85;
    const radio = vez === 0 ? 0 : 0.00012 * (1 + Math.floor((vez - 1) / 8));
    const lat = reporte.lat + Math.cos(angulo) * radio;
    const lng = reporte.lng + Math.sin(angulo) * radio;
    const marcador = L.marker([lat, lng], { icon: RC.icono(color) }).addTo(mapa);
    marcador.bindPopup(popup(reporte));
    limites.push([reporte.lat, reporte.lng]);
  });
  if (limites.length) mapa.fitBounds(limites, { padding: [28, 28], maxZoom: 16 });
}

iniciar();
