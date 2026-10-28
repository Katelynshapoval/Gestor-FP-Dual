# Comportamientos especiales: bajas

> Volver al [índice](README.md). Flujo normal en [baja y reactivación](../logica-de-negocio/baja-y-reactivacion.md).

### La baja desactiva la cuenta en todas las convocatorias
- **Condición**: baja de una solicitud de alumno o de empresa.
- **Comportamiento**: las cuentas son por persona o por empresa, así que se desactivan aunque el alumno o la empresa tengan solicitudes en otras convocatorias. En empresa se desactivan **todos** los usuarios EMPRESA cuyo contacto pertenece a la empresa.
- **Consecuencias**: el usuario no puede consultar ni sus solicitudes de otros años hasta que se reactive.
- **Referencia**: `bajaService.setCuentasActivas`.

### Cancelaciones parciales
- **Condición**: falla la cancelación de alguna reserva (p. ej. interbloqueo).
- **Comportamiento**: la baja ya está confirmada; la respuesta lista esas reservas en `pendientes` y el mensaje pide cancelarlas desde su ficha. Repetir la baja → 409 `YA_DE_BAJA`.
- **Motivo**: los procedimientos de cancelación tienen transacción propia y no pueden incluirse en la de la baja (DB-06).
- **Referencia**: prueba «company baja: students are told, a failed cancellation is reported, not fatal».

### Avisos solo a la otra parte
- **Comportamiento**: baja de alumno → se avisa a cada empresa; baja de empresa → se avisa a cada alumno. El dado de baja no recibe correo.

### Motivo de la baja fuera de la fila
- **Comportamiento**: la solicitud en BAJA tiene `motivo = NULL`; el motivo y la fecha salen del último evento `BAJA` (`motivo_baja`, `fecha_baja` en los listados).
- **Motivo**: los triggers solo admiten motivo en RECHAZADO (migración 016).

### Reactivar no restaura reservas ni mira el plazo
- **Comportamiento**: vuelve al estado anterior a la baja (o PENDIENTE si no se encuentra), reactiva cuentas y **no** recupera reservas canceladas. No comprueba que la convocatoria siga activa: una solicitud de un año cerrado puede volver a VALIDADO (y el personal podría reservarla, porque `/reservas/admin` no exige convocatoria activa).
- **Si el estado previo era RECHAZADO**: se repone el motivo del último `RECHAZAR`, o «Solicitud rechazada antes de la baja.».

### Baja sin la migración 016
- **Comportamiento**: 503 `MIGRACION_PENDIENTE` y nada cambia.
- **Referencia**: prueba «baja without migration 016: clear error, nothing changed».

### Errores no controlados en baja y reactivación
- **Comportamiento**: los errores SQL de `darDeBaja` y `reactivar` se relanzan sin `mapSqlError`; llegan al manejador global → **500** «Error interno del servidor.» (por ejemplo, un interbloqueo en la primera transacción) 🔶.
