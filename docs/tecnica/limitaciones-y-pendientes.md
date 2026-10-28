# Limitaciones conocidas y aspectos pendientes

> Parte de la [documentación técnica](README.md).

## 1. Integridad y modelo de datos

| Limitación | Estado |
| --- | --- |
| Filas de reserva reutilizadas; el tipo de contrato se pierde al cancelar | Abierta |
| La reactivación de reservas no recomprueba en BD que las solicitudes sigan VALIDADO | Abierta |
| Procedimientos con transacción propia: la auditoría se escribe tras el commit y la baja no es atómica | Abierta |
| Órdenes de bloqueo distintos entre procedimientos (posibles interbloqueos) | Sospechada, no reproducida |
| Firmas de versiones anteriores perdidas; `dual_documento_versiones` incompleta y sin lectores | Abierta |
| Auditoría limitada a solicitudes, reservas, documentos y bajas (sin empresa, tutores, cupos, convocatorias, cuentas ni plantillas); las cancelaciones por reducción de cupo no generan evento | Abierta |
| Las ediciones de `ge_empresas` y de tutores no guardan historial | Abierta |
| Familia de anexo deducida del nombre del tipo de contrato | Baja prioridad |
| Objetos obsoletos: `calendario`, `dual_empresa_transportes`, `sp_activar_convocatoria`, `sp_asignar_transporte_empresa`, 3 vistas, índices `ix_dual_empresa_tutores_empresa` e `ix_plantilla_tipo` | Pendiente de exportar y borrar |

## 2. Rendimiento

- `GET /reservas`, `GET /solicitudes/empresa/todas`, `GET /solicitudes/alumno` (sin parámetro) y Seguimiento cargan todos los años; Seguimiento construye en memoria los documentos esperados y luego filtra y pagina. Crecen con los años; no se ha medido con volúmenes reales.
- Subconsultas correlacionadas por fila (`fn_cupos_disponibles`, últimos eventos de baja, anexo actual por reserva).
- Un Chromium por generación de documento.
- Búsquedas `LIKE '%…%'` y en memoria.

## 3. Seguridad y datos personales

Ver [seguridad § 4](seguridad-y-permisos.md#4-riesgos-y-limitaciones-conocidos).

## 4. Funcionales

| Aspecto | Estado |
| --- | --- |
| Rechazo del convenio de una empresa ya validada | La empresa sigue VALIDADO; sin decidir |
| Las empresas suben cupos y añaden ciclos sin aprobación del centro | Comportamiento actual |
| Preferencias del alumno | El catálogo está vacío, así que el formulario no las muestra |
| Alta de usuarios de personal y gestión de roles | Solo por inserción manual en BD |
| Reactivar un tutor desactivado | Sin endpoint |
| Borrado de convocatorias, ofertas o plantillas | No existe |
| Edición de datos del alumno desde el portal | Sin endpoint |
| Aviso por correo al reabrir, reactivar, cambiar el tipo de contrato o resolver cambios de datos | No se envía |
| Formato del DNI y NSS del alumno | Solo se valida en el formulario, no en el backend |

## 5. Operación

- Sin entorno de producción, guía de despliegue ni CI.
- Una prueba del backend falla de forma preexistente (`mail/config: development defaults to log mode`).
- `dual_especialidades` no tiene fichero de carga en el repositorio.
- Pendientes de comprobar: lectura de pantalla con lector de pantalla y envío real de correo.

## 6. Discrepancias entre comentarios del código y comportamiento

| Dónde | Dice | Hace |
| --- | --- | --- |
| `convocatoriasService.update` | «updates a future (not yet active) convocatoria» | Permite editar cualquier convocatoria no activa, también pasadas |
| `authService.getAll` | «admin/coordinador» | La ruta exige ADMINISTRADOR |
| `solicitudesAlumnoService` (error del catálogo) | «Ejecuta la migración 008» | La 008 es un script retirado; el catálogo viene del baseline |
| Mensaje de `trg_convocatorias_bu_una_activa` | «Use sp_activar_convocatoria…» | El procedimiento no se usa; la activación es por fechas |

## 7. Pendiente de confirmar

| Cuestión | Motivo |
| --- | --- |
| Si otras herramientas del centro leen las tablas protegidas o `calendario` | Fuera del repositorio |
| Volúmenes reales y tamaño de ficheros; cuenta de MySQL, zona horaria y despliegue de un entorno real | No hay producción |
| Comportamiento detrás de un proxy inverso (IP del limitador, CORS, servido de la SPA) | No hay configuración de despliegue |
| Uso previsto de `dual_documento_versiones` | Ningún código la lee |
| Origen de las plantillas de `backend/required_documents/` | No se referencian desde el código |
