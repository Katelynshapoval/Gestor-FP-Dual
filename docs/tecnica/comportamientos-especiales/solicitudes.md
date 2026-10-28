# Comportamientos especiales: solicitudes de alumno y de empresa

> Volver al [índice](README.md). Flujos normales: [alumno](../logica-de-negocio/solicitudes-alumno.md) · [empresa](../logica-de-negocio/solicitudes-empresa.md).

## Alumno

### Alumno que repite con cuenta
- **Contexto**: `POST /solicitudes/alumno`.
- **Condición**: el DNI ya existe en `gf_alumnosfct` y tiene usuario.
- **Comportamiento**: el campo «Contraseña» del formulario se interpreta como **su contraseña actual del portal**. Incorrecta → 401 `CUENTA_EXISTENTE` sin escribir nada; correcta → se actualizan todos sus datos personales y su ciclo «último» y se crea la nueva solicitud; la contraseña no cambia. Cuenta inactiva → 403.
- **Motivo**: SEC-3 (un formulario público no debe sobrescribir datos ajenos).
- **Referencia**: `solicitudesAlumnoService.create`; pruebas SEC-3 en `authorization.test.js`.

### Alumno existente sin cuenta (ficha importada)
- **Condición**: el DNI existe pero no hay usuario.
- **Comportamiento**: solo se **rellenan los campos vacíos** de la ficha; los ya informados se conservan aunque el formulario traiga otros. Se crea la cuenta con la contraseña del formulario. La solicitud se crea con el ciclo del formulario, aunque `gf_alumnosfct.id_especialidad_dual` conserve el anterior.
- **Motivo**: no se puede probar la identidad; el centro corrige el resto (comentario en el código). Comportamiento de ciclo confirmado como intencionado en `docs/DATABASE_STAGE_1_REPORT.md` § 5.
- **Consecuencias**: el correo de confirmación se envía al email **del formulario**, pero las notificaciones posteriores y la recuperación de contraseña van al email **guardado** en la ficha (que se conserva si ya tenía uno).

### DNI del alumno sin validar en el backend
- **Condición**: petición directa a la API (sin el formulario).
- **Comportamiento**: el backend solo normaliza el DNI (trim + mayúsculas). La letra de control de DNI/NIE, el NSS y la exigencia de tutor legal para menores se validan solo en el formulario (`formatValidation.js`, `AddDualStudent`). En cambio, el alta de empresa **sí** valida CIF y DNI en el backend (WF-12).
- **Consecuencias**: pueden entrar DNI con formato inválido por la API. La unicidad (`uq_gf_alumnosfct_dni`) sí se garantiza.
- **Referencia**: `solicitudesAlumnoService.create`, [`frontend/src/utils/formatValidation.js`](../../../frontend/src/utils/formatValidation.js).

### Ciclo de la ficha frente al ciclo de la solicitud
- **Condición**: un alumno solicita ciclos distintos en convocatorias distintas.
- **Comportamiento**: desde la migración 017 cada solicitud guarda su ciclo (`dual_solicitudes_alumno.id_especialidad`); la ficha (`gf_alumnosfct.id_especialidad_dual` y `especialidad`) solo guarda el último. Todas las reglas y listados leen el de la solicitud. El ciclo de una solicitud no cambia mientras tenga reservas activas (trigger) y no hay endpoint para cambiarlo.
- **Motivo**: DB-01 (antes, repetir con otro ciclo cambiaba el ciclo de todas las solicitudes y reservas anteriores).
- **Referencia**: migración 017, `trg_dsa_bu_reglas`, prueba `stage1.test.js`, `stage1.db.test.js`.

### Preferencias con id inexistente
- **Comportamiento**: el `INSERT` en `dual_solicitud_preferencias` falla por FK; `mapSqlError` no mapea ese código → **500** «Error interno del servidor.» y se deshace toda la solicitud 🔶.
- **Referencia**: `solicitudesAlumnoService.create`, `dbHelpers.mapSqlError`.

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
- **Motivo**: «Public registration must not upsert» (comentario).

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
- **Referencia**: prueba «D7: a validated company cannot be rejected through the API».

### Convenio rechazado de una empresa ya validada
- **Comportamiento**: el convenio queda RECHAZADO y la empresa **sigue VALIDADO**, con sus reservas intactas y sus ofertas reservables. El evento registra `empresa_validada_sin_cambios`.
- **Motivo**: decisión D6 (fase 2) abierta; propuesta en `docs/PHASE_2_REPORT.md` § 3.
- **Referencia**: `documentosService.rechazar`; prueba «D6 open…».

### Reaplicación: qué solicitud se toma como base
- **Comportamiento**: la de `fecha_solicitud` más reciente (sin desempate por id). Se reutilizan los ids de representante, domicilios y coordinador; la copia en escritura protege las solicitudes anteriores cuando luego se editan.
- **Consecuencia**: reaplicar no sirve para corregir el CIF, la razón social, el representante ni los domicilios.

### Reabrir fuera de la convocatoria activa
- **Comportamiento**: 400 `CONVOCATORIA_CERRADA`. Una solicitud rechazada de un año pasado queda rechazada para siempre (salvo editar las fechas de esa convocatoria, ver [convocatorias](convocatorias.md#edición-de-una-convocatoria-pasada)).
- **Motivo**: decisión D7 (fase 2).
