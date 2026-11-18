# @pazos-dev/contability-core

Motor contable embebible en TypeScript. Dominio, casos de uso y puertos; **sin ORM, sin HTTP, sin base de datos y sin dependencias de runtime**. Los adaptadores durables se instalan aparte.

```bash
pnpm add @pazos-dev/contability-core
```

## Punto de entrada

| Símbolo | Qué es |
| --- | --- |
| `Accounting` | La fachada pública: diecisiete operaciones, cada una entregando un DTO serializable. |
| `createInMemoryAccounting` | Adaptador volátil para pruebas y desarrollo. No persiste nada. |
| tipos de `ports` | `UnitOfWork` y los repositorios que implementa un adaptador durable. |

El paquete publica **una** fachada a propósito. No expone las diecisiete clases de caso de uso ni un símbolo por operación.

## El importe nunca es flotante

`Money` guarda un `bigint` en unidades mínimas y una `Currency` con su escala. Un importe se construye con un parser decimal exacto o con `MoneyFactor`, nunca con un `number`. `Money.multiply`, `Money.divide` y `Money.allocate` reciben un factor exacto y un modo de redondeo explícito.

## Sin entorno

El código compilado no importa ningún módulo de Node.js: no toca disco, red, procesos ni relojes. Corre igual en Node, Bun, Deno o un worker. La persistencia, la transacción y la concurrencia son obligaciones del adaptador, listadas en [docs/INTEGRATION.md](https://github.com/pazos-dev/contability-core/blob/main/docs/INTEGRATION.md).

## Documentación

- Estado y alcance real: [docs/STATUS.md](https://github.com/pazos-dev/contability-core/blob/main/docs/STATUS.md)
- Contrato del adaptador del anfitrión: [docs/INTEGRATION.md](https://github.com/pazos-dev/contability-core/blob/main/docs/INTEGRATION.md)
- Especificaciones por área: [docs/specs](https://github.com/pazos-dev/contability-core/tree/main/docs/specs)

Este paquete es un motor, no un sistema contable terminado. Las cotizaciones, la diferencia de cambio y el cierre de ejercicio no están implementados.
