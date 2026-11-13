# ReportaCalle

Aplicación web gratuita para que las vecinas y los vecinos de **San José Iturbide, Guanajuato**, reporten problemas de la calle: baches, fugas de agua, alumbrado, coladeras u otro. Cada reporte recibe un folio (`RC-0001`, `RC-0002`, …). Quien coordina el proyecto puede inspeccionarlo (fotos, medidas y recomendación) y, al marcarlo como **Inspeccionado**, la app envía un correo al municipio. Si el correo sale bien, el estatus pasa a **Enviado al municipio**.

Es un servicio ciudadano sin fines de lucro. Los reportes se entregan gratis al municipio.

## Qué puede hacer alguien

- **Reportar** en el inicio: tipo de problema, fotos, ubicación (GPS o pin en el mapa) y una descripción. El contacto es opcional y se puede enviar de forma anónima.
- **Ver el mapa** en `/mapa`, con un color por estatus. No se muestra el contacto.
- **Seguir un folio** en `/folio/RC-0001`: línea de tiempo, fotos, y —si ya hubo inspección— medidas, recomendación y fecha de envío.
- **Administrar** en `/admin`: lista, filtros, contacto del vecino, inspección, cambio de estatus, historial de correos, reenvío y descarga CSV o Excel.

Estatus: **Recibido**, **Inspeccionado**, **Enviado al municipio**, **Reparado**.

El aviso de `/privacidad` es un **borrador**. Hay que completarlo con el nombre del responsable y un contacto para pedir que se borre un reporte. Está marcado con un comentario `BORRADOR` en el código de esa página.

## Cómo está armada (para mantenerla simple)

Una sola aplicación **Node.js + Express**. Las páginas son HTML, CSS y JavaScript sin framework. Los mapas usan **Leaflet** y teselas de **OpenStreetMap** (no hace falta una llave de pago).

| Pieza | Producción | Si no configuras nada (tu computadora) |
| --- | --- | --- |
| Datos | PostgreSQL de Supabase, con la variable `DATABASE_URL` | SQLite en `data/reportacalle.sqlite`. Si ese módulo no se pudo instalar, un archivo `data/reportacalle.json` |
| Fotos | Supabase Storage | Carpeta `uploads/`, servida por la propia app |
| Correo | SMTP (Brevo, Resend u otro) | No se envía. El reporte se queda en Inspeccionado y el intento queda como pendiente |

La misma aplicación habla con cualquiera de esas opciones. No hay que cambiar código para pasar de local a Render.

Decisiones a propósito, para que sea fácil de cuidar:

- El área se calcula sola: **largo × ancho**, en cm². La profundidad no entra en el área.
- El correo se dispara al **guardar** un reporte con el estatus Inspeccionado (esa acción es la revisión humana). Volver a guardar mientras ya está Inspeccionado no manda otro correo. Para repetirlo está el botón **Reenviar al municipio**.
- El CSV y el Excel para el municipio **no incluyen** el teléfono ni el correo del vecino. Eso solo se ve dentro del panel.
- `MAIL_TRANSPORT=json` simula un envío exitoso y guarda el mensaje en `data/buzon/`. Sirve para probar en local. No lo uses en Render.

## Correrla en tu computadora

Necesitas [Node.js 20 o más nuevo](https://nodejs.org).

```bash
npm install
npm start
```

Abre [http://localhost:3000](http://localhost:3000). Sin archivo `.env` la app arranca igual: guarda datos y fotos en la carpeta del proyecto y el panel no deja entrar hasta que definas una contraseña.

Para usar el panel y dejar la configuración anotada:

```bash
cp .env.example .env
```

Edita `.env` y pon al menos:

```bash
ADMIN_PASSWORD=una-clave-solo-tuya
SESSION_SECRET=una-frase-larga-y-aleatoria
```

Reinicia con `npm start`. Entra a [http://localhost:3000/admin](http://localhost:3000/admin).

Para probar el correo **sin** abrir una cuenta SMTP, agrega en `.env`:

```bash
MAIL_TRANSPORT=json
MAIL_FROM=ReportaCalle <reportes@reportacalle.test>
```

Al marcar un reporte como Inspeccionado, el estatus pasará a Enviado al municipio y el mensaje quedará en `data/buzon/`. Quita `MAIL_TRANSPORT` cuando ya tengas SMTP de verdad.

Durante el desarrollo puedes usar `npm run dev` (reinicia sola al cambiar código) o `npm run verificar` (recorre el flujo sola, con un SMTP falso y luego el transporte de prueba).

`data/` y `uploads/` no se suben a git. En Render el disco se borra en cada despliegue: por eso en producción hacen falta Supabase y, para avisar al municipio, el SMTP.

## Variables de entorno

| Variable | Obligatoria en producción | Para qué sirve |
| --- | --- | --- |
| `PORT` | La pone Render | Puerto HTTP. La app escucha en `0.0.0.0`. |
| `DATABASE_URL` | Sí | URI de PostgreSQL (Supabase). Si falta, se usa SQLite o JSON. |
| `SUPABASE_URL` | Sí, para las fotos | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_KEY` | Sí, para las fotos | Llave `service_role`. Solo vive en el servidor. Nunca va al navegador. |
| `SUPABASE_BUCKET` | Sí, para las fotos | Nombre del bucket público. En el ejemplo: `reportes`. |
| `ADMIN_PASSWORD` | Sí | Contraseña del panel `/admin`. |
| `SESSION_SECRET` | Sí | Firma la cookie de sesión. En el Blueprint de Render se genera sola. |
| `PUBLIC_BASE_URL` | Recomendada | Dirección pública, sin barra final, para los enlaces del correo. Ejemplo: `https://reportacalle.onrender.com`. Si falta, se usa el host de la petición. |
| `SMTP_HOST` | Sí, para enviar correo | Servidor SMTP. |
| `SMTP_PORT` | Sí, para enviar correo | Normalmente `587`. Con SSL directo, `465`. |
| `SMTP_SECURE` | Sí, para enviar correo | `false` en el puerto 587. `true` en el 465. |
| `SMTP_USER` | Sí, para enviar correo | Usuario SMTP. |
| `SMTP_PASS` | Sí, para enviar correo | Contraseña o llave SMTP. |
| `MAIL_FROM` | Sí, para enviar correo | Remitente **del proyecto**, por ejemplo `ReportaCalle <reportes@tudominio.org>`. No uses un Gmail personal. |
| `MAIL_TO` | Tiene valor por defecto | Destino. Si no la defines: `atencion.ciudadana@sji.gob.mx`. |
| `MAIL_TRANSPORT` | No | Solo pruebas locales. `json` simula el envío. No la pongas en Render. |

Si en el Blueprint todavía no tienes un secreto, puedes escribir `PENDIENTE`. La app arranca y trata ese valor como “no configurado”. Después cámbialo en el **Dashboard de Render**, en Environment: un nuevo sync del Blueprint no actualiza las variables marcadas como secreto.

Opcionales de desarrollo: `DATA_BACKEND` (`auto`, `sqlite`, `json` o `postgres`), `DATA_DIR` y `UPLOADS_DIR`.

## Configurar el correo al municipio

Cuando en el panel guardas un reporte como **Inspeccionado**, ReportaCalle arma un correo en HTML y en texto plano con folio, tipo, descripción, ubicación, enlace de Google Maps, medidas (largo, ancho, profundidad y área), recomendación, fotos (adjuntas y también como enlace) y el enlace público de seguimiento. Si el envío funciona, el estatus cambia a **Enviado al municipio** y se guarda la fecha. Si el SMTP no está listo o el servidor rechaza el mensaje, el reporte **sigue en Inspeccionado**, el error queda en el historial de envíos y puedes usar **Reenviar al municipio**.

El remitente (`MAIL_FROM`) tiene que ser un correo del proyecto, con un dominio que controles o el remitente que te dé el servicio de correo. No uses tu Gmail personal: se mezcla con tu bandeja y varios proveedores lo bloquean.

### Brevo (plan gratuito)

1. Crea una cuenta en [https://www.brevo.com](https://www.brevo.com).
2. Verifica un remitente o, mejor, un dominio propio (Settings → Senders, domains & dedicated IPs). El correo verificado será tu `MAIL_FROM`.
3. En SMTP & API, crea una llave SMTP.
4. En Render (o en tu `.env`) pon:
   - `SMTP_HOST=smtp-relay.brevo.com`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
   - `SMTP_USER=` el correo con el que entraste a Brevo
   - `SMTP_PASS=` la llave SMTP (no la contraseña de la cuenta)
   - `MAIL_FROM=ReportaCalle <reportes@tudominio.org>` (un remitente ya verificado)
   - `MAIL_TO=atencion.ciudadana@sji.gob.mx`

### Resend (plan gratuito)

1. Crea una cuenta en [https://resend.com](https://resend.com).
2. Agrega y verifica un dominio (Resend no deja usar un Gmail como remitente).
3. Crea una API key.
4. En Render (o en tu `.env`) pon:
   - `SMTP_HOST=smtp.resend.com`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
   - `SMTP_USER=resend`
   - `SMTP_PASS=` la API key
   - `MAIL_FROM=ReportaCalle <reportes@tudominio.org>`
   - `MAIL_TO=atencion.ciudadana@sji.gob.mx`

Cada intento (éxito, fallo o pendiente) se guarda en la tabla `envios`.

## Desplegar en Render + Supabase

La base y las fotos van en Supabase. Render solo ejecuta la página. El archivo `render.yaml` describe el servicio web (plan gratuito, región Oregon, revisión de salud en `/salud`).

Cuando este repositorio esté en la rama principal, puedes abrir el Blueprint aquí:

[https://dashboard.render.com/blueprint/new?repo=https://github.com/cachewow/reportacalle](https://dashboard.render.com/blueprint/new?repo=https://github.com/cachewow/reportacalle)

### 1. Crear el proyecto de Supabase

1. Entra a [https://supabase.com](https://supabase.com) y crea un proyecto. Guarda la contraseña de la base: no se vuelve a mostrar completa.
2. Espera a que el proyecto termine de crearse.

### 2. Obtener `DATABASE_URL`

1. En el proyecto: **Project Settings → Database**.
2. En **Connection string** elige **URI**.
3. Copia la cadena, sustituye `[YOUR-PASSWORD]` por la contraseña de la base y, si hace falta, codifica los caracteres especiales de la contraseña (`@` pasa a `%40`, `#` a `%23`).
4. La URI debe pedir SSL. Si no trae `sslmode=require` al final, agrégalo: `?sslmode=require`.
5. Ese texto completo es `DATABASE_URL`. No lo subas a git.

Para un servicio que se queda prendido, como este en Render, sirve la conexión directa (puerto 5432). La app crea las tablas sola la primera vez que arranca.

### 3. Obtener las llaves y el bucket de fotos

1. **Project Settings → API**.
2. `SUPABASE_URL` es el **Project URL**.
3. `SUPABASE_SERVICE_KEY` es la llave **service_role** (secret). No uses la llave `anon` y no la pongas en el HTML.
4. En **Storage → New bucket**, nombre `reportes` y márcalo como **público** para que el mapa, el seguimiento y el correo puedan mostrar las fotos. Ese nombre es `SUPABASE_BUCKET`.

### 4. Crear el servicio en Render

1. Fusiona este proyecto en la rama principal del repositorio de GitHub.
2. Abre el enlace del Blueprint de arriba (o en el Dashboard: **New → Blueprint** y elige el repo).
3. Revisa que el servicio se llame `reportacalle` y que el plan sea el gratuito si quieres empezar sin costo.
4. Completa los secretos que pide el formulario:
   - `ADMIN_PASSWORD`: una contraseña larga, solo tuya.
   - `SESSION_SECRET`: si el Blueprint la generó sola, déjala.
   - `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`: los valores del paso anterior.
   - `PUBLIC_BASE_URL`: puedes poner `PENDIENTE` la primera vez y, cuando Render te dé la dirección `https://algo.onrender.com`, cambiarla en el Dashboard.
   - SMTP y `MAIL_FROM`: los de Brevo o Resend. Si todavía no los tienes, escribe `PENDIENTE` en `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`. La página funciona; los correos quedan pendientes.
   - `MAIL_TO` ya viene como `atencion.ciudadana@sji.gob.mx`. Cámbiala si el municipio te da otra.
5. Pulsa **Apply** y espera a que el despliegue quede en vivo. La revisión de salud llama a `/salud`.
6. Abre la URL del servicio, crea un reporte de prueba y entra a `/admin`.

El plan gratuito de Render se duerme tras un rato sin visitas. La primera visita después de eso tarda un poco más.

Los secretos del Blueprint solo se preguntan al crear el servicio. Para cambiarlos después: entra al servicio en Render → **Environment** → edita el valor → **Save**. No hace falta volver a aplicar el Blueprint, y un sync posterior no borra lo que escribiste ahí.

### 5. Después del primer despliegue

1. Copia la URL `https://….onrender.com` en `PUBLIC_BASE_URL` para que los enlaces del correo no dependan de la petición.
2. Cuando el SMTP esté listo, sustituye los `PENDIENTE` y marca un reporte de prueba como Inspeccionado.
3. Revisa el historial de envíos en el panel. Si falló, el botón **Reenviar al municipio** lo intenta de nuevo sin perder las medidas.

## Aviso de privacidad

`/privacidad` es un borrador honesto: dice qué se recoge, que el contacto es opcional, que las fotos y la ubicación se comparten con el municipio y que los datos no se venden. Antes de promover la página, pon tu nombre y un correo para las solicitudes de eliminación. El comentario HTML al inicio de `vistas/privacidad.html` lo recuerda.
