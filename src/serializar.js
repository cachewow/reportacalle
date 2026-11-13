const { CATEGORIAS, ESTATUS } = require('./catalogo');

function fotoPublica(foto) {
  return { id: foto.id, origen: foto.origen, url: foto.url };
}

function aPublico(reporte) {
  return {
    folio: reporte.folio,
    categoria: reporte.categoria,
    categoriaTexto: CATEGORIAS[reporte.categoria] || reporte.categoria,
    descripcion: reporte.descripcion,
    lat: reporte.lat,
    lng: reporte.lng,
    estatus: reporte.estatus,
    estatusTexto: ESTATUS[reporte.estatus] || reporte.estatus,
    largoCm: reporte.largoCm,
    anchoCm: reporte.anchoCm,
    profundidadCm: reporte.profundidadCm,
    areaCm2: reporte.areaCm2,
    recomendacion: reporte.recomendacion,
    enviadoEn: reporte.enviadoEn,
    creadoEn: reporte.creadoEn,
    actualizadoEn: reporte.actualizadoEn,
    fotos: reporte.fotos.map(fotoPublica),
  };
}

function aAdmin(reporte) {
  return {
    ...aPublico(reporte),
    anonimo: reporte.anonimo,
    contactoNombre: reporte.anonimo ? null : reporte.contactoNombre,
    contactoDato: reporte.anonimo ? null : reporte.contactoDato,
    envios: (reporte.envios || []).map((envio) => ({
      id: envio.id,
      destinatario: envio.destinatario,
      fecha: envio.fecha,
      estado: envio.estado,
      error: envio.error,
    })),
  };
}

module.exports = { aPublico, aAdmin };
