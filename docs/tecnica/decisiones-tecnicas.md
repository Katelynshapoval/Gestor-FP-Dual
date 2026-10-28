# Decisiones técnicas y particularidades arquitectónicas

> Parte de la [documentación técnica](README.md). Cada punto indica qué se hizo, por qué (si consta) y qué consecuencias tiene.

## Monolito en capas sin ORM
- **Qué**: Express → servicios con SQL parametrizado escrito a mano → MySQL. Los servicios reciben `req`/`res`; no hay capa de controlador ni de repositorio.
- **Consecuencia**: las consultas viven junto a su lógica y algunas se repiten (p. ej. `loadEmpresaDatos` y `loadEmpresaDatosRead`, una con `FOR UPDATE`).

## Reglas en tres niveles
- **Qué**: las reglas críticas se comprueban en Node (mensajes y códigos), en procedimientos (bajo bloqueo) y en triggers (invariante para cualquier escritor).
- **Consecuencia**: duplicación y mensajes distintos según qué nivel salte primero; cambiar una regla obliga a revisar los tres.

## Reglas de estado como funciones puras
- **Qué**: [`estadoReglas.js`](../../backend/src/services/estadoReglas.js) devuelve `null` o `{status, code, error}` sin acceder a BD; lo usan los servicios, la ficha de reserva y las pruebas.
- **Consecuencia**: la ficha de reserva y el endpoint de confirmación nunca discrepan.

## Catálogo de documentos en código (duplicado en BD)
- **Qué**: [`documentCatalogue.js`](../../backend/src/services/documentCatalogue.js) define tipos, padres, actores, firmantes, revisión y generación; los tipos se resuelven **por nombre**.
- **Duplicación**: `trg_dd_bi/bu_reglas` repiten la relación tipo → padre; `sp_confirmar_reserva` y `anexoClaveSql` repiten la regla de familia `'%beca%'`.

## Familia de anexo por nombre del tipo de contrato
- **Qué**: «beca» en el nombre → Anexo III; cualquier otro → Anexo II.
- **Consecuencia**: un tipo nuevo cuyo nombre contenga «beca» pasa a la familia III; renombrar `BECA` rompería la regla.

## Ids fijos de catálogo
- **Qué**: el baseline inserta los catálogos con ids explícitos; el código resuelve por nombre, pero quedan literales: `id_solicitud_alumno_confirmada` (`= 2`), las vistas (`= 2`) y los `INSERT … id_estado_validacion = 1` de las altas.
- **Consecuencia**: los catálogos no deben renumerarse; un estado nuevo se añade por nombre (como `BAJA`).

## Reutilización de filas de reserva
- **Qué**: clave única `(id_solicitud_alumno, id_solicitud_empresa_especialidad)`; volver a reservar reactiva la fila cancelada.
- **Consecuencia**: lógica de reactivación en dos procedimientos y un trigger; los documentos de varios intentos comparten `id_reserva`.

## Procedimientos con transacción propia
- **Qué**: los procedimientos de reservas hacen `START TRANSACTION … COMMIT`.
- **Consecuencia**: el backend no puede envolverlos; la auditoría se escribe después (`recordEventAfterCommit`) y la baja no es atómica.

## Unicidad condicional con columnas generadas
- **Qué**: `uq_dual_reservas_confirmada_alumno`, `uq_dec_solicitud_pendiente`, `uq_plantilla_activa`, `uq_dd_actual`: una columna generada que es NULL cuando la regla no aplica, más un índice único.
- **Motivo**: MySQL no tiene índices únicos parciales.

## Copia en escritura de datos de empresa compartidos
- **Qué**: la reaplicación reutiliza ids de domicilios y contactos; al editar, se clonan (domicilios, representante) o se congela una copia para las otras solicitudes (coordinador).
- **Motivo**: que los años anteriores y sus convenios conserven los valores de entonces.
- **Excepciones**: `ge_empresas` y tutores se editan en el sitio.

## Tablas protegidas
- **Qué**: no se altera la estructura de `ge_empresas`, `ge_domicilios`, `ge_contactos`, `gf_alumnosfct`.
- **Motivo**: regla del proyecto. Es probable que otras herramientas del centro las usen, pero no está confirmado ❓.
- **Consecuencia**: soluciones indirectas (empresa del contacto por su domicilio, ciclo por solicitud en una tabla nueva, motivos en eventos). Excepción aceptada: el índice único de DNI.

## Ficheros en la base de datos
- **Qué**: PDF y DOCX como `LONGBLOB`.
- **Motivo**: una transacción cubre fichero, versión, firmas y auditoría, y hay una sola copia de seguridad. Razonable hasta unos 5–10 GB.

## Firmas como atestaciones
- **Qué**: `SUBIDA_FIRMADA` y `CONFIRMACION_APP`; ninguna es criptográfica y el centro revisa el fichero.

## Activación de convocatorias por fechas
- **Qué**: el indicador `activa` se deriva de las fechas con un temporizador interno.

## Recuperación de contraseña sin tabla
- **Qué**: JWT con huella del hash; cada enlace sirve una vez sin almacenar tokens.

## Generación con Chromium por petición
- **Qué**: `puppeteer.launch()` por documento.
- **Consecuencia**: generaciones simultáneas multiplican el consumo de memoria.

## Notificaciones «disparar y olvidar»
- **Qué**: sin cola; tras el commit; nunca hacen fallar la petición.

## Dependencias sin uso
`google-auth-library`, `soffice`, `crypto-browserify`, `body-parser`, `@react-oauth/google` y el paquete npm `mysql` (`backup.js` usa el cliente de línea de comandos, no el paquete) no se importan en ningún sitio.

## Puntos especialmente delicados
- Cualquier cambio en `sp_reservar_alumno`, `sp_reasignar_reserva`, `sp_confirmar_reserva` o los triggers de `dual_reservas` (probar reservas concurrentes por la última plaza).
- `documentosStore.saveByClave`: el bloqueo del padre debe seguir siendo la **primera** lectura de la transacción (REPEATABLE READ).
- El orden «desactivar antes de activar» en `syncConvocatoriaActiva`.
- `empresaDatos.applyEmpresaDatos`: copia en escritura y caso de domicilio legal = trabajo.
- Cambiar `dateStrings` en el pool cambia el formato de todas las fechas de la API.
- Cambiar `JWT_SECRET` cierra todas las sesiones.
