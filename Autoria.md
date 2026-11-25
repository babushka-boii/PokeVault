# Declaración de autoría — PokéVault

**Proyecto:** TICS316, Diseño de Software (individual)  
**Última actualización:** 2026-11-23 (Iteración 7)

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

## Iteración 4 — Continuación PC Storage (22/10/2026)

- El estudiante definió el alcance, las referencias Emerald/Black & White, la
  disposición clásica, accesibilidad y requisitos de audio, y autorizó continuar
  en la rama existente sin commits automáticos.
- Codex asistió en análisis, diseño acotado, pruebas, paginación, componentes,
  hooks, CSS, síntesis Web Audio y documentación. El código requiere revisión y
  comprensión del estudiante; no se atribuyen experiencias personales ni escucha real.
- Los fondos y efectos se generan con CSS y osciladores/envelopes originales.
  No se copiaron interfaces píxel por píxel, grabaciones, melodías, sprites o
  recursos de Nintendo al repositorio. Las imágenes siguen siendo URLs remotas de
  PokéAPI, sujetas a revisión de condiciones y derechos ya pendiente.
- La verificación automatizada usa respuestas HTTP y audio simulados. La revisión
  visual/auditiva manual quedó pendiente por ausencia de navegador conectado.
- No se incorporaron dependencias nuevas, autenticación, inventario ni migraciones.

## Iteración 4 — Búsqueda de Pokémon en cajas (22/10/2026)

- El estudiante definió que buscar debe localizar la caja y posición originales,
  con Scraggy (#559) como ejemplo de aceptación, y conservar el flujo clásico.
- Codex asistió en diseño, pruebas, índice/cache backend, combobox frontend,
  integración de selección/foco/audio, diagnóstico y documentación.
- Se consultó el índice real `https://pokeapi.co/api/v2/pokemon-species/?limit=1025`
  para verificar nombre/número. Las pruebas usan HTTP simulado; no se copiaron
  sprites ni sonidos. El índice solo aporta nombres canónicos, sin traducciones
  o alias inventados. Continúan pendientes las revisiones de derechos ya registradas.
- No hubo dependencias nuevas, migraciones, cambios de propiedad, commits ni push.
  El estudiante debe revisar y entender este código asistido por IA; no se atribuye
  como realizada una revisión visual/auditiva manual.

## Iteración 4 — Refinamiento definitivo del PC (22/10/2026)

- El estudiante definió las prioridades visuales/funcionales y aportó tres imágenes
  como referencia de estilo. Se inspeccionaron, sin copiarlas como assets al repo.
- Codex y agentes auxiliares asistieron en investigación de fuentes, diseño,
  implementación, pruebas y revisión de iconos, backend de detalles y documentación.
  CSS/SVG de fondos e insignias son originales asistidos por IA, no capturas ni
  símbolos copiados de juegos. El estudiante debe revisar y comprender el resultado.
- Fuente de datos: `https://pokeapi.co/docs/v2/` y recursos Pokémon/Species/Ability
  de PokéAPI. Se verificaron Bulbasaur ES/EN y Scraggy ES mediante el endpoint real.
- Fuente de iconos/referencia de tipos: `https://github.com/PokeAPI/sprites`.
  Inventario, SHAs, dimensiones, APNG y derechos se registran en
  `research/sprites/VERIFICATION.md` y `verification.json`, solo con metadatos.
  El aviso upstream atribuye las imágenes a The Pokémon Company; CC0 del repositorio
  no se interpreta como liberación de todos los derechos de terceros. Se cargan
  iconos remotos por URL; no se empaquetan binarios de imágenes o sonidos.
- No se inventan descripciones, etimologías, propiedad de cartas ni permisos de
  assets. Nombres/habilidades usan localización del proveedor y fallback explícito.
- La revisión visual/auditiva manual continúa pendiente por falta de navegador;
  las pruebas automatizadas y las consultas reales no equivalen a esa aprobación.
- No hubo commits, push, merge, cambio de rama, migraciones o dependencias nuevas.

## Iteración 4 — Integración del catálogo TCGdex (22/10/2026)

- El estudiante definió el flujo Cajas/Pokédex → cartas por especie → detalle →
  regreso al contexto, el alcance público sin inventario y la conservación de la
  interfaz existente. Tras una interrupción, indicó continuar los archivos presentes
  sin reiniciar, resetear, hacer commits ni publicar.
- Codex y agentes auxiliares asistieron en investigación de la API, diseño acotado,
  adaptador/cachés/validación FastAPI, componentes y cliente TypeScript, navegación,
  localización, pruebas, diagnóstico, revisión independiente y documentación.
  El material es co-construido con IA y requiere revisión y comprensión del estudiante.
- Fuentes oficiales: `https://tcgdex.dev/rest/cards`,
  `https://tcgdex.dev/rest/filtering-sorting-pagination`,
  `https://tcgdex.dev/reference/card`, `https://tcgdex.dev/reference/card-brief`
  y `https://tcgdex.dev/assets`, consultadas el 22/10/2026. Las solicitudes reales a
  `api.tcgdex.net` y siete verificaciones de la API de aplicación se registran en
  `research/tcgdex/VERIFICATION.md` y `metadata.json` con límites explícitos.
- Los datos de cartas, asociaciones multi-especie y traducciones proceden de
  TCGdex; los detalles de especie siguen procediendo de PokéAPI. Las pruebas usan
  respuestas deterministas simuladas. No se inventan cartas, ataques, traducciones,
  totales, propiedad del usuario ni cobertura no comprobada.
- Las ilustraciones se cargan por URL HTTPS remota de `assets.tcgdex.net`; no se
  guardaron imágenes ni sonidos de Pokémon en el repositorio. Disponibilidad técnica
  y documentación del proveedor no equivalen a autorización de todos los derechos
  de terceros; se conserva la revisión de condiciones ya pendiente.
- La verificación final ejecutó 43 pruebas de proveedores, 82 backend y 146 frontend,
  además de Ruff, ESLint, TypeScript y build. Las consultas reales y las pruebas
  automatizadas no equivalen a revisión visual/auditiva: no había navegador disponible.
  No se atribuyen al estudiante experiencias, reflexiones ni aprobaciones personales.
- No hubo commits, push, merge, cambio de rama, migraciones ni dependencias nuevas;
  se preservaron cambios existentes y no se modificaron directorios de herramientas.

## Iteración 4 — Refinamiento de experiencia TCG (22/10/2026)

- El estudiante definió las prioridades de fiabilidad de imágenes, interacción,
  cronología, expansiones y detalle, aportó una referencia visual de logo y enlaces
  de inspiración y autorizó implementar directamente conservando los cambios previos.
- Codex y agentes auxiliares asistieron en diagnóstico, investigación de contratos,
  modelos/cachés/ordenación, resolutores de assets, React/TypeScript/CSS, controles
  táctiles, pruebas previas, revisión independiente y documentación. El resultado
  requiere revisión y comprensión del estudiante; no se atribuyen reflexiones propias.
- Se revisaron las referencias oficiales `https://tcgdex.dev/assets`,
  `https://tcgdex.dev/reference/set`, la referencia de cartas y GraphQL, así como
  `https://tcgdex.net/database/sv-scarlet-violet/sv03.5-151/199-charizard-ex` para
  jerarquía de información. `research/tcgdex/refinement.json` conserva metadatos,
  cabeceras HEAD y consultas reales separadas de las respuestas simuladas en tests.
- `https://poke-151.simey.me/`, `https://poke-holo.simey.me/` y
  `https://github.com/simeydotme/pokemon-cards-css` fueron referencias conceptuales.
  Se identificó GPL-3.0; no se incorporaron código, texturas, assets ni dependencias
  de ese proyecto. La solución de Pointer Events, gradientes y variables CSS es
  original asistida por IA; no reproduce sus implementaciones ni el layout TCGdex.
  La referencia de logo aportada no se copió ni se trató como una excepción codificada.
- Las imágenes/logos siguen siendo URLs remotas oficiales del proveedor, con
  fallback limitado a formatos y recursos verificados de la misma impresión.
  Texto e imagen registran sus idiomas por separado. Los efectos son simulaciones,
  sin atribuir acabado físico ni propiedad a una carta. No se inventaron precios,
  fechas, traducciones, assets ni disponibilidad. La revisión de derechos previamente
  pendiente no se considera resuelta por la accesibilidad técnica del proveedor.
- El gate final pasó con 43 pruebas de proveedores, 98 backend y 193 frontend,
  lint, tipos y build. No había navegador disponible; no se atribuye inspección visual,
  interacción táctil real, escucha o aprobación personal al estudiante. El checklist
  manual permanece en DEVELOPMENT.md.
- No se hicieron commits, push, merge, reset, cambios de rama, migraciones ni
  dependencias nuevas; se conservaron las modificaciones y directorios de herramientas.

## Iteración 5A — Autenticación e identidad (24/10/2026)

**Aporte del estudiante:** especificación detallada del alcance, seguridad, criterios
de aceptación y restricciones; decisión de continuar sobre la rama existente sin
implementar inventario ni publicar cambios.

**Aporte asistido por IA (Codex):** inspección de arquitectura y pruebas, investigación
de documentación primaria de Google/OWASP/Authlib, plan técnico, modelos y migración
SQLAlchemy/Alembic, flujo OIDC/PKCE y sesiones FastAPI, capa tipada React de sesión,
login/perfil ES/EN, pruebas deterministas y PostgreSQL, revisión de seguridad y
actualización documental. El estudiante debe revisar y comprender las decisiones,
configurar sus propias credenciales y completar la validación manual.

**Dependencias/fuentes:** Authlib y joserfc aportan protocolo y criptografía; no se
implementa firma criptográfica propia ni se copian plantillas de Google. Fuentes
primarias y configuración exacta están enlazadas en `docs/AUTHENTICATION.md`.
No se introducen secretos, avatares licenciados, inventario ficticio ni imágenes
propietarias nuevas. Se conservan los registros y atribuciones anteriores.

**Límite de evidencia:** pruebas automáticas con proveedor simulado y base PostgreSQL
de pruebas; no equivalen a login Google real, aprobación visual ni certificación
formal de seguridad. No hubo commit, push o merge automático.

## Iteración 5B — Inventario personal (07/11/2026)

**Aporte del estudiante:** alcance y autorización de continuación desde su Mac,
restricciones de seguridad/privacidad, preferencia por revisión local sin commits ni
push y criterios de aceptación para inventario persistente.

**Aporte asistido por IA (Codex):** inspección del repositorio/entorno macOS, plan,
modelo SQLAlchemy/migración Alembic, CRUD con aislamiento y CSRF existentes, cliente y
componentes React, diccionario ES/EN, pruebas de integración y regresión, revisión
independiente y documentación. No se introdujeron dependencias ni assets nuevos;
TCGdex sigue aportando datos/artwork remotos mediante el adaptador existente.

**Límites:** identidades Google simuladas únicamente en pruebas, datos PostgreSQL de
pruebas en esquemas desechables, sin credenciales expuestas/modificadas. La revisión
y comprensión del código, configuración OAuth y aceptación manual corresponden al
estudiante. Evidencia automatizada no equivale a login real ni aprobación visual.
No hubo commit, push o merge automático.

## Iteración 5C — Cajas personales persistentes (07/11/2026)

**Aporte del estudiante:** especificación funcional y de integridad detallada,
restricciones académicas/de seguridad, aceptación por copia física, decisión de
posponer rediseño visual y trabajo fuera de alcance; corrección de la rama base y
autorización explícita para continuar sin commits ni push.

**Aporte asistido por IA (Codex):** auditoría de Git/arquitectura, plan, modelos y
migración Alembic 0004, APIs autenticadas, transacciones/constraints, integración React
con experiencia PC existente, localización, ruta de copia individual, vistas derivadas,
pruebas HTTP/PostgreSQL/frontend, revisión independiente y actualización documental.
Se usaron agentes en paralelo para backend, frontend, pruebas PostgreSQL y revisión.
La revisión y comprensión del código por el estudiante siguen siendo necesarias.

**Fuentes y reutilización:** adaptadores existentes de TCGdex/PokéAPI, menu icons,
wallpapers CSS, efectos de audio originales y dependencias ya instaladas. No se
añadieron paquetes, servicios, assets propietarios, metadatos de negocio ficticios
ni una segunda representación de inventario. La accesibilidad de datos remotos no
resuelve las revisiones de licencias pendientes del proyecto.

**Evidencia y límites:** gate final con 43 pruebas de proveedores, 247 backend
(42 PostgreSQL) y 265 frontend, lint/tipos/build correctos. Google/proveedores se
simulan en pruebas deterministas; PostgreSQL usa esquemas desechables. La migración
local aditiva quedó verificada en 0004 sin downgrade de desarrollo. La inspección
real de navegador se limitó al catálogo y entrada/error personal anterior al upgrade;
no equivale a aceptación completa, login Google real o aprobación visual/audio.
Las credenciales y archivos .env no se modificaron ni imprimieron. No hubo commits,
push, merge, reset ni rebase por Codex; se conservan las atribuciones e historia anteriores.

## Iteración 5D — Expansiones y completitud derivada (09/11/2026)

**Aporte del estudiante:** alcance detallado, reglas de completitud por printing ID,
separación entre conteo impreso y total, requisitos de seguridad/cobertura/validación,
límites académicos y decisión de continuar sin publicación ni rediseño visual.

**Aporte asistido por IA (Codex):** auditoría Git/documentación/arquitectura, creación
de rama 5D desde 5C completo, verificación pública acotada de TCGdex, contratos y extensión
del adaptador existente, agregación SQL y APIs, páginas React ES/EN, reutilización de
artwork/formularios, pruebas de proveedor/HTTP/PostgreSQL/interfaz, revisión independiente
y documentación. Se usaron agentes paralelos para proveedor, frontend, PostgreSQL y
revisión; Codex principal coordinó e implementó servicios/API/semántica de conteo.

**Fuentes/reutilización:** documentación oficial de TCGdex enlazada en SET_COMPLETION.md
y evidencias fechadas en research/tcgdex. Se reutilizaron dependencias, infraestructura
de catálogo, imágenes remotas y componentes existentes; no se copiaron nuevas imágenes
propietarias ni se inventaron metadatos ni se creó otro inventario. El tracker no supone
que lengua/condición/acabado sean entradas distintas ni certifica un master-set.

**Límites y responsabilidad:** el estudiante debe revisar y comprender el código,
verificar datos/fuentes y completar aceptación manual. Pruebas deterministas simulan
límites Google/TCGdex y usan esquemas PostgreSQL desechables. Las consultas públicas
limitadas y HEAD no garantizan cobertura mundial, licencias o disponibilidad futura.
No hubo prueba manual de Google o navegador 5D, migración nueva ni alteración de datos
poblados, secretos o dependencias. No hubo commit/push/merge/rebase/reset por Codex.
El gate final pasó con 43 pruebas de fixtures de proveedores, 355 backend (66 de
PostgreSQL, 62 del nuevo adaptador de sets) y 315 frontend; Ruff, ESLint, TypeScript,
build y whitespace correctos. Se conservan los registros/atribuciones previos;
evidencia y comparación con 5C en DEVELOPMENT.md.


## Iteración 6 — Escáner OCR (2026-11-10–11)

**Aporte del estudiante:** definición detallada del flujo, prioridades de fiabilidad,
seguridad y corrección humana; restricciones académicas/técnicas, preparación de la
rama y autorización para continuar preservando los cambios tras interrupciones.
La aceptación con cámara, fotografías reales, Google y navegador sigue pendiente;
no se atribuye al estudiante una validación que no está registrada.

**Aporte asistido por IA (Codex):** auditoría Git/arquitectura, selección e instalación
asistida de OCR, contratos/API, supervisor de procesos, validación y extracción,
extensión del CardProvider, ranking explicable, UI ES/EN, reutilización del formulario
físico e idempotencia de inventario, tests, revisión y documentación. Agentes separados
trabajaron OCR/evaluación, matching y frontend; otro realizó revisión independiente.
Codex principal integró APIs, seguridad/reintentos, PostgreSQL y cerró las correcciones
interrumpidas con pruebas observadas antes/después. La última revisión comprobó los
tres hallazgos corregidos; no se presenta como otra ejecución de todo el test suite.

**Fuentes y activos:** Tesseract/tessdata oficiales (Apache-2.0), Pillow (HPND), metadatos
TCGdex con URLs/hashes y componentes existentes. Las 14 imágenes de prueba son diseños
sintéticos originales de texto/formas, sin artwork de cartas ni fotos privadas.
Arial/DejaVu se usan desde una instalación local; no se distribuyen archivos de fuente.
Catálogo de evaluación: 510 identidades físicas EN con aliases ES reales donde existen.
No se inventaron cartas, traducciones, probabilidades calibradas o resultados OCR.

**Verificación y límites:** gate final 43 fixtures, 508 backend (75 PostgreSQL), 379 frontend;
Ruff/ESLint/TypeScript/build/whitespace aprobados, sin skips. OCR nativo real: 11/11 top-1
y top-3 en muestras etiquetadas, 2/2 abstenciones y 1/1 ambigüedad; datos medidos y límites en
research/scanner y DEVELOPMENT.md. Un pequeño catálogo sintético no estima precisión
sobre fotografías reales ni búsqueda mundial. Hubo un smoke adicional contra TCGdex
real, sin interacción de navegador ni escritura de inventario. No hubo cambios de
credenciales, migración nueva, destrucción de datos, commit, push, merge, rebase o reset.
El estudiante debe revisar y comprender el código, completar SCANNER.md y decidir
cuándo publicar. Se conservan todas las atribuciones y entradas históricas anteriores.


### Continuación acotada — 2026-11-23

El usuario delimitó un único hito y autorizó exclusivamente evaluación local de dos
fotografías. Codex recuperó la implementación existente, completó regresiones HEIC y
HTTP, corrigió un test obsoleto y registró mediciones reales con trazabilidad de hashes.
La localización y OCR regional evaluados ya estaban implementados antes de esta
sesión; no se atribuyen como una nueva implementación. Verificación: 66 backend,
20 frontend de servicio, lint acotado y TypeScript; sin aceptación manual de navegador
ni ejecución del gate completo. Las fotografías no forman parte del repositorio.


### Hito B — 2026-11-23

El usuario delimitó recuperación ante localización incorrecta y prohibió comenzar
matching visual/UI. Codex implementó únicamente comparación OCR acotada con la imagen
original, regresiones, traducciones de avisos y registro reproducible de mediciones.
Se reutilizó el detector y la extracción previos. Las identidades esperadas de las
dos fotos permanecen exclusivamente en evaluación; no se añadieron excepciones por
nombre, archivo o ID a producción. No se atribuye aceptación de navegador ni precisión
general a estas mediciones.


### 2026-11-23 — Milestone C

Asistencia de Codex: revisión del ciclo de sesión del escáner, corrección de programación
cancelable del reconocimiento y retorno de foco, cuatro regresiones de escaneos consecutivos
y logout, y documentación. Validación ejecutada: 98 pruebas frontend focalizadas, lint
acotado y TypeScript. No se atribuye validación manual de navegador ni nuevas mediciones OCR.

### Milestone D — final validation (2026-11-23)

Real Zen browser acceptance completed with existing Google OAuth, local FastAPI,
PostgreSQL, Tesseract 5.5.4 and pillow-heif 1.8.1. Original HEIC Cranidos → me05-044
and Armarouge → me05-086 ranked first as possible matches. Explicit selection and
save created exactly two acceptance copies, retained in the development database.
Both collection detail pages and read-only PostgreSQL queries confirmed persistence;
migration remains 0004. Spanish/English flow, next-scan reset and focus were observed.
Race/failure scenarios have automated coverage, not browser fault-injection evidence.

Final bash scripts/check.sh exited 0: 43 unittest cases, 586 backend cases (including
75 PostgreSQL integration cases), 406 frontend cases across 32 files; zero failures
or skips. Provider validation, Ruff, ESLint, TypeScript, build and whitespace passed.
Earlier gate attempts found one copied-patch false positive in existing unintegrated
visual code and 25 scanner lint violations. Fixed without enabling hybrid recognition
or weakening tests. Focused runs: 43 backend, 98 frontend and 15 visual tests passed.

Ready for final user acceptance. Mobile camera/touch, narrow-screen and VoiceOver
remain manual: http://localhost:5173/scanner on the development Mac. No private images
stored in the repository, secrets changed, database resets, commits or pushes.
See docs/SCANNER.md for copy identifiers and detailed browser evidence.

### Acceptance regression follow-up — 2026-11-23

Recovered the two absent candidates in the five-photo sample with bounded fallback
framing, layout-aware Trainer title OCR and language-aware discovery budget ordering.
All five expected cards now rank first, as do the prior Cranidos/Armarouge HEICs.
Jamming Tower and Zigzagoon numbers remain unreadable: same-name printings remain
ambiguous, requiring explicit confirmation. This is not a general accuracy claim.
Scorbunny retains a partial OCR title and uncertain confidence. See docs/SCANNER.md
and research/scanner/acceptance_regression_{before,after}.json for measured evidence.

Validation: 100 focused tests; one complete scripts/check.sh run passed with 43
unittest, 593 backend and 406 frontend tests, zero skips/failures. Ruff, ESLint,
TypeScript, production build and whitespace passed. Seven general regression cases
cover bounded localized discovery, incomplete regional names, secret numbering,
Trainer headers/title regions and interrupted geometric boundaries. No private
images committed, inventory writes, credentials changes, commits or pushes.
Remaining: improve outlined footer OCR using independent evidence; do not infer a
printing solely from first rank. No hybrid recognition or Iteration 7 work.

## Iteración 7 — Precios de referencia (23/11/2026)

### Aportes del estudiante

- Definió las fuentes (Cardmarket `trend` en EUR, respaldo TCGplayer en USD), la regla por variante de cada copia física, la etiqueta "precio de referencia" sin ajuste por estado, CLP por defecto con opción USD, las cachés y las vistas.
- Resolvió las seis preguntas abiertas del spec, cambió la fuente de tasas a ExchangeRate-API con atribución, y revisó y corrigió el tope de precios y la precisión de las columnas.
- Aplicó la migración `0005` en su base y decidió el ritmo de commits (sin push).

### Uso de IA (Claude Code)

- Redacción del spec, del plan, de esta documentación y de la evidencia en `research/prices/`.
- Implementación completa del backend y del frontend de precios con sus pruebas, y una revisión final que encontró y corrigió un problema de seguridad (filas por ids inventados).
- El código fue escrito por la IA y revisado por el estudiante por tareas; debe ser entendido por él antes de la entrega.

## Iteración 8A — Rediseño visual "Unova Noir" (2026-11-23)

### Decisiones del estudiante

- Definió la dirección visual (paleta, roles de color, tipografías, formas, movimiento, shell e Inicio), aprobó el spec y el plan con las siete decisiones recomendadas y dos ajustes (deuda técnica del endpoint de expansiones; pie de estado solo con sesión y cerrado).
- Fijó la regla de trabajo: un commit por tarea si pasan pruebas y lint, sin push, una única revisión visual en Safari al final de la 8A.

### Uso de IA (Claude Code)

- Auditoría del frontend, spec, plan, tokens, componentes, migración de estilos, Inicio, pruebas y documentación.
- El código fue escrito por la IA; la aceptación visual la hace el estudiante en su navegador, y debe entender el código antes de la entrega.

## Iteración 8C — Carpetas (2026-11-24)

### Decisiones del estudiante

- Definió el concepto (carpetas tipo álbum real con páginas de 9 bolsillos, bandeja "Sin carpeta", ubicación de cada carta, animaciones) y aprobó D1–D8, con el ajuste de anunciar de dónde se movió una copia.
- Fijó la regla de trabajo: un commit por tarea si pasan pruebas y lint, sin push, migración aplicada por él al final.

### Uso de IA (Claude Code)

- Spec, plan, migración, backend, frontend, pruebas y documentación. La aceptación visual la hace el estudiante en su navegador; debe entender el código antes de la entrega.

## Iteración 8C.1 — Retirar las Cajas PC (2026-11-24)

### Decisiones del estudiante

- Pidió retirar las Cajas PC y la migración reversible que borra las tablas congeladas; aprobó la Pokédex paginada con búsqueda (D1 = B), la redirección `/boxes?pokemon=N` y partir de la rama de la 8C. Pidió registrar el rediseño visual de la Pokédex como iteración pendiente.

### Uso de IA (Claude Code)

- Spec, plan, migración, frontend, pruebas y documentación. La aceptación visual la hace el estudiante en su navegador.

## Iteración 8D, Parte 1 — Álbum abierto y acciones en contexto (2026-11-24)

### Decisiones del estudiante

- Aprobó D1–D7 y la Parte 1, y pidió detenerse antes de la Parte 2 para revisar en Safari.

### Uso de IA (Claude Code)

- Álbum, acciones en contexto, gestos, detalle de copia, pruebas y documentación. La aceptación visual la hace el estudiante en su navegador.

## Iteración 9A — Inicio final (2026-11-25)

### Decisiones del estudiante

- Aprobó D1–D16, con el carrusel continuo en bucle y el gráfico que une los registros reales sin cortar la línea. Pidió la regla de commits de `CLAUDE.md`.

### Uso de IA (Claude Code)

- Spec, plan, migración, backend, frontend, pruebas y documentación. La aceptación visual la hace el estudiante en su navegador.
