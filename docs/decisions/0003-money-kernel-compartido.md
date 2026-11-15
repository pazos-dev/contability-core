# ADR 0003 — money como kernel compartido del dominio

Estado: decisión adoptada. Sustituye, para `money/`, el listado de carpetas de ADR 0002.
Fecha: 2026-11-14.

## Contexto

`src/core/domain/money/` era la única carpeta del dominio sin agregado: contenía dos objetos de valor
(`Currency`, `Money`), el catálogo ISO generado y su error. Se la trataba como par de `account`, `journal`,
`entries` y `period`, y esa simetría no se sostenía:

- Con la agrupación por naturaleza aplicada a las cinco carpetas (`value-objects/`, `types/`, `errors/`,
  `dto/`), `money/` producía rutas como `money/value-objects/money.ts`, que nombran dos veces lo mismo: en una
  carpeta donde todo es un objeto de valor, `value-objects/` no separa nada.
- El único archivo que quedaba en la raíz de `money/` era `currency-catalog.ts`, de 223 líneas y generado: el
  46% de las líneas de la carpeta. Abrir la carpeta mostraba primero el catálogo y los dos valores un nivel
  abajo, o sea, la estructura decía lo contrario de lo que la carpeta significa.
- Los contextos acotados son cuatro: `Account`, `Journal`, `JournalEntry` y `AccountingPeriod` son los únicos
  agregados del módulo. `Money` no es el agregado de ningún dominio del negocio: es un valor que varios
  necesitan.

## Decisión

`money/` deja de ser un contexto acotado y pasa a ser el kernel compartido del dominio:
`src/core/domain/shared/money/`.

- **Dentro de `domain/`.** `Money` es un concepto de dominio; sacarlo de la capa permitiría que un adaptador
  importara un importe monetario sin pasar por el dominio, que es el límite que el proyecto cuida.
- **Plano.** `currency.ts`, `money.ts`, `currency-catalog.ts` y `money-errors.ts` al mismo nivel. Se conserva
  sólo `dto/`, porque separar datos de comportamiento sigue siendo cierto dentro de un kernel.
- **`describe-value.ts` se mudó a `shared/`.** Era el otro archivo suelto en la raíz de `domain/` y lo importan
  todos los dominios; con el kernel creado, dejarlo afuera era arbitrario.
- **`scripts/check-project.mjs` codifica la distinción**: exige los cuatro contextos acotados por nombre y el
  kernel compartido aparte (barrel, README y spec), en lugar de listar cinco pares.

## Alternativas descartadas

- **Mantener las carpetas por naturaleza dentro de `money/` y sólo sacar el catálogo a `catalog/`.** Conserva
  `money/value-objects/money.ts` y crea una carpeta `catalog/` que ningún otro dominio tiene.
- **Mover `money/` fuera de `domain/`.** Rompe el límite de capa, y `docs/specs/money.md` seguiría siendo una
  spec de dominio sobre algo que ya no estaría en `domain/`.
- **Poner `Money` dentro de `entries/`.** Haría que un contexto acotado poseyera el dinero de todo el sistema, y
  la capa de aplicación tendría que importar `entries/` para pedir un importe.

## Consecuencias

- Se actualizaron en el mismo cambio: `scripts/check-project.mjs`, `docs/ARCHITECTURE.md`,
  `docs/specs/money.md`, `docs/specs/currency-catalog.md`, `docs/DOMAIN.md`, `tests/public-api.test.mjs`,
  `tests/domain/shared/money/` y el generador `scripts/sync-iso4217.mjs` con la cabecera del archivo generado.
- La superficie publicada no cambia: `package.json` exporta sólo `.` y el barrel raíz reexporta los mismos
  símbolos. Sólo se movió una ruta interna.
- Un contexto acotado puede importar `shared/` por el barrel del concepto compartido; sigue prohibido importar
  archivos internos de otro contexto.
