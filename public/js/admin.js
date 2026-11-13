const acceso = document.getElementById('acceso');
const panel = document.getElementById('panel');
const lista = document.getElementById('lista');
const detalle = document.getElementById('detalle');
const filtros = document.getElementById('filtros');
const forma = document.getElementById('forma-detalle');
const mensaje = document.getElementById('mensaje-guardar');
const errorGuardar = document.getElementById('error-guardar');
let reporteActual = null;

function textoMedida(valor) {
  return valor == null ? '' : String(valor);
}

function etiquetaEnvio(estado) {
  if (estado === 'exito') return 'Enviado';
  if (estado === 'fallo') return 'Falló';
  return 'Pendiente';
}

function pintarLista(reportes) {
  lista.hidden = false;
  detalle.hidden = true;
  lista.replaceChildren();
  if (!reportes.length) {
    const vacio = document.createElement('p');
    vacio.className = 'ayuda';
    vacio.textContent = 'No hay reportes con ese filtro.';
    lista.appendChild(vacio);
    return;
  }
  reportes.forEach((reporte) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'item';
    const titulo = document.createElement('strong');
    titulo.textContent = `${reporte.folio} · ${reporte.categoriaTexto}`;
    const meta = document.createElement('p');
    const ultimo = reporte.envios[reporte.envios.length - 1];
    const extra = ultimo && ultimo.estado !== 'exito' ? ` · último envío: ${etiquetaEnvio(ultimo.estado)}` : '';
    meta.textContent = `${reporte.estatusTexto} · ${RC.fecha(reporte.creadoEn)}${extra}`;
    boton.append(titulo, meta);
    boton.addEventListener('click', () => abrir(reporte.folio));
    lista.appendChild(boton);
  });
}

async function cargarLista() {
  const params = new URLSearchParams(new FormData(filtros));
  const reportes = await RC.json(`/api/admin/reportes?${params.toString()}`);
  pintarLista(reportes);
}

function formularioSucio() {
  if (!reporteActual) return false;
  return document.getElementById('det-largo').value !== textoMedida(reporteActual.largoCm)
    || document.getElementById('det-ancho').value !== textoMedida(reporteActual.anchoCm)
    || document.getElementById('det-prof').value !== textoMedida(reporteActual.profundidadCm)
    || document.getElementById('det-recomendacion').value !== (reporteActual.recomendacion || '')
    || document.getElementById('det-estatus').value !== reporteActual.estatus
    || forma.querySelector('input[type="file"]').files.length > 0;
}

function actualizarArea() {
  const largo = RC.numero(document.getElementById('det-largo').value);
  const ancho = RC.numero(document.getElementById('det-ancho').value);
  document.getElementById('det-area').textContent = largo == null || ancho == null
    ? '—'
    : RC.textoArea(Math.round(largo * ancho * 100) / 100);
}

function llenarDetalle(reporte) {
  reporteActual = reporte;
  lista.hidden = true;
  detalle.hidden = false;
  document.getElementById('det-folio').textContent = reporte.folio;
  document.getElementById('det-tipo').textContent = reporte.categoriaTexto;
  document.getElementById('det-meta').textContent = `Recibido el ${RC.fecha(reporte.creadoEn)}. Actualizado el ${RC.fecha(reporte.actualizadoEn)}.`;
  const contacto = document.getElementById('det-contacto');
  if (reporte.anonimo || (!reporte.contactoNombre && !reporte.contactoDato)) {
    contacto.textContent = reporte.anonimo ? 'Reporte anónimo.' : 'Sin datos de contacto.';
  } else {
    contacto.textContent = `Contacto: ${reporte.contactoNombre || 'Sin nombre'} · ${reporte.contactoDato || 'sin teléfono ni correo'}`;
  }
  document.getElementById('det-desc').textContent = reporte.descripcion;
  document.getElementById('det-maps').href = `https://www.google.com/maps?q=${reporte.lat},${reporte.lng}`;
  document.getElementById('det-seguimiento').href = `/folio/${reporte.folio}`;
  const select = document.getElementById('det-estatus');
  [...select.options].forEach((opcion) => {
    opcion.hidden = opcion.value === 'enviado' && reporte.estatus !== 'enviado';
  });
  select.value = reporte.estatus;
  document.getElementById('det-largo').value = textoMedida(reporte.largoCm);
  document.getElementById('det-ancho').value = textoMedida(reporte.anchoCm);
  document.getElementById('det-prof').value = textoMedida(reporte.profundidadCm);
  document.getElementById('det-recomendacion').value = reporte.recomendacion || '';
  const entradaFotos = document.getElementById('fotos-inspeccion');
  entradaFotos.value = '';
  document.getElementById('resumen-inspeccion').textContent = 'Ninguna foto elegida.';
  actualizarArea();
  RC.galeria(
    document.getElementById('det-fotos-vecino'),
    reporte.fotos.filter((f) => f.origen === 'vecino'),
    'Foto del vecino'
  );
  RC.galeria(
    document.getElementById('det-fotos-inspeccion'),
    reporte.fotos.filter((f) => f.origen === 'inspeccion'),
    'Foto de la inspección'
  );
  const reenviar = document.getElementById('reenviar');
  reenviar.hidden = reporte.estatus !== 'inspeccionado' && reporte.estatus !== 'enviado';
  const historial = document.getElementById('det-envios');
  historial.replaceChildren();
  if (!reporte.envios.length) {
    const vacio = document.createElement('li');
    vacio.textContent = 'Todavía no hay intentos de envío.';
    historial.appendChild(vacio);
  } else {
    reporte.envios.forEach((envio) => {
      const item = document.createElement('li');
      const estado = document.createElement('span');
      estado.className = `estado estado-${envio.estado}`;
      estado.textContent = etiquetaEnvio(envio.estado);
      const texto = document.createElement('p');
      texto.textContent = `${RC.fecha(envio.fecha)} · ${envio.destinatario}`;
      item.append(estado, texto);
      if (envio.error) {
        const fallo = document.createElement('p');
        fallo.className = 'ayuda';
        fallo.textContent = envio.error;
        item.appendChild(fallo);
      }
      historial.appendChild(item);
    });
  }
  const ultimo = reporte.envios[reporte.envios.length - 1];
  if (reporte.estatus === 'inspeccionado' && (!ultimo || ultimo.estado !== 'exito')) {
    mensaje.textContent = 'El correo al municipio no se ha enviado. Puedes corregir los datos y pulsar «Reenviar al municipio».';
  } else if (reporte.enviadoEn) {
    mensaje.textContent = `Enviado al municipio el ${RC.fecha(reporte.enviadoEn)}.`;
  } else {
    mensaje.textContent = '';
  }
  errorGuardar.hidden = true;
  detalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function abrir(folio) {
  const reporte = await RC.json(`/api/admin/reportes/${encodeURIComponent(folio)}`);
  llenarDetalle(reporte);
}

['det-largo', 'det-ancho'].forEach((id) => {
  document.getElementById(id).addEventListener('input', actualizarArea);
});

document.getElementById('fotos-inspeccion').addEventListener('change', (evento) => {
  const cantidad = evento.target.files.length;
  document.getElementById('resumen-inspeccion').textContent = cantidad
    ? `${cantidad} ${cantidad === 1 ? 'foto lista' : 'fotos listas'} para subir.`
    : 'Ninguna foto elegida.';
});

filtros.addEventListener('change', () => {
  cargarLista().catch((e) => {
    lista.textContent = e.message;
  });
});

document.getElementById('volver').addEventListener('click', () => {
  cargarLista().catch((e) => { lista.textContent = e.message; });
});

document.getElementById('salir').addEventListener('click', async () => {
  await RC.json('/api/admin/salir', { method: 'POST' });
  panel.hidden = true;
  acceso.hidden = false;
});

forma.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!reporteActual) return;
  errorGuardar.hidden = true;
  const nuevo = document.getElementById('det-estatus').value;
  const anterior = reporteActual.estatus;
  if (nuevo === 'inspeccionado' && anterior !== 'inspeccionado') {
    const faltan = !document.getElementById('det-largo').value
      || !document.getElementById('det-ancho').value
      || !document.getElementById('det-recomendacion').value.trim();
    const texto = faltan
      ? 'Faltan medidas o la recomendación. Si continúas, se intentará enviar el correo al municipio de todos modos. ¿Continuar?'
      : 'Al guardar como Inspeccionado se envía el correo al municipio. Si sale bien, el estatus pasará a Enviado al municipio. ¿Continuar?';
    if (!window.confirm(texto)) return;
  }
  const boton = document.getElementById('guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const respuesta = await RC.json(`/api/admin/reportes/${reporteActual.folio}/guardar`, {
      method: 'POST',
      body: new FormData(forma),
    });
    llenarDetalle(respuesta.reporte);
    if (respuesta.envio && !respuesta.correoEnviado) {
      mensaje.textContent = `No se pudo enviar el correo. El reporte sigue como ${respuesta.reporte.estatusTexto}. ${respuesta.envio.error || ''}`;
    } else if (respuesta.correoEnviado) {
      mensaje.textContent = 'Correo enviado. El estatus cambió a Enviado al municipio.';
    }
  } catch (e) {
    errorGuardar.hidden = false;
    errorGuardar.textContent = e.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar cambios';
  }
});

document.getElementById('reenviar').addEventListener('click', async () => {
  if (!reporteActual) return;
  if (formularioSucio()) {
    window.alert('Hay cambios sin guardar. Pulsa Guardar cambios antes de reenviar.');
    return;
  }
  if (!window.confirm('¿Reenviar este reporte al municipio?')) return;
  const boton = document.getElementById('reenviar');
  boton.disabled = true;
  try {
    const respuesta = await RC.json(`/api/admin/reportes/${reporteActual.folio}/reenviar`, { method: 'POST' });
    llenarDetalle(respuesta.reporte);
    mensaje.textContent = respuesta.correoEnviado
      ? 'Correo reenviado. El estatus quedó en Enviado al municipio.'
      : `El reenvío no salió. ${respuesta.envio.error || ''}`;
  } catch (e) {
    errorGuardar.hidden = false;
    errorGuardar.textContent = e.message;
  } finally {
    boton.disabled = false;
  }
});

document.getElementById('forma-acceso').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const aviso = document.getElementById('error-acceso');
  aviso.hidden = true;
  const password = new FormData(evento.target).get('password');
  try {
    await RC.json('/api/admin/ingresar', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    await entrar();
  } catch (e) {
    aviso.hidden = false;
    aviso.textContent = e.message;
  }
});

async function entrar() {
  const sesion = await RC.json('/api/admin/sesion');
  if (!sesion.autenticado) {
    acceso.hidden = false;
    panel.hidden = true;
    return;
  }
  acceso.hidden = true;
  panel.hidden = false;
  const banner = document.getElementById('aviso-correo');
  if (sesion.correo && !sesion.correo.listo) {
    banner.hidden = false;
    banner.textContent = `El correo no está configurado. Los reportes que marques como Inspeccionado se quedarán así hasta que haya SMTP. Destino previsto: ${sesion.correo.destinatario}.`;
  } else if (sesion.correo && sesion.correo.modo === 'json') {
    banner.hidden = false;
    banner.textContent = 'Modo de prueba: el correo no sale a internet; se guarda en el servidor como JSON.';
  } else if (sesion.correo) {
    banner.hidden = false;
    banner.textContent = `Los reportes inspeccionados se envían a ${sesion.correo.destinatario}.`;
  }
  await cargarLista();
}

entrar().catch(() => {
  acceso.hidden = false;
});
