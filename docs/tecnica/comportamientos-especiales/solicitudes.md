# Comportamientos especiales: solicitudes de alumno y de empresa

> Volver al [índice](README.md). Flujos normales: [alumno](../logica-de-negocio/solicitudes-alumno.md) · [empresa](../logica-de-negocio/solicitudes-empresa.md).

## Alumno

### Alumno que repite con cuenta
- **Contexto**: `POST /solicitudes/alumno`.
- **Condición**: el DNI ya existe en `gf_alumnosfct` y tiene usuario.
- **Comportamiento**: el campo «Contraseña» del formulario se interpreta como **su contraseña actual del portal**. Incorrecta → 401 `IDENTIDAD_NO_VERIFICADA` sin escribir nada; correcta → se actualizan todos sus datos personales y su ciclo «último» y se crea la nueva solicitud; la contraseña no cambia. Cuenta inactiva → 403.
- **Referencia**: `solicitudesAlumnoService.create`.

### Alumno existente sin cuenta (ficha importada)
- **Condición**: el DNI existe pero no hay usuario.
- **Comportamiento** (SEC-001): **no se hace nada**. Responde 401 `IDENTIDAD_NO_VERIFICADA`, con el mismo mensaje que una contraseña incorrecta, y cuenta como intento fallido. No se crea la cuenta, no se escribe la ficha ni se abre la solicitud.
- **Motivo**: nadie ha probado quién envía el formulario anónimo; antes cualquiera podía crear la cuenta de ese alumno con su DNI.
- **Consecuencias**: el alumno tiene que pasar por el centro, y el portal todavía **no tiene pantalla** para que Administración le cree la cuenta. En desarrollo no hay ninguna ficha así con solicitud.

### DNI del alumno en el backend
- **Comportamiento** (SEC-001): el backend normaliza el DNI (trim + mayúsculas) y comprueba su formato y letra con `dniNieValido` → 400 «No es un DNI/NIE válido.». El NSS y la exigencia de tutor legal para menores se validan solo en el formulario (`formatValidation.js`, `AddDualStudent`).
- **Referencia**: `solicitudesAlumnoService.create`, [`helpers/dbHelpers.js`](../../../backend/src/helpers/dbHelpers.js).

### Petición de corrección y edición del centro a la vez
- **Condición**: el alumno pide corregir un campo y, antes de que Administración la apruebe, alguien del centro cambia ese mismo campo.
- **Comportamiento**: al aprobar, 409 `CONFLICTO` con cada campo (original, actual y solicitado). «Aplicar igualmente» aprueba con `confirmar_conflicto: true` y sobrescribe el valor actual.
- **Referencia**: `alumnoCambiosService.aprobarCambio`.

### Petición de corrección cuando ya no se puede editar
- **Condición**: la convocatoria deja de estar activa o la solicitud se da de baja con una petición pendiente.
- **Comportamiento**: aprobar falla con 400 (`CONVOCATORIA_CERRADA` / `SOLICITUD_BAJA`) y la petición se queda PENDIENTE; se puede rechazar. El alumno ya no puede modificarla: fuera de la convocatoria activa `GET /solicitudes/alumno/mia/datos` responde 404 `SIN_SOLICITUD`, y con la baja su cuenta está desactivada.

### Petición que cambia el ciclo con reservas activas
- **Comportamiento**: se puede enviar, pero al aprobar falla con 409 `RESERVAS_ACTIVAS` mientras el alumno tenga reservas pendientes o confirmadas. Hay que cancelarlas o rechazar la petición.

### Ciclo de la ficha frente al ciclo de la solicitud
- **Condición**: un alumno solicita ciclos distintos en convocatorias distintas.
- **Comportamiento**: desde la migración 017 cada solicitud guarda su ciclo (`dual_solicitudes_alumno.id_especialidad`); la ficha (`gf_alumnosfct.id_especialidad_dual` y `especialidad`) solo guarda el último. Todas las reglas y listados leen el de la solicitud. Administración puede cambiarlo con la [corrección de datos](../logica-de-negocio/solicitudes-alumno.md#5-corrección-de-datos-del-alumno-migración-020), solo en la convocatoria activa y sin reservas activas (también lo impide el trigger).
- **Referencia**: migración 017, `trg_dsa_bu_reglas`, prueba `stage1.test.js`, `stage1.db.test.js`.

### Especialidad inactiva en el alta
- **Comportamiento**: el formulario solo muestra especialidades activas, pero el backend solo comprueba que **existan**; una petición directa puede usar una inactiva. Lo mismo en las ofertas del alta y de la reaplicación de empresa (en cambio `addEspecialidad` exige activa).

### El portal del alumno solo muestra una solicitud
- **Comportamiento**: `/solicitudes/alumno/mia` y `/documentos/alumno/mios` devuelven solo la de la convocatoria activa o, si no hay, la más reciente. Las reservas (`/reservas/alumno`) sí incluyen todas las convocatorias.

### Validar con documentos validados después de la comprobación
- **Comportamiento**: `missingStudentValidation` se comprueba fuera de la transacción; el procedimiento lo vuelve a comprobar dentro. Si entre ambos alguien rechaza el CV, el procedimiento lo detecta → 400 «Para validar al alumno deben estar validados el CV y el Anexo DGA.».

### Rechazar un documento de un alumno ya validado
- **Comportamiento**: se permite; la solicitud **sigue VALIDADO** y el alumno sigue siendo reservable. Ver [documentos](documentos.md#rechazar-un-documento-ya-validado).

## Empresa

### Alta pública con un CIF ya registrado
- **Comportamiento**: 409 «Esta empresa ya está registrada. Inicia sesión con el CIF para gestionar su participación.». También si dos altas simultáneas del mismo CIF chocan con el índice único.
- **Motivo**: «Public registration must not upsert» (comentario). La auditoría de seguridad mantuvo este 409 aunque revela que el CIF existe (SEC-009), porque evita empresas duplicadas.

### Demasiadas altas públicas
- **Comportamiento** (SEC-003): las dos altas públicas comparten `signupRateLimit`: 10 por IP y hora y 300 al día en total (configurables). Al pasarse → 429 «Se han recibido demasiadas solicitudes. Vuelve a intentarlo más tarde.» con `Retry-After`. El contador está en memoria y es de un solo proceso. Detrás de un proxy, `TRUST_PROXY` decide qué IP se cuenta.

### Alta de empresa sin plantilla de convenio
- **Condición**: no hay plantilla activa de CONVENIO, o la generación (Chromium, plantilla) falla.
- **Comportamiento**: la solicitud queda creada (201), sin convenio, y **no se envía ningún correo de confirmación** (el correo solo sale si hay PDF). En consola: «…no hay plantilla activa de convenio. La solicitud se ha guardado.» o el error.
- **Consecuencias**: el convenio aparece en Seguimiento como «Pendiente de generar» (o «No hay plantilla activa»). El centro puede generarlo después (`POST /documentos/generar`) o la empresa subirlo.
- **Referencia**: `safelyGenerateAndSendConvenio`.

### DNI de representante y coordinador
- **Comportamiento**: se validan con `dniNieValido` pero se guardan **sin normalizar** en el alta; las ediciones (`empresaDatos`) los guardan normalizados. Comparaciones posteriores (`valuesEqual`) normalizan, así que no generan cambios espurios.

### Errores de catálogo en el alta
- **Comportamiento**: una especialidad repetida en la lista → `ER_DUP_ENTRY` → 409 «Ya existe un registro con esos datos.»; un id de especialidad inexistente → error de FK no mapeado → **500** 🔶; un id de transporte inexistente se **descarta en silencio** porque `replaceTransportesSolicitud` usa `INSERT IGNORE` 🔶 (comportamiento de MySQL con `IGNORE` sobre FK). Los transportes se validan explícitamente solo en la edición de datos.

### Validar una empresa sin ofertas
- **Comportamiento**: `sp_validar_solicitud_empresa` exige ≥ 1 oferta. Como las ofertas pueden bajar a 0 plazas pero no borrarse, en la práctica siempre hay al menos una fila; una oferta con 0 plazas cuenta 🔶.

### Una empresa VALIDADO no se puede rechazar
- **Comportamiento**: `solicitudTransicion` solo permite rechazar desde PENDIENTE. La única salida es la baja.

### Convenio rechazado de una empresa ya validada
- **Comportamiento**: el convenio queda RECHAZADO y la empresa **sigue VALIDADO**, con sus reservas intactas y sus ofertas reservables. El evento registra `empresa_validada_sin_cambios`.
- **Referencia**: `documentosService.rechazar`.

### Reaplicación: qué solicitud se toma como base
- **Comportamiento**: la de `fecha_solicitud` más reciente (sin desempate por id). Se reutilizan los ids de representante, domicilios y coordinador; la copia en escritura protege las solicitudes anteriores cuando luego se editan.
- **Consecuencia**: reaplicar no sirve para corregir el CIF, la razón social, el representante ni los domicilios.

### Reabrir fuera de la convocatoria activa
- **Comportamiento**: 400 `CONVOCATORIA_CERRADA`. Una solicitud rechazada de un año pasado queda rechazada para siempre (salvo editar las fechas de esa convocatoria, ver [convocatorias § 4](../logica-de-negocio/convocatorias.md#4-editar--put-convocatoriasid-administrador)).
