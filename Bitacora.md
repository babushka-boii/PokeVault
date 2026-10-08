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
