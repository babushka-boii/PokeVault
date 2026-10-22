# Bitácora de desarrollo — PokéVault

**Curso:** Diseño de Software — TICS316  
**Modalidad:** Individual  
**Inicio de semanas evaluables:** lunes 5 de octubre de 2026

Esta bitácora registra qué se hizo realmente, qué se consultó a IA, qué se ajustó y qué queda pendiente. Se actualizará semanalmente, sin inventar implementaciones ni pruebas.

## Semana 1 — 05/10/2026 al 11/10/2026

**Fecha del registro:** 08/10/2026  
**Tipo de entrega:** planificación y documentación inicial.

### Trabajo realizado

- Se seleccionó el tema 2 del proyecto: Pokédex de cartas Pokémon.
- Se acordó el nombre **PokéVault** y se creó un repositorio público en GitHub.
- Se discutieron funcionalidades oficiales y extensiones: navegación por especies, cajas personalizables, wishlist, mazos, portfolio y costes estimados de completar sets.
- Se definió como referencia central una **PC Box clásica de Pokémon**: panel de detalles a la izquierda y caja de mini-sprites a la derecha, no una grilla de tarjetas modernas.
- Se propusieron rutas/pantallas, flujos de interacción, diseño responsive, SSO, multilenguaje y una arquitectura preliminar React + FastAPI + PostgreSQL.
- Se prepararon documentos de requisitos, UX/UI, arquitectura y roadmap. **No se desarrolló software funcional esta semana**.

### Bitácora de consultas y prompts de IA (resumen fiel)

1. **Definición inicial:** solicitar lluvia de ideas detallada para el tema Pokémon, frontend/backend y trabajo posterior con Codex. **Resultado:** concepto de gestor de cartas con scanner, colecciones, set completion y precios.
2. **Personalización de cajas y Pokédex:** solicitar un PC similar a los videojuegos, mini-sprites, filtros por Pokémon/generación/set y cajas configurables. **Cambio:** las cajas se establecieron como experiencia central; una especie abre sus cartas TCG.
3. **Referencia visual:** exigir que el aspecto de la caja se mantuviera muy fiel a la captura clásica proporcionada. **Cambio:** panel izquierdo y grilla de sprites derecha quedan como restricción fuerte del UX.
4. **Perfil:** pedir selección de personaje de Pokémon como avatar, en lugar de subir fotos; el estudiante elegirá 10–15. **Cambio:** avatar de entrenador predefinido, lista pendiente.
5. **Planificación:** limitar el trabajo del día a la primera entrega semanal. **Cambio:** solo repositorio y documentación inicial, sin código funcional.

La herramienta de IA ayudó a estructurar, redactar y ordenar el material. Estas notas son resúmenes de consultas y decisiones, no una transcripción exacta de todos los prompts.

### Decisiones y razones

- **Arquitectura modular monolítica:** menor complejidad operativa que microservicios para un proyecto individual.
- **PostgreSQL:** relaciones entre usuarios, cartas, copias, cajas, mazos y transacciones.
- **React + TypeScript / FastAPI:** frontend interactivo y procesamiento de imágenes posible en Python.
- **Datos externos como candidatos:** no dar por confirmada la cobertura de cartas, precios ni licencias.
- **Un incremento verificable:** cumplir evaluación iterativa sin simular que las funciones están terminadas.

### ¿Qué aprendí? / ¿Qué fue lo más difícil?

**Puntos para reflexión del estudiante (completar con su experiencia real antes de la evaluación):**
- Aprendizaje: ______________________________________
- Dificultad principal: _________________________________
- Cómo la resolví / siguiente intento: ____________________

No corresponde atribuir al estudiante reflexiones personales que todavía no ha escrito.

### Pendiente para la próxima semana

- Revisar y validar este documento con el estudiante.
- Evaluar datos oficiales, precios y términos de uso.
- Diseñar el modelo relacional y definir cómo se guardan copias físicas, variantes, multiespecie y cartas Trainer/Energy.
- Seleccionar conjunto de prueba para el escaneo.

## Iteración 2 — Evidencia de proveedores y modelo lógico

**Fecha del registro:** 19/10/2026
**Tipo de entrega:** investigación técnica reproducible y diseño de datos; todavía no hay frontend, backend, base de datos ni autenticación.

### Trabajo realizado y evidencia

- Se definió un manifest fijo de 12 casos: cinco cartas y un set en TCGdex; tres especies y tres recursos Pokémon en PokéAPI.
- Se implementó validación HTTPS acotada, normalización EN/ES, variantes y precios sin mezclar monedas ni convertir valores `null` en cero.
- Se comprobaron relaciones con cero, una y múltiples especies, además de los conteos `swsh3` (189 oficiales, 201 totales).
- Se generaron fixtures mínimos con procedencia y SHA-256, y un reporte reproducible sin red. Su digest se mantuvo idéntico al regenerarlo offline.
- Se ejecutaron 43 pruebas automatizadas offline al cerrar la implementación.
- Se diseñó el ERD lógico para catálogo, localización, copias físicas, usuarios, cajas y membresías con integridad por usuario.

### Participación de IA y ajustes

Codex ayudó a revisar el repositorio, redactar el diseño y plan, implementar pruebas/código y documentar resultados. Durante el refresh real se detectaron y corrigieron con pruebas tres diferencias: idioma requerido por TCGdex, ausencia legítima de `dexId` en Trainer/Energy y enlaces nominales anidados de PokéAPI. También se redujeron los fixtures de respuestas completas a una proyección mínima.

### Límites y siguiente paso

La muestra demuestra viabilidad técnica, no cobertura total ni permiso de redistribución de imágenes. Precios, términos, licencias y vigencia deben revisarse antes de producción. El próximo incremento es crear un scaffold ejecutable de frontend/API/base de datos y autenticación, sin adelantar todavía esas implementaciones.

## Iteración 3 — Scaffold ejecutable

**Fecha del registro:** 19/10/2026
**Tipo de entrega:** frontend, API, PostgreSQL y verificación local; autenticación y funciones de dominio pendientes.

### Trabajo realizado y evidencia

- Se implementó un backend FastAPI configurable, sin conexión a base de datos durante la importación o construcción de la aplicación.
- `GET /api/v1/health` distingue API y PostgreSQL: HTTP 200 saludable y HTTP 503 sanitizado cuando la base no responde.
- Se agregó SQLAlchemy, una tabla técnica `app_metadata` y la migración reversible `0001`; no se crearon tablas de usuarios, catálogo o inventario.
- Se implementó un shell React/TypeScript/Vite responsive con rutas `/`, `/boxes`, `/pokedex` y `/profile`, además de diccionarios ES/EN persistidos localmente.
- La portada consume el endpoint de salud, valida su respuesta y ofrece reintento tanto ante red inaccesible como ante PostgreSQL degradado.
- La verificación final ejecutó 43 pruebas de proveedores, 9 del backend —incluida integración PostgreSQL— y 13 del frontend. También pasaron Ruff, ESLint, TypeScript, el build de Vite y la revisión de espacios.
- Se comprobó manualmente la migración, la respuesta saludable, el HTTP 503 degradado y la interfaz a ancho de escritorio y 390 px sin desbordamiento horizontal.

### Participación de IA y ajustes

Codex asistió en el diseño técnico, plan incremental, pruebas primero, implementación, diagnóstico y documentación. Durante la verificación se corrigieron dos problemas con evidencia: una regla Ruff incompatible con el patrón declarativo `Depends` de FastAPI se delimitó explícitamente, y la prueba real degradada reveló que faltaba el botón de reintento para HTTP 503; se agregó una prueba que falló antes de implementar la corrección.

### Decisiones y límites

- Se eligió PostgreSQL nativo en Arch Linux, sin Docker, y archivos `.env` locales ignorados por Git.
- Se mantuvieron dependencias mínimas; no se instalaron Tailwind, shadcn/ui, TanStack Query ni bibliotecas de autenticación antes de necesitarlas.
- Google SSO, catálogo en ejecución, cajas funcionales, inventario, precios, scanner y assets Pokémon siguen pendientes.
- No se inventan reflexiones personales del estudiante; debe revisar y comprender el código antes de la evaluación.

## Iteración 4 — Pokédex Nacional funcional inicial

**Fecha del registro:** 22/10/2026
**Tipo de entrega:** catálogo público de los primeros 20 Pokémon integrado al frontend y FastAPI existentes.

### Trabajo realizado

- Se revisaron especificación, arquitectura, roadmap, UX/UI, modelo de datos,
  desarrollo, dependencias, rutas y pruebas antes de editar.
- Se sustituyó el placeholder de Pokédex por una cuadrícula responsive con número
  nacional, nombre, tipos traducidos y sprite remoto, más estados de carga,
  vacío, error sanitizado, reintento y alternativa de imagen ausente.
- Se creó `GET /api/v1/pokemon` y un adaptador PokéAPI separado del routing:
  cinco solicitudes concurrentes, timeout de cinco segundos por solicitud,
  deadline total de 15 segundos y caché completa de 300 segundos en memoria.
- Se mantuvieron PostgreSQL, migraciones, Cajas y rutas existentes. No hay
  autenticación simulada, inventario ficticio ni imágenes copiadas al repositorio.
- HTTPX2 pasó de dependencia de desarrollo a ejecución sin instalar paquetes nuevos.

### Evidencia y obstáculos

- Las pruebas nuevas fallaron antes de implementar porque no existían el módulo
  Pokémon ni los estados de la página; luego pasaron con la implementación.
- `bash scripts/check.sh` pasó fuera del sandbox: 43 pruebas de proveedores,
  16 backend (incluida PostgreSQL), 20 frontend, Ruff, ESLint, TypeScript,
  build de producción y `git diff --check`.
- Dentro del sandbox, PostgreSQL no fue accesible y TestClient se bloqueó
  incluso con las pruebas de salud existentes. Se solicitó ejecución fuera
  del sandbox y las mismas pruebas pasaron; no se alteraron para ocultar el problema.
- Una consulta real mediante el endpoint FastAPI y PokéAPI devolvió HTTP 200,
  20 entradas ordenadas, Bulbasaur al inicio y Raticate al final, con URLs HTTPS
  de sprites. No se descargaron imágenes durante esta comprobación.
- La revisión visual manual de escritorio/móvil queda pendiente: la herramienta
  de navegador no encontró ningún navegador conectado. Las pruebas de interfaz
  cubren localización, teclado/reintento, errores, vacío y cancelación al desmontar;
  no sustituyen una inspección visual responsive.

### Participación de IA y límites

El prompt del estudiante solicitó esta primera Pokédex funcional con alcance y
validaciones explícitos. Codex asistió en revisión, diseño, pruebas, implementación,
diagnóstico, consulta real y documentación. La intervención y fuentes se registran
también en `Autoria.md`; el estudiante debe revisar y comprender el resultado.
No se inventan reflexiones personales ni aprobación académica del estudiante.

La Pokédex se limita a 1–20: sin filtros, paginación, detalles TCG ni inventario.
Los sprites se cargan desde URLs del proveedor y pueden fallar o estar ausentes.
La caché es por proceso y no persistente. La revisión de licencias/condiciones de
assets y la comprobación visual quedan pendientes, junto a las siguientes funciones.
