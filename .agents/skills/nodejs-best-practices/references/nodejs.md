# Criterios de ejecución en Node.js

## Asincronía y concurrencia

Esperar las operaciones necesarias y tratar explícitamente las tareas en segundo plano. No usar Promise.all sobre una lista ilimitada de peticiones o escrituras. Seleccionar concurrencia según los límites del proveedor, la base y la memoria disponible.

No ejecutar operaciones dependientes en paralelo ni paralelizar escrituras que alteran las garantías del caso de uso. Promise.all no revierte automáticamente efectos ya realizados cuando una promesa falla.

## Plazos y reintentos

Definir el plazo completo y, cuando proceda, el de cada intento. Utilizar cancelación compatible con la API real; comprobar si cancelar la espera detiene el trabajo subyacente. Reintentar con límite y espera apropiada solo cuando el fallo sea transitorio y repetir la operación no duplique efectos.

La idempotencia requiere una clave, un ámbito de unicidad y un mecanismo consistente; no basta con consultar si existe y luego insertar sin protección concurrente.

## Recursos y cierre

Identificar al propietario de cada conexión, archivo o stream. Liberar recursos también en errores. Al cerrar un servidor, dejar de admitir trabajo, esperar lo que deba terminar y liberar recursos dentro de un plazo definido. No invocar salida inmediata en una biblioteca reutilizable.

## Transacciones

Agrupar las escrituras que deben ser atómicas. Propagar el contexto transaccional según el contrato elegido. No asumir que dos repositorios usan la misma transacción por recibir el mismo pool. Verificar fallos intermedios con la base real cuando se implemente persistencia.

## Observabilidad

Registrar contexto útil: identificador de operación, origen y error interno permitido. Evitar credenciales, tokens y datos sensibles. No convertir un fallo de persistencia en una respuesta de éxito ni capturar errores para devolver un saldo cero.

## Fuentes primarias

- [No bloquear el event loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop).
- [Documentación de Node.js](https://nodejs.org/api/).

Consultar la documentación de la versión instalada y del cliente de base o red utilizado para sus garantías concretas.
