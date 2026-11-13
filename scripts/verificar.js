// Prueba el flujo local sin Supabase ni SMTP real:
// alta de reporte, mapa, seguimiento, admin, fallo de correo,
// reenvío con transporte JSON y exportación.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function prepararEntorno(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reportacalle-'));
  const guardar = {};
  const claves = [
    'DATA_DIR', 'UPLOADS_DIR', 'DATA_BACKEND', 'DATABASE_URL',
    'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_BUCKET',
    'ADMIN_PASSWORD', 'SESSION_SECRET', 'NODE_ENV', 'MAIL_TRANSPORT',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS',
    'MAIL_FROM', 'MAIL_TO', 'PUBLIC_BASE_URL', 'PORT',
  ];
  for (const clave of claves) guardar[clave] = process.env[clave];
  process.env.NODE_ENV = 'development';
  process.env.DATA_DIR = path.join(dir, 'data');
  process.env.UPLOADS_DIR = path.join(dir, 'uploads');
  process.env.ADMIN_PASSWORD = 'clave-de-prueba-123';
  process.env.SESSION_SECRET = 'secreto-de-sesion-de-prueba-muy-largo';
  process.env.MAIL_FROM = 'ReportaCalle <reportes@reportacalle.test>';
  process.env.MAIL_TO = 'atencion.ciudadana@sji.gob.mx';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = '1';
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_USER = 'reporte';
  process.env.SMTP_PASS = 'secreto-smtp';
  process.env.PUBLIC_BASE_URL = '';
  delete process.env.DATABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_BUCKET;
  delete process.env.MAIL_TRANSPORT;
  delete process.env.DATA_BACKEND;
  Object.assign(process.env, extra);
  return {
    dir,
    restaurar() {
      for (const clave of claves) {
        if (guardar[clave] === undefined) delete process.env[clave];
        else process.env[clave] = guardar[clave];
      }
    },
  };
}

function cliente(base) {
  const jar = new Map();
  return async function pedir(ruta, opciones = {}) {
    const headers = { ...(opciones.headers || {}) };
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const respuesta = await fetch(base + ruta, { ...opciones, headers, redirect: 'manual' });
    const cookies = typeof respuesta.headers.getSetCookie === 'function' ? respuesta.headers.getSetCookie() : [];
    for (const cruda of cookies) {
      const par = cruda.split(';')[0];
      const corte = par.indexOf('=');
      if (corte > 0) jar.set(par.slice(0, corte).trim(), par.slice(corte + 1).trim());
    }
    return respuesta;
  };
}

async function cuerpo(respuesta) {
  const texto = await respuesta.text();
  try { return JSON.parse(texto); } catch { return texto; }
}

function foto(nombre) {
  return new Blob([PNG], { type: 'image/png' });
}

async function escuchar(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function escenarioSqlite() {
  const entorno = prepararEntorno();
  const { crearApp } = require('../src/server');
  const app = await crearApp();
  const server = await escuchar(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  const pedir = cliente(base);
  try {
    const salud = await cuerpo(await pedir('/salud'));
    assert.equal(salud.ok, true);
    assert.equal(salud.datos, 'sqlite');
    assert.equal(salud.fotos, 'local');
    assert.equal(salud.correo, 'smtp');

    const pagina = await (await pedir('/')).text();
    assert.ok(pagina.includes('ReportaCalle'));
    assert.ok(pagina.includes('Reportar de forma anónima'));
    assert.ok(pagina.includes('Bache'));
    const privacidad = await (await pedir('/privacidad')).text();
    assert.ok(privacidad.includes('BORRADOR'));
    assert.ok(privacidad.includes('No vendemos'));
    assert.equal((await pedir('/mapa')).status, 200);
    assert.equal((await pedir('/admin')).status, 200);

    const sinFoto = new FormData();
    sinFoto.set('categoria', 'bache');
    sinFoto.set('descripcion', 'Falta la foto en este intento');
    sinFoto.set('lat', '21');
    sinFoto.set('lng', '-100');
    const rechazado = await pedir('/api/reportes', { method: 'POST', body: sinFoto });
    assert.equal(rechazado.status, 400);

    const alta = new FormData();
    alta.set('categoria', 'bache');
    alta.set('descripcion', 'Bache grande frente al jardín principal');
    alta.set('lat', '20.999100');
    alta.set('lng', '-100.385200');
    alta.set('contacto_nombre', 'Ana');
    alta.set('contacto_dato', 'ana.secreta@example.com');
    alta.append('fotos', foto('bache.png'), 'bache.png');
    const creado = await pedir('/api/reportes', { method: 'POST', body: alta });
    const dato = await cuerpo(creado);
    assert.equal(creado.status, 201, JSON.stringify(dato));
    assert.equal(dato.folio, 'RC-0001');
    assert.ok(!JSON.stringify(dato).includes('ana.secreta'));

    const anonima = new FormData();
    anonima.set('categoria', 'alumbrado');
    anonima.set('descripcion', 'Luminaria apagada en la calle Hidalgo');
    anonima.set('lat', '21.001000');
    anonima.set('lng', '-100.390000');
    anonima.set('anonimo', '1');
    anonima.set('contacto_nombre', 'Nadie');
    anonima.set('contacto_dato', 'no-guardar@example.com');
    anonima.append('fotos', foto('luz.png'), 'luz.png');
    const segunda = await cuerpo(await pedir('/api/reportes', { method: 'POST', body: anonima }));
    assert.equal(segunda.folio, 'RC-0002');

    const publicos = await cuerpo(await pedir('/api/reportes'));
    assert.equal(publicos.length, 2);
    assert.ok(!JSON.stringify(publicos).includes('ana.secreta'));
    assert.ok(!JSON.stringify(publicos).includes('no-guardar'));
    assert.ok(!JSON.stringify(publicos).includes('envios'));

    const seguimiento = await cuerpo(await pedir('/api/reportes/rc-0001'));
    assert.equal(seguimiento.folio, 'RC-0001');
    assert.equal(seguimiento.estatus, 'recibido');
    const fotoVecino = await pedir(seguimiento.fotos[0].url);
    assert.equal(fotoVecino.status, 200);
    assert.equal(Buffer.from(await fotoVecino.arrayBuffer()).equals(PNG), true);

    const mal = await pedir('/api/admin/ingresar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'incorrecta' }),
    });
    assert.equal(mal.status, 401);
    const bien = await pedir('/api/admin/ingresar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'clave-de-prueba-123' }),
    });
    assert.equal(bien.status, 200, await bien.clone().text());
    const sesion = await cuerpo(await pedir('/api/admin/sesion'));
    assert.equal(sesion.autenticado, true);

    const adminLista = await cuerpo(await pedir('/api/admin/reportes'));
    assert.equal(adminLista[1].contactoDato, 'ana.secreta@example.com');
    const adminAnonimo = adminLista.find((r) => r.folio === 'RC-0002');
    assert.equal(adminAnonimo.anonimo, true);
    assert.equal(adminAnonimo.contactoDato, null);

    const guardar = new FormData();
    guardar.set('estatus', 'inspeccionado');
    guardar.set('largo_cm', '120.5');
    guardar.set('ancho_cm', '80');
    guardar.set('profundidad_cm', '3,5');
    guardar.set('recomendacion', 'Rellenar con concreto hidráulico y compactar la base.');
    guardar.append('fotos', foto('dron.png'), 'dron.png');
    const guardadoRes = await pedir('/api/admin/reportes/RC-0001/guardar', { method: 'POST', body: guardar });
    const guardado = await cuerpo(guardadoRes);
    assert.equal(guardadoRes.status, 200, JSON.stringify(guardado));
    assert.equal(guardado.correoEnviado, false);
    assert.equal(guardado.reporte.estatus, 'inspeccionado');
    assert.equal(guardado.reporte.areaCm2, 9640);
    assert.equal(guardado.reporte.profundidadCm, 3.5);
    assert.equal(guardado.envio.estado, 'fallo');
    assert.ok(guardado.reporte.fotos.some((f) => f.origen === 'inspeccion'));

    const temprano = await pedir('/api/admin/reportes/RC-0002/reenviar', { method: 'POST' });
    assert.equal(temprano.status, 400);

    process.env.MAIL_TRANSPORT = 'json';
    const reenvio = await cuerpo(await pedir('/api/admin/reportes/RC-0001/reenviar', { method: 'POST' }));
    assert.equal(reenvio.correoEnviado, true, JSON.stringify(reenvio.envio));
    assert.equal(reenvio.reporte.estatus, 'enviado');
    assert.ok(reenvio.reporte.enviadoEn);
    assert.equal(reenvio.reporte.envios.at(-1).estado, 'exito');
    assert.equal(reenvio.reporte.envios[0].estado, 'fallo');

    const buzon = path.join(entorno.dir, 'data', 'buzon');
    const archivos = fs.readdirSync(buzon);
    assert.equal(archivos.length, 1);
    const mensaje = fs.readFileSync(path.join(buzon, archivos[0]), 'utf8');
    assert.ok(mensaje.includes('RC-0001'));
    assert.ok(mensaje.includes('https://www.google.com/maps?q='));
    assert.ok(mensaje.includes('/folio/RC-0001'));
    assert.ok(mensaje.includes('atencion.ciudadana@sji.gob.mx'));
    assert.ok(mensaje.includes('hidr') && mensaje.includes('ulico'));
    assert.ok(mensaje.includes('120.5'));
    assert.ok(mensaje.toLowerCase().includes('vecino') || mensaje.includes('attachments'));

    const publico = await cuerpo(await pedir('/api/reportes/RC-0001'));
    assert.equal(publico.estatus, 'enviado');
    assert.equal(publico.areaCm2, 9640);
    assert.ok(publico.recomendacion.includes('hidráulico'));
    assert.ok(!JSON.stringify(publico).includes('ana.secreta'));
    assert.equal(publico.enviadoEn, reenvio.reporte.enviadoEn);

    const filtrados = await cuerpo(await pedir('/api/admin/reportes?categoria=alumbrado'));
    assert.equal(filtrados.length, 1);
    assert.equal(filtrados[0].folio, 'RC-0002');

    const csvRes = await pedir('/api/admin/exportar.csv');
    const csvBytes = Buffer.from(await csvRes.arrayBuffer());
    assert.ok(csvBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
    const csv = csvBytes.toString('utf8');
    assert.ok(csv.includes('RC-0001'));
    assert.ok(csv.includes('Bache'));
    assert.ok(csv.includes('9640'));
    assert.ok(!csv.includes('ana.secreta'));
    const xlsx = await pedir('/api/admin/exportar.xlsx');
    assert.equal(xlsx.status, 200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(Buffer.from(await xlsx.arrayBuffer()));
    const hoja = libro.getWorksheet('Reportes');
    const valores = [];
    hoja.eachRow((fila) => fila.eachCell((celda) => valores.push(String(celda.value))));
    assert.ok(valores.includes('RC-0001'));
    assert.ok(valores.includes('RC-0002'));

    const reparar = new FormData();
    reparar.set('estatus', 'reparado');
    reparar.set('largo_cm', '120.5');
    reparar.set('ancho_cm', '80');
    reparar.set('profundidad_cm', '3.5');
    reparar.set('recomendacion', 'Rellenar con concreto hidráulico y compactar la base.');
    const reparado = await cuerpo(await pedir('/api/admin/reportes/RC-0001/guardar', { method: 'POST', body: reparar }));
    assert.equal(reparado.reporte.estatus, 'reparado');
    assert.equal(reparado.correoEnviado, false);
    assert.equal(fs.readdirSync(buzon).length, 1);

    await pedir('/api/admin/salir', { method: 'POST' });
    const cerrado = await pedir('/api/admin/reportes');
    assert.equal(cerrado.status, 401);
    console.log('Flujo SQLite + correo de prueba: correcto.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.cerrar();
    entorno.restaurar();
  }
}

async function escenarioJson() {
  const entorno = prepararEntorno({ DATA_BACKEND: 'json' });
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  const { crearApp } = require('../src/server');
  const app = await crearApp();
  const server = await escuchar(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  const pedir = cliente(base);
  try {
    const salud = await cuerpo(await pedir('/salud'));
    assert.equal(salud.datos, 'json');
    assert.equal(salud.correo, 'ninguno');
    const alta = new FormData();
    alta.set('categoria', 'coladera');
    alta.set('descripcion', 'Coladera sin tapa junto a la esquina');
    alta.set('lat', '20.997');
    alta.set('lng', '-100.386');
    alta.set('anonimo', '1');
    alta.append('fotos', foto('tapa.png'), 'tapa.png');
    const creado = await cuerpo(await pedir('/api/reportes', { method: 'POST', body: alta }));
    assert.equal(creado.folio, 'RC-0001');
    await pedir('/api/admin/ingresar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'clave-de-prueba-123' }),
    });
    const guardar = new FormData();
    guardar.set('estatus', 'inspeccionado');
    guardar.set('largo_cm', '40');
    guardar.set('ancho_cm', '40');
    guardar.set('profundidad_cm', '10');
    guardar.set('recomendacion', 'Colocar tapa nueva.');
    const guardado = await cuerpo(await pedir('/api/admin/reportes/RC-0001/guardar', { method: 'POST', body: guardar }));
    assert.equal(guardado.reporte.estatus, 'inspeccionado');
    assert.equal(guardado.envio.estado, 'pendiente');
    assert.equal(guardado.reporte.areaCm2, 1600);
    console.log('Respaldo JSON sin SMTP: el reporte queda Inspeccionado y el envío pendiente.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.cerrar();
    entorno.restaurar();
  }
}

(async () => {
  await escenarioSqlite();
  await escenarioJson();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
