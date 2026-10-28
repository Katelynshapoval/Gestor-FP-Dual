# Procesos, tareas programadas y herramientas

> Parte de la [documentación técnica](../README.md).

## 1. Procesos en ejecución dentro del servidor

| Proceso | Implementación | Frecuencia | Efecto | Fallo |
| --- | --- | --- | --- | --- |
| Sincronización de la convocatoria activa | `startConvocatoriaScheduler` en [`convocatoriasService.js`](../../../backend/src/services/convocatoriasService.js), lanzado en `app.listen` | Al arrancar y cada 15 min (`setInterval(...).unref()`); además en lecturas de convocatorias y tras crear/editar | `activa = 1` solo en la convocatoria vigente | Consola; reintento en el siguiente intervalo |
| Envío de correos | `notificaciones.*` y `transporter.sendMail` sin `await` en la respuesta | Tras cada *commit* que lo requiere | [correo](../api-e-integraciones/correo-electronico.md) | Consola; se pierde |
| Generación de PDF | `generateDocument` (Chromium por documento) | Bajo demanda; tras el alta y la reaplicación de empresa | Documento `GENERADO` | Ver [fallos](../comportamientos-especiales/fallos-y-concurrencia.md#generación-de-pdf-chromium-plantilla-o-datos) |

No hay colas, *workers*, eventos de MySQL (0 `EVENT`) ni cron externo. Si se ejecutaran varios procesos Node, cada uno tendría su propio programador (inocuo: la sincronización es idempotente y transaccional) y su propio limitador de intentos.

## 2. Scripts de base de datos (`backend/scripts`)

| Script | Propósito | Salvaguardas |
| --- | --- | --- |
| [`migrate.js`](../../../backend/scripts/migrate.js) | `status`, `mark-baseline`, `up [--to NNN]` | `--yes`; rechaza `NODE_ENV=production` sin `--allow-production`; imprime la BD destino; checksum por fichero |
| [`schema.js`](../../../backend/scripts/schema.js) | `baseline`, `dump`, `diff <esquema>` | Solo lectura sobre la BD (lee `information_schema` y `SHOW CREATE`); ignora `DEFINER` y `AUTO_INCREMENT`; solo exporta como datos las 6 tablas de catálogo |
| [`backup.js`](../../../backend/scripts/backup.js) | `mysqldump --single-transaction --routines --triggers --events --hex-blob` a `backups/`; `verify` restaura en `<DBNAME>_backupcheck` y compara | Contraseña por `MYSQL_PWD` (no en `argv`); `backups/` ignorado por Git (contiene datos personales). `MYSQL_BIN` para la ruta de los binarios (por defecto la de Windows) |
| [`verifyDb.js`](../../../backend/scripts/verifyDb.js) | BD aislada `<DBNAME>_verify`: `create`, `migrate`, `rollback`, `drop` | Rechaza cualquier nombre que no termine en `_verify`; nunca copia filas de la BD real |
| [`seedPruebas.js`](../../../backend/scripts/seedPruebas.js) | Cuentas de personal, dos empresas, un alumno y solicitudes VALIDADO marcadas «PRUEBA» | Rechaza producción; no borra nada; contraseñas solo en `backend/.pruebas.local.json` (ignorado por Git); especialidad configurable con `PRUEBA_ESPECIALIDAD` (5 por defecto) |
| [`probarCorreos.js`](../../../backend/scripts/probarCorreos.js) | Envía cada plantilla de notificación | Exige `MAIL_MODE=smtp` y `MAIL_REDIRECT_TO`; rechaza producción; solo lectura |

## 3. Pruebas automatizadas

| Conjunto | Ejecución | Qué cubre |
| --- | --- | --- |
| Backend unitarias (`backend/test/*.test.js`) | `npm test` en `backend/` (`node --test`) | Servicios con BD simulada (`fakePool` del [arnés](../../../backend/test/helpers/harness.js)): autenticación, autorización, reglas de estado, transacciones de documentos, flujos de reservas y ficha, panel, notificaciones, bajas, recuperación de contraseña |
| Backend contra BD (`backend/test/db/*.db.test.js`) | `DB_INTEGRATION=1 node --test test/db/…` | Migraciones, triggers, auditoría inmutable, DNI único, cancelar y volver a reservar, guardas y reglas de 017, concurrencia de documentos, reversión. Se omiten sin `DB_INTEGRATION` |
| Frontend (`frontend/src/**/*.test.*`) | `npm test` en `frontend/` | Navegación, búsqueda, `Tabs` accesibles, formularios por pasos, «Qué tienes pendiente», cliente HTTP, etiquetas, insignias de reserva, `Modal`/`MotivoDialog` |

Estado conocido : 87 pruebas backend correctas, 20 omitidas sin BD, 1 fallo preexistente (`mail/config: development defaults to log mode`, porque el módulo vuelve a cargar `MAIL_MODE` del `.env` local); frontend 28/28. No hay CI configurada.

## 4. Operación habitual

1. Copia de seguridad verificada antes de cualquier migración (`npm run db:backup` + `verify`).
2. Migraciones con el backend detenido cuando cambian columnas que el backend escribe (017).
3. Carga de `dual_especialidades` en cada entorno nuevo.
4. Subida de plantillas activas (CONVENIO, ANEXO_II, ANEXO_III) por un administrador para poder generar documentos.
5. Creación de convocatorias con fechas sin solapes; la activación es automática.
