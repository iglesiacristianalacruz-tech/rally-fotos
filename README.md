# Evidencia de equipos

App web/PWA simple para iPhone: equipos suben una foto por item de checklist y un admin revisa, borra fotos y edita la lista.

## Stack

- HTML/CSS/JS plano.
- Supabase Free para Postgres + Storage.
- IndexedDB para fotos pendientes cuando no hay internet.
- GitHub Pages o Cloudflare Pages para hosting estático.
- Cliente Supabase guardado localmente en `supabase.js`.

Sin React, sin build step, sin app nativa.

## Modo demo

Abre `index.html` directamente para probar el flujo sin Supabase. En demo, los datos se guardan en el navegador.

PIN admin: se configura en `config.js`.

## Setup real con Supabase

1. Crea un proyecto en Supabase.
2. En Supabase SQL Editor, ejecuta `supabase.sql`.
3. Copia `Project URL` y `anon public key` desde Supabase.
4. Edita `config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  supabaseAnonKey: "TU_ANON_KEY",
  bucket: "team-photos",
  adminPin: "CAMBIA_ESTE_PIN"
};
```

5. Sube esta carpeta a GitHub Pages.

Si ya habias corrido el SQL antes de agregar PIN por equipo, ejecuta esta migracion una vez:

```sql
alter table public.teams add column if not exists pin text not null default '';
```

## Uso

- Admin: crea cada equipo y asigna su PIN.
- Equipo: elige su equipo de la lista y entra con su PIN.
- Equipo con internet: toma foto y se sube.
- Equipo sin internet: toma foto, queda guardada en ese celular y luego toca `Subir guardadas`.
- Admin: entra con PIN, selecciona equipo, ve previews y puede borrar fotos.
- Admin: desde el menu de cada equipo puede renombrarlo o eliminarlo con sus fotos.
- Admin al editar un item: se eliminan las fotos de ese item para todos los equipos.

## Seguridad

Este MVP usa PIN simple para admin/equipos y politicas abiertas en Supabase porque no hay login real ni backend propio.

Sirve para un evento interno/controlado. Para uso publico, mueve las acciones admin y borrados a Supabase Edge Functions con secreto del servidor.

## Checks

```bash
node self-check.js
node --check app.js
node --check service-worker.js
```
