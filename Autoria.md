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
