# SPEC — Cuenta contable

Estado: reglas locales listas; jerarquía y unicidad se verifican al implementar aplicación.
Ruta: `src/core/domain/account/`.

## Modelo

Account: id, chartOfAccountsId, code, name, type, parentId opcional, postingAllowed y estado ACTIVE/INACTIVE.
AccountType: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE.
AccountCode es un valor; no se convierte a número: conservar ceros iniciales y el formato del plan.
Propuesta inicial: IDs, código y nombre no vacíos, sin espacios exteriores; rechazar en lugar de recortar
silenciosamente.
No imponer una máscara nacional ni deducir jerarquía del texto del código.

## Reglas y dueño de validación

| Regla | Responsable |
| --- | --- |
| ID, plan, código y nombre no vacíos; tipo válido | Account y AccountCode. |
| Una cuenta no puede ser su propio padre | Account. |
| Padre del mismo plan y ausencia de ciclos | Caso de uso con repositorio. |
| Código único dentro del plan | Caso de uso y restricción única de BD. |
| Agrupadora no recibe movimientos | postingAllowed=false y caso contabilizar. |
| Cuenta usada no se elimina ni cambia de plan/tipo a escondidas | Caso de uso con historial. |
| Inactiva no admite nuevos asientos contabilizados | Caso contabilizar. |

Una cuenta con hijos debe actuar como agrupadora en esta fase. Crear un hijo de una cuenta que ya tiene
movimientos exige una política posterior; inicialmente rechazar. Desactivar no borra el historial y
reactivar devuelve la cuenta a ACTIVE sin borrarlo.
No almacenar un saldo editable. No exigir positividad de saldo por la naturaleza habitual de la cuenta.

## Aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| A01 | Código `001.01` | Se conserva como texto. |
| A02 | Nombre/código/ID vacío | Rechazo. |
| A03 | Padre igual al ID propio | Rechazo local. |
| A04 | Padre de otro plan o que forma un ciclo | Rechazo desde aplicación. |
| A05 | Código repetido en un plan | Rechazo; el mismo código en otro plan puede existir. |
| A06 | Cuenta agrupadora o inactiva al contabilizar | No se registra el asiento. |
| A07 | Cuenta ya usada | Se permite desactivar; no borrar su historial. |
| A08 | Cambiar un DTO o referencia recibida | No altera estado protegido. |
| A09 | Reactivar una cuenta inactiva | Vuelve a ACTIVE conservando identidad e historial. |

Propuesta de API: create, rename, deactivate, activate y consulta de estado. Cambios de código/padre/tipo quedan
fuera del primer incremento para evitar prometer operaciones sin reglas de historial.
