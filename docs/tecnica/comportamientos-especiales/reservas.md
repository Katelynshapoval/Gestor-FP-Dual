# Comportamientos especiales: reservas

> Volver al [índice](README.md). Flujo normal en [reservas](../logica-de-negocio/reservas.md).

### Reservar dos veces el mismo par
- **Contexto**: `POST /reservas` y `POST /reservas/admin`.
- **Condición**: el par alumno–oferta ya tiene una reserva PENDIENTE o CONFIRMADA (doble clic, dos pestañas, empresa y centro a la vez).
- **Comportamiento** (desde la 018): la segunda petición espera al bloqueo de la primera y después falla con «El alumno ya tiene una reserva activa con esta oferta.» → 400. No se escribe evento ni se envía correo.
- **Antes de la 018**: el procedimiento devolvía la reserva existente y el backend duplicaba el evento `RESERVAR` y el correo.
- **Referencia**: `reservasService.reservar` / `reservarAdmin`, `reservasTx.reservar`, `sp_reservar_alumno`, `uq_dr_par_activo`.

### Reservar a un alumno confirmado en otra oferta
- **Comportamiento**: «El alumno ya tiene una reserva confirmada.» → 400.

### Volver a reservar tras una cancelación
- **Condición**: se reserva de nuevo un par cancelado, o una reasignación tiene como destino una oferta en la que el alumno ya estuvo y fue cancelado.
- **Comportamiento** (018): se crea una **fila nueva** PENDIENTE, sin tipo de contrato, tutor, motivo ni documentos. La fila cancelada no cambia: conserva su tipo, tutor, motivo, anexo y firmas.
- **Consecuencias**: la ficha de cada intento muestra los demás en «Intentos relacionados». Las filas **reactivadas antes de la 018** siguen mezclando los documentos de sus dos intentos (los del primero, como no actuales).
- **Referencia**: `sp_reservar_alumno`, `sp_reasignar_reserva`, `reservasService.reservasRelacionadas`.

### Una reserva cancelada no se puede modificar
- **Comportamiento**: `trg_dr_bu_reglas` rechaza cualquier cambio («Una reserva cancelada es definitiva y no se puede modificar. Crea una reserva nueva.» → 400): tutor, tipo de contrato, estado o motivo. La ficha la muestra en solo lectura, con su motivo (excepto al alumno).

### Tipo de contrato de las reservas canceladas
- **Comportamiento** (018): se conserva, así que la ficha de una reserva cancelada sigue mostrando su anexo (en solo lectura).
- **Datos anteriores**: las canceladas antes de la 018 perdieron el tipo (la regla anterior lo prohibía en CANCELADA). Su ficha solo lista el Calendario; el anexo sigue en la BD con `es_actual = 1` y es descargable por id. En desarrollo hay 7 reservas así.

### Cambio de familia de contrato con anexo existente
- **Condición**: Beca ↔ (Contrato, Convenio, Otro) con un anexo de la familia actual subido o generado.
- **Comportamiento**: si ese anexo está PENDIENTE o VALIDADO → 409 `ANEXO_EXISTENTE` (hay que rechazarlo antes). Si está RECHAZADO → el cambio se acepta y el anexo pasa a historial. Cambiar dentro de la misma familia siempre se permite, aunque haya anexo.
- **Referencia**: `estadoReglas.tipoContratoCambiable`.

### Confirmar enviando otro tipo de contrato
- **Comportamiento**: 400 `TIPO_DISTINTO`. Enviar el mismo tipo o ninguno es equivalente.

### Confirmación concurrente del mismo alumno
- **Condición**: dos miembros del centro confirman a la vez dos reservas distintas del mismo alumno.
- **Comportamiento**: las dos bloquean primero la solicitud del alumno, así que se serializan. La primera confirma y cancela la otra; la segunda recibe «Solo una reserva PENDIENTE puede confirmarse.» → 400. Como red de seguridad, `uq_dual_reservas_confirmada_alumno` → 409 «El alumno ya tiene otra reserva confirmada.».

### Confirmación y reserva nueva del mismo alumno a la vez
- **Comportamiento** (018): si la reserva llega primero, la confirmación espera y la cancela como hermana («Alumno asignado a otra empresa.»), con su evento. Si la confirmación llega primero, la reserva espera y falla con «ya tiene una reserva confirmada». Los eventos `CONFIRMAR` y `CANCELAR` se escriben en la misma transacción; los correos, después del commit.

### Reasignación desde una reserva confirmada
- **Comportamiento**: se permite. El origen pasa a CANCELADA y el destino queda **PENDIENTE**: el alumno deja de tener plaza confirmada hasta que se confirme el destino (con su propio anexo, firmas y validación). Las demás reservas pendientes del alumno no se tocan. Una reserva solo se reasigna una vez (`id_reserva_origen` único): la cancelada ya no admite otra reasignación.
- **Interfaz**: tras reasignar, el panel pasa a la reserva nueva, que muestra «Reasignada desde»; la de origen muestra «Reasignada a».

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
- **Comportamiento**: se puede asignar o cambiar (el trigger permite CONFIRMADA → CONFIRMADA). En CANCELADA, no (400). Cada asignación registra `RESERVA/TUTOR`.
