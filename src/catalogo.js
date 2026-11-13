// Catálogos que usa toda la app. Si cambias un texto visible,
// actualiza también public/js/comun.js (es la copia del navegador).

const CATEGORIAS = {
  bache: 'Bache',
  fuga: 'Fuga de agua',
  alumbrado: 'Alumbrado',
  coladera: 'Coladera',
  otro: 'Otro',
};

const ESTATUS = {
  recibido: 'Recibido',
  inspeccionado: 'Inspeccionado',
  enviado: 'Enviado al municipio',
  reparado: 'Reparado',
};

// Orden de la línea de tiempo en la página de seguimiento.
const ORDEN_ESTATUS = ['recibido', 'inspeccionado', 'enviado', 'reparado'];

const COLORES_ESTATUS = {
  recibido: '#d97706',
  inspeccionado: '#1d4ed8',
  enviado: '#7c3aed',
  reparado: '#15803d',
};

// Centro de San José Iturbide, Guanajuato.
const CENTRO = { lat: 20.9986, lng: -100.3843, zoom: 15 };

function categoriaValida(valor) {
  return Object.prototype.hasOwnProperty.call(CATEGORIAS, valor);
}

function estatusValido(valor) {
  return Object.prototype.hasOwnProperty.call(ESTATUS, valor);
}

module.exports = {
  CATEGORIAS,
  ESTATUS,
  ORDEN_ESTATUS,
  COLORES_ESTATUS,
  CENTRO,
  categoriaValida,
  estatusValido,
};
