# Smart Aula — Biblioteca virtual gratuita

Plataforma para leer y compartir PDFs. **Explorar es gratis para todos**; solo hace falta cuenta para subir PDFs y guardar favoritos.

## Corrección rápida de errores comunes

### 1. Error al subir: `new row violates row-level security`

En Supabase → **SQL Editor**, ejecuta el archivo `sql/fix-rls.sql`.

Luego cierra sesión, vuelve a entrar e intenta subir de nuevo.

### 2. Login con correo no funciona (Google sí)

En Supabase → **Authentication** → **Providers** → **Email**:

- Desactiva **Confirm email** (para desarrollo/producción simple), **o**
- Confirma el correo que te llegó al registrarte antes de iniciar sesión.

Usa el **mismo correo** al registrarte e iniciar sesión (minúsculas, sin espacios).

### 3. Parece que no hay sesión iniciada

Tras iniciar sesión, el botón del navbar debe mostrar tu nombre. Si no:

1. Revisa que `js/config.js` tenga URL y anon key correctos.
2. En Supabase → **Authentication** → **URL Configuration**, añade tu dominio local y de Netlify.

## Configuración

1. Copia `js/config.example.js` → `js/config.js`
2. Pega **Project URL** y **anon key** de Supabase
3. Ejecuta `sql/schema.sql` y luego `sql/fix-rls.sql`
4. Crea bucket Storage `pdfs` (público) con políticas de lectura/escritura para autenticados
5. Abre con **Live Server** (no `file://`)

## Estructura

- `index.html` — Inicio público
- `dashboard.html` — Biblioteca pública
- `viewer.html` — Lector PDF público
- `login.html` — Solo para subir/guardar
- `upload.html` / `profile.html` — Requieren sesión

## Stack

HTML · CSS · JavaScript vanilla · Supabase · Netlify

© Smart Aula
