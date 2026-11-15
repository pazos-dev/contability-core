# DTO del dominio y organización de pruebas

Separar en cada dominio las formas de datos (entradas de construcción, representaciones serializadas y la
forma interna que consume el constructor privado) de los archivos de los objetos de valor, agrupar por
naturaleza `errors/`, `types/` y `value-objects/`, reconocer `money` como kernel compartido del dominio y
reagrupar los archivos de prueba en espejo de `src/`. Rama `refactor/domain-dtos`; `main` queda en `e00a128`
hasta el merge.

## Specs

S1. Pedido original, textual: «vamos a refactorizar uqe hay michos errores. en dominio vas a crear dto para
separar las interfaces y tipos que estan y mantener correctamente clean arq value object etc. y su carpeta de
test tmabien de dominio».

S2. Decisión del usuario sobre ubicación, textual del preview aprobado: «dto/ dentro de cada dominio, sigue
público». Los DTO viven en `src/core/domain/<dominio>/dto/` y cada barrel los sigue exportando con los mismos
nombres: la superficie pública del paquete no pierde ni renombra un símbolo.

S3. Decisión del usuario sobre pruebas, textual del preview aprobado: «Espejo de `src/`». `tests/domain/<dominio>/`,
`tests/application/`, `tests/adapters/` y `tests/public-api.test.mjs`.

S4. Regla de separación: `dto/` reúne toda forma de datos del dominio y ninguna de esas formas tiene
comportamiento — las entradas de construcción (`*Input`), las representaciones serializadas (`*JSON`) y las
formas internas que consume el constructor privado (`*Fields`, `*Changes`). Cada archivo de objeto de valor
contiene sólo su clase. Los archivos generados quedan fuera de la regla, porque la próxima regeneración los
sobrescribe: `currency-catalog.ts` conserva su `IsoCurrencyEntry`.

S5. Consistencia de tipos de estado: `AccountStatus` y `JournalStatus` dejan de declararse dentro del archivo
de la clase y viven en `account-status.ts` y `journal-status.ts`, igual que `period-status.ts` y
`entry-status.ts`.

S6. Sin cambio de comportamiento: las 217 pruebas y `tests/public-api.test.mjs` pasan sin cambiar una sola
expectativa, y `pnpm check` queda en verde.

S7. Nada fuera del dominio importa un DTO del dominio. Hoy sólo los barrels los reexportan, así que mover los
archivos no toca la capa de aplicación ni los adaptadores.

S8. Los archivos de prueba siguen consumiendo `dist/index.js`, la superficie pública del paquete: sólo cambia
la profundidad relativa del import relativo.

S9. Requerimiento posterior, textual: «los errors typos y value object tambien agrupalos por separado». Cada
dominio agrupa `errors/`, `types/` y `value-objects/` con el mismo criterio que ya usaba `dto/`: una clase o
una forma de datos por archivo, sin comportamiento mezclado.

S10. El agregado de cada contexto acotado queda en la raíz de su dominio, porque es su puerta de entrada.
Quedan también en la raíz los ayudantes internos (`entry-text.ts` en `entries/`) y los archivos generados, que
conservan la ubicación donde los escribe su generador.

S11. Requerimiento posterior, textual: «poruqe la estructura de money asi? money es mas bien un value object no
creo de deba se tener una carpeta de domnio propia y porque dejaste catalog currency fuera como sk fuera lo mas
importante?». Diagnóstico confirmado: `money/` es la única carpeta del dominio sin agregado y el catálogo
generado de 223 líneas era el único archivo de su raíz, el 46% de las líneas de la carpeta.

S12. Decisión del usuario entre tres opciones: «Sacar money/ de domain/: kernel compartido». `money` deja de
ser un contexto acotado y vive en `src/core/domain/shared/money/`, dentro de la capa de dominio y plano
(`currency.ts`, `money.ts`, `currency-catalog.ts`, `money-errors.ts`, más `dto/`), sin `value-objects/` ni
`errors/`. `describe-value.ts` pasa a `shared/`. `check:project` exige los cuatro contextos acotados y, aparte,
el barrel, README y spec del kernel compartido. Registrado en ADR 0003, que sustituye ese punto de ADR 0002.

S13. Requerimiento posterior, textual: «en casos de usos esta port y en domain dto que es lo mismo con diferente
nombre deja plasmado usar un mismo nombre para todo cuando sean iguales conso y busca si hay alguna otra csrpeta
parecida».

S14. Un mismo nombre para la misma naturaleza en todas las capas, y el empaquetado sigue la convención de su
capa. `dto` = formas de datos sin comportamiento; `ports` = contratos de comportamiento que el anfitrión
implementa. Por eso `use-cases/contracts.ts` pasa a `application/dto.ts`, y `StoredOperation` sale de `ports/` a
ese módulo: `ports/` queda sólo con interfaces de comportamiento. La regla y su tabla viven en
`ARCHITECTURE.md`, sección «Nombres de módulos».

S15. Requerimiento posterior, textual (parte de L15): «veo que en los casos de uso co.o registeracount y otros
se repite el mismo pateon de validaciones casi siempre antes de pasar hacer lo qu3 deberia sinya tenemosnguard
se puede pasar esa logica a un objeto o una clase estatica para no repetir tanto el cosigo ?». Se extrae el
ciclo de idempotencia —`Idempotency.execute`, con `replay` y `remember` privados— y las secuencias de guardas
quedan intactas, por las razones de L16.

S16. Requerimiento posterior, textual (resto de L15): la puerta de entrada no debe confundirse con el dominio y
`application` debe estar por carpetas como `domain`. Decisión: el nombre `Accounting` se conserva y la fachada
pasa a `facade/accounting.ts`; los casos de uso van uno por archivo en `use-cases/<área>/`, con un `rules.ts`
por área y un `result.ts` en `entries/`. Sin cambio de superficie pública.

S17. Requerimiento posterior, textual: «mi idea es mantener accounting que se pueda instanciar como actualmente
es ... Y lo que yo quiero pasar a clases con métodos estáticos directamente son los casos de uso de la
aplicación ... varias clases pero con sus métodos estáticos». Una clase por área con una operación estática por
caso de uso, dependencias por parámetro; `Accounting` queda instanciable y `#deps` privado. Un campo estático en
cualquiera de las cuatro clases queda prohibido explícitamente por S17.

## Tasks

| ID | Spec | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S2, S4, S5, S7 | Extraer las 14 formas de datos y los 2 tipos de estado a `dto/` en los cinco dominios; barrels con las rutas nuevas | `refactor(domain): move every data shape into per-domain dto folders` |
| T2 | S3, S8 | Reagrupar los 14 archivos de prueba en espejo de `src/` y ajustar los imports a `dist/` | `test: mirror the source tree in the tests folder` |
| T3 | S2, S3, S6 | Documentar: `ARCHITECTURE.md`, los cinco README de dominio, `tests/README.md` y `STATUS.md` | `docs(domain): document the dto folders and the test layout` |
| T4 | S9, S10 | Mover `errors/`, `types/` y `value-objects/` en los cinco dominios; imports y barrels | `refactor(domain): group errors, types and value objects into their own folders` |
| T5 | S9, S10 | Documentar la agrupación por naturaleza en `ARCHITECTURE.md`, los cinco README y `STATUS.md` | `docs(domain): document the folder taxonomy` |
| T6 | S11, S12 | Mover `money/` a `shared/money/` plano y `describe-value.ts` a `shared/`; imports, barrels, `check:project`, generador y pruebas | `refactor(domain): move money into the shared kernel and flatten it` |
| T7 | S11, S12 | ADR 0003, nota en ADR 0002, `ARCHITECTURE.md`, `DOMAIN.md`, las dos specs, `STATUS.md` y este documento | `docs(domain): record money as the shared kernel` |
| T8 | S13, S14 | Renombrar `contracts.ts` a `dto.ts` y sacar `StoredOperation` de `ports/`; imports, barrels y `check:project` | `refactor(application): name the data module dto and empty ports of data` |
| T9 | S14 | Regla de nombres en `ARCHITECTURE.md`, README de `use-cases/`, `STATUS.md` y este documento | `docs: state one name per kind across layers` |
| T10 | S14 | `ports/` (carpeta con un solo `index.ts`) pasa a `ports.ts`; imports, `check:project` y su README integrado al de la capa | `refactor(application): make ports a single module` |
| T11 | S15 | `Idempotency.execute` con mitades privadas; 9 call sites | `refactor(application): make Idempotency own the whole cycle` |
| T12 | S16 | Fachada a `facade/` y casos de uso uno por archivo en `use-cases/<área>/` | `refactor(application): one file per use case in area folders` |
| T13 | S16 | Documentar la estructura nueva en `ARCHITECTURE.md`, los dos README de la capa y `STATUS.md` | `docs(application): document the per-use-case layout` |
| T14 | S17 | Cuatro clases de área con operaciones estáticas y fachada adaptada | `refactor(application): group use cases into four area classes with static operations` |
| T15 | S17 | Documentar el modelo en `ARCHITECTURE.md`, los dos README y `STATUS.md` | `docs(application): document the static operations model` |
| T16 | S17 | `entries/` vuelve a ser carpeta (tres piezas) y sus módulos de apoyo pierden el prefijo ad-hoc | `refactor(application): give entries a folder and drop the ad-hoc prefixes` |

## Log

L1. «vamos a refactorizar uqe hay michos errores. en dominio vas a crear dto para separar las interfaces y
tipos que estan y mantener correctamente clean arq value object etc. y su carpeta de test tmabien de dominio».

L2. Diagnóstico propio antes de escribir: `pnpm check` estaba en verde, así que «errores» no eran fallos de
compilación ni de prueba. Se identificaron tres defectos reales: los DTO de construcción dentro de los
archivos de los objetos de valor (12 interfaces en 5 archivos), su export en la superficie pública del
paquete (6 símbolos) y las pruebas sin agrupar por capa, contra lo que ya pedía `tests/README.md`.

L3. Se descartó fusionar `EntryLineInput` (aplicación) con `JournalEntryLineInput` (dominio): uno viaja con
`MoneyJSON` y `lineId`, el otro con `Money` e `id`. No son duplicados, son dos concerns con el límite de capa
en el medio.

L4. Decisiones del usuario: los DTO quedan dentro del dominio y siguen siendo públicos; las pruebas se
agrupan en espejo de `src/`.

L5. Se descartó mover los DTO a la capa de aplicación: era la tercera opción del preview y no se eligió, así
que el dominio sigue publicando sus DTO de construcción y `ARCHITECTURE.md` no cambia de modelo de capas.

L6. Corrección durante la implementación: `currency-catalog.ts` se declara generado («Do not edit by hand»,
`pnpm sync:iso4217`), así que `IsoCurrencyEntry` no se movió. La alternativa era editar también el generador
para reubicar una interfaz de seis líneas, y eso agrega superficie de fallo sin quitar ningún defecto. La
regla de S4 se ajustó para excluir los archivos generados en lugar de dejar la spec contradiciendo al código.
Cuatro formas de datos más de las que decía el diagnóstico inicial: son 14, no 12, al contar `CurrencyJSON`
y `MoneyJSON`.

L7. Al mover las pruebas aparecieron rutas viejas en más documentos que los previstos: las seis specs de
casos de uso, `docs/specs/currency-catalog.md`, `docs/specs/ledger.md` y `docs/STATUS.md`. Se corrigieron
porque son documentos vigentes. Los `docs/tasks/*.md` de tareas ya cerradas conservan sus rutas: son
registro de lo que era cierto al cerrar, no guía actual.

L8. «los errors typos y value object tambien agrupalos por separado».

Continuación del mismo criterio: `dto/` fue el primer grupo y quedaban otros tres tipos de archivo en la
raíz de cada dominio. Se movieron dieciséis archivos con `git mv`, así que el historial los sigue. El
compilador fue la red: `pnpm typecheck` limpio al primer intento después de reapuntar imports, y
`pnpm check` en 217/217.

L9. Decisiones internas (rutinarias, no consultadas):
- El agregado queda en la raíz del dominio y no dentro de un `entities/`. La simetría total pedía un cuarto
grupo que no se pidió, y el agregado en la raíz comunica que es la puerta de entrada del dominio.
- La frontera `types/` / `dto/` se resolvió por intención y quedó escrita: `types/` es de qué está hecho el
modelo y no tiene campos; `dto/` son formas de datos que cruzan un límite.
- `money/` no tiene `types/`: sus uniones cerradas son códigos de error y viven junto a su error, en
  `errors/money-errors.ts`.
- `currency-catalog.ts`, `entry-text.ts` y `describe-value.ts` no se movieron, por las razones de S10.

L10. «poruqe la estructura de money asi? money es mas bien un value object no creo de deba se tener una carpeta
de domnio propia y porque dejaste catalog currency fuera como sk fuera lo mas importante?».

Respuesta con evidencia: `money/` no tenía agregado (los únicos cuatro son `Account`, `Journal`,
`JournalEntry`, `AccountingPeriod`), pero la carpeta existía por decisión previa del proyecto — `AGENTS.md` la
llama carpeta temática y `check:project` la exigía. Los dos defectos reales eran otros: `value-objects/`
dentro de una carpeta que es todo valores producía `money/value-objects/money.ts`, y el archivo de 223 líneas
en la raíz hacía que el catálogo generado pareciera el centro de la carpeta.

L11. Decisión del usuario: kernel compartido, entre las tres opciones del preview. Consecuencias que se
resolvieron juntas:
- Se descartó sacar `money/` fuera de `domain/`: rompe el límite de capa, porque un adaptador podría importar un
importe monetario sin pasar por el dominio.
- Dentro del kernel la carpeta queda plana, que es lo que responde al segundo defecto: con todo al mismo nivel,
  el catálogo ya no parece el archivo principal.
- `describe-value.ts` se mudó a `shared/` por la misma razón: era el otro archivo suelto en la raíz de
  `domain/` y lo importan todos los dominios.
- `check:project` pasa a codificar la distinción en lugar de listar cinco pares.
- La decisión se registró en un ADR nuevo (0003) con las alternativas descartadas, y ADR 0002 conserva su texto
  con una nota de sustitución: es historia, no guía vigente.

L12. «en casos de usos esta port y en domain dto que es lo mismo con diferente nombre deja plasmado usar un mismo
nombre para todo cuando sean iguales conso y busca si hay alguna otra csrpeta parecida».

Inventario antes de tocar: `application/use-cases/contracts.ts` y `domain/<contexto>/dto/` eran la misma cosa
con dos nombres. `ports/` no era lo mismo —son contratos de comportamiento— pero tenía adentro un DTO,
`StoredOperation`, y eso es lo que hacía que las dos carpetas se leyeran iguales. Revisadas el resto:
`domain/shared/` y `application/use-cases/shared/` ya comparten nombre; `application/errors.ts` y
`domain/<contexto>/errors/` comparten nombre y difieren sólo en empaquetado, que la regla justifica (una clase
de error para toda la capa contra una por contexto); `src/composition/` está vacía salvo README; y
`src/adapters/memory/` no entra en la regla porque es un adaptador concreto, no una capa con naturalezas.

L13. Nombre elegido: `dto`, y no `contracts`. `contract` ya significa otra cosa en este proyecto —el contrato
con el anfitrión, que son los puertos—, y esa ambigüedad es justamente lo que produjo la confusión. `dto` ya
existía en cinco carpetas; renombrar un archivo es más barato y no compite con ningún otro uso de la palabra.
`application/dto.ts` queda en la raíz de la capa y no dentro de `use-cases/` porque también contiene
`StoredOperation`, que el puerto de idempotencia necesita: dejarlo en `use-cases/` obligaría a que `ports/`
importara de `use-cases/`, es decir, a invertir la dependencia entre las dos carpetas.

L14. Continuación pedida: «psi has lo de ports contratc y dto». `ports/` era una carpeta cuyo único contenido
era `index.ts`, contra la regla de empaquetado de S14 —módulo único cuando la capa concentra una sola pieza—,
así que pasa a `ports.ts` y su README se integra al de la capa. De paso se barrieron las últimas menciones a
«contratos» que nombraban datos y no el contrato con el anfitrión: `use-cases/README.md` y la tabla de API
pública. Las menciones que quedan son correctas: `contract` significa en este proyecto el contrato con el
anfitrión, que son los puertos y las specs.

L15. «te hago caso y no los centralizamos. vaos hacer un ultimo refactor ahora a palicacion te digo. primeor la
puerta de entrada acounting debe de ser core o contability o aplication no acounting puede confundir. y ahora
aplication deberia de estar por carpetas como domian pra tener una estructura pero antes de hacerlo veo que en
los casos de uso co.o registeracount y otros se repite el mismo pateon de validaciones casi siempre antes de
pasar hacer lo qu3 deberia sinya tenemosnguard se puede pasar esa logica a un objeto o una clase estatica para no
repetir tanto el cosigo ?»

L16. Diagnóstico de la repetición, medido: 11 casos de uso, 9 con idempotencia, y son **dos** repeticiones
distintas. El esqueleto `of` → `replay` → salida temprana → `remember` se repetía 9 veces y su uso por mitades
era un defecto silencioso: sin `remember` el reintento con la misma clave reejecuta la operación. La secuencia
de guardas se repite en los 11 pero **difiere en cada uno**, su orden es contractual y cada guarda devuelve un
valor que la siguiente consume, así que no se puede extraer sin perder el orden y los payloads; ya se había
evaluado y descartado en `guards.ts`. Una clase estática se descartó además porque no puede llevar el `scope`
de la unidad de trabajo y sería estado global encubierto.

L17. Decisiones del usuario entre opciones: la puerta de entrada **conserva el nombre `Accounting`** y gana
carpeta propia (`facade/`), porque `Core` no dice nada, `Application` choca con `ApplicationDeps`,
`ApplicationError` y `ApplicationErrorCode`, y `Contability` no es palabra en ningún idioma; y los casos de uso
van **uno por archivo** en carpetas por área, no sólo `entries/`. Las clases se extrajeron por rangos de línea,
no se retipearon: el comportamiento dentro de cada clase es idéntico byte a byte. Lo que sí cambió es la
visibilidad de los helpers compartidos, que ahora se exportan desde su módulo interno.

L18. «mi idea es mantener accounting que se pueda instanciar como actualmente es para no cometer esos errores ...
Y lo que yo quiero pasar a clases con métodos estáticos directamente son los casos de uso de la aplicación ...
Esa es mi propuesta y quiero ver que crees» → «varias clases pero con sus métodos estáticos».

Concesión que corresponde: `new PostEntry(deps)` crea un objeto sin identidad ni ciclo de vida que sólo captura
un parámetro, es decir un closure con sintaxis de clase. El invariante del mundo compartido vive en `Accounting`,
no en los once objetos, así que esos objetos no protegían nada que la fachada no garantice ya. La objeción
anterior valía contra poner el estado en la clase (un `static #deps`), no contra operaciones estáticas con las
dependencias por parámetro.

L19. Forma adoptada: `Accounts`, `Journals`, `Periods`, `Entries`, con el nombre de la clase como sustantivo y el
del método como verbo (`Entries.post`, no `Entries.postEntry`). `Accounting` no se tocó: sigue instanciable, con
`#deps` privado y el test de dos fachadas intacto. Los cuerpos se generaron por script desde los archivos
anteriores, no se retipearon, y las clases sólo pudieron cambiar de forma; lo único que cambió de visibilidad son
las reglas propias de `accounts`, que pasaron a funciones privadas del módulo. Medido: 940 → 759 líneas y 15 → 7
archivos. Se advierte lo que el commit anterior había ganado y este revierte: el archivo por caso de uso.

L20. «porque volviste a colocar los casos de uso fuera de carpetas? o es idea mia». No era idea suya: `4ef969d`
creó las carpetas y `84ec958` las colapsó al pasar a una clase por área. La causa fue S17, pero la decisión de no
dejar carpetas con un `index.ts` adentro fue propia, aplicando la regla que el usuario había pedido para `ports/`.
Al revisarlo apareció una inconsistencia real que él no había nombrado: `entries-rules.ts` y `entries-result.ts`
se nombraban por área más rol inventado, contra S14, que nombra los módulos por naturaleza. Corrección: `entries/`
vuelve a ser carpeta porque tiene tres piezas —`entries.ts`, `rules.ts`, `result.ts`— y las tres áreas de una
sola pieza quedan planas. La regla se aplica sin excepciones en las dos direcciones: la carpeta aparece cuando
agrupa algo, y el nombre del módulo es naturaleza, no `área-rol`.
