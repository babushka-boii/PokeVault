# PokéVault — guía para Claude

Gestor de colección Pokémon TCG (proyecto de Diseño de Software, UAI). Un solo desarrollador: Naim Salas. Pokédex, cajas estilo videojuego, catálogo TCG (TCGdex), inventario de copias físicas, seguimiento de expansiones y escáner de cartas con OCR.

## Cómo trabajar con Naim
- Claude escribe y arregla todo el código; Naim decide qué hacer y revisa.
- Respuestas al punto, técnicas pero fáciles de entender; ejemplos cotidianos o chilenos cuando ayuden.
- **Antes de cada tarea, indicar modelo (Opus/Sonnet/Haiku) y esfuerzo recomendados** y esperar su "dale".
- No inventar el estado del proyecto: verificarlo en el repo (git, docs/ROADMAP.md, docs/SCANNER.md).
- Codex y Claude se turnan el trabajo (Codex sobre todo en el frontend visual). Dejar cambios claros, con commits pequeños y bitácora actualizada.
- Conversación en español. Código, commits y docs/ en inglés.
- Nunca encadenes un commit después de un comando de pruebas. Corre las pruebas, confirma que el código de salida es 0 y recién entonces haz commit.
- No hacer commit/push sin que lo pida o confirme. Nunca leer ni subir `backend/.env` ni fotos privadas.

## Stack
- Frontend: React + TypeScript + Vite + CSS plano con variables (sin Tailwind) + React Router, ES/EN (`frontend/src/i18n`).
- Backend: Python + FastAPI + SQLAlchemy + Alembic + PostgreSQL. Login con Google (OIDC).
- Integraciones: PokéAPI, TCGdex, Tesseract + Pillow + pillow-heif (OCR).
- Migración actual: `0008` (borra las tablas de cajas personales, Iteración 8C.1). Antes: `0007` carpetas, `0006` fondo "noir", `0005` precios.

## Comandos (en el Mac de Naim)
- Validación completa: `bash scripts/check.sh` (unittest, pytest, ruff, vitest, eslint, tsc, build, git diff --check).
- API: `cd backend && .venv/bin/uvicorn app.main:create_app --factory --reload --no-access-log`
- Front: `npm run dev --prefix frontend` → http://localhost:5173 (escáner en `/scanner`)
- Migrar: `cd backend && .venv/bin/alembic upgrade head`
- Limitación: la sesión de Claude corre en Linux. El `.venv` y `node_modules` son de macOS, así que **Naim debe correr las pruebas en su Terminal**. Tampoco hay `git push` desde la sesión: lo hace Naim.

## Reglas de dominio (no mezclar)
- Distinguir siempre: carta oficial del catálogo (TCGdex) ≠ copia física del usuario ≠ ubicación en una caja personal.
- Las copias físicas se organizan en carpetas (páginas de 3×3, desde la 8C). Una copia está en a lo más una carpeta; un bolsillo tiene a lo más una copia. Las Cajas PC (del catálogo y personales) ya no existen (8C.1); `/boxes` solo redirige.
- Nunca mostrar ni anunciar UUID de copias en la interfaz: usar nombre de carta y expansión (pruebas anti-UUID).
- Datos del inventario aislados por usuario; proteger toda operación de escritura.
- Copias duplicadas no suben el % de completitud de una expansión.
- El escáner preserva la incertidumbre: nunca inventa identificaciones ni registra solo; exige confirmación explícita.

## Estado (verificar antes de confiar)
- Iteración 6 (escáner) mezclada en `main` (PR #4). Números contorneados se leen con `_enclosed_glyphs` en worker.py; el "1" cursivo sigue frágil: nunca corregir números con el catálogo. Pendiente: cámara de celular real (OAuth solo en localhost).
- Iteración 7 (precios de referencia) mezclada en `main` (PR #5). Aceptación manual en Safari OK el 2026-11-23 (detalle de carta, copia reverse, Perfil, CLP/USD con y sin sesión, caja). Pendiente: revisar el enlace de atribución y el comportamiento sin red.
- Precios: TCGdex Cardmarket `trend` EUR (respaldo TCGplayer `marketPrice` USD) por variante de la copia; tasas de ExchangeRate-API (mindicador.cl no respondió). Atribución obligatoria "Rates By Exchange Rate API" y no redistribuir tasas. Detalle en docs/PRICES.md.
- Prueba local del OCR: la sesión de Claude puede copiar `backend/app` y fotos a su entorno y correr `recognize_file` con Tesseract (Python 3.13 necesita paréntesis en `except A, B:`; no tocar el repo por eso).
- Iteración 8A (rediseño "Unova Noir": tokens, shell e Inicio, migración `0006`) mezclada en `main` (PR #6). Estilos: CSS con variables en `frontend/src/styles/tokens.css` (único lugar con colores; lo vigila una prueba de contrato).
- Iteración 8C (carpetas, reemplaza a las cajas personales) vive en `feat/iteration-8c-binders` (subida a GitHub; el 2026-11-24 `origin/main` aún NO la contenía, verificar antes de asumir que se mezcló). `check.sh` exit 0. Detalle en docs/BINDERS.md.
- Iteración 8C.1 (retirar las Cajas PC) implementada en `feat/iteration-8c1-retire-pc-boxes`, apilada sobre la 8C, sin push ni PR; `check.sh` exit 0. Naim debe aplicar `0007` y `0008` (con respaldo previo; comandos en docs/DEVELOPMENT.md) y hacer la revisión en Safari (lista en docs/ROADMAP.md). Pokédex paginada (30 por página) con búsqueda por nombre o número. Pendiente: rediseño visual de la Pokédex (Unova Noir, se define en maqueta). Siguiente: 8D portadas y stickers; luego favoritas, master set y perfil con entrenador.
- Futuro: wishlist/intercambios.

## Documentación
`docs/` (ARCHITECTURE, DATA_MODEL, INVENTORY, BOXES, BINDERS, SET_COMPLETION, SCANNER, PRICES, UX_UI, DEVELOPMENT, ROADMAP), `Bitacora.md` (log semanal), `Autoria.md` (uso de IA).
