# Solicitudes de alumno

> Código: [`solicitudesAlumnoService.js`](../../../backend/src/services/solicitudesAlumnoService.js), [`solicitudTransiciones.js`](../../../backend/src/services/solicitudTransiciones.js), [`estadoReglas.solicitudTransicion`](../../../backend/src/services/estadoReglas.js), `sp_validar_solicitud_alumno`, `trg_dsa_*`. Frontend: [`AddDualStudent`](../../../frontend/src/pages/AddDualStudent/index.js), [`LinkStudents`](../../../frontend/src/pages/LinkStudents/index.js), [`StudentMain`](../../../frontend/src/pages/StudentMain/index.js). Pruebas: `authorization.test.js`, `stage1.test.js`, `phase2.test.js`.

## 1. Envío público — `POST /solicitudes/alumno`

**Qué hace**: registra (o actualiza) al alumno, crea su solicitud para la convocatoria activa con su CV y su Anexo DGA, y crea su cuenta de portal si no la tenía.

**Desde dónde**: formulario público `/addDualStudent` (6 pasos), `multipart/form-data`.

### 1.1 Validaciones previas (sin escribir)

| Comprobación | Respuesta si falla |
| --- | --- |
| Ficheros `cv` y `anexoDga` presentes; `multer` solo acepta `application/pdf` (tipo MIME declarado por el cliente) de ≤ 10 MB | 400 |
| `nombre, dni, domicilio, cp, localidad, telalumno, email, id_especialidad_dual` | 400 «Faltan campos obligatorios…» |
| `password` ≥ 8 caracteres | 400 |
| Hay convocatoria activa | **409** «…El plazo de solicitud está cerrado.» |
| La especialidad existe (no se comprueba que esté activa) | 400 |

El backend **solo normaliza** el DNI (trim + mayúsculas); la letra de control del DNI/NIE, el NSS y la obligatoriedad del tutor legal para menores se comprueban **solo en el formulario** ([comportamientos especiales](../comportamientos-especiales/solicitudes.md#dni-del-alumno-sin-validar-en-el-backend)).

### 1.2 Transacción

1. `SELECT idalumno FROM gf_alumnosfct WHERE dni = ? FOR UPDATE` (usa el índice único; bloquea solo esa fila o el hueco).
2. Según el caso:

| Caso | Comprobación | Efecto en `gf_alumnosfct` |
| --- | --- | --- |
| DNI nuevo | — | `INSERT` con todos los datos |
| DNI existente **con cuenta** | Ya tiene solicitud en esta convocatoria → 409. La contraseña del formulario debe ser su **contraseña actual del portal** (limitador de login compartido, clave = DNI): incorrecta → **401 `CUENTA_EXISTENTE`**; cuenta inactiva → 403 | `UPDATE` de **todos** los datos personales y del ciclo «último» (`especialidad`, `id_especialidad_dual`) |
| DNI existente **sin cuenta** (p. ej. importado) | Ya tiene solicitud → 409 | Solo se **rellenan campos vacíos** (`COALESCE(NULLIF(col,''), ?)`); `id_especialidad_dual` solo si era NULL. La identidad no está probada |

3. Segunda comprobación de duplicado en la convocatoria → 409.
4. `INSERT dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad = id_especialidad_dual del formulario, PENDIENTE)`. El trigger exige especialidad y convocatoria activa.
5. `CALL sp_guardar_documento` para CV y ANEXO_DGA; el ANEXO_DGA queda con `estado_workflow = 'SUBIDO_FIRMADO'`.
6. Preferencias 1–3 si vienen (`INSERT … ON DUPLICATE KEY UPDATE`).
7. Cuenta ALUMNO si no existe (contraseña del formulario, `email` NULL, `must_change_password = 0`). **Nunca** se cambia la contraseña de una cuenta existente.
8. Documentos de la solicitud: `id_usuario_origen` = cuenta, `origen_documento = 'SUBIDA'`, `registrado_en = NOW()`.
9. `COMMIT`; correo «Solicitud Dual recibida» (sin esperar).

**Resultado**: 201 `{ id_solicitud_alumno, cuenta_existente }`.

**Si falla**: `ROLLBACK` completo; errores SQL vía `mapSqlError`. Un id de preferencia inexistente provoca un error de FK no mapeado → **500** 🔶.

**Notas**:
- Los documentos del alta se guardan llamando al procedimiento directamente (no con `saveByClave`): **no generan eventos `SUBIR`** ni crean filas de firma (CV y Anexo DGA no tienen firmantes en el catálogo).
- Desde la 017 el ciclo de la solicitud es el del formulario aunque la ficha del alumno (caso sin cuenta) conserve otro.

## 2. Revisión por el centro

Todas usan `aplicarTransicion` (bloqueo `FOR UPDATE` de la solicitud, regla pura, cambio, evento en la misma transacción) y notifican tras el commit.

| Acción | Endpoint | Condiciones | Cambios | Notificación |
| --- | --- | --- | --- | --- |
| Validar | `POST /solicitudes/alumno/:id/validar` | Antes de la transacción, `missingStudentValidation`: CV y Anexo DGA **actuales VALIDADO** (si no, 400 «…primero hay que validar: CV, Anexo DGA»). Estado PENDIENTE (si no, 400 `ESTADO_NO_PERMITE`). El procedimiento lo vuelve a exigir | `sp_validar_solicitud_alumno`; evento `VALIDAR` | «Tu solicitud… ha sido validada» |
| Rechazar | `…/rechazar {motivo}` | Motivo no vacío; PENDIENTE | `sp_rechazar_solicitud_alumno`; evento `RECHAZAR` con motivo | «…no ha sido aceptada» con el motivo |
| Reabrir | `…/reabrir {motivo?}` | RECHAZADO y convocatoria de la solicitud **activa** (si no, 400 `CONVOCATORIA_CERRADA`) | PENDIENTE, `motivo = NULL` (el motivo del rechazo queda solo en el evento); evento `REABRIR` | Ninguna |

No se puede validar ni rechazar una solicitud ya VALIDADO, RECHAZADO o BAJA. **No hay forma de devolver una solicitud VALIDADO a PENDIENTE ni de rechazarla**: solo puede darse de baja ([baja y reactivación](baja-y-reactivacion.md)).

## 3. Consultas

| Endpoint | Rol | Detalle |
| --- | --- | --- |
| `GET /solicitudes/alumno?estado=&convocatoria=&include=full` | Personal | Lista con datos del alumno, ciclo **de la solicitud**, cuenta (`tiene_cuenta`, `cuenta_activa`), `motivo_baja`/`fecha_baja` (último evento BAJA) y documentos proyectados para el centro con `puede_validar_solicitud`. Con `include=full` añade todas sus reservas con resumen documental. **Sin filtro, devuelve todas las convocatorias.** |
| `GET /solicitudes/alumno/:id` | Personal | Detalle (sin `numeroSS`) |
| `GET /solicitudes/alumno/:id/documentos` | Personal | Todos los documentos (actuales e históricos) con estado |
| `GET /solicitudes/alumno/mia` | ALUMNO | **Una sola** solicitud: la de la convocatoria activa o, si no hay, la más reciente (`ORDER BY c.activa DESC, fecha_solicitud DESC LIMIT 1`). 404 `SIN_SOLICITUD` si no tiene ninguna |

## 4. Qué puede hacer el alumno después

- Ver su solicitud, reservas y documentos (`/studentMain`).
- **Sustituir** su CV o Anexo DGA mientras no estén VALIDADO (`POST /documentos/alumno/:idSolicitud/:tipo`), por ejemplo tras un rechazo.
- Firmar el Anexo II/III y el Calendario de sus reservas.
- No puede editar sus datos personales desde el portal: solo volviendo a enviar el formulario en otra convocatoria (con su contraseña) o a través del centro 🔶 (no hay endpoint de edición de datos de alumno).

## 5. Efectos sobre otros componentes

- Una solicitud VALIDADO de la convocatoria activa aparece en `/alumnos/disponibles` de las empresas con oferta VALIDADO de su ciclo, y en las listas de elegibles del personal.
- `id_especialidad` de la solicitud determina qué ofertas puede ocupar (triggers y consultas) y en qué ciclo aparece en Seguimiento y notificaciones.
