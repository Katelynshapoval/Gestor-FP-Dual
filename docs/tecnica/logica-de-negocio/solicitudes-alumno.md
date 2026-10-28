# Solicitudes de alumno

> Código: [`solicitudesAlumnoService.js`](../../../backend/src/services/solicitudesAlumnoService.js), [`alumnoDatos.js`](../../../backend/src/services/alumnoDatos.js) y [`alumnoCambiosService.js`](../../../backend/src/services/alumnoCambiosService.js) (corrección de datos), [`solicitudTransiciones.js`](../../../backend/src/services/solicitudTransiciones.js), [`estadoReglas.solicitudTransicion`](../../../backend/src/services/estadoReglas.js), `sp_validar_solicitud_alumno`, `trg_dsa_*`. Frontend: [`AddDualStudent`](../../../frontend/src/pages/AddDualStudent/index.js), [`LinkStudents`](../../../frontend/src/pages/LinkStudents/index.js) (con [`AlumnoDatosActions.jsx`](../../../frontend/src/pages/LinkStudents/components/student-card/AlumnoDatosActions.jsx)), [`StudentMain`](../../../frontend/src/pages/StudentMain/index.js) (con [`MisDatos.jsx`](../../../frontend/src/pages/StudentMain/MisDatos.jsx) y [`AlumnoEditForm.jsx`](../../../frontend/src/pages/StudentMain/AlumnoEditForm.jsx)). Pruebas: `authorization.test.js`, `stage1.test.js`, `phase2.test.js`, `alumnoDatos.test.js`, `alumnoCambios.test.js`, `security.test.js`, `AlumnoEditForm.test.jsx`.

## 1. Envío público — `POST /solicitudes/alumno`

**Qué hace**: registra (o actualiza) al alumno, crea su solicitud para la convocatoria activa con su CV y su Anexo DGA, y crea su cuenta de portal si no la tenía.

**Desde dónde**: formulario público `/addDualStudent` (6 pasos), `multipart/form-data`.

### 1.1 Validaciones previas (sin escribir)

| Comprobación | Respuesta si falla |
| --- | --- |
| Límite de altas públicas (`signupRateLimit`, SEC-003): por defecto 10 por IP y hora y 300 al día en total | **429 `TOO_MANY_ATTEMPTS`** «Se han recibido demasiadas solicitudes…» |
| Ficheros `cv` y `anexoDga` presentes; `multer` acepta `application/pdf` de ≤ 10 MB y `requirePdfSignature` exige que el contenido empiece por `%PDF-` (SEC-008) | 400 |
| `nombre, dni, domicilio, cp, localidad, telalumno, email, id_especialidad_dual` | 400 «Faltan campos obligatorios…» |
| DNI/NIE con formato y letra de control válidos (`dniNieValido`, SEC-001) | 400 «No es un DNI/NIE válido.» |
| `password` ≥ 8 caracteres | 400 |
| Hay convocatoria activa | **409** «…El plazo de solicitud está cerrado.» |
| La especialidad existe (no se comprueba que esté activa) | 400 |

El backend normaliza el DNI (trim + mayúsculas) y comprueba su letra. El NSS y la obligatoriedad del tutor legal para menores se comprueban **solo en el formulario**.

### 1.2 Transacción

1. `SELECT idalumno FROM gf_alumnosfct WHERE dni = ? FOR UPDATE` (usa el índice único; bloquea solo esa fila o el hueco).
2. Según el caso:

| Caso | Comprobación | Efecto en `gf_alumnosfct` |
| --- | --- | --- |
| DNI nuevo | — | `INSERT` con todos los datos |
| DNI existente **con cuenta** | Ya tiene solicitud en esta convocatoria → 409. La contraseña del formulario debe ser su **contraseña actual del portal** (limitador de login compartido, clave = DNI): incorrecta → **401 `IDENTIDAD_NO_VERIFICADA`**; cuenta inactiva → 403 | `UPDATE` de **todos** los datos personales y del ciclo «último» (`especialidad`, `id_especialidad_dual`) |
| DNI existente **sin cuenta** (p. ej. importado) | Nadie ha probado la identidad (SEC-001) | **Nada**: `ROLLBACK` y **401 `IDENTIDAD_NO_VERIFICADA`**; cuenta como fallo en el limitador. No se crea la cuenta, no se toca la ficha ni se abre la solicitud. El alumno tiene que pasar por el centro |

Los dos 401 llevan el **mismo mensaje** (SEC-009), para que el formulario no revele si un DNI tiene cuenta o solo ficha: «No se ha podido verificar tu identidad con este DNI/NIE. Si ya tienes cuenta en el portal, escribe en «Contraseña» tu contraseña actual. Si no la tienes o no la recuerdas, contacta con el centro.»

3. Segunda comprobación de duplicado en la convocatoria → 409.
4. `INSERT dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad = id_especialidad_dual del formulario, PENDIENTE)`. El trigger exige especialidad y convocatoria activa.
5. `CALL sp_guardar_documento` para CV y ANEXO_DGA; el ANEXO_DGA queda con `estado_workflow = 'SUBIDO_FIRMADO'`.
6. Cuenta ALUMNO si no existe (contraseña del formulario, `email` NULL, `must_change_password = 0`). **Nunca** se cambia la contraseña de una cuenta existente.
7. Documentos de la solicitud: `id_usuario_origen` = cuenta, `origen_documento = 'SUBIDA'`, `registrado_en = NOW()`.
8. `COMMIT`; correo «Solicitud Dual recibida» (sin esperar).

**Resultado**: 201 `{ id_solicitud_alumno, cuenta_existente }`.

**Si falla**: `ROLLBACK` completo; errores SQL vía `mapSqlError`.

**Notas**:
- Los documentos del alta se guardan llamando al procedimiento directamente (no con `saveByClave`): **no generan eventos `SUBIR`** ni crean filas de firma (CV y Anexo DGA no tienen firmantes en el catálogo).
- Desde la 017 el ciclo de la solicitud es el del formulario.

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
| `GET /solicitudes/alumno?estado=&convocatoria=&include=full` | Personal | Lista con datos del alumno, ciclo **de la solicitud**, cuenta (`tiene_cuenta`, `cuenta_activa`), `motivo_baja`/`fecha_baja` (último evento BAJA), `id_cambio_pendiente` (petición de corrección pendiente), `convocatoria_activa` y documentos proyectados para el centro con `puede_validar_solicitud`. Con `include=full` añade todas sus reservas con resumen documental. **Sin filtro, devuelve todas las convocatorias.** |
| `GET /solicitudes/alumno/:id` | Personal | Detalle (sin `numeroSS`) |
| `GET /solicitudes/alumno/:id/documentos` | Personal | Todos los documentos (actuales e históricos) con estado |
| `GET /solicitudes/alumno/mia` | ALUMNO | **Una sola** solicitud: la de la convocatoria activa o, si no hay, la más reciente (`ORDER BY c.activa DESC, fecha_solicitud DESC LIMIT 1`). 404 `SIN_SOLICITUD` si no tiene ninguna |

## 4. Qué puede hacer el alumno después

- Ver su solicitud, reservas y documentos (`/studentMain`).
- **Sustituir** su CV o Anexo DGA mientras no estén VALIDADO (`POST /documentos/alumno/:idSolicitud/:tipo`), por ejemplo tras un rechazo.
- Firmar el Anexo II/III y el Calendario de sus reservas.
- **Pedir la corrección de sus datos** (§ 5). No los cambia directamente.

## 5. Corrección de datos del alumno (migración 020)

Dos caminos con las **mismas reglas** (`alumnoDatos.corregir`):

- **Edición directa** por **Administración** (Coordinación no): lápiz de la tarjeta del alumno.
- **Petición del alumno** desde el portal, que Administración aprueba o rechaza. Mismo modelo que los cambios de datos de empresa.

**Reglas comunes**

| Regla | Respuesta si se incumple |
| --- | --- |
| Solo la solicitud de la **convocatoria activa** | 400 `CONVOCATORIA_CERRADA` |
| No en una solicitud dada de baja | 400 `SOLICITUD_BAJA` («…Reactívala antes de editar sus datos.») |
| El **DNI/NIE no se puede cambiar** (es el usuario y la identidad) | 400 `DNI_NO_EDITABLE` |
| Formato de cada campo (código postal de 5 cifras, teléfono de 9, emails, fechas, DNI del tutor legal…) | 400 `DATOS_INVALIDOS` con `errores` por campo |
| El **ciclo** no cambia mientras la solicitud tenga reservas PENDIENTE o CONFIRMADA (también lo exige `trg_dsa_bu_reglas`). La ventana de edición del personal las lista con «Cancelar reserva» | 409 `RESERVAS_ACTIVAS` con la lista de `reservas` |
| Al menos un cambio | 400 `SIN_CAMBIOS` |

Campos: ciclo, nombre y apellidos, fecha de nacimiento, nacionalidad, sexo, tutor legal y su DNI/NIE, email personal y del centro, teléfonos, domicilio, código postal, localidad, carnet de conducir, vehículo, idiomas y número de la Seguridad Social. Los datos personales se guardan en `gf_alumnosfct` (una ficha por persona); el ciclo, en la solicitud (y en la copia «último ciclo» de la ficha si es la solicitud más reciente). Cambiar el nombre actualiza también `dual_usuarios.nombre_mostrar`. Los documentos ya generados conservan los datos anteriores.

**Edición directa** — `GET|PUT /solicitudes/alumno/:id/datos` (ADMINISTRADOR)

`GET` devuelve `editable`, `motivo_no_editable`, los datos y las `reservas_activas`. `PUT` bloquea la solicitud y después sus reservas (mismo orden que `sp_reservar_alumno`), aplica solo los campos cambiados y registra `DATOS_CORREGIDOS` con los **nombres** de los campos (y los ids de ciclo), nunca los valores. Si cambia el ciclo, el alumno recibe el correo «Hemos corregido el ciclo de tu solicitud de FP Dual».

**Petición del alumno** — `GET /solicitudes/alumno/mia/datos`, `POST /solicitudes/alumno/mia/cambios` (ALUMNO)

1. El alumno abre «Solicitar corrección», cambia lo que esté mal y envía. Se guarda en `dual_alumno_cambios` solo lo que cambia (`payload`) y el valor que tenían esos campos (`snapshot`). Evento `CAMBIO_SOLICITADO`.
2. Solo hay **una petición pendiente** por solicitud: mientras lo está, el alumno la modifica («Cambiar mi corrección») y se sustituye en la misma fila.
3. Sus datos no cambian hasta que se resuelve. El portal muestra «Corrección enviada para revisión» con la tabla de cambios, o «Petición de corrección rechazada» con el motivo.

**Resolución** — `GET /solicitudes/alumno/:id/cambios`, `POST …/cambios/:idCambio/aprobar { confirmar_conflicto? }`, `POST …/cambios/:idCambio/rechazar { motivo }` (ADMINISTRADOR)

- La tarjeta del alumno muestra la etiqueta **«Cambios pendientes»** y, en «Información», el recuadro «El alumno ha pedido corregir sus datos» con la tabla Actual → Solicitado y los botones Aprobar / Rechazar.
- **Aprobar** aplica los cambios con las reglas comunes, cierra la petición y registra `CAMBIO_APROBADO`, todo en una transacción. Si el centro cambió alguno de esos campos después de la petición → **409 `CONFLICTO`** con `requires_confirm` y la lista de conflictos; «Aplicar igualmente» repite con `confirmar_conflicto: true`.
- **Rechazar** exige motivo (400 `MOTIVO_REQUERIDO`); evento `CAMBIO_RECHAZADO`.
- Correo al alumno en ambos casos («Hemos corregido tus datos…» / «Tu petición de corrección de datos no se ha aplicado», con el motivo), y el de ciclo corregido si cambió el ciclo.
- Una petición ya resuelta → 400 `YA_RESUELTA`.

## 6. Efectos sobre otros componentes

- Una solicitud VALIDADO de la convocatoria activa aparece en `/alumnos/disponibles` de las empresas con oferta VALIDADO de su ciclo, y en las listas de elegibles del personal.
- `id_especialidad` de la solicitud determina qué ofertas puede ocupar (triggers y consultas) y en qué ciclo aparece en Seguimiento y notificaciones.
