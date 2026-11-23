# PokéVault — guía para Claude

Gestor de colección Pokémon TCG (proyecto de Diseño de Software, UAI). Un solo desarrollador: Naim Salas. Pokédex, cajas estilo videojuego, catálogo TCG (TCGdex), inventario de copias físicas, seguimiento de expansiones y escáner de cartas con OCR.

## Cómo trabajar con Naim
- Claude escribe y arregla todo el código; Naim decide qué hacer y revisa.
- Respuestas al punto, técnicas pero fáciles de entender; ejemplos cotidianos o chilenos cuando ayuden.
- **Antes de cada tarea, indicar modelo (Opus/Sonnet/Haiku) y esfuerzo recomendados** y esperar su "dale".
- No inventar el estado del proyecto: verificarlo en el repo (git, docs/ROADMAP.md, docs/SCANNER.md).
- Codex y Claude se turnan el trabajo (Codex sobre todo en el frontend visual). Dejar cambios claros, con commits pequeños y bitácora actualizada.
- Conversación en español. Código, commits y docs/ en inglés.
- No hacer commit/push sin que lo pida o confirme. Nunca leer ni subir `backend/.env` ni fotos privadas.

## Stack
- Frontend: React + TypeScript + Vite + Tailwind + React Router, ES/EN (`frontend/src/i18n`).
- Backend: Python + FastAPI + SQLAlchemy + Alembic + PostgreSQL. Login con Google (OIDC).
- Integraciones: PokéAPI, TCGdex, Tesseract + Pillow + pillow-heif (OCR).
- Migración actual: `0005` (precios de referencia, Iteración 7).

## Comandos (en el Mac de Naim)
- Validación completa: `bash scripts/check.sh` (unittest, pytest, ruff, vitest, eslint, tsc, build, git diff --check).
- API: `cd backend && .venv/bin/uvicorn app.main:create_app --factory --reload --no-access-log`
- Front: `npm run dev --prefix frontend` → http://localhost:5173 (escáner en `/scanner`)
- Migrar: `cd backend && .venv/bin/alembic upgrade head`
- Limitación: la sesión de Claude corre en Linux. El `.venv` y `node_modules` son de macOS, así que **Naim debe correr las pruebas en su Terminal**. Tampoco hay `git push` desde la sesión: lo hace Naim.

## Reglas de dominio (no mezclar)
- Distinguir siempre: carta oficial del catálogo (TCGdex) ≠ copia física del usuario ≠ ubicación en una caja personal.
- Cajas del catálogo (visual, por especie) ≠ cajas personales (organizan copias físicas). Grilla 6×5.
- Datos del inventario aislados por usuario; proteger toda operación de escritura.
- Copias duplicadas no suben el % de completitud de una expansión.
- El escáner preserva la incertidumbre: nunca inventa identificaciones ni registra solo; exige confirmación explícita.

## Estado (verificar antes de confiar)
- Iteración 6 (escáner) mezclada en `main` (PR #4). Números contorneados se leen con `_enclosed_glyphs` en worker.py; el "1" cursivo sigue frágil: nunca corregir números con el catálogo. Pendiente: cámara de celular real (OAuth solo en localhost).
- Iteración 7 (precios de referencia) mezclada en `main` (PR #5). Aceptación manual en Safari OK el 2026-11-23 (detalle de carta, copia reverse, Perfil, CLP/USD con y sin sesión, caja). Pendiente: revisar el enlace de atribución y el comportamiento sin red.
- Precios: TCGdex Cardmarket `trend` EUR (respaldo TCGplayer `marketPrice` USD) por variante de la copia; tasas de ExchangeRate-API (mindicador.cl no respondió). Atribución obligatoria "Rates By Exchange Rate API" y no redistribuir tasas. Detalle en docs/PRICES.md.
- Prueba local del OCR: la sesión de Claude puede copiar `backend/app` y fotos a su entorno y correr `recognize_file` con Tesseract (Python 3.13 necesita paréntesis en `except A, B:`; no tocar el repo por eso).
- Futuro: wishlist/intercambios, rediseño visual (retro Esmeralda + moderno gen 5 Negro).

## Documentación
`docs/` (ARCHITECTURE, DATA_MODEL, INVENTORY, BOXES, SET_COMPLETION, SCANNER, PRICES, UX_UI, DEVELOPMENT, ROADMAP), `Bitacora.md` (log semanal), `Autoria.md` (uso de IA).
