const crypto = require('crypto');

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function esPendiente(valor) {
  const texto = String(valor || '').trim().toLowerCase();
  return !texto || texto === 'pendiente' || texto === 'cambiar' || texto === 'xxx';
}

function esVerdadero(valor) {
  return ['1', 'true', 'on', 'si', 'sí', 'yes'].includes(String(valor || '').trim().toLowerCase());
}

// Acepta "1,5" y "1.5". Devuelve null si viene vacío.
// Devuelve NaN si el texto no es un número usable.
function numero(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const n = Number(texto.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100000) return NaN;
  return Math.round(n * 100) / 100;
}

function calcularArea(largo, ancho) {
  if (largo == null || ancho == null || Number.isNaN(largo) || Number.isNaN(ancho)) return null;
  return Math.round(largo * ancho * 100) / 100;
}

function formatearFolio(n) {
  return `RC-${String(n).padStart(4, '0')}`;
}

function folioValido(folio) {
  return /^RC-\d+$/.test(String(folio || '').toUpperCase());
}

function fechaLegible(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(fecha);
}

function textoArea(cm2) {
  if (cm2 == null || Number.isNaN(Number(cm2))) return '';
  const n = Number(cm2);
  const m2 = n / 10000;
  const fmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
  return `${fmt.format(n)} cm² (${fmt.format(m2)} m²)`;
}

function coord(n) {
  return Number(n).toFixed(6);
}

function enlaceMapa(lat, lng) {
  return `https://www.google.com/maps?q=${coord(lat)},${coord(lng)}`;
}

function clavesIguales(entrada, real) {
  const a = crypto.createHash('sha256').update(String(entrada), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(real), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function basePublica(req) {
  const configurada = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (configurada && !esPendiente(configurada) && /^https?:\/\//i.test(configurada)) {
    return configurada;
  }
  const host = req.get('host');
  return `${req.protocol}://${host}`;
}

function limpiarError(err) {
  const msg = err && err.message ? err.message : String(err || 'Error desconocido');
  return msg.replace(/pass(word)?[=:]\s*\S+/gi, 'pass=***').slice(0, 500);
}

module.exports = {
  escaparHtml,
  esPendiente,
  esVerdadero,
  numero,
  calcularArea,
  formatearFolio,
  folioValido,
  fechaLegible,
  textoArea,
  coord,
  enlaceMapa,
  clavesIguales,
  basePublica,
  limpiarError,
};
