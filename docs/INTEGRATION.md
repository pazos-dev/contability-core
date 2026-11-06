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

## Persistencia

Los objetos de dominio viven en memoria durante la ejecución. Un repositorio guarda y reconstruye su estado.
Sin adaptador durable, los datos se pierden al terminar el proceso. No hay BD configurada en este ZIP.
PostgreSQL y un ORM son opciones futuras; no requisitos dentro del dominio.

## Atomicidad entre módulos

Un core desacoplado no garantiza automáticamente que compra y asiento se confirmen juntos.
En una misma BD se puede compartir una transacción mediante contratos explícitos.
Entre servicios/BDs, especificar reintentos e idempotencia y valorar outbox/saga cuando se necesite.
No añadir infraestructura distribuida en esta fase.

## Contratos de intercambio

- Moneda y unidades mínimas explícitas; bigint como cadena en JSON.
- Fecha contable YYYY-MM-DD; instante de auditoría como concepto distinto.
- IDs de libro, diario, período y cuentas sin valores mágicos.
- Clave de idempotencia para operaciones repetibles, aislada por libro y operación.
- Códigos de error estables; traducción a HTTP en el adaptador de entrada.

Antes de persistencia real, especificar relación empresa/libro/plan, numeración e invariantes transaccionales.
