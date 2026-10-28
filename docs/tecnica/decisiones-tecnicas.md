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
- **Qué**: el baseline inserta los catálogos con ids explícitos; el código resuelve por nombre, pero quedan literales: `id_solicitud_alumno_confirmada` (`= 2`), `id_alumno_activo` (`IN (1, 2)`, 018, que su guarda comprueba), dos consultas de `reservasTx` y `bajaService`, las vistas (`= 2`) y los `INSERT … id_estado_validacion = 1` de las altas.
- **Consecuencia**: los catálogos no deben renumerarse; un estado nuevo se añade por nombre (como `BAJA`).

## Una fila por intento de reserva
- **Qué** (migración 018, decisiones D2 y D5): la unicidad es solo del par **activo** (`uq_dr_par_activo`); volver a reservar tras una cancelación inserta una fila nueva, y una reasignación enlaza la nueva con `id_reserva_origen`. Una reserva CANCELADA es definitiva y conserva tipo de contrato, tutor, motivo y documentos.
- **Antes**: la clave única `(alumno, oferta)` obligaba a reactivar la fila cancelada, que perdía el tipo de contrato y mezclaba los documentos de varios intentos bajo el mismo `id_reserva`. Esas filas antiguas no se han reescrito.
- **Consecuencia**: el panel de la reserva muestra los **intentos relacionados** (reasignada desde / a, intentos anteriores y posteriores con la misma oferta).

## Transacciones del backend para las reservas
- **Qué** (018, D6): los procedimientos de reservas ya no abren ni confirman transacciones y se niegan a ejecutarse en autocommit. El backend las abre con `inTransaction` ([`db/transaction.js`](../../backend/src/db/transaction.js)), con READ COMMITTED, escribe la auditoría en la misma transacción y confirma una sola vez. Solo [`reservasTx.js`](../../backend/src/services/reservasTx.js) llama a los procedimientos (lo comprueba una prueba).
- **Motivo**: que la transición y su evento, la baja completa y la reducción de cupo sean todo o nada.
- **Consecuencia**: un orden de bloqueo único (solicitud de alumno → solicitud de empresa → ofertas → reservas). Un interbloqueo repite la operación entera (máx. 2 veces), así que la función no debe tener efectos fuera de la BD; los correos van después.

## Unicidad condicional con columnas generadas
- **Qué**: `uq_dual_reservas_confirmada_alumno`, `uq_dr_par_activo`, `uq_dec_solicitud_pendiente`, `uq_dac_solicitud_pendiente`, `uq_plantilla_activa`, `uq_dd_actual`: una columna generada que es NULL cuando la regla no aplica, más un índice único.
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

## Recuperación de contraseña y sesiones ligadas a la contraseña
- **Qué**: JWT con huella del hash; cada enlace sirve una vez sin almacenar tokens. Desde SEC-006 el token de **sesión** también lleva esa huella: cambiar o restablecer la contraseña cierra las sesiones anteriores sin tabla de revocación.

## Correcciones de datos con revisión
- **Qué**: empresas (`dual_empresa_cambios`) y alumnos (`dual_alumno_cambios`, 020) no cambian sus datos: envían una petición con solo los campos cambiados y una foto (`snapshot`) de su valor. El centro la aprueba o la rechaza; si los datos cambiaron entretanto, la aprobación se detiene y pide confirmación.
- **Excepción**: el DNI/NIE del alumno y el CIF no se pueden cambiar (son el usuario de acceso).

## Generación con Chromium por petición
- **Qué**: `puppeteer.launch()` por documento, sin JavaScript y sin red (SEC-004: se cancela cualquier petición que no sea `data:`). Las plantillas solo resuelven nombres de variable: no se evalúa código.
- **Consecuencia**: generaciones simultáneas multiplican el consumo de memoria.

## Notificaciones «disparar y olvidar»
- **Qué**: sin cola; tras el commit; nunca hacen fallar la petición.

## Dependencias sin uso
`google-auth-library`, `soffice`, `crypto-browserify` y `body-parser` se quitaron del backend (SEC-005). Siguen sin importarse en ningún sitio `@react-oauth/google` (frontend) y el paquete npm `mysql` (backend; `backup.js` usa el cliente de línea de comandos, no el paquete).

## Puntos especialmente delicados
- Cualquier cambio en los procedimientos o triggers de `dual_reservas`, en `reservasTx.js` o en `db/transaction.js`: respetar el orden de bloqueo y pasar `test/db/stage2.db.test.js` (concurrencia real, inyección de fallos).
- `documentosStore.saveByClave`: el bloqueo del padre debe seguir siendo la **primera** lectura de la transacción (REPEATABLE READ).
- El orden «desactivar antes de activar» en `syncConvocatoriaActiva`.
- `empresaDatos.applyEmpresaDatos`: copia en escritura y caso de domicilio legal = trabajo.
- Cambiar `dateStrings` en el pool cambia el formato de todas las fechas de la API.
- Cambiar `JWT_SECRET` cierra todas las sesiones. Cambiar cómo se calcula la huella de la contraseña (`passwordFingerprint`) también.
