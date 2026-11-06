# ADR 0002 — Preparación técnica y normalización

Estado: decisiones técnicas adoptadas para preparar este ZIP; no aprobación de políticas fiscales.
Fecha: 2026-11-06.

## Contexto

El kit inicial dejaba versiones, nombres de carpetas y herramientas por configurar. El análisis posterior
distinguió diario, asientos y período, y eligió dinero en unidades mínimas.

## Decisiones

- Un paquete TypeScript ESM, pnpm, Node >=24. TypeScript 5.9.3 fijado; sin dependencias de ejecución.
- Compilación tsc con NodeNext, imports relativos con extensión `.js` y exportación explícita.
- Carpetas `money`, `account`, `journal`, `entries`, `period`.
- Journal no duplica a JournalEntry. El asiento vive en entries.
- Pruebas JavaScript ESM `*.test.mjs` con node:test y node:assert/strict, consumiendo `dist/` tras compilar.
- Tipo de error propuesto: excepción de dominio con código estable. Sin códigos HTTP en core.
- Propuesta Money inicial: entrada decimal estricta como texto o bigint, negativos permitidos en Money;
  líneas de asiento siempre positivas. Rechazar exceso de decimales, sin redondeo automático.
- Propuesta Currency: código de tres letras mayúsculas y escala explícita entre 0 y 6 para esta base;
  no equivale a un catálogo oficial ni pretende cubrir todas las unidades monetarias posibles.
- JSON propuesto: `{ minorUnits: "1025", currency: { code: "UYU", scale: 2 } }`.
- No definir límite monetario de negocio arbitrario; validar formatos y no convertir bigint a number.

Las propuestas de Money/Currency completan huecos técnicos para iniciar; están identificadas en su spec.
Si una aplicación necesita otra escala, modificar su spec antes de consolidar el contrato público.
Multiplicación, división y distribución esperan su propia política de redondeo.

## Verificación

Ver VALIDACION.md para conocer qué comandos pudieron ejecutarse al preparar el ZIP.
Se incluye el lockfile real generado al preparar y compilar la base.
