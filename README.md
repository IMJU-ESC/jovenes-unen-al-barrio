# Jóvenes que Unen al Barrio · IMJU Escuinapa

Código fuente de la plataforma de seguimiento del programa.

**Sitio en funcionamiento:** https://jovenes-unen-al-barrio.feernsz.chatgpt.site

## Funciones

- Panel administrador y acceso individual de jóvenes.
- Registro de asistencia por selección múltiple o escaneo de QR individual.
- Seguimiento por mes: 90 horas (80 de actividades y 10 de aprendizaje).
- Horas independientes de actividades; faltas justificadas y no justificadas.
- Perfiles con fotografía, calendario y evidencias de actividades.
- Exportación de registros y edición de datos y accesos por administración.
- Interfaz adaptable a celulares.

## Alcance de esta copia

Esta copia corresponde al código de la versión 16, fuente `fbc6fa2dcdef312cd4151a00a12743b0418054ce`.
Incluye recursos gráficos y migraciones de estructura. No incluye registros de jóvenes,
contraseñas, sesiones, fotografías de perfiles, evidencias ni secretos de producción.
No es una copia de seguridad de la base de datos.

La publicación actual continúa alojada en ChatGPT Sites. Guardar este código en GitHub
no migra el alojamiento ni configura despliegues automáticos desde este repositorio.
Los cambios en GitHub no se publican automáticamente en el sitio actual.

## Tecnología

React, TypeScript, Vinext/Vite, Cloudflare Workers, D1 (SQLite), R2 y Drizzle.
El manifiesto `.openai/hosting.json` conserva la referencia al sitio original y las
vinculaciones `DB` y `BUCKET`; su identificador no es una credencial.

## Desarrollo

Se requiere Node.js >=22.13.0 y la versión de pnpm indicada en `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
```

Las migraciones están en `drizzle/`. Para un entorno nuevo deben aplicarse a su propia
base D1. La cuenta maestra inicial requiere configurar `BOOTSTRAP_TOKEN` como secreto
del entorno; nunca debe guardarse en Git. Una instalación nueva comienza sin usuarios.

Para alojar fuera de Sites se deben configurar el Worker, D1, R2, secretos, dominio,
migraciones y traslado seguro de datos. No es un sitio estático para GitHub Pages.

## Protección de información

No incorporar exportaciones de la base de datos, archivos `.env`, `.dev.vars`, claves,
tokens ni fotografías privadas al repositorio. Los registros operativos se respaldan
por separado en almacenamiento privado.

## Variante independiente sin servicios de pago

Se añadió una variante estática React + API Worker para **Workers Free + D1 Free**.
No utiliza R2, Cloudflare Images, Durable Objects ni servicios de correo/SMS de pago.
No activar Workers Paid. El límite gratuito de D1 por base es 500 MB; el sistema
reserva como máximo 200 MiB para fotos codificadas, dejando margen para registros e índices.
Las fotos de perfil se comprimen a 100 KB y las evidencias a 200 KB antes de salir del navegador.
El contador de almacenamiento se actualiza mediante triggers transaccionales; las cargas
se rechazan al llenarse. El panel muestra el uso y permite descargar/eliminar evidencias.
Una foto de perfil nueva libera el espacio de la anterior. No se admiten videos.

```sh
pnpm install --frozen-lockfile
pnpm build:free
pnpm db:free:local
pnpm preview:free
```

### Publicación pendiente de configurar en la cuenta propietaria

1. Verificar Workers **Free** en la cuenta Cloudflare del IMJU, sin contratar productos.
2. Crear una base D1 `jovenes-barrio`; sustituir el UUID de ejemplo en `wrangler.free.jsonc`.
3. Aplicar migraciones con `pnpm db:free:remote`.
4. Migrar registros y fotos de producción mediante un canal privado. Nunca subirlos a GitHub.
5. Para una base nueva vacía, configurar el secreto `BOOTSTRAP_TOKEN` mediante Wrangler o el
   dashboard, crear la cuenta maestra y retirar ese secreto. No publicar su valor.
6. Ejecutar `pnpm build:free` y `pnpm deploy:free`, usando el subdominio gratuito workers.dev.
7. Verificar acceso maestro y juvenil, fotos, asistencia QR y límites en el entorno real antes
   de distribuir la nueva dirección o retirar la versión anterior.

Los límites de uso se comparten con otras aplicaciones de la cuenta. En Free, alcanzar
los límites puede suspender operaciones hasta que se restablezcan; no se promete servicio
ilimitado. La preparación del código no implica que la cuenta ni el despliegue remoto estén
configurados. El alojamiento original sigue activo hasta completar la migración.
