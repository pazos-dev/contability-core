# Integración con otras aplicaciones

## Como módulo importable

La aplicación anfitriona crea adaptadores y los inyecta en los casos de uso exportados por el core.
Puede ser NestJS, Express, otra aplicación Node o una herramienta sin servidor HTTP.
No existen todavía funciones exportadas: el ejemplo siguiente describe el contrato futuro, no código ejecutable.

1. Inventario registra una compra en su propio dominio.
2. Un coordinador traduce el hecho a una petición contable con cuentas e importes explícitos.
3. El caso de uso crea y contabiliza el asiento dentro del libro correspondiente.
4. Un adaptador guarda el asiento y devuelve un resultado serializable.

La UI consume la API del anfitrión. Un navegador no se conecta directamente a un repositorio PostgreSQL del core.
El catálogo de productos y los documentos comerciales permanecen en sus módulos.

## Frontera: qué garantiza el core y qué debe garantizar el anfitrión

Este repositorio es un motor contable embebible. **No incluye base de datos, ORM, migraciones, HTTP ni
procesos.** Por eso las garantías que dependen del almacenamiento no son un incremento pendiente del core: son
un contrato que el anfitrión debe cumplir al implementar los puertos.

| El core garantiza | El anfitrión debe garantizar |
| --- | --- |
| Las reglas contables y de coherencia, con códigos de error estables | Una `UnitOfWork` que sea una transacción real de su motor |
| Que todas las lecturas y entregas al puerto ocurran dentro de ese alcance | Atomicidad y rollback de su motor |
| Consultar unicidad antes de entregar: código de cuenta, código de diario, solapamiento de períodos, una sola reversión | Restricciones únicas en su esquema que cierren la ventana entre la consulta y la escritura |
| Un identificador de asiento que nunca se reutiliza, comprobado antes de entregar | Clave primaria sobre `(ledgerId, entryId)`, que es la garantía durable |
| Rechazar un asiento si el período ya está cerrado en el momento de la lectura | Serialización o detección de versión entre cierre y contabilización |

Consecuencia práctica: en este repositorio las pruebas del adaptador en memoria demuestran **la disciplina de
las operaciones**, no atomicidad ni aislamiento. Un adaptador durable del anfitrión debe probar eso con su
base real, y esas pruebas viven en el anfitrión.

## Persistencia

Los objetos de dominio viven en memoria durante la ejecución. Un repositorio guarda y reconstruye su estado.
Sin adaptador durable **del anfitrión**, los datos se pierden al terminar el proceso. Este repositorio no
configura ninguna base: incluir PostgreSQL, un ORM o migraciones queda fuera de su alcance por diseño.

**Un importe se guarda con `minorUnits`, `code` y `scale`.** La escala es parte del dato contable, no un
derivable: la tabla ISO 4217 puede cambiar y el código solo no alcanza para releer un valor histórico.
`Money.toJSON()` ya la incluye; no la quites del esquema de la base ni del DTO por parecer redundante.
Guardar solo `minorUnits` y `code` convierte un cambio de escala en una lectura 10 o 100 veces menor
sin ningún error. Reconstruir sin escala, o con una escala que no coincide con la tabla, falla
(`M14` y `M15` en `docs/specs/money.md`).

Un código fuera del catálogo ISO no es un error: es una moneda propia y la escala viaja con el dato.
Eso cubre las monedas que ISO todavía no publica y las que retiró. El adaptador no debe completar la
escala desde una tabla propia ni deducirla del código: la que viene en el registro es la autoridad.

## Atomicidad entre módulos

Un core desacoplado no garantiza automáticamente que compra y asiento se confirmen juntos.
En una misma BD se puede compartir una transacción mediante contratos explícitos.
Entre servicios/BDs, especificar reintentos e idempotencia y valorar outbox/saga cuando se necesite.
No añadir infraestructura distribuida en esta fase.

## Contratos de intercambio

- Moneda, escala y unidades mínimas explícitas; bigint como cadena en JSON.
- Fecha contable YYYY-MM-DD; instante de auditoría como concepto distinto.
- IDs de libro, diario, período y cuentas sin valores mágicos.
- Clave de idempotencia para operaciones repetibles, aislada por libro y operación.
- Códigos de error estables; traducción a HTTP en el adaptador de entrada.

Antes de persistencia real, especificar relación empresa/libro/plan, numeración e invariantes transaccionales.
