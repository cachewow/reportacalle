// Fotos de ReportaCalle.
//
// Si SUPABASE_URL, SUPABASE_SERVICE_KEY y SUPABASE_BUCKET están definidas,
// las fotos se suben a Supabase Storage. Si no, se guardan en uploads/
// y Express las sirve en /uploads/...

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { directorioUploads, supabaseConfigurado } = require('./config');

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function detectarMime(buffer, declarado) {
  let mime = String(declarado || '').toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (!MIME_PERMITIDOS.has(mime) || !buffer || buffer.length < 12) return null;
  const magia = buffer.subarray(0, 12);
  const esJpeg = magia[0] === 0xff && magia[1] === 0xd8 && magia[2] === 0xff;
  const esPng = magia[0] === 0x89 && magia[1] === 0x50 && magia[2] === 0x4e && magia[3] === 0x47;
  const esGif = magia.slice(0, 4).toString('ascii') === 'GIF8';
  const esWebp = magia.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const coincide = (mime === 'image/jpeg' && esJpeg)
    || (mime === 'image/png' && esPng)
    || (mime === 'image/gif' && esGif)
    || (mime === 'image/webp' && esWebp);
  return coincide ? mime : null;
}

function validarArchivo(archivo) {
  if (!archivo || !archivo.buffer || !archivo.buffer.length) {
    return 'La foto llegó vacía.';
  }
  if (archivo.size > 8 * 1024 * 1024) {
    return 'Cada foto debe pesar menos de 8 MB.';
  }
  const mime = detectarMime(archivo.buffer, archivo.mimetype);
  if (!mime) {
    return 'Solo se aceptan fotos JPG, PNG, WEBP o GIF. Si el teléfono manda HEIC, el formulario intenta convertirla a JPG.';
  }
  return null;
}

function nombreSeguro(mime) {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${EXTENSION[mime]}`;
}

function crearLocal() {
  const raiz = directorioUploads();
  fs.mkdirSync(raiz, { recursive: true });

  function absoluto(clave) {
    const destino = path.resolve(raiz, clave);
    const base = path.resolve(raiz);
    if (destino !== base && !destino.startsWith(`${base}${path.sep}`)) {
      throw new Error('Ruta de foto inválida.');
    }
    return destino;
  }

  return {
    tipo: 'local',
    async guardar({ folio, origen, archivo }) {
      const mime = detectarMime(archivo.buffer, archivo.mimetype);
      const clave = path.posix.join(origen, folio, nombreSeguro(mime));
      const destino = absoluto(clave);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      await fs.promises.writeFile(destino, archivo.buffer);
      return { origen, url: `/uploads/${clave}`, clave, mime };
    },
    async leer(foto) {
      return fs.promises.readFile(absoluto(foto.clave));
    },
    async borrar(foto) {
      try {
        await fs.promises.unlink(absoluto(foto.clave));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
  };
}

function crearSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const bucket = process.env.SUPABASE_BUCKET.trim();
  const cliente = createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_KEY.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    tipo: 'supabase',
    async guardar({ folio, origen, archivo }) {
      const mime = detectarMime(archivo.buffer, archivo.mimetype);
      const clave = `${origen}/${folio}/${nombreSeguro(mime)}`;
      const { error } = await cliente.storage.from(bucket).upload(clave, archivo.buffer, {
        contentType: mime,
        upsert: false,
      });
      if (error) {
        throw new Error(`No se pudo guardar la foto en Supabase: ${error.message}`);
      }
      const { data } = cliente.storage.from(bucket).getPublicUrl(clave);
      return { origen, url: data.publicUrl, clave, mime };
    },
    async leer(foto) {
      const { data, error } = await cliente.storage.from(bucket).download(foto.clave);
      if (error || !data) {
        throw new Error(error ? error.message : 'No se pudo descargar la foto.');
      }
      return Buffer.from(await data.arrayBuffer());
    },
    async borrar(foto) {
      await cliente.storage.from(bucket).remove([foto.clave]);
    },
  };
}

function crearAlmacen() {
  if (supabaseConfigurado()) return crearSupabase();
  return crearLocal();
}

module.exports = {
  crearAlmacen,
  validarArchivo,
  detectarMime,
};
