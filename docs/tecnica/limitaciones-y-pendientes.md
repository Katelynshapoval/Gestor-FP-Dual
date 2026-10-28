# Limitaciones conocidas y aspectos pendientes

> Parte de la [documentación técnica](README.md). Ids de hallazgos: `SEC-*`, `WF-*`, `PM-*`, `V-*` en [`docs/AUDIT.md`](../AUDIT.md) y [`docs/ROADMAP.md`](../ROADMAP.md); `DB-*` en [`docs/DATABASE_AUDIT.md`](../DATABASE_AUDIT.md).

## 1. Integridad y modelo de datos

| Limitación | Estado | Referencia |
| --- | --- | --- |
| Filas de reserva reutilizadas; el tipo de contrato se pierde al cancelar | Abierta (etapa 2 del plan) | DB-04, D2/D5 del plan de BD |
| La reactivación de reservas no recomprueba la elegibilidad en BD | Abierta (etapa 2) | DB-05 |
| Procedimientos con transacción propia: auditoría tras el commit, baja no atómica | Abierta (etapa 2) | DB-06 |
| Órdenes de bloqueo distintos entre procedimientos | Sospechada, no reproducida | DB-07 |
| Firmas de versiones anteriores perdidas; `dual_documento_versiones` incompleta y sin lectores | Abierta (etapa 3) | DB-02 |
| Auditoría limitada a 4 entidades (sin empresa, tutores, cupos, convocatorias, cuentas, plantillas) y cancelaciones por cupo sin evento | Abierta (etapa 3) | DB-10, DB-11 |
| Ediciones de `ge_empresas` y tutores sin historial | Abierta | DB-12 |
| Familia de anexo deducida del nombre | Baja prioridad | DB-09 |
| Objetos obsoletos (`calendario`, `dual_empresa_transportes`, `sp_activar_convocatoria`, `sp_asignar_transporte_empresa`, 3 vistas) | Pendiente de exportar y borrar (etapa 4) | DB-15 |
| Índices redundantes (`ix_dual_empresa_tutores_empresa`, `ix_plantilla_tipo`) | Etapa 4 | Auditoría § 3.5 |
| Resueltas en 017 | Ciclo por solicitud (DB-01), un documento actual (DB-03), suelo de cupo (DB-10, parte BD), búsquedas de CIF por índice (DB-08), interbloqueos → 409 (DB-07, parte) | [`DATABASE_STAGE_1_REPORT.md`](../DATABASE_STAGE_1_REPORT.md) |

## 2. Rendimiento

- **Listados sin filtro de convocatoria en SQL**: `GET /reservas`, `GET /solicitudes/empresa/todas`, `GET /solicitudes/alumno` (sin parámetro) y Seguimiento cargan todos los años. Seguimiento construye en memoria todos los documentos esperados y luego filtra y pagina; el panel lo reconstruye en cada carga (`documentos_accion_centro`). Crecen linealmente con los años (auditoría § 7, PM-1). No medido con volúmenes reales.
- Subconsultas correlacionadas por fila (`fn_cupos_disponibles`, últimos eventos de baja, anexo actual por reserva).
- Un Chromium por generación de documento (PM-3).
- Búsquedas `LIKE '%…%'` y en memoria.

## 3. Seguridad y datos personales

Ver [seguridad § 4](seguridad-y-permisos.md#4-riesgos-y-limitaciones-conocidos): cuenta `root` (DB-13), datos sensibles en claro y sin retención (DB-14), sin limitador en formularios públicos (SEC-7), sin verificación de PDF (SEC-9), tokens en `localStorage`, tokens no revocables por cambio de contraseña.

## 4. Funcionales

| Aspecto | Estado |
| --- | --- |
| Efecto del rechazo del convenio de una empresa validada | **D6 abierta** (fase 2): la empresa sigue validada |
| Las empresas suben cupos y añaden ciclos sin aprobación | **D3 aplazada** |
| Preferencias del alumno con catálogo vacío | D9 del plan de BD pendiente |
| No hay alta de usuarios de personal ni gestión de roles en la aplicación | Inserción manual |
| No se puede reactivar un tutor desactivado | Sin endpoint |
| No hay borrado de convocatorias, ofertas ni plantillas | Diseño actual |
| No hay edición de datos del alumno desde el portal | Sin endpoint |
| No se notifica a nadie al reabrir, reactivar, cambiar el tipo de contrato o resolver cambios de datos | Mapeo de notificaciones aprobado en fase 4 |
| El backend no valida el formato del DNI del alumno ni el NSS | Solo el formulario |

## 5. Operación y documentación

- Sin entorno de producción ni guía de despliegue; sin CI.
- Prueba preexistente fallida en el backend (`mail/config: development defaults to log mode`).
- `dual_especialidades` sin fichero de carga en el repositorio.
- Comprobaciones manuales de lectura de pantalla, envío real de correo y revisión del usuario abiertas desde la fase 4 ([`PHASE_4_REPORT.md`](../PHASE_4_REPORT.md)).

## 6. Discrepancias entre documentación existente y código

| Documento | Discrepancia | Comportamiento real |
| --- | --- | --- |
| [`docs/DATABASE_AUDIT.md`](../DATABASE_AUDIT.md) | Describe DB-01, DB-03, DB-08 y la parte BD de DB-10 como problemas abiertos y el `mapSqlError` sin interbloqueos | Resueltos por la migración 017 y la etapa 1 (28/10/2026). La auditoría refleja el estado de `ffede73` |
| [`docs/ROADMAP.md`](../ROADMAP.md) | Las fases figuran «en curso/no completas» y la fase 5 sin estado | Las bajas, la recuperación de contraseña y la etapa 1 de BD (posteriores) están implementadas |
| Comentario de `convocatoriasService.update` | «updates a future (not yet active) convocatoria» | Permite editar cualquier convocatoria no activa, también pasadas |
| Comentario de `authService.getAll` | «admin/coordinador» | La ruta exige ADMINISTRADOR |
| Comentario de `solicitudesAlumnoService` (error del catálogo) | «Ejecuta la migración 008» | La 008 es un script retirado; el catálogo actual viene del baseline |
| Mensaje de `trg_convocatorias_bu_una_activa` | «Use sp_activar_convocatoria…» | El procedimiento no se usa; la activación es por fechas |
| [`db/README.md`](../../db/README.md) y documentos de fase | En inglés | Esta documentación técnica está en español y prevalece en caso de conflicto con el código |

## 7. Pendiente de confirmar

| Cuestión | Por qué no se ha podido confirmar |
| --- | --- |
| Si otras herramientas del centro leen las tablas protegidas o `calendario` | Fuera del repositorio |
| Volúmenes reales por convocatoria y tamaño de ficheros | No hay producción |
| Cuenta de MySQL, zona horaria y despliegue de un futuro entorno real | No hay producción |
| Comportamiento detrás de un proxy inverso (IP del limitador, CORS, servido de la SPA) | No hay configuración de despliegue |
| Uso previsto de `dual_documento_versiones` (pantalla de historial de versiones) | Ningún código la lee |
| Origen de las plantillas de `backend/required_documents/` | No se referencian desde el código |
| Si los interbloqueos sospechados (DB-07) ocurren en la práctica | No reproducidos |
