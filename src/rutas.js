const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { CATEGORIAS, categoriaValida, estatusValido } = require('./catalogo');
const { validarArchivo } = require('./almacen');
const { enviarAlMunicipio, estadoCorreo } = require('./correo');
const { aCsv, aXlsx } = require('./exportar');
const { aPublico, aAdmin } = require('./serializar');
const { pagina } = require('./vista');
const { RAIZ } = require('./config');
const {
  esVerdadero,
  numero,
  calcularArea,
  folioValido,
  basePublica,
  clavesIguales,
} = require('./util');

const VISTAS = path.join(RAIZ, 'vistas');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
});

function leerVista(nombre) {
  return fs.readFileSync(path.join(VISTAS, nombre), 'utf8');
}

function asincrono(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function conFotos(max) {
  return (req, res, next) => {
    upload.array('fotos', max)(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Cada foto debe pesar menos de 8 MB.' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: `Puedes subir hasta ${max} fotos.` });
        }
      }
      return res.status(400).json({ error: error.message || 'No se pudieron leer las fotos.' });
    });
  };
}

function exigeAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Entra al panel para continuar.' });
}

function normalizarFolio(valor) {
  return String(valor || '').trim().toUpperCase();
}

function crearLimitador() {
  const intentos = new Map();
  return {
    bloqueado(ip) {
      const ahora = Date.now();
      const previos = (intentos.get(ip) || []).filter((t) => ahora - t < 10 * 60 * 1000);
      intentos.set(ip, previos);
      return previos.length >= 8;
    },
    anotar(ip) {
      const ahora = Date.now();
      const previos = (intentos.get(ip) || []).filter((t) => ahora - t < 10 * 60 * 1000);
      previos.push(ahora);
      intentos.set(ip, previos);
    },
  };
}

async function guardarArchivos(almacen, archivos, origen, carpeta) {
  const guardadas = [];
  try {
    for (const archivo of archivos) {
      guardadas.push(await almacen.guardar({ folio: carpeta, origen, archivo }));
    }
    return guardadas;
  } catch (error) {
    await Promise.all(guardadas.map((foto) => almacen.borrar(foto).catch(() => {})));
    throw error;
  }
}

function registrarRutas(app, { datos, almacen }) {
  const limite = crearLimitador();

  const enviarPagina = (vista, opciones) => (req, res) => {
    res.type('html').send(pagina({ ...opciones, cuerpo: leerVista(vista) }));
  };

  app.get('/', enviarPagina('reportar.html', {
    titulo: 'Reportar un problema · ReportaCalle',
    descripcion: 'Reporta baches, fugas, alumbrado y coladeras en San José Iturbide, Guanajuato.',
    activo: 'reportar',
    mapa: true,
    scripts: ['/js/reportar.js'],
  }));
  app.get('/reportar', (req, res) => res.redirect(301, '/'));
  app.get('/mapa', enviarPagina('mapa.html', {
    titulo: 'Mapa de reportes · ReportaCalle',
    descripcion: 'Mapa de problemas de la calle reportados en San José Iturbide.',
    activo: 'mapa',
    ancha: true,
    mapa: true,
    scripts: ['/js/mapa.js'],
  }));
  const opcionesFolio = {
    titulo: 'Seguimiento de reporte · ReportaCalle',
    descripcion: 'Consulta el estado de un reporte de ReportaCalle con su folio.',
    activo: 'folio',
    mapa: true,
    scripts: ['/js/seguimiento.js'],
  };
  app.get('/folio', enviarPagina('seguimiento.html', opcionesFolio));
  app.get('/folio/:folio', enviarPagina('seguimiento.html', opcionesFolio));
  app.get('/privacidad', enviarPagina('privacidad.html', {
    titulo: 'Aviso de privacidad · ReportaCalle',
    descripcion: 'Aviso de privacidad de ReportaCalle, reportes ciudadanos en San José Iturbide.',
    activo: 'privacidad',
  }));
  app.get('/admin', enviarPagina('admin.html', {
    titulo: 'Administración · ReportaCalle',
    descripcion: 'Panel del responsable de ReportaCalle.',
    activo: 'admin',
    ancha: true,
    robots: 'noindex,nofollow',
    scripts: ['/js/admin.js'],
  }));

  app.get('/salud', asincrono(async (req, res) => {
    const viva = await datos.ping();
    if (!viva) return res.status(503).json({ ok: false });
    res.json({
      ok: true,
      servicio: 'reportacalle',
      datos: datos.motor,
      fotos: almacen.tipo,
      correo: estadoCorreo().modo,
    });
  }));

  app.get('/api/reportes', asincrono(async (req, res) => {
    const lista = await datos.listar();
    res.json(lista.map(aPublico));
  }));

  app.get('/api/reportes/:folio', asincrono(async (req, res) => {
    const folio = normalizarFolio(req.params.folio);
    if (!folioValido(folio)) {
      return res.status(400).json({ error: 'El folio debe verse así: RC-0001.' });
    }
    const reporte = await datos.porFolio(folio);
    if (!reporte) return res.status(404).json({ error: 'No encontramos ese folio.' });
    res.json(aPublico(reporte));
  }));

  app.post('/api/reportes', conFotos(6), asincrono(async (req, res) => {
    const categoria = String(req.body.categoria || '').trim();
    const descripcion = String(req.body.descripcion || '').trim();
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const anonimo = esVerdadero(req.body.anonimo);

    if (!categoriaValida(categoria)) {
      return res.status(400).json({ error: 'Elige el tipo de problema.' });
    }
    if (descripcion.length < 8 || descripcion.length > 4000) {
      return res.status(400).json({ error: 'Cuéntanos el problema en la descripción (entre 8 y 4000 caracteres).' });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'La ubicación no es válida. Coloca el pin en el mapa.' });
    }

    const archivos = (req.files || []).filter((archivo) => archivo && archivo.size > 0);
    if (!archivos.length) {
      return res.status(400).json({ error: 'Agrega al menos una foto del problema.' });
    }
    for (const archivo of archivos) {
      const error = validarArchivo(archivo);
      if (error) return res.status(400).json({ error });
    }

    const contactoNombre = anonimo ? null : String(req.body.contacto_nombre || '').trim().slice(0, 120) || null;
    const contactoDato = anonimo ? null : String(req.body.contacto_dato || '').trim().slice(0, 160) || null;
    const carpeta = crypto.randomBytes(6).toString('hex');
    const guardadas = await guardarArchivos(almacen, archivos, 'vecino', carpeta);

    try {
      const reporte = await datos.crearReporte({
        categoria,
        descripcion,
        lat,
        lng,
        anonimo,
        contactoNombre,
        contactoDato,
      }, guardadas);
      console.log(`Nuevo reporte ${reporte.folio} (${CATEGORIAS[categoria]}).`);
      res.status(201).json({
        folio: reporte.folio,
        enlace: `/folio/${reporte.folio}`,
        reporte: aPublico(reporte),
      });
    } catch (error) {
      await Promise.all(guardadas.map((foto) => almacen.borrar(foto).catch(() => {})));
      throw error;
    }
  }));

  app.post('/api/admin/ingresar', asincrono(async (req, res) => {
    const clave = process.env.ADMIN_PASSWORD;
    if (!clave || !String(clave).trim() || String(clave).trim().toLowerCase() === 'pendiente') {
      return res.status(503).json({ error: 'Falta configurar ADMIN_PASSWORD en el servidor.' });
    }
    const ip = req.ip || 'local';
    if (limite.bloqueado(ip)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    }
    const password = req.body && req.body.password;
    if (!password || !clavesIguales(password, clave)) {
      limite.anotar(ip);
      return res.status(401).json({ error: 'La contraseña no es correcta.' });
    }
    req.session.admin = true;
    res.json({ ok: true });
  }));

  app.post('/api/admin/salir', (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  app.get('/api/admin/sesion', (req, res) => {
    const autenticado = Boolean(req.session && req.session.admin);
    res.json({
      autenticado,
      correo: autenticado ? estadoCorreo() : undefined,
    });
  });

  app.get('/api/admin/reportes', exigeAdmin, asincrono(async (req, res) => {
    const estatus = String(req.query.estatus || '').trim();
    const categoria = String(req.query.categoria || '').trim();
    if (estatus && !estatusValido(estatus)) {
      return res.status(400).json({ error: 'Estatus no válido.' });
    }
    if (categoria && !categoriaValida(categoria)) {
      return res.status(400).json({ error: 'Categoría no válida.' });
    }
    const lista = await datos.listar({ estatus, categoria });
    res.json(lista.map(aAdmin));
  }));

  app.get('/api/admin/reportes/:folio', exigeAdmin, asincrono(async (req, res) => {
    const folio = normalizarFolio(req.params.folio);
    const reporte = await datos.porFolio(folio);
    if (!reporte) return res.status(404).json({ error: 'No encontramos ese reporte.' });
    res.json(aAdmin(reporte));
  }));

  app.post('/api/admin/reportes/:folio/guardar', exigeAdmin, (req, res, next) => {
    const tipo = req.headers['content-type'] || '';
    if (tipo.includes('multipart/form-data')) return conFotos(8)(req, res, next);
    return next();
  }, asincrono(async (req, res) => {
    const folio = normalizarFolio(req.params.folio);
    const anterior = await datos.porFolio(folio);
    if (!anterior) return res.status(404).json({ error: 'No encontramos ese reporte.' });

    const pedido = String((req.body && req.body.estatus) || anterior.estatus).trim();
    if (!estatusValido(pedido)) {
      return res.status(400).json({ error: 'Elige un estatus válido.' });
    }

    const largo = numero(req.body.largo_cm);
    const ancho = numero(req.body.ancho_cm);
    const profundidad = numero(req.body.profundidad_cm);
    if ([largo, ancho, profundidad].some((n) => Number.isNaN(n))) {
      return res.status(400).json({ error: 'Las medidas deben ser números en centímetros, cero o más.' });
    }
    const recomendacion = String(req.body.recomendacion || '').trim();
    if (recomendacion.length > 4000) {
      return res.status(400).json({ error: 'La recomendación es demasiado larga.' });
    }

    const archivos = (req.files || []).filter((archivo) => archivo && archivo.size > 0);
    for (const archivo of archivos) {
      const error = validarArchivo(archivo);
      if (error) return res.status(400).json({ error });
    }

    // "Enviado al municipio" solo lo pone un correo exitoso.
    let estatus = pedido;
    if (pedido === 'enviado' && anterior.estatus !== 'enviado') estatus = 'inspeccionado';
    if (pedido === 'enviado' && anterior.estatus === 'enviado') estatus = 'enviado';

    let reporte = await datos.actualizar(folio, {
      estatus,
      largoCm: largo,
      anchoCm: ancho,
      profundidadCm: profundidad,
      areaCm2: calcularArea(largo, ancho),
      recomendacion: recomendacion || null,
    });

    if (archivos.length) {
      const guardadas = await guardarArchivos(almacen, archivos, 'inspeccion', folio);
      try {
        reporte = await datos.agregarFotos(folio, guardadas);
      } catch (error) {
        await Promise.all(guardadas.map((foto) => almacen.borrar(foto).catch(() => {})));
        throw error;
      }
    }

    const pideInspeccion = pedido === 'inspeccionado'
      || (pedido === 'enviado' && anterior.estatus !== 'enviado');
    const yaEstaba = anterior.estatus === 'inspeccionado' && pedido === 'inspeccionado';
    let resultado = null;
    if (pideInspeccion && !yaEstaba) {
      resultado = await enviarAlMunicipio({
        datos,
        almacen,
        folio,
        baseUrl: basePublica(req),
      });
      reporte = resultado.reporte;
    }

    res.json({
      reporte: aAdmin(reporte),
      envio: resultado ? resultado.envio : null,
      correoEnviado: Boolean(resultado && resultado.ok),
    });
  }));

  app.post('/api/admin/reportes/:folio/reenviar', exigeAdmin, asincrono(async (req, res) => {
    const folio = normalizarFolio(req.params.folio);
    const reporte = await datos.porFolio(folio);
    if (!reporte) return res.status(404).json({ error: 'No encontramos ese reporte.' });
    if (reporte.estatus !== 'inspeccionado' && reporte.estatus !== 'enviado') {
      return res.status(400).json({
        error: 'Primero marca el reporte como Inspeccionado para poder enviarlo al municipio.',
      });
    }
    const resultado = await enviarAlMunicipio({
      datos,
      almacen,
      folio,
      baseUrl: basePublica(req),
    });
    res.json({
      reporte: aAdmin(resultado.reporte),
      envio: resultado.envio,
      correoEnviado: resultado.ok,
    });
  }));

  app.get('/api/admin/exportar.csv', exigeAdmin, asincrono(async (req, res) => {
    const lista = await datos.listar();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reportacalle-reportes.csv"');
    res.send(aCsv(lista));
  }));

  app.get('/api/admin/exportar.xlsx', exigeAdmin, asincrono(async (req, res) => {
    const lista = await datos.listar();
    const buffer = await aXlsx(lista);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reportacalle-reportes.xlsx"');
    res.send(buffer);
  }));
}

module.exports = { registrarRutas };
