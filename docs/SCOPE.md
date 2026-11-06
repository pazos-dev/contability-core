# Alcance y estado de la entrega

## Objetivo

Preparar un módulo reutilizable, importable desde distintas aplicaciones y sin interfaz visual inicial.
Inventario, compras y ventas mantienen sus propios dominios y se conectan mediante casos de uso contables.

## Incluido en este ZIP

- Instrucciones de agente y las seis skills completas del kit anterior, sin cambios.
- Arquitectura, glosario, integración, decisiones y workflow.
- Especificaciones de money, account, journal, entries, period y del caso de uso contabilizar.
- Árbol de carpetas real con responsabilidades y tareas de implementación secuenciales.
- Configuración TypeScript/ESM y comandos pnpm; validador del paquete preparado.
- Registro exacto de validaciones ejecutadas y pendientes.

## Implementación posterior

Money/Currency → Account → Journal → AccountingPeriod → JournalEntry → aplicación y memoria → persistencia real.
El orden técnico pone el período antes de contabilizar para poder validar cierre desde la primera integración.
La documentación de un componente no significa que esté programado.

## Fuera de la fase inicial

Interfaz, servidor público, ORM, migraciones, impuestos, nómina, facturación electrónica,
conversión de divisas, conciliación bancaria y despliegue.
Informes básicos y ejercicio contable quedan en el roadmap, con especificación posterior.
