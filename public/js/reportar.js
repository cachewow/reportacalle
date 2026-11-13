const forma = document.getElementById('forma-reporte');
const entradaFotos = document.getElementById('fotos');
const previstas = document.getElementById('previstas');
const anonimo = document.getElementById('anonimo');
const camposContacto = document.getElementById('campos-contacto');
const error = document.getElementById('error-reporte');
const boton = document.getElementById('enviar');
const resultado = document.getElementById('resultado');
const folioEl = document.getElementById('folio');
const enlaceSeguimiento = document.getElementById('ir-seguimiento');
const inputLat = document.getElementById('lat');
const inputLng = document.getElementById('lng');
const mensajeGps = document.getElementById('mensaje-gps');

let fotosListas = [];
let urlsPrevias = [];

function ponerPin(marcador, mapa, lat, lng) {
  marcador.setLatLng([lat, lng]);
  inputLat.value = Number(lat).toFixed(6);
  inputLng.value = Number(lng).toFixed(6);
  if (mapa) mapa.panTo([lat, lng]);
}

function leerPin() {
  const lat = Number(String(inputLat.value).replace(',', '.'));
  const lng = Number(String(inputLng.value).replace(',', '.'));
  return { lat, lng };
}

if (typeof L !== 'undefined') {
  const mapa = RC.mapaBase('mapa-reporte', RC.CENTRO.lat, RC.CENTRO.lng, RC.CENTRO.zoom);
  const marcador = L.marker([RC.CENTRO.lat, RC.CENTRO.lng], {
    draggable: true,
    icon: RC.icono('#0c6b4d'),
  }).addTo(mapa);
  ponerPin(marcador, null, RC.CENTRO.lat, RC.CENTRO.lng);
  marcador.on('dragend', () => {
    const p = marcador.getLatLng();
    ponerPin(marcador, null, p.lat, p.lng);
  });
  mapa.on('click', (evento) => ponerPin(marcador, mapa, evento.latlng.lat, evento.latlng.lng));
  inputLat.addEventListener('change', () => {
    const p = leerPin();
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) marcador.setLatLng([p.lat, p.lng]);
  });
  inputLng.addEventListener('change', () => inputLat.dispatchEvent(new Event('change')));
  document.getElementById('usar-gps').addEventListener('click', () => {
    mensajeGps.textContent = 'Buscando tu ubicación…';
    if (!navigator.geolocation) {
      mensajeGps.textContent = 'Este navegador no tiene GPS. Mueve el pin a mano.';
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      ponerPin(marcador, mapa, pos.coords.latitude, pos.coords.longitude);
      mapa.setView([pos.coords.latitude, pos.coords.longitude], 17);
      mensajeGps.textContent = 'Listo. Si el pin no quedó exacto, arrástralo.';
    }, (err) => {
      mensajeGps.textContent = err.code === 1
        ? 'No se permitió el GPS. Activa el permiso o mueve el pin a mano.'
        : 'El GPS tardó demasiado. Mueve el pin en el mapa.';
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
} else {
  document.getElementById('usar-gps').addEventListener('click', () => {
    mensajeGps.textContent = 'El mapa no cargó. Escribe la latitud y la longitud a mano.';
  });
}

function actualizarContacto() {
  const ocultar = anonimo.checked;
  camposContacto.hidden = ocultar;
  camposContacto.querySelectorAll('input').forEach((input) => {
    input.disabled = ocultar;
  });
}
anonimo.addEventListener('change', actualizarContacto);
actualizarContacto();

async function comprimir(archivo) {
  if (!archivo.type || !archivo.type.startsWith('image/')) {
    throw new Error('Elige archivos de imagen.');
  }
  if (typeof createImageBitmap !== 'function') return archivo;
  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch (e) {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(archivo.type)) return archivo;
    throw new Error('No pudimos preparar esa foto. Elige una imagen JPG o PNG.');
  }
  const max = 1600;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);
  const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', 0.75));
  if (typeof bitmap.close === 'function') bitmap.close();
  if (!blob) return archivo;
  const base = (archivo.name || 'foto').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

entradaFotos.addEventListener('change', async () => {
  error.hidden = true;
  urlsPrevias.forEach((url) => URL.revokeObjectURL(url));
  urlsPrevias = [];
  previstas.replaceChildren();
  fotosListas = [];
  const archivos = [...entradaFotos.files].slice(0, 6);
  try {
    for (const archivo of archivos) {
      const listo = await comprimir(archivo);
      fotosListas.push(listo);
      const url = URL.createObjectURL(listo);
      urlsPrevias.push(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Vista previa de la foto';
      previstas.appendChild(img);
    }
    document.getElementById('resumen-fotos').textContent = fotosListas.length
      ? `${fotosListas.length} ${fotosListas.length === 1 ? 'foto lista' : 'fotos listas'}.`
      : 'Ninguna foto elegida.';
  } catch (e) {
    fotosListas = [];
    error.hidden = false;
    error.textContent = e.message;
  }
});

forma.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  error.hidden = true;
  if (!fotosListas.length) {
    error.hidden = false;
    error.textContent = 'Agrega al menos una foto del problema.';
    return;
  }
  const datos = new FormData(forma);
  datos.delete('fotos');
  fotosListas.forEach((foto) => datos.append('fotos', foto, foto.name));
  boton.disabled = true;
  boton.textContent = 'Enviando…';
  try {
    const respuesta = await RC.json('/api/reportes', { method: 'POST', body: datos });
    forma.hidden = true;
    folioEl.textContent = respuesta.folio;
    enlaceSeguimiento.href = respuesta.enlace;
    resultado.hidden = false;
    resultado.focus?.();
    document.getElementById('copiar').onclick = async () => {
      try {
        await navigator.clipboard.writeText(respuesta.folio);
      } catch (e) {
        const area = document.createElement('textarea');
        area.value = respuesta.folio;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      const aviso = document.getElementById('copiado');
      aviso.hidden = false;
      setTimeout(() => { aviso.hidden = true; }, 2500);
    };
  } catch (e) {
    error.hidden = false;
    error.textContent = e.message;
    boton.disabled = false;
    boton.textContent = 'Enviar reporte';
  }
});
