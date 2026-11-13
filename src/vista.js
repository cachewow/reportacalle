const { escaparHtml } = require('./util');

function pagina({
  titulo,
  descripcion,
  activo,
  cuerpo,
  ancha = false,
  mapa = false,
  robots = 'index,follow',
  scripts = [],
}) {
  const enlaces = [
    ['reportar', '/', 'Reportar'],
    ['mapa', '/mapa', 'Mapa'],
    ['folio', '/folio', 'Mi folio'],
  ];
  const nav = enlaces.map(([id, href, texto]) => {
    const actual = id === activo ? ' aria-current="page"' : '';
    return `<a href="${href}"${actual}>${texto}</a>`;
  }).join('');

  const leaflet = mapa
    ? `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">`
    : '';
  const scriptsMapa = mapa
    ? '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>'
    : '';
  const scriptsPagina = scripts.map((src) => `<script src="${src}"></script>`).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escaparHtml(descripcion)}">
  <meta name="theme-color" content="#0c6b4d">
  <meta name="robots" content="${robots}">
  <title>${escaparHtml(titulo)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
  ${leaflet}
  <link rel="stylesheet" href="/css/estilos.css">
</head>
<body>
  <a class="saltar" href="#contenido">Saltar al contenido</a>
  <header class="encabezado">
    <a class="marca" href="/">
      <span class="marca-icono" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="36" height="36">
          <rect width="64" height="64" rx="16" fill="#0c6b4d"/>
          <path d="M32 12c-8.4 0-15 6.6-15 15.2C17 39 32 54 32 54s15-15 15-26.8C47 18.6 40.4 12 32 12z" fill="#fff"/>
          <circle cx="32" cy="27" r="6" fill="#0c6b4d"/>
        </svg>
      </span>
      <span>
        <strong>ReportaCalle</strong>
        <small>San José Iturbide, Guanajuato</small>
      </span>
    </a>
    <nav class="menu" aria-label="Principal">${nav}</nav>
  </header>
  <main id="contenido" class="${ancha ? 'contenido contenido-ancho' : 'contenido'}">
    <noscript>
      <p class="aviso">Para reportar, ver el mapa y consultar un folio, activa JavaScript en el navegador.</p>
    </noscript>
    ${cuerpo}
  </main>
  <footer class="pie">
    <p>Proyecto ciudadano sin fines de lucro para San José Iturbide, Guanajuato.</p>
    <p>
      <a href="/privacidad">Aviso de privacidad</a>
      <span aria-hidden="true"> · </span>
      <a href="/admin">Administración</a>
    </p>
  </footer>
  <script src="/js/comun.js"></script>
  ${scriptsMapa}
  ${scriptsPagina}
</body>
</html>`;
}

module.exports = { pagina };
