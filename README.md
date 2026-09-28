# Smart Aula

> Biblioteca académica digital para organizar, consultar y compartir documentos educativos.

Smart Aula es una plataforma web desarrollada para facilitar el acceso y la gestión de recursos académicos en formato digital. Permite explorar documentos, leer PDFs directamente desde el navegador, guardar contenido, organizarlo mediante colecciones y publicar nuevos documentos.

El proyecto nació como una propuesta para centralizar materiales académicos que normalmente se encuentran dispersos entre carpetas, dispositivos y diferentes plataformas.

---

## Características

### Biblioteca digital

- Exploración de documentos académicos.
- Búsqueda de documentos.
- Filtrado por categorías.
- Visualización de información de cada documento.
- Lectura de PDFs directamente desde el navegador.
- Descarga de documentos.

### Cuenta de usuario

- Registro e inicio de sesión.
- Autenticación mediante correo electrónico.
- Inicio de sesión con Google.
- Recuperación de contraseña.
- Perfil de usuario.
- Avatar y biografía.

### Organización personal

- Guardar documentos como favoritos.
- Crear y administrar colecciones.
- Agregar documentos a colecciones.
- Continuar la lectura desde el punto donde se dejó.
- Registro del progreso de lectura.

### Interacción

- Sistema de likes.
- Comentarios en documentos.
- Contador de visualizaciones.
- Contador de descargas.

### Publicación de documentos

Los usuarios autenticados pueden publicar documentos académicos en formato PDF.

Las funciones incluyen:

- Subida de PDFs.
- Información y descripción del documento.
- Selección de categorías.
- Edición de documentos.
- Eliminación de documentos.
- Control de visibilidad de documentos.

### Administración

La plataforma cuenta con un módulo de administración para gestionar:

- Usuarios.
- Documentos.
- Categorías.
- Información general de la plataforma.

### PWA

Smart Aula incorpora características de Progressive Web App (PWA), permitiendo una experiencia más cercana a una aplicación instalada.

Incluye:

- Web App Manifest.
- Service Worker.
- Página offline.
- Iconos para dispositivos.
- Instalación como aplicación compatible.

### Interfaz

La plataforma cuenta con una interfaz orientada a facilitar la navegación y lectura, incluyendo:

- Diseño responsive.
- Modo oscuro.
- Categorías visuales.
- Biblioteca de documentos.
- Navegación adaptada a diferentes dispositivos.

---

## Tecnologías utilizadas

### Frontend

- HTML5
- CSS3
- JavaScript
- PDF.js

### Backend y servicios

- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Storage

### Despliegue

- Netlify
- GitHub Pages para pruebas del frontend

### Herramientas

- Git
- GitHub
- Visual Studio Code

---

## Arquitectura

Smart Aula utiliza una arquitectura basada en una aplicación web cliente conectada a servicios en la nube.

```text
                    +---------------------+
                    |       Usuario       |
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    |   Smart Aula Web    |
                    |     HTML/CSS/JS     |
                    +----------+----------+
                               |
                 +-------------+-------------+
                 |             |             |
                 v             v             v
          +-----------+ +-----------+ +-----------+
          |   Auth    | | PostgreSQL| |  Storage  |
          |  Supabase | |  Supabase | |  Supabase |
          +-----------+ +-----------+ +-----------+
                               |
                               v
                         Documentos PDF
