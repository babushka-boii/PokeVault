# Declaración de autoría — PokéVault

**Proyecto:** TICS316, Diseño de Software (individual)  
**Última actualización:** 2026-10-22 (Iteración 4)

Este archivo declara qué partes son de concepción del estudiante, cuáles han recibido apoyo de herramientas de IA y qué materiales externos se prevé consultar.

## Semana 1 — 05/10/2026 al 11/10/2026

### Aportes del estudiante

- Selección del proyecto Pokémon TCG.
- Definición de la experiencia que quiere transmitir: producto hecho para aficionados a Pokémon.
- Insistencia en respetar la estructura visual del PC Box clásico de referencia.
- Propuesta de cajas personalizables, sprites de especies, filtros por Pokédex/generación/set, personalización de fondos y sonidos.
- Propuesta de mazos TCG, cartas faltantes, wishlist y presupuesto de completar colecciones.
- Decisión de permitir avatares de entrenadores elegidos entre aproximadamente 10–15 personajes, sin subir fotografías.
- Aprobación de lineamientos de producto y delimitación de la primera entrega a documentación inicial.

### Uso de IA (ChatGPT)

- Generación de propuestas, comparación de alternativas y organización de requisitos.
- Redacción asistida de README, especificación, UX/UI, arquitectura, roadmap, bitácora y este documento.
- Orientación sobre tecnologías candidatas (React, FastAPI, PostgreSQL), todavía sin verificación práctica.
- Asistencia para organizar el primer incremento y su commit.

**Alcance de la autoría de código:** en esta semana no se implementó frontend ni backend; no hay código funcional que atribuir. Los archivos de documentación son material **co-construido con IA** y deben ser revisados y entendidos por el estudiante.

### Fuentes externas y terceros

- Enunciado y rúbrica oficiales de TICS316: base para los requerimientos y criterios de evaluación.
- Capturas/imágenes de referencia de las cajas de Pokémon: utilizadas para comunicar intención visual, **no** incorporadas como assets del repositorio.
- PokéAPI y TCGdex: servicios externos **propuestos**, todavía sin integración ni comprobación de cobertura/licencias.
- Ilustraciones, personajes, sprites, música y efectos de Pokémon: propiedad intelectual de sus respectivos titulares; no se han incluido esos archivos en este primer commit.

## Declaración de mantenimiento

En semanas posteriores, cada integración de código o recurso externo debe registrar: origen/URL cuando corresponda, licencia o condiciones, alcance de modificación, participación de IA y qué se comprobó manualmente. El estudiante deberá ser capaz de explicar y defender el código durante la demo técnica.

## Iteración 2 — 19/10/2026

### Aportes y decisiones del estudiante

- Aprobación del alcance, diseño incremental, modelo conceptual y ejecución en una rama/worktree aislada.
- Selección previa de TCGdex y PokéAPI como candidatos y exigencia de preservar el trabajo existente, verificar por etapas y no instalar dependencias innecesarias.

### Uso de IA (Codex)

- Inspección del repositorio, diseño y planificación asistida.
- Implementación asistida del validador Python, pruebas offline, fixtures mínimos, reporte y ERD lógico.
- Diagnóstico durante la consulta real y correcciones guiadas por pruebas.
- Redacción asistida de la documentación y actualización de los registros.

El código y los documentos de esta iteración son material co-construido con IA y requieren revisión y comprensión del estudiante. No se atribuyen frontend, backend, base de datos ni autenticación, porque aún no existen.

### Fuentes y límites externos

- TCGdex (`api.tcgdex.net`) y PokéAPI (`pokeapi.co`), consultados el 19/10/2026 para los 12 casos versionados.
- Solo se guardan JSON mínimos y URLs; no se descargaron imágenes o sprites.
- La accesibilidad técnica no concede derechos sobre marcas, ilustraciones, sprites u otros assets de Pokémon. Licencias, términos y uso de precios siguen pendientes de revisión.

## Iteración 3 — 19/10/2026

### Aportes y decisiones del estudiante

- Aprobación del stack React/TypeScript/Vite, FastAPI/SQLAlchemy/Alembic y PostgreSQL nativo.
- Elección de ejecución incremental en una rama/worktree aislada, con revisión y pruebas antes de cada commit.
- Configuración local de PostgreSQL y credenciales privadas fuera del repositorio.
- Aprobación de mantener Google SSO y funciones de dominio fuera de este incremento.

### Uso de IA (Codex)

- Diseño y planificación asistida del scaffold ejecutable.
- Implementación asistida de configuración, API de salud, integración PostgreSQL, migración, frontend localizado, pruebas y gate de calidad.
- Diagnóstico basado en pruebas de compatibilidad FastAPI/Ruff y del reintento faltante en estado degradado.
- Pruebas manuales asistidas del flujo saludable/degradado y del diseño responsive.
- Redacción asistida de la guía de desarrollo y actualización de documentos del proyecto.

El código y la documentación son material co-construido con IA. El estudiante debe revisarlos, ejecutarlos y poder explicar sus decisiones. No se atribuyen como implementados Google SSO, catálogo, inventario, cajas funcionales, precios, reconocimiento de imágenes ni despliegue.

### Dependencias y recursos externos

- Dependencias de aplicación y desarrollo declaradas en `backend/requirements*.txt` y `frontend/package-lock.json`; sus metadatos de licencia se auditan a nivel de paquete, sin extender esa revisión a futuras fuentes de datos o assets.
- PostgreSQL se usa como servicio local; no se añadieron imágenes de base de datos ni credenciales al repositorio.
- No se incorporaron sprites, ilustraciones, fuentes, sonidos ni otros binarios protegidos de Pokémon.
- Los fixtures mínimos de TCGdex y PokéAPI permanecen como evidencia de la iteración anterior; su presencia no equivale a autorización para redistribuir imágenes o marcas.

## Iteración 4 — 22/10/2026

- El estudiante definió el alcance de la Pokédex funcional: primeros 20 Pokémon,
  integración mediante FastAPI, localización ES/EN, pruebas y conservación de la arquitectura.
- Codex asistió en la revisión del proyecto, diseño acotado, pruebas previas a la
  implementación, código backend/frontend, verificación y documentación.
- Se consultó la documentación oficial de PokéAPI: https://pokeapi.co/docs/v2/.
  El adaptador usa datos y URLs del proveedor; los sprites se cargan remotamente,
  sin copiar imágenes al repositorio. El acceso técnico no resuelve los derechos
  de los assets; su revisión continúa pendiente antes de redistribución o producción.
- HTTPX2 ya estaba instalado para pruebas; se declaró como dependencia de ejecución.
- No se atribuyen al estudiante reflexiones personales ni revisión del código que
  todavía no ha realizado. Debe revisar y comprender este material asistido por IA.
- No se implementaron autenticación, inventario, cartas TCG ni cambios de Cajas.
