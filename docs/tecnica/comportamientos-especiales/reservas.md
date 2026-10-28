# Comportamientos especiales: reservas

> Volver al [índice](README.md). Flujo normal en [reservas](../logica-de-negocio/reservas.md).

### Reservar dos veces el mismo par
- **Contexto**: `POST /reservas` y `POST /reservas/admin`.
- **Condición**: el par alumno–oferta ya tiene una reserva PENDIENTE (doble clic, dos pestañas, empresa y centro a la vez).
- **Comportamiento**: `sp_reservar_alumno` devuelve el id existente **sin cambiar nada** (idempotente en BD). El backend, sin embargo, **vuelve a registrar** un evento `RESERVAR`, **vuelve a enviar** el correo al alumno (y a la empresa si lo hizo el centro) y responde 201 como si fuera nueva.
- **Consecuencias**: eventos y correos duplicados; no hay plazas consumidas de más.
- **Referencia**: `reservasService.reservar` / `reservarAdmin`, procedimiento `sp_reservar_alumno` (rama `v_estado = v_pendiente`).

### Reservar un par ya confirmado
- **Comportamiento**: error del procedimiento «El alumno ya tiene una reserva confirmada con esta oferta.» → 400. Si el alumno está confirmado en **otra** oferta: «El alumno ya tiene una reserva confirmada.» → 400.

### Reactivación de una fila cancelada
- **Condición**: se vuelve a reservar un par cancelado, o una reasignación tiene como destino una oferta en la que el alumno ya estuvo y fue cancelado.
- **Comportamiento**: se reutiliza la **misma fila** (`id_reserva`): pasa a PENDIENTE sin tipo de contrato, sin tutor ni motivo, y sus documentos se marcan `es_actual = 0` (siguen visibles en el historial del personal).
- **Motivo**: la clave única `(alumno, oferta)` obliga a reutilizar la fila; por eso no se heredan anexos ni tutor del intento anterior.
- **Consecuencias**: los documentos de varios intentos comparten `id_reserva` y solo se distinguen por fecha y `es_actual`. La reactivación no vuelve a comprobar en BD que las solicitudes sigan VALIDADO (lo hace Node antes, fuera del bloqueo).
- **Referencia**: `sp_reservar_alumno`, `sp_reasignar_reserva`.

### El tipo de contrato se pierde al cancelar
- **Comportamiento**: todos los caminos de cancelación ponen `id_tipo_contrato = NULL` porque `trg_dr_bu_reglas` lo prohíbe en CANCELADA. La ficha de una reserva cancelada ya no sabe qué anexo correspondía y **solo lista el Calendario**.
- **Consecuencias**: el anexo de una reserva cancelada sigue con `es_actual = 1` (hasta una reactivación), pero no aparece ni en `documentos` (se elige por familia y ya no hay familia) ni en `historial` (que solo muestra `es_actual = 0` y tipos heredados). Sigue en la BD y es descargable por id.

### Cambio de familia de contrato con anexo existente
- **Condición**: Beca ↔ (Contrato, Convenio, Otro) con un anexo de la familia actual subido o generado.
- **Comportamiento**: si ese anexo está PENDIENTE o VALIDADO → 409 `ANEXO_EXISTENTE` (hay que rechazarlo antes). Si está RECHAZADO → el cambio se acepta y el anexo pasa a historial. Cambiar dentro de la misma familia siempre se permite, aunque haya anexo.
- **Referencia**: `estadoReglas.tipoContratoCambiable`.

### Confirmar enviando otro tipo de contrato
- **Comportamiento**: 400 `TIPO_DISTINTO`. Enviar el mismo tipo o ninguno es equivalente.

### Confirmación concurrente del mismo alumno
- **Condición**: dos miembros del centro confirman a la vez dos reservas distintas del mismo alumno.
- **Comportamiento**: la primera confirma y cancela la otra; la segunda falla en el procedimiento («Solo una reserva PENDIENTE puede confirmarse.» → 400) o, en el peor caso, choca con `uq_dual_reservas_confirmada_alumno` → 409 «El alumno ya tiene otra reserva confirmada.».

### Confirmación con eventos y correos después del commit
- **Comportamiento**: los eventos `CONFIRMAR` y `CANCELAR` de las hermanas se calculan **antes** de llamar al procedimiento (consulta `otras`) y se escriben después. Si otra reserva pendiente se creara entre esa consulta y el procedimiento, se cancelaría sin evento ni aviso 🔶 (ventana muy estrecha).

### Reasignación desde una reserva confirmada
- **Comportamiento**: se permite. El origen pasa a CANCELADA y el destino queda **PENDIENTE**: el alumno deja de tener plaza confirmada hasta que se confirme el destino (con su propio anexo, firmas y validación). Las demás reservas pendientes del alumno no se tocan.

### Reservas del centro en convocatorias pasadas
- **Comportamiento**: `/reservas/admin` y `/reservas/:id/reasignar` no exigen convocatoria activa; basta que ambas solicitudes sigan VALIDADO y compartan convocatoria y ciclo. La empresa, en cambio, solo reserva en la activa.

### La empresa no puede cancelar una confirmada
- **Comportamiento**: `POST /reservas/:id/cancelar` → 400 «Solo puede cancelar una reserva pendiente propia.». Debe hacerlo el centro (`cancelar-admin`). La ficha lo indica en `acciones.cancelar`.

### Cancelar una reserva ya cancelada
- **Comportamiento**: empresa → 400 (no es PENDIENTE); centro → «La reserva ya esta cancelada.» del procedimiento → 400. No hay evento.

### El Calendario no es requisito de confirmación
- **Comportamiento**: `reservaConfirmable` y `sp_confirmar_reserva` solo miran el anexo de la familia. El Calendario puede completarse antes o después, o nunca.

### Motivo de cancelación oculto al alumno
- **Comportamiento**: `GET /reservas/alumno` devuelve `motivo = NULL` y la ficha lo oculta al rol ALUMNO; el correo al alumno no incluye el motivo.

### Tutor en una reserva confirmada
- **Comportamiento**: se puede asignar o cambiar (el trigger permite CONFIRMADA → CONFIRMADA). En CANCELADA, no (400).
