const path = require('path');
const { esPendiente } = require('./util');

const RAIZ = path.join(__dirname, '..');

function directorioDatos() {
  return process.env.DATA_DIR || path.join(RAIZ, 'data');
}

function directorioUploads() {
  return process.env.UPLOADS_DIR || path.join(RAIZ, 'uploads');
}

function supabaseConfigurado() {
  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_BUCKET;
  return !esPendiente(url) && !esPendiente(llave) && !esPendiente(bucket);
}

function correoMunicipio() {
  const destino = String(process.env.MAIL_TO || '').trim();
  return esPendiente(destino) ? 'atencion.ciudadana@sji.gob.mx' : destino;
}

module.exports = {
  RAIZ,
  directorioDatos,
  directorioUploads,
  supabaseConfigurado,
  correoMunicipio,
};
