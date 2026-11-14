# Dominio y vocabulario

## Conceptos

| Concepto | Responsabilidad | No contiene |
| --- | --- | --- |
| Currency | Código y escala de la moneda. Objeto de valor. | Saldo, tipo de cambio ni identidad de BD. |
| Money | Importe exacto y moneda, inmutables. | Formato visual, conversiones ni persistencia. |
| Account | Clasificación contable dentro de un plan; tipo, jerarquía y admisión de movimientos. | Saldo editable ni registro de operaciones. |
| Journal | Diario que agrupa y clasifica asientos. | Las reglas de equilibrio de cada asiento. |
| JournalEntry | Registro de un hecho económico mediante líneas. | Datos de un proveedor, productos o lógica de inventario. |
| JournalEntryLine | Cuenta, lado DEBIT/CREDIT e importe positivo. | Escritura independiente que rompa el agregado. |
| AccountingPeriod | Intervalo de fechas y estado OPEN/CLOSED. | Registros contables dentro de sí mismo. |
| Ledger (libro) | Ámbito de aislamiento contable: identidad, nombre, un plan de cuentas y estado ACTIVE/INACTIVE. | Empresa, usuario, autorización, moneda funcional, cuentas ni saldos. |

Las carpetas agrupan conceptos. `money/` no es una entidad: contiene Money y Currency.

## Cuentas y naturaleza

| Tipo | Aumento habitual | Disminución habitual |
| --- | --- | --- |
| ASSET / Activo | Debe | Haber |
| LIABILITY / Pasivo | Haber | Debe |
| EQUITY / Patrimonio | Haber | Debe |
| REVENUE / Ingreso | Haber | Debe |
| EXPENSE / Gasto | Debe | Haber |

La naturaleza habitual no prohíbe contabilizar en el lado opuesto. Las contracuentas requieren una política
adicional cuando se incorporen. La presentación del saldo depende del informe y de las cuentas incluidas.

## Reglas consolidadas

- Dinero exacto en bigint de unidades mínimas, operaciones inmutables y compatibilidad de moneda.
- Código de cuenta único dentro del plan; jerarquía dentro del mismo plan y sin ciclos.
- Cuentas agrupadoras sin movimientos. Cuentas usadas se desactivan en lugar de borrarse.
- Asientos con al menos dos líneas positivas, Debe = Haber y una moneda por asiento en la primera versión.
- Borradores editables. Asientos contabilizados inmutables; corrección mediante otro asiento de reversión.
- Fechas de calendario y períodos OPEN/CLOSED. Un período cerrado rechaza nuevas contabilizaciones en sus fechas.
- El libro da ámbito a todo lo demás: nace ACTIVE, no se borra, su plan de cuentas no cambia y un libro
  inactivo rechaza escrituras. Especificado en `specs/ledger.md`; todavía sin implementar.

Consultar las especificaciones para distinguir invariantes locales de validaciones que requieren repositorios.

## Ejemplo: electricidad pendiente de pago

Al reconocer un gasto de 1.000 UYU:

| Cuenta | Debe | Haber |
| --- | --- | --- |
| Gasto de electricidad | 1.000 | — |
| Electricidad por pagar | — | 1.000 |

Al pagarlo, crear otro asiento: Debe 1.000 en Electricidad por pagar y Haber 1.000 en Banco.
El primer asiento reconoce el gasto y la deuda. El segundo cancela la deuda y reduce el dinero;
no vuelve a reconocer el mismo gasto.

## Responsabilidad fiscal

País, impuestos, declaraciones y obligaciones locales siguen fuera de esta fase.
No deducir normativa de un ejemplo en UYU ni introducir cuentas fiscales por defecto.
