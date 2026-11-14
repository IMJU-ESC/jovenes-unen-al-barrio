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
