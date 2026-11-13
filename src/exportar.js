// CSV y Excel para entregar la lista al municipio.
// El contacto del vecino no va en estos archivos: se queda solo en el panel.

const ExcelJS = require('exceljs');
const { CATEGORIAS, ESTATUS } = require('./catalogo');
const { fechaLegible, textoArea, enlaceMapa } = require('./util');

const COLUMNAS = [
  ['Folio', (r) => r.folio],
  ['Tipo', (r) => CATEGORIAS[r.categoria] || r.categoria],
  ['Latitud', (r) => r.lat],
  ['Longitud', (r) => r.lng],
  ['Google Maps', (r) => enlaceMapa(r.lat, r.lng)],
  ['Descripción', (r) => r.descripcion],
  ['Largo (cm)', (r) => r.largoCm],
  ['Ancho (cm)', (r) => r.anchoCm],
  ['Profundidad (cm)', (r) => r.profundidadCm],
  ['Área (cm²)', (r) => r.areaCm2],
  ['Área legible', (r) => textoArea(r.areaCm2)],
  ['Recomendación', (r) => r.recomendacion || ''],
  ['Estatus', (r) => ESTATUS[r.estatus] || r.estatus],
  ['Fecha de reporte', (r) => fechaLegible(r.creadoEn)],
  ['Fecha de actualización', (r) => fechaLegible(r.actualizadoEn)],
  ['Fecha de envío al municipio', (r) => fechaLegible(r.enviadoEn)],
];

function filas(reportes) {
  return reportes.map((reporte) => COLUMNAS.map(([, valor]) => {
    const dato = valor(reporte);
    return dato == null ? '' : dato;
  }));
}

function escaparCsv(valor) {
  const texto = String(valor ?? '');
  if (/[",\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function aCsv(reportes) {
  const encabezado = COLUMNAS.map(([nombre]) => escaparCsv(nombre)).join(',');
  const cuerpo = filas(reportes).map((fila) => fila.map(escaparCsv).join(',')).join('\r\n');
  return `\uFEFF${encabezado}\r\n${cuerpo}\r\n`;
}

async function aXlsx(reportes) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'ReportaCalle';
  const hoja = libro.addWorksheet('Reportes');
  hoja.addRow(COLUMNAS.map(([nombre]) => nombre));
  hoja.getRow(1).font = { bold: true };
  for (const fila of filas(reportes)) hoja.addRow(fila);
  hoja.columns.forEach((columna) => {
    columna.width = 22;
  });
  hoja.getColumn(6).width = 48;
  hoja.getColumn(12).width = 48;
  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { aCsv, aXlsx };
