# Migraciones y compatibilidad con datos existentes

> Parte de la [base de datos](vision-general.md). Instrucciones operativas completas en [`db/README.md`](../../../db/README.md) (en inglés); aquí se explica el sistema y el efecto de cada migración.

## 1. Sistema

- **Baseline** [`db/000_baseline.sql`](../../../db/000_baseline.sql): esquema completo tras los scripts retirados 002–011, generado con `scripts/schema.js baseline`. Solo estructura y filas de catálogo, sin datos personales ni `DEFINER`.
- **Migraciones numeradas** `db/migrations/NNN_*.sql`, aplicadas en orden por [`scripts/migrate.js`](../../../backend/scripts/migrate.js). Cada fichero se divide en sentencias respetando `DELIMITER` ([`scripts/lib/sqlScript.js`](../../../backend/scripts/lib/sqlScript.js)) y se registra en `schema_migrations` con su **checksum SHA-256**. `status` avisa si un fichero cambió tras aplicarse: **nunca se edita una migración aplicada**, se añade otra.
- **Reversiones** `db/rollback/NNN_*.down.sql`: manuales (MySQL Workbench), con advertencias de pérdida de datos al principio. Después hay que borrar la fila de `schema_migrations`.
- **Scripts retirados** `db/legacy_migrations/` (002–011 y `after_schema_patch.sql`): solo historia. **No ejecutar**: `after_schema_patch.sql` siembra nombres de estado antiguos y rompe las reservas.

```mermaid
flowchart LR
  E{¿BD vacía?} -- sí --> B[ejecuta 000_baseline] --> M[migraciones pendientes en orden]
  E -- no --> R{¿000 registrado?}
  R -- no --> X[error: comprobar con schema diff y ejecutar mark-baseline]
  R -- sí --> M
  M --> S[(schema_migrations)]
```

### 1.1 Fallos a mitad de fichero

MySQL confirma el DDL sentencia a sentencia, así que un fichero que falla puede quedar **aplicado a medias**. El ejecutor se detiene, muestra la sentencia y **no registra** el fichero. Hay que aplicar la reversión (o solo sus pasos para los objetos creados), corregir y volver a lanzar `up`.

Las migraciones 015, 017 y 018 empiezan con un **procedimiento guarda** (`sp_015_comprobar_dni`, `sp_017_comprobar`, `sp_018_comprobar`) que verifica los datos y se detiene **antes de cambiar nada** si una regla nueva ya se incumple. Si la guarda detiene la ejecución, solo queda creado ese procedimiento: se borra, se corrigen los datos con las consultas de auditoría del final del fichero y se repite.

## 2. Historia de las migraciones

| Versión | Fichero | Qué cambia | Datos existentes | Reversión |
| --- | --- | --- | --- | --- |
| 000 | `000_baseline.sql` | Esquema base | En una BD existente se **marca** sin ejecutar (`mark-baseline`) | — |
| 012 | `012_reglas_por_nombre_y_reservas` | Funciones `fn_id_*`; procedimientos y triggers resuelven estados y tipos **por nombre**; `sp_validar_solicitud_alumno` exige CV + **ANEXO_DGA** (antes pedía el tipo heredado `ANEXO_2` y ninguna solicitud nueva podía validarse); reactivación limpia de reservas; confirmación con el tipo **guardado** y anexo validado; triggers de documentos con el catálogo actual | Sin cambio de filas | Restaura las definiciones anteriores |
| 013 | `013_auditoria_y_firmas` | Tabla `dual_eventos` inmutable; `dual_documento_firmas.firmado_por` y `metodo`; `dual_documentos.firmas_exentas_legacy` | Marca como exentos **solo** los documentos `LEGACY`, ya `VALIDADO`, de tipo con firmantes (CONVENIO, ANEXO_II, ANEXO_III, CALENDARIO) y sin ninguna fila de firma; registra cada exención como evento `EXENCION_FIRMA_LEGACY`. En desarrollo: 6 convenios | **Borra la auditoría** (exportar antes); requiere el backend anterior |
| 014 | `014_transportes_por_solicitud` | Tabla `dual_solicitud_empresa_transportes`; `transportes_conocidos` | Copia los transportes de la empresa solo a su solicitud **más reciente** (`fecha_solicitud DESC, id DESC`); las anteriores quedan con `transportes_conocidos = 0` («No registrado»), porque sus valores originales se habían sobrescrito y no se inventan | Requiere el backend anterior |
| 015 | `015_dni_unico` | `gf_alumnosfct.dni` pasa a **único** (tabla protegida: excepción aceptada) | **Se detiene** si hay DNI duplicados (según la colación, ignorando mayúsculas y acentos) o sin normalizar; nunca fusiona ni borra alumnos | Vuelve al índice simple |
| 016 | `016_estado_baja` | Fila `BAJA` en `dual_estados_validacion` (id 4 en desarrollo) | Idempotente | Borra la fila; **se detiene sin cambiar nada** mientras alguna solicitud o documento esté en BAJA. Requiere el backend anterior. Los eventos `BAJA`/`REACTIVAR` se conservan |
| 017 | `017_integridad_especialidad_documentos_cupos` | `dual_solicitudes_alumno.id_especialidad` NN + FK; triggers `trg_dsa_bi/bu_reglas`, `trg_dr_bi_reglas` y vista `vw_alumnos_disponibles` la leen; `padre_actual` + `uq_dd_actual`; `sp_guardar_documento` con lectura bloqueante; trigger `trg_dsee_bu_cupo` | **Copia** el ciclo de `gf_alumnosfct.id_especialidad_dual` a cada solicitud. **Se detiene** si: un alumno tiene varias solicitudes (el valor guardado solo es el último ciclo); una solicitud no tiene ciclo; una reserva está en una oferta de otro ciclo; hay documentos actuales duplicados; una oferta tiene más reservas activas que plazas | **Pierde** `id_especialidad` (si un alumno cambió de ciclo entre convocatorias, ese dato desaparece); requiere el backend anterior; reaplicarla luego puede detenerse en su guarda |
| 018 | `018_reservas_por_intento_y_transacciones` | **Una fila por intento de reserva**: la clave única `(alumno, oferta)` se sustituye por `uq_dr_par_activo` (solo pares activos) y se añade `id_reserva_origen` (reasignaciones). Una reserva CANCELADA es definitiva y conserva tipo de contrato, tutor y documentos. Los cinco procedimientos de reservas dejan de gestionar su transacción y exigen la del llamante (`autocommit = 0`, si no `SQLSTATE 45001`). Orden de bloqueo único y recuentos con lectura bloqueante (`trg_dr_bi_reglas`, `trg_dr_bu_reglas`, `trg_dsee_bu_cupo`). `dual_eventos` admite `OFERTA` y `TUTOR` | No reescribe filas. Las canceladas antes de la 018 ya habían perdido el tipo de contrato; las reactivadas antes conservan los documentos del intento anterior como no actuales. **Se detiene** si los ids de estado no son PENDIENTE=1, CONFIRMADA=2, CANCELADA=3, si hay un par con dos reservas activas o una oferta por encima de su cupo | Exacta **solo** mientras ningún par tenga un segundo intento y no haya eventos `OFERTA`/`TUTOR`; si no, su guarda se detiene y la única vuelta atrás es la copia previa. Pierde `id_reserva_origen`. Requiere el backend anterior |
| 019 | `019_auditoria_usuarios` | `dual_eventos.chk_de_entidad` admite `USUARIO` y conserva `OFERTA` y `TUTOR` (de la 018) | Sin cambio de filas | **Se detiene sin cambiar nada** mientras exista algún evento `USUARIO`. Si la 018 no está registrada, también se detiene si hay eventos `OFERTA` o `TUTOR`. Requiere el backend anterior |
| 020 | `020_alumno_cambios` | Tabla nueva `dual_alumno_cambios`: peticiones de corrección de datos del alumno, con una sola pendiente por solicitud (columna generada + único) y motivo obligatorio al rechazar. No toca las tablas protegidas | Sin cambio de filas | Borra la tabla; **se detiene** si tiene filas. Requiere el backend anterior (la lista de alumnos la lee) |
| 021 | `021_quitar_preferencias` | Elimina `dual_preferencias` y `dual_solicitud_preferencias` (el catálogo nunca se rellenó y nada leía las preferencias). Con ellas desaparecen las únicas FK `CASCADE` | **Se detiene sin cambiar nada** si alguna de las dos tablas tiene filas | Vuelve a crear las tablas vacías. El backend anterior las necesita |

## 3. Orden de despliegue y compatibilidad backend ↔ esquema

- El backend actual lee `dual_eventos`, `firmas_exentas_legacy`, `firmado_por`/`metodo`, `dual_solicitud_empresa_transportes` y `transportes_conocidos`: **012–015 deben aplicarse antes** de arrancarlo.
- El backend actual inserta `dual_solicitudes_alumno.id_especialidad`: **017 y ese backend van juntos**. Con el backend nuevo sobre un esquema anterior a 017 cualquier alta de alumno falla (columna inexistente); con el backend anterior sobre 017, el `INSERT` sin `id_especialidad` lo rechaza `trg_dsa_bi_reglas`.
- La baja (`bajaService`) comprueba si existe el estado `BAJA` y, si no, responde **503 `MIGRACION_PENDIENTE`** sin cambiar nada.
- Las operaciones de reservas llaman a los procedimientos dentro de `inTransaction`: **018 y ese backend van juntos**. El backend anterior sobre la 018 recibe `SQLSTATE 45001` (500) en cada reserva; el nuevo sobre un esquema anterior escribe eventos `OFERTA`/`TUTOR` que el `CHECK` rechaza.
- El alta, la edición, la baja y el reseteo de contraseña de personal escriben `dual_eventos` con entidad `USUARIO`: **019 y ese backend van juntos**. Sin 019 la operación se deshace y responde **503 `MIGRACION_PENDIENTE`**.
- La lista de alumnos y la corrección de datos leen `dual_alumno_cambios`: **020 antes** de arrancar ese backend.
- La 021 borra tablas que el backend anterior lee y escribe: primero el backend sin preferencias, **después** la 021.
- `solicitudesAlumnoService.create` lanza «El catálogo de documentos no está actualizado. Ejecuta la migración 008.» si faltan los tipos `CV` o `ANEXO_DGA` (→ 500).

## 4. Estado conocido (desarrollo)

`schema_migrations` contiene 000 (MARK), 012–016 (27/10/2026) y 017–021 (28/10/2026: 017 a las 10:32, 018 a las 15:57, 019 a las 17:50, 020 a las 19:38 y 021 a las 20:21). Todas las migraciones del repositorio están aplicadas.

## 5. Verificación

- `node scripts/verifyDb.js create --to NNN` construye `<DBNAME>_verify` solo desde el repositorio; `npm run db:schema -- diff <DBNAME>_verify` compara.
- `DB_INTEGRATION=1 node --test test/db/stage1.db.test.js` reconstruye la BD de verificación, prueba guardas, reglas, reversión y reaplicación de 017, y la borra (`KEEP_VERIFY=1` la conserva). `test/db/stage2.db.test.js` hace lo mismo con la 018, con sesiones concurrentes reales e inyección de fallos. `test/db/phase2.db.test.js` requiere 018 aplicada.
- Antes de toda migración: `npm run db:backup` y `npm run db:backup -- verify <fichero>`.
