// ReportaCalle — servidor único.
// Sirve las páginas y el API. Escucha en 0.0.0.0 y en el puerto
// que indique PORT (Render lo asigna; en local usamos 3000).

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const { crearDatos } = require('./datos');
const { crearAlmacen } = require('./almacen');
const { registrarRutas } = require('./rutas');
const { pagina } = require('./vista');
const { estadoCorreo, advertirRemitente } = require('./correo');
const { directorioUploads, RAIZ } = require('./config');
const { esPendiente, escaparHtml } = require('./util');

async function crearApp() {
  const datos = await crearDatos();
  const almacen = crearAlmacen();
  fs.mkdirSync(directorioUploads(), { recursive: true });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const secreto = !esPendiente(process.env.SESSION_SECRET)
    ? process.env.SESSION_SECRET
    : 'desarrollo-solo-local-no-uses-esto-en-produccion';

  app.use(cookieSession({
    name: 'rc_sesion',
    keys: [secreto],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use('/uploads', express.static(directorioUploads(), {
    fallthrough: false,
    index: false,
    maxAge: '1h',
  }));
  app.use(express.static(path.join(RAIZ, 'public'), { index: false }));

  registrarRutas(app, { datos, almacen });

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'No encontramos esa ruta.' });
    }
    res.status(404).type('html').send(pagina({
      titulo: 'Página no encontrada · ReportaCalle',
      descripcion: 'Esa página no existe en ReportaCalle.',
      activo: '',
      cuerpo: '<section class="tarjeta"><h1>No encontramos esa página</h1><p><a href="/">Volver a reportar</a></p></section>',
    }));
  });

  app.use((error, req, res, next) => {
    const estado = error.status || error.statusCode || 500;
    if (estado >= 500) console.error(error);
    if (res.headersSent) return next(error);
    const mensaje = estado === 500
      ? 'Ocurrió un error. Intenta de nuevo en un momento.'
      : (error.message || 'No se pudo completar la acción.');
    if (req.path.startsWith('/api/') || (req.headers.accept || '').includes('application/json')) {
      return res.status(estado).json({ error: mensaje });
    }
    return res.status(estado).type('html').send(pagina({
      titulo: 'Error · ReportaCalle',
      descripcion: 'Ocurrió un error en ReportaCalle.',
      activo: '',
      cuerpo: `<section class="tarjeta"><h1>Algo salió mal</h1><p>${escaparHtml(mensaje)}</p></section>`,
    }));
  });

  app.cerrar = () => datos.cerrar();
  app.locals.datos = datos;
  app.locals.almacen = almacen;
  return app;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && esPendiente(process.env.SESSION_SECRET)) {
    console.error('En producción hace falta SESSION_SECRET. No se inicia el servidor.');
    process.exit(1);
  }
  if (esPendiente(process.env.SESSION_SECRET)) {
    console.warn('SESSION_SECRET no está definida. Se usa un secreto temporal; las sesiones se pierden al reiniciar.');
  }
  if (esPendiente(process.env.ADMIN_PASSWORD)) {
    console.warn('ADMIN_PASSWORD no está definida. El panel /admin no va a dejar entrar a nadie.');
  }

  const app = await crearApp();
  const puerto = Number(process.env.PORT) || 3000;
  app.listen(puerto, '0.0.0.0', () => {
    const correo = estadoCorreo();
    advertirRemitente();
    console.log(`ReportaCalle escuchando en http://0.0.0.0:${puerto}`);
    console.log(`Datos: ${app.locals.datos.motor}`);
    console.log(`Fotos: ${app.locals.almacen.tipo}`);
    console.log(`Correo: ${correo.modo}${correo.listo ? '' : ' (sin configurar, los envíos quedan pendientes)'}`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('No se pudo iniciar ReportaCalle.');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { crearApp };
