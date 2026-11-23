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
- Migración actual: `0004`. El escáner no agrega migraciones.

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
- Rama `feat/iteration-6-card-scanner`, subida a GitHub (4 commits el 2026-11-23). Última validación completa: código 0.
- Iteración 6 (escáner): milestones A–D hechos; las 5 fotos de prueba rankean la carta correcta primero.
- Números contorneados (relleno oscuro + borde claro) se leen con `_enclosed_glyphs` en worker.py (Zigzagoon 130/217, Torre de Interferencia 261/217). El "1" cursivo de esa tipografía sigue frágil: nunca corregir números con el catálogo.
- Pendiente: aceptación manual en celular, pantallas chicas y Safari; decidir PR/merge.
- Prueba local del OCR: la sesión de Claude puede copiar `backend/app` y fotos a su entorno y correr `recognize_file` con Tesseract (Python 3.13 necesita paréntesis en `except A, B:`; no tocar el repo por eso).
- Futuro: precios (Cardmarket/TCGplayer, aún no implementado), rediseño visual (retro Esmeralda + moderno gen 5 Negro), valorización de colecciones.

## Documentación
`docs/` (ARCHITECTURE, DATA_MODEL, INVENTORY, BOXES, SET_COMPLETION, SCANNER, UX_UI, DEVELOPMENT, ROADMAP), `Bitacora.md` (log semanal), `Autoria.md` (uso de IA).
