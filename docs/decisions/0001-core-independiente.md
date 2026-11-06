# ADR 0001 — Core reutilizable e independiente

Estado: base de trabajo consolidada con el objetivo expresado por Luis.

El módulo se integra desde distintas aplicaciones y comienza sin interfaz visual.
Separar dominio, aplicación, adaptadores y composición. Mantener HTTP, ORM y Node fuera del dominio.
No exigir microservicios ni monorepo. Repositorios en aplicación cuando aparezca un caso de uso real.

Consecuencia: las reglas se pueden probar sin BD; la aplicación final necesita un adaptador para persistir.
La composición y las garantías de transacción quedan explícitas fuera de las entidades.
