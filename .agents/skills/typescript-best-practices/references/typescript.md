# Criterios TypeScript

## Límites externos

Tratar JSON, variables de entorno y resultados no validados de terceros como datos desconocidos. Comprobar estructura y semántica antes de crear valores del dominio. Una anotación o `as` no modifica ni valida el dato en ejecución.

Usar validadores existentes si su contrato es apropiado. No elegir una librería por defecto sin revisar dependencias. Mantener validación del protocolo en el adaptador y las invariantes en el propietario del dominio; no duplicar reglas a mano si se puede reutilizar el mismo punto de construcción.

## Estados y resultados

Representar variantes con un discriminante cuando eviten combinaciones inválidas. Por ejemplo, una respuesta conceptual «éxito con valor» o «fallo con error» debe impedir «éxito sin valor». Esto es un ejemplo de modelado, no la elección del modelo de errores del módulo.

Comprobar exhaustividad en transiciones cerradas. No representar «no cargado», «no encontrado» y «fallo» mediante el mismo `undefined` si el consumidor debe distinguirlos.

## Dinero y serialización

No usar coma flotante binaria decimal como representación canónica. Elegir enteros exactos con escala o una representación decimal exacta mediante una decisión documentada. Si se usan números enteros de JavaScript, comprobar el rango seguro. Si se usa `bigint`, definir su representación textual o estructurada para JSON; no asumir que JSON.stringify lo admite directamente.

No pasar por `Number`, parseFloat u otra conversión con pérdida al construir, comparar o serializar valores exactos. Definir claramente qué ocurre con exceso de decimales, signo, límites y formatos no admitidos.

## Contratos y tipos

- Usar `type` e `interface` por su función y convenciones, sin imponer una regla artificial universal.
- Reservar genéricos para relaciones útiles; evitar convertir una función concreta en un framework genérico.
- Distinguir ausencia y nulidad cuando el negocio las distinga.
- Usar `import type` cuando corresponda a la configuración real.
- Respetar ESM/CJS, exports y resolución de módulos elegidos; verificar la emisión real antes de cambiar extensiones.
- Acotar conversiones inevitables y documentar la garantía externa que las hace seguras.

## Fuentes primarias

- [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).
- [Configuración TypeScript](https://www.typescriptlang.org/tsconfig/).
- [Compatibilidad de módulos](https://www.typescriptlang.org/docs/handbook/modules/theory.html).

Consultar las páginas pertinentes y la versión instalada antes de usar opciones que puedan variar.
