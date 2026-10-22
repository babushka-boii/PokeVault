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

## Iteración 4 — Continuación: PC Storage como vista previa del catálogo

**Fecha:** 22/10/2026.

El estudiante solicitó una experiencia de cajas clásicas, con dos paneles, 30
espacios, navegación, fondos originales y audio retro; explicitó que no existe
inventario ni autenticación. Codex revisó documentación/código/Git, explicó el
diseño antes de editar y asistió en pruebas, implementación y documentación sobre
la rama existente. Se preservó el directorio `.superpowers/` previamente sin seguimiento.
No se hicieron commits, push, merge ni migraciones.

Se añadieron paginación acotada al endpoint existente (defaults y esquema anterior
conservados), cachés limitadas, hook de carga/cancelación, componentes de cuadrícula,
detalles, sprites y ajustes, tres fondos CSS y un módulo Web Audio original. Las
cajas cubren 1–1025 en grupos de 30 y muestran explícitamente una vista previa del
catálogo; no se inventaron cartas propias. Sonido inicialmente desactivado, volumen
15%, preferencias locales y manejo de audio ausente/restringido. Las acciones de
selección, navegación y aplicación de fondo tienen efectos distintos; no hay
controles de cancelar o confirmación de inventario ficticios.

Las pruebas nuevas fallaron inicialmente por el placeholder y por ignorarse la
paginación. Tras implementar, el gate completo pasó: 43 pruebas de proveedores,
17 backend (incluida PostgreSQL), 28 frontend, Ruff, ESLint, TypeScript, build y
revisión de espacios. Los mocks HTTP/audio cubren errores, última página parcial,
límites, selección, teclado, idioma, preferencias, throttling, cierre de recursos,
resume rechazado y respuestas tardías.

No había navegador conectado al intentar revisión visual. Quedan pendientes la
inspección manual a 390 px/escritorio y escuchar los efectos reales; se registró
un checklist reproducible en DEVELOPMENT.md. No se atribuyen al estudiante revisión
ni reflexiones que no realizó. Cajas de inventario, reglas, cartas TCG, fondos
persistidos y ampliación futura del rango de especies permanecen fuera del alcance.

## Iteración 4 — Refinamiento: búsqueda dentro de las cajas

**Fecha:** 22/10/2026.

El estudiante pidió localizar Pokémon por nombre completo/parcial o número dentro
de su caja original, preservando todos sus compañeros. Codex asistió en diseño,
pruebas previas, implementación y registros. Se añadió un índice de nombres
PokéAPI acotado a 1025 especies, cacheado una hora en el servidor, con ocho resultados
máximos, validación, timeout y errores sanitizados. El navegador no descarga el
catálogo completo. No se añadieron dependencias ni migraciones.

La lupa abre un panel compacto ES/EN con debounce de 300 ms, cancelación, sugerencias,
limpieza, teclado, Escape y estados de carga/vacío/error/reintento. Elegir un
resultado calcula caja/espacio, carga la cuadrícula habitual y enfoca la selección.
Buscar de nuevo en la misma caja no solicita otra página. Se reutilizan efectos de
audio existentes con un único efecto de llegada para evitar solapamiento.

Las pruebas iniciales fallaron por ausencia de ruta y controles. Durante la
implementación se corrigió un reemplazo de texto demasiado amplio que había
alterado una expresión JSX; las comprobaciones posteriores pasaron. El gate final
`bash scripts/check.sh` pasó: 43 pruebas de proveedores, 21 backend, 37 frontend,
Ruff, ESLint, TypeScript, build y revisión de espacios. Las pruebas cubren exacto,
parcial, mayúsculas, número, errores, debounce, respuestas tardías, caja/espacio y
foco. Scraggy (#559) llega a Caja 19, espacio 19, con sus otros 29 Pokémon visibles.
Una consulta real al índice confirmó los resultados de `Scraggy`, `scragg` y `#559`.

Se mantiene el fallback de nombres canónicos; no se inventaron alias españoles.
La revisión visual y auditiva sigue pendiente sin navegador conectado. El estudiante
debe revisar y comprender el código; no se atribuyen reflexiones ni validaciones
personales no realizadas. No se hicieron commits ni push y se conservaron los
cambios anteriores del trabajo de Cajas.

## Iteración 4 — Refinamiento definitivo de iconos, detalles e interfaz PC

**Fecha:** 22/10/2026.

### Solicitud y trabajo

El estudiante rechazó los sprites de combate dentro de la cuadrícula y las cápsulas
redondeadas de tipos. Aportó referencias visuales de Pikachu y del banner Eléctrico,
y pidió iconos de menú Gen V estáticos/APNG, detalles reales, badges inspirados en
Sword/Shield y un fondo clásico claro, conservando búsqueda/audio/teclado.

Codex revisó Git/documentación/código antes de editar, explicó el enfoque y dividió
la investigación de assets y el backend de detalles entre agentes auxiliares, con
revisión independiente del backend. Se preservaron los cambios sin commit y no se
modificó `.superpowers/`, rama, migraciones, dependencias ni funcionalidades ajenas.

Se verificaron árboles y archivos del repositorio PokeAPI/sprites. Gen V cubre
1–649; Pikachu animado es APNG de 32×32 con dos frames de 170 ms. Se verificaron rangos
posteriores de iconos de menú hasta 1025 y sus PNG estáticos de muestra. El banner
Eléctrico #13 mide 200×44; no se copió porque la licencia del repositorio no elimina
los derechos de las imágenes. La evidencia de procedencia/SHAs/formatos quedó en
`research/sprites/`, sin binarios de Pokémon.

La cuadrícula usa iconos de menú con fallback a estáticos/menu posterior/placeholder,
modo persistido y reducción de movimiento. El panel carga solo el Pokémon elegido,
con medidas convertidas, habilidades normales/ocultas y descripción localizada.
Se eliminó el placeholder TCG y se compartió un TypeBadge original para 18 tipos.
Se añadió Clásico como fondo predeterminado, iconos más legibles y espacios
transparentes sobre una superficie continua, sin animación CSS artificial del sprite.

### Evidencia y límites

Las pruebas nuevas fallaron antes de implementar por la ausencia de componentes,
ruta y datos. Se ejecutó el gate completo: 43 pruebas de proveedores, 48 backend
(incluida PostgreSQL), 80 frontend, Ruff, ESLint, TypeScript, build y espacios.
El comando reproducible es `bash scripts/check.sh`.

Una consulta real mediante FastAPI confirmó Bulbasaur ES/EN: 0.7 m, 6.9 kg,
Espesura/Overgrow y Clorofila/Chlorophyll, con descripciones genuinas normalizadas.
También confirmó Scraggy ES: 0.6 m, 11.8 kg, dos habilidades normales y una oculta.
Las pruebas de búsqueda conservan Caja 19/espacio 19 y el resto de la cuadrícula;
se añadieron regresiones de familia de sprite, modo, nodos APNG estables,
fallback, movimiento reducido, localización, datos tardíos y medidas.

No había navegador conectado tras consultar la herramienta y su diagnóstico.
No se afirma revisión visual a 390 px, reproducción APNG en navegador ni escucha
real. La inspección binaria confirma frames, no reproducción visual. Se dejó un
checklist preciso en DEVELOPMENT.md. Trivia/etimología sin fuente, inventario,
cartas y cajas persistentes siguen diferidos. El estudiante debe revisar y poder
explicar el código; no se inventan reflexiones o aprobaciones personales.
