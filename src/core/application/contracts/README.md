# Responsabilidad

Datos de entrada y salida serializables, sin ORM ni bigint crudo en JSON.

Estado: implementado para los incrementos 006a y 006b, un archivo por área (`accounts.ts`, `journals.ts`,
`periods.ts`, `entries.ts`) y un `index.ts` que agrega la superficie. Los contratos aceptan texto y
booleanos; los casos de uso construyen los objetos de valor. Ninguna salida expone una instancia de
dominio mutable.
