# Convocatorias

> Código: [`convocatoriasService.js`](../../../backend/src/services/convocatoriasService.js), triggers `trg_convocatorias_bi/bu_una_activa`. Pruebas: `backend/test/phase3.test.js` (WF-3), `phase4.test.js` (estado público).

## 1. Activación automática por fechas — `syncConvocatoriaActiva`

| Aspecto | Detalle |
| --- | --- |
| Qué hace | Hace que `activa = 1` solo en la convocatoria cuyo rango `[fecha_inicio, fecha_fin]` contiene `CURDATE()` del servidor MySQL; si ninguna lo contiene, ninguna queda activa. |
| Cuándo | Al arrancar el servidor, cada **15 minutos** (`setInterval` con `unref`), y de forma síncrona al llamar a `GET /convocatorias`, `GET /convocatorias/activa`, `GET /convocatorias/estado` y tras crear o editar una convocatoria. |
| Cómo | Una transacción: `SELECT … FOR UPDATE` de todas las convocatorias ordenadas por `fecha_inicio DESC, id DESC`; elige la primera vigente; **desactiva antes de activar** (así nunca hay dos activas a la vez y el trigger no salta). |
| Solapamientos | Si varias contienen hoy (datos antiguos), gana la que empezó más tarde. La creación y la edición impiden nuevos solapamientos. |
| Si falla | `safeSync` registra el error en consola y devuelve `null`; las lecturas siguen con el indicador que hubiera. |
| Afecta a | Todo lo que depende de `activa = 1`: altas de solicitudes (trigger), reaplicación, reapertura, edición de datos, cambios, cupos, ciclos, alumnos visibles y reservas de empresa. |

Las operaciones de escritura leen la convocatoria activa con `getActiveConvocatoria`, que **no sincroniza**: entre la medianoche del cambio de fechas y la siguiente sincronización (como mucho 15 min, o antes si alguien abre una pantalla que consulta `/convocatorias/estado`) se usa el indicador anterior 🔶.

## 2. Consultas

| Endpoint | Acceso | Respuesta |
| --- | --- | --- |
| `GET /convocatorias/activa` | Público | La activa o **404** «No hay ninguna convocatoria activa…» |
| `GET /convocatorias/estado` | Público | `{ abierta, activa, proxima }`; `proxima` = la siguiente con `fecha_inicio > CURDATE()`. Lo usan la portada y los formularios para mostrar «abierto / cerrado» |
| `GET /convocatorias` | Personal | Todas (`SELECT *`), más recientes primero |

## 3. Crear — `POST /convocatorias` (ADMINISTRADOR)

- Obligatorios `nombre`, `fecha_inicio`, `fecha_fin` en formato `AAAA-MM-DD`; inicio ≤ fin → si no, 400.
- Sin solapamiento con ninguna otra (`fecha_inicio <= fin AND fecha_fin >= inicio`) → si no, **409** con el nombre de la que se solapa.
- Se inserta inactiva y se sincroniza: si su rango incluye hoy, queda activa inmediatamente.
- Nombre duplicado → 409 `DUPLICADO` (índice único).

## 4. Editar — `PUT /convocatorias/:id` (ADMINISTRADOR)

- 404 si no existe; **400 si está activa** («No se puede editar una convocatoria activa.»).
- Mismas validaciones de fechas y solapamiento (excluyéndose a sí misma).
- Tras guardar, sincroniza: si las nuevas fechas incluyen hoy, pasa a activa.

**Discrepancia con el comentario del código**: el comentario dice «updates a future (not yet active) convocatoria», pero la única condición es no estar activa; **también se pueden editar convocatorias pasadas**, y si sus nuevas fechas incluyen hoy, se reactivan ([comportamientos especiales](../comportamientos-especiales/convocatorias.md)).

## 5. Lo que no existe

- No hay borrado de convocatorias.
- No hay activación manual: `sp_activar_convocatoria` existe en BD pero no se usa (y el mensaje del trigger de actualización todavía lo menciona).
- No hay cierre anticipado distinto de cambiar las fechas (que solo es posible con la convocatoria inactiva).
