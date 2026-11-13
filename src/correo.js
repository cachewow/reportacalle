// Correo al municipio.
//
// enviarAlMunicipio(folio) arma el mensaje (folio, tipo, mapa, fotos,
// medidas, recomendación y enlace de seguimiento) y lo manda por SMTP.
//
// Lo dispara el panel cuando el responsable marca el reporte como
// "Inspeccionado": esa acción es la revisión humana antes de avisar
// al municipio. El botón "Reenviar al municipio" vuelve a llamar aquí.
//
// Si el SMTP no está configurado o el envío falla, NO cambia el estatus.
// El intento queda en la tabla envios (pendiente o fallo) para reintentarlo.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { CATEGORIAS } = require('./catalogo');
const { correoMunicipio, directorioDatos } = require('./config');
const {
  escaparHtml,
  esPendiente,
  fechaLegible,
  textoArea,
  coord,
  enlaceMapa,
  limpiarError,
} = require('./util');

const LIMITE_ADJUNTO = 3_500_000;

function smtpSecure() {
  const explicito = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes'].includes(explicito)) return true;
  if (['0', 'false', 'no'].includes(explicito)) return false;
  return Number(process.env.SMTP_PORT || 587) === 465;
}

function smtpListo() {
  return !esPendiente(process.env.SMTP_HOST)
    && !esPendiente(process.env.SMTP_USER)
    && !esPendiente(process.env.SMTP_PASS)
    && !esPendiente(process.env.MAIL_FROM);
}

function estadoCorreo() {
  const modo = String(process.env.MAIL_TRANSPORT || '').trim().toLowerCase();
  if (modo === 'json' || modo === 'prueba') {
    return { listo: !esPendiente(process.env.MAIL_FROM), modo: 'json', destinatario: correoMunicipio() };
  }
  if (smtpListo()) {
    return { listo: true, modo: 'smtp', destinatario: correoMunicipio() };
  }
  return { listo: false, modo: 'ninguno', destinatario: correoMunicipio() };
}

function crearTransporte() {
  const estado = estadoCorreo();
  if (estado.modo === 'json') {
    if (!estado.listo) {
      return { listo: false, motivo: 'Falta MAIL_FROM. En pruebas locales también hace falta para simular el correo.' };
    }
    return {
      listo: true,
      modo: 'json',
      enviar: (mensaje) => nodemailer.createTransport({ jsonTransport: true }).sendMail(mensaje),
    };
  }
  if (estado.modo !== 'smtp') {
    return {
      listo: false,
      motivo: 'El correo no está configurado. Faltan SMTP_HOST, SMTP_USER, SMTP_PASS o MAIL_FROM.',
    };
  }
  const puerto = Number(process.env.SMTP_PORT || 587);
  const seguro = smtpSecure();
  return {
    listo: true,
    modo: 'smtp',
    enviar: (mensaje) => nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port: puerto,
      secure: seguro,
      auth: {
        user: process.env.SMTP_USER.trim(),
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    }).sendMail(mensaje),
  };
}

function urlAbsoluta(baseUrl, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function medidasTexto(reporte) {
  const partes = [];
  if (reporte.largoCm != null) partes.push(`largo ${reporte.largoCm} cm`);
  if (reporte.anchoCm != null) partes.push(`ancho ${reporte.anchoCm} cm`);
  if (reporte.profundidadCm != null) partes.push(`profundidad ${reporte.profundidadCm} cm`);
  const area = textoArea(reporte.areaCm2);
  if (!partes.length && !area) return 'Sin medidas capturadas.';
  const linea = partes.length ? partes.join(', ') : 'Sin largo, ancho o profundidad.';
  return area ? `${linea}. Área (largo × ancho): ${area}.` : `${linea}.`;
}

async function prepararFotos(reporte, almacen, baseUrl) {
  const lista = [];
  let indice = 0;
  for (const foto of reporte.fotos) {
    indice += 1;
    const publica = urlAbsoluta(baseUrl, foto.url);
    const etiqueta = foto.origen === 'inspeccion' ? 'Inspección' : 'Vecino';
    const item = {
      origen: foto.origen,
      etiqueta,
      url: publica,
      cid: null,
    };
    try {
      const buffer = await almacen.leer(foto);
      if (buffer && buffer.length > 0 && buffer.length <= LIMITE_ADJUNTO) {
        item.cid = `foto${indice}@reportacalle`;
        item.adjunto = {
          filename: `${foto.origen}-${indice}.jpg`,
          content: buffer,
          contentType: 'image/jpeg',
          cid: item.cid,
        };
        if (foto.url.endsWith('.png')) item.adjunto.contentType = 'image/png';
        if (foto.url.endsWith('.webp')) item.adjunto.contentType = 'image/webp';
        if (foto.url.endsWith('.gif')) item.adjunto.contentType = 'image/gif';
        const ext = item.adjunto.contentType.split('/')[1].replace('jpeg', 'jpg');
        item.adjunto.filename = `${foto.origen}-${indice}.${ext}`;
      }
    } catch (error) {
      item.nota = 'No se pudo adjuntar; usa el enlace.';
      console.warn(`No se adjuntó la foto ${foto.clave}: ${limpiarError(error)}`);
    }
    lista.push(item);
  }
  return lista;
}

function armarMensaje({ reporte, fotos, baseUrl, destinatario }) {
  const tipo = CATEGORIAS[reporte.categoria] || reporte.categoria;
  const seguimiento = `${baseUrl}/folio/${reporte.folio}`;
  const mapa = enlaceMapa(reporte.lat, reporte.lng);
  const medidas = medidasTexto(reporte);
  const recomendacion = reporte.recomendacion || 'Sin recomendación escrita.';
  const asunto = `ReportaCalle ${reporte.folio} — ${tipo} en San José Iturbide`;

  const bloquesFotos = fotos.map((foto) => {
    const imagen = foto.cid
      ? `<img src="cid:${foto.cid}" alt="${escaparHtml(foto.etiqueta)}" style="max-width:100%;border-radius:8px;margin:8px 0">`
      : '';
    return `<p style="margin:16px 0"><strong>${escaparHtml(foto.etiqueta)}</strong><br>${imagen}<br><a href="${escaparHtml(foto.url)}">${escaparHtml(foto.url)}</a></p>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f3f1ea;color:#17211b;font-family:Georgia,serif">
  <table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px">
    <tr><td>
      <p style="margin:0;letter-spacing:.04em;text-transform:uppercase;font-size:13px;color:#0c6b4d">ReportaCalle · San José Iturbide</p>
      <h1 style="font-family:Arial,sans-serif;font-size:24px;margin:8px 0 4px">Reporte ${escaparHtml(reporte.folio)}</h1>
      <p style="margin:0 0 16px;font-size:18px">${escaparHtml(tipo)}</p>
      <p>${escaparHtml(reporte.descripcion)}</p>
      <h2 style="font-family:Arial,sans-serif;font-size:18px">Ubicación</h2>
      <p>${escaparHtml(coord(reporte.lat))}, ${escaparHtml(coord(reporte.lng))}<br>
      <a href="${escaparHtml(mapa)}">Abrir en Google Maps</a></p>
      <h2 style="font-family:Arial,sans-serif;font-size:18px">Medidas</h2>
      <p>${escaparHtml(medidas)}</p>
      <h2 style="font-family:Arial,sans-serif;font-size:18px">Recomendación de reparación</h2>
      <p>${escaparHtml(recomendacion)}</p>
      <h2 style="font-family:Arial,sans-serif;font-size:18px">Fotos</h2>
      ${bloquesFotos || '<p>Este reporte no tiene fotos adjuntas en el correo. Revisa el seguimiento.</p>'}
      <p style="margin-top:24px"><a href="${escaparHtml(seguimiento)}">Ver la página pública de seguimiento</a></p>
      <p style="color:#3d4a44;font-size:14px">Mensaje generado por ReportaCalle para el municipio de San José Iturbide, Guanajuato. El contacto del vecino no se incluye.</p>
    </td></tr>
  </table>
</body>
</html>`;

  const lineasFotos = fotos.map((foto) => `- ${foto.etiqueta}: ${foto.url}`).join('\n') || '- Sin fotos';
  const texto = [
    `ReportaCalle ${reporte.folio}`,
    `Tipo: ${tipo}`,
    '',
    reporte.descripcion,
    '',
    `Ubicación: ${coord(reporte.lat)}, ${coord(reporte.lng)}`,
    `Google Maps: ${mapa}`,
    '',
    `Medidas: ${medidas}`,
    '',
    `Recomendación de reparación: ${recomendacion}`,
    '',
    'Fotos:',
    lineasFotos,
    '',
    `Seguimiento: ${seguimiento}`,
    '',
    'Mensaje generado por ReportaCalle para el municipio de San José Iturbide, Guanajuato.',
  ].join('\n');

  return {
    from: process.env.MAIL_FROM.trim(),
    to: destinatario,
    subject: asunto,
    text: texto,
    html,
    attachments: fotos.map((foto) => foto.adjunto).filter(Boolean),
  };
}

async function guardarBuzon(folio, info) {
  const dir = path.join(directorioDatos(), 'buzon');
  fs.mkdirSync(dir, { recursive: true });
  const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${folio}.json`;
  const archivo = path.join(dir, nombre);
  const cuerpo = typeof info.message === 'string' ? info.message : JSON.stringify(info.message || info);
  await fs.promises.writeFile(archivo, cuerpo);
  return archivo;
}

/**
 * Envía el reporte al municipio y, solo si sale bien, lo marca como
 * "Enviado al municipio" con la fecha del envío.
 */
async function enviarAlMunicipio({ datos, almacen, folio, baseUrl }) {
  const reporte = await datos.porFolio(folio);
  if (!reporte) {
    const error = new Error('No encontramos ese reporte.');
    error.status = 404;
    throw error;
  }

  const destinatario = correoMunicipio();
  const transporte = crearTransporte();
  if (!transporte.listo) {
    const envio = await datos.registrarEnvio({
      reporteId: reporte.id,
      folio: reporte.folio,
      destinatario,
      estado: 'pendiente',
      error: transporte.motivo,
    });
    return { ok: false, envio, reporte: await datos.porFolio(folio) };
  }

  try {
    const fotos = await prepararFotos(reporte, almacen, baseUrl);
    const mensaje = armarMensaje({ reporte, fotos, baseUrl, destinatario });
    const info = await transporte.enviar(mensaje);
    if (transporte.modo === 'json') await guardarBuzon(reporte.folio, info);
    const cuando = new Date().toISOString();
    const envio = await datos.registrarEnvio({
      reporteId: reporte.id,
      folio: reporte.folio,
      destinatario,
      estado: 'exito',
      error: null,
    });
    const actualizado = await datos.marcarEnviado(reporte.folio, cuando);
    console.log(`Correo de ${reporte.folio} enviado a ${destinatario} (${transporte.modo}) el ${fechaLegible(cuando)}.`);
    return { ok: true, envio, reporte: actualizado };
  } catch (error) {
    const mensaje = limpiarError(error);
    console.error(`Falló el correo de ${reporte.folio}: ${mensaje}`);
    const envio = await datos.registrarEnvio({
      reporteId: reporte.id,
      folio: reporte.folio,
      destinatario,
      estado: 'fallo',
      error: mensaje,
    });
    return { ok: false, envio, reporte: await datos.porFolio(folio) };
  }
}

function advertirRemitente() {
  const from = String(process.env.MAIL_FROM || '');
  if (/@(gmail|hotmail|outlook|live|yahoo|icloud)\./i.test(from)) {
    console.warn('MAIL_FROM parece un correo personal. Usa un remitente propio del proyecto (dominio verificado en Brevo o Resend).');
  }
}

module.exports = {
  enviarAlMunicipio,
  estadoCorreo,
  advertirRemitente,
  armarMensaje,
};
