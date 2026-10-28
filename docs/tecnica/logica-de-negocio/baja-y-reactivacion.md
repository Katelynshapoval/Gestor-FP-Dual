# Baja y reactivación

> Código: [`bajaService.js`](../../../backend/src/services/bajaService.js), [`estadoReglas.bajaTransicion`](../../../backend/src/services/estadoReglas.js), migración [`016_estado_baja.sql`](../../../db/migrations/016_estado_baja.sql). Frontend: [`BajaControls.jsx`](../../../frontend/src/components/BajaControls.jsx) (pestaña «Cuenta» de las tarjetas). Pruebas: `backend/test/phase5.test.js`.

**Qué es**: retirar del programa a un alumno o a una empresa (una solicitud concreta), solo por **ADMINISTRADOR**. Rutas: `GET|POST /solicitudes/{alumno|empresa}/:id/baja` y `POST …/:id/reactivar`. Coordinación recibe 403.

## 1. Vista previa — `GET …/:id/baja`

Lista las reservas **PENDIENTE y CONFIRMADA** que la baja cancelaría (primero las confirmadas), con alumno, empresa y ciclo, para el diálogo de confirmación.

## 2. Dar de baja — `POST …/:id/baja { motivo }`

| Paso | Detalle |
| --- | --- |
| Regla | Solicitud existente (404); no BAJA ya (**409 `YA_DE_BAJA`**); motivo no vacío (400 `MOTIVO_OBLIGATORIO`). Se admite desde PENDIENTE, VALIDADO o RECHAZADO |
| Migración | Si no existe el estado `BAJA` → **503 `MIGRACION_PENDIENTE`** sin cambios |
| Transacción 1 | Bloquea la solicitud; estado BAJA con `motivo = NULL` (los triggers solo admiten motivo en RECHAZADO); **desactiva cuentas**: alumno → su usuario; empresa → **todos** los usuarios EMPRESA cuyo contacto pertenece a la empresa; evento `BAJA` con `estado_anterior`, motivo y `detalle { cuentas_desactivadas, reservas_a_cancelar }`; commit |
| Después, por reserva | `sp_cancelar_reserva_admin` con motivo «Baja del alumno en el programa: …» o «Baja de la empresa en el programa: …»; evento `CANCELAR` (`detalle.por_baja`) tras el commit; aviso **solo a la otra parte** (baja de alumno → empresa; baja de empresa → alumno) |
| Fallos parciales | Si una cancelación falla, se registra y se devuelve en `pendientes`; la baja **no** se deshace. Repetir la baja da 409, así que las reservas restantes se cancelan a mano desde su ficha |
| Respuesta | `{ message, canceladas: [ids], pendientes: [ids] }` |

Efectos colaterales:
- La sesión abierta del usuario termina en su siguiente petición (401 `ACCOUNT_DISABLED`); no puede entrar (403) ni recibir enlace de recuperación.
- Como la cuenta es **por persona/empresa**, la desactivación afecta a **todas sus convocatorias**, no solo a la solicitud dada de baja.
- No se pueden crear reservas nuevas con esa solicitud (exigen VALIDADO).
- Los documentos no cambian.

## 3. Reactivar — `POST …/:id/reactivar { motivo? }`

| Paso | Detalle |
| --- | --- |
| Regla | Estado actual BAJA (400 si no) |
| Estado destino | `estado_anterior` del **último evento `BAJA`** si es PENDIENTE, VALIDADO o RECHAZADO; si no se encuentra, PENDIENTE |
| RECHAZADO | Recupera el motivo del último evento `RECHAZAR` o, si no hay, «Solicitud rechazada antes de la baja.» (los triggers exigen motivo) |
| Cuentas | Reactiva las mismas cuentas (alumno o todos los usuarios EMPRESA de la empresa) |
| Auditoría | Evento `REACTIVAR` con motivo opcional |
| No hace | **No restaura las reservas canceladas**; no comprueba que la convocatoria siga activa (una solicitud de un año pasado puede volver a VALIDADO) |

## 4. Interfaz

`BajaControls` muestra «Dar de baja» o «Reactivar» según `estado_validacion`, y la fecha y el motivo de la baja (`motivo_baja`, `fecha_baja` calculados del último evento `BAJA` en los listados). Solo se renderiza para ADMINISTRADOR; el backend lo vuelve a exigir.
