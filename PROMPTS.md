# Prompts para el agente

## Primer incremento

```text
Lee AGENTS.md, docs/STATUS.md y docs/tasks/001-money.md. Usa las skills del proyecto
.agents/skills/accounting-implement/SKILL.md y typescript-best-practices/SKILL.md.
Implementa docs/specs/money.md con las decisiones de ADR 0002. No reabras acuerdos
ya consolidados. Ejecuta primero check:project; instala dependencias si hace falta.
Añade pruebas reales de M01-M12, exporta solo lo implementado y ejecuta tipos,
compilación y pruebas. Actualiza STATUS.md. Limita esta entrega a Currency y Money.
```

## Continuar

```text
Lee AGENTS.md y docs/STATUS.md, inspecciona los cambios existentes y continúa la
siguiente tarea de docs/tasks/. Sigue specs y decisiones canónicas. Conserva cambios
ajenos. Implementa un incremento verificable y actualiza el relevo con evidencia real.
```

## Revisar un incremento

```text
Lee la skill .agents/skills/accounting-review/SKILL.md. Revisa el diff frente a su
spec y las reglas de arquitectura. Prioriza errores reproducibles de dinero, estados,
mutación, pertenencia al libro, atomicidad y contratos. Ejecuta las comprobaciones
pertinentes. Indica archivo, efecto y evidencia; separa defectos de preferencias.
```

## Especificar lo siguiente

```text
Usa .agents/skills/accounting-spec/SKILL.md para el siguiente caso del roadmap que
aún no tenga spec. Respeta el dominio existente y define entradas, reglas, fallos,
atomicidad, idempotencia y criterios antes de implementarlo. No inventes normativa.
```

Los agentes pueden leer estos archivos explícitamente aunque no tengan un comando de skills.
