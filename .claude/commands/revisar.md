---
description: Revisa los cambios pendientes con el subagente revisor y entrega su informe
argument-hint: "[alcance opcional: commit, rama, archivo o migración]"
---

Llama al subagente **revisor** (`.claude/agents/revisor.md`) para que revise los cambios pendientes de este repositorio: `git diff`, cambios preparados y migraciones de `supabase/migrations/` que no estén en la tabla «Aplicadas» de su README.

Alcance indicado por Jose (si está vacío, todo lo pendiente): $ARGUMENTS

Cuando el revisor termine, entrégale a Jose su informe tal cual, sin resumirlo ni suavizarlo. Si marca una **DECISIÓN DE NEGOCIO**, dilo en la primera línea. No cambies nada por tu cuenta a partir del informe: espera a que Jose decida.
