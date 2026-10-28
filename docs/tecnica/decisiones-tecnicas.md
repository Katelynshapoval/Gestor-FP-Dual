# Decisiones técnicas y particularidades arquitectónicas

> Parte de la [documentación técnica](README.md). Para cada decisión se indica si su motivo está documentado (informes de fase, auditorías, comentarios) o no ha podido confirmarse.

## Monolito en capas sin ORM
- **Qué**: Express → servicios con SQL parametrizado escrito a mano → MySQL. Los servicios reciben `req`/`res`; no hay capa de controlador ni de repositorio.
- **Motivo**: no documentado para el origen; la hoja de ruta lo considera adecuado («the architecture … is sound», [`docs/ROADMAP.md`](../ROADMAP.md) § F).
- **Consecuencia**: las consultas viven junto a su lógica; consultas parecidas se repiten (p. ej. `loadEmpresaDatos` y `loadEmpresaDatosRead` son casi idénticas, una con `FOR UPDATE`).

## Reglas en tres niveles
- **Qué**: las reglas críticas se comprueban en Node (mensajes y códigos), en procedimientos (bajo bloqueo) y en triggers (invariante para cualquier escritor).
- **Motivo**: documentado como diseño intencionado en [`docs/DATABASE_AUDIT.md`](../DATABASE_AUDIT.md) § 2 («by design»); los triggers actúan como segunda línea de defensa.
- **Consecuencia**: duplicación y mensajes distintos según qué nivel salte primero; cambiar una regla obliga a revisar los tres.

## Reglas de estado como funciones puras
- **Qué**: [`estadoReglas.js`](../../backend/src/services/estadoReglas.js) devuelve `null` o `{status, code, error}` sin acceder a BD; lo usan servicios, la ficha de reserva (para mostrar acciones y requisitos) y las pruebas.
- **Motivo**: documentado en la cabecera del fichero (compartir reglas entre servicios y pruebas).
- **Consecuencia**: la ficha de reserva y el endpoint de confirmación nunca discrepan.

## Catálogo de documentos en código (duplicado en BD)
- **Qué**: [`documentCatalogue.js`](../../backend/src/services/documentCatalogue.js) define los tipos, sus padres, actores, firmantes, revisión y generación; los tipos se resuelven **por nombre**.
- **Duplicación**: `trg_dd_bi/bu_reglas` repiten la relación tipo → padre; `sp_confirmar_reserva` y `anexoClaveSql` repiten la regla de familia `'%beca%'`.
- **Motivo**: documentado («Type lists are duplicated from documentCatalogue.js (acceptable; changes are rare)», auditoría § 3.4; DB-09 propone una columna en `dual_tipos_contrato`).

## Familia de anexo por nombre del tipo de contrato
- **Qué**: «beca» en el nombre → Anexo III; cualquier otro → Anexo II.
- **Consecuencia**: añadir un tipo de contrato cuyo nombre contenga «beca» lo convierte automáticamente en familia III; renombrar `BECA` rompería la regla.
- **Motivo**: no documentado en origen; DB-09 lo señala como mejora de baja prioridad.

## Ids fijos de catálogo
- **Qué**: el baseline inserta los catálogos con ids explícitos; el código resuelve por nombre desde 012, pero quedan literales: `id_solicitud_alumno_confirmada` (`= 2`), las vistas (`= 2`) y los `INSERT … id_estado_validacion = 1` de las altas.
- **Consecuencia**: los catálogos no deben renumerarse; un nuevo estado se añade por nombre (como `BAJA` en 016).

## Reutilización de filas de reserva
- **Qué**: clave única `(id_solicitud_alumno, id_solicitud_empresa_especialidad)`; volver a reservar reactiva la fila cancelada (WF-4 limpia tipo, tutor y documentos).
- **Motivo**: heredado del esquema; la auditoría lo califica de debilidad de diseño (DB-04) y el plan propone una fila por intento (D2 del plan de BD, etapa 2).
- **Consecuencia**: lógica de reactivación en dos procedimientos y un trigger; documentos de varios intentos bajo el mismo `id_reserva`.

## Procedimientos con transacción propia
- **Qué**: los procedimientos de reservas hacen `START TRANSACTION … COMMIT`.
- **Consecuencia**: el backend no puede envolverlos; la auditoría se escribe después (`recordEventAfterCommit`) y la baja no es atómica.
- **Motivo**: no documentado en origen; DB-06 propone transacciones del backend (D6 del plan de BD).

## Unicidad condicional con columnas generadas
- **Qué**: `uq_dual_reservas_confirmada_alumno`, `uq_dec_solicitud_pendiente`, `uq_plantilla_activa`, `uq_dd_actual` (columna generada que es NULL cuando la regla no aplica + índice único).
- **Motivo**: MySQL no tiene índices únicos parciales; documentado como buen diseño en la auditoría § 3.5 y adoptado en 017 para `uq_dd_actual`.

## Copia en escritura de datos de empresa compartidos
- **Qué**: la reaplicación reutiliza ids de domicilios y contactos; al editar, se clonan (domicilios, representante) o se congela una copia para las otras solicitudes (coordinador).
- **Motivo**: WF-11 (fase 2): que los años anteriores y sus convenios mantengan los valores de entonces.
- **Excepciones**: `ge_empresas` y tutores se editan en el sitio (DB-12; D3 del plan de BD propone copia también para tutores).

## Tablas protegidas
- **Qué**: no se altera la estructura de `ge_empresas`, `ge_domicilios`, `ge_contactos`, `gf_alumnosfct`.
- **Motivo**: regla del proyecto recogida en la auditoría y el plan de BD. Que otras herramientas del centro las usen es probable por su origen (FCT) pero **no está confirmado**: la auditoría pide preguntarlo al centro ❓.
- **Consecuencia**: soluciones indirectas (empresa del contacto por su domicilio, ciclo por solicitud en una tabla nueva, motivos en eventos). Excepción aceptada: el índice único de DNI (015).

## Ficheros en la base de datos
- **Qué**: PDF y DOCX como `LONGBLOB`.
- **Motivo**: documentado en la auditoría § 8: una transacción cubre fichero, versión, firmas y auditoría; una sola copia de seguridad. Recomendación: mantenerlo hasta ~5–10 GB.

## Firmas como atestaciones
- **Qué**: `SUBIDA_FIRMADA` y `CONFIRMACION_APP`; el centro revisa el fichero.
- **Motivo**: decisión D1 (fase 2); la verificación criptográfica de PDF (SEC-9) está planificada.

## Activación de convocatorias por fechas
- **Qué**: el indicador `activa` se deriva de las fechas con un temporizador interno.
- **Motivo**: decisión de la fase 1 (WF-3: «activation = automatic by dates»).

## Recuperación de contraseña sin tabla
- **Qué**: JWT con huella del hash.
- **Motivo**: documentado en la cabecera de `passwordResetService.js` (cada enlace sirve una vez sin almacenar tokens).

## Generación con Chromium por petición
- **Qué**: `puppeteer.launch()` por documento.
- **Motivo**: no documentado; PM-3 (fase 5) propone un navegador compartido y generar tras la respuesta.

## Notificaciones «disparar y olvidar»
- **Qué**: sin cola; tras el commit; nunca fallan la petición.
- **Motivo**: documentado en la cabecera de `notificaciones.js`.

## Dependencias sin uso
- `google-auth-library`, `soffice`, `crypto-browserify`, `body-parser`, `@react-oauth/google` y el paquete npm `mysql` (dependencia de desarrollo; `backup.js` usa el **cliente de línea de comandos** `mysql`, no el paquete) no se importan en ningún sitio. Motivo no documentado; la fase 5 prevé eliminarlas.

## Puntos especialmente delicados
- Cualquier cambio en `sp_reservar_alumno`, `sp_reasignar_reserva`, `sp_confirmar_reserva` o los triggers de `dual_reservas` (probar reservas concurrentes por la última plaza).
- `documentosStore.saveByClave`: el bloqueo del padre debe seguir siendo la **primera** lectura de la transacción (REPEATABLE READ, ver informe de la etapa 1 § 4).
- El orden «desactivar antes de activar» en `syncConvocatoriaActiva`.
- `empresaDatos.applyEmpresaDatos`: copia en escritura y caso de domicilio legal = trabajo.
- Cambiar `dateStrings` en el pool cambia el formato de todas las fechas de la API.
- Cambiar `JWT_SECRET` cierra todas las sesiones.
