# Responsabilidad

Datos de entrada y salida serializables, sin ORM ni bigint crudo en JSON.

Estado: implementado para el incremento 006a en `registration.ts`. Los contratos aceptan texto y
booleanos; los casos de uso construyen los objetos de valor. Ninguna salida expone una instancia de
dominio mutable.
