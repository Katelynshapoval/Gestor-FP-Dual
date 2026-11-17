# Limitaciones conocidas

> Parte de la [documentación técnica](README.md). Lo que el sistema no hace, o hace de una forma concreta que conviene conocer. Las medidas de seguridad y sus límites están en [seguridad y permisos](seguridad-y-permisos.md#4-límites-conocidos).

## 1. Datos e integridad

| Tema | Cómo es |
| --- | --- |
| Reservas anteriores a la 018 | Desde la 018 cada intento de reserva es una fila nueva y una cancelada conserva su tipo de contrato. Las filas anteriores no se reescribieron: en la base de desarrollo hay 7 reservas canceladas sin tipo de contrato y una reserva con documentos de dos intentos |
| Deshacer la 018 | Solo es posible antes del primer reintento de un par alumno–oferta y del primer evento `OFERTA` o `TUTOR`; después, solo restaurando una copia |
| Ficheros sustituidos | Al subir o generar un fichero nuevo, el anterior y sus firmas no se guardan |
| Convenio heredado (026) | Guarda su propia copia del PDF del convenio original: un PDF por empresa y año |
| Auditoría (`dual_eventos`) | Registra solicitudes, reservas, documentos, ofertas, tutores, cuentas (altas, cambios, bajas y contraseñas temporales de todos los roles), correos, tipos de documento y firmas. No registra los cambios de datos de empresa, convocatorias, ciclos ni plantillas |
| Historial de empresas y tutores | `ge_empresas` y los tutores se editan en la misma fila: no guardan versiones anteriores |
| Familia del anexo | Se deduce del nombre del tipo de contrato: si contiene «beca», Anexo III; si no, Anexo II (`documentCatalogue.familiaContrato` y `sp_confirmar_reserva`) |
| Tabla `calendario` | No la usa esta aplicación. Se conserva sin cambios |

## 2. Rendimiento

- `GET /reservas`, `GET /solicitudes/empresa/todas`, `GET /solicitudes/alumno` (sin parámetro) y Seguimiento cargan todos los años. Seguimiento construye en memoria los documentos esperados y después filtra y pagina. El coste crece con cada curso acumulado.
- Subconsultas correlacionadas por fila: últimos eventos de baja y anexo actual por reserva. Las plazas salen de la vista `vw_plazas_oferta`: un recuento por oferta.
- Cada generación de documento arranca un Chromium.
- Las búsquedas usan `LIKE '%…%'` o se hacen en memoria.

## 3. Funcionamiento

| Tema | Cómo es |
| --- | --- |
| Rechazar el convenio de una empresa ya validada | El convenio pasa a RECHAZADO y la solicitud de empresa sigue VALIDADO |
| Plazas y ciclos de una empresa | Mientras su solicitud no está validada, la empresa sube plazas y añade ciclos sin aprobación del centro. Validada, solo puede reducirlas. Máximo `MAX_PLAZAS_POR_CICLO` (20) por ciclo (SEC-002) |
| Ficha de alumno sin cuenta (importada) | No puede darse de alta desde el formulario público (SEC-001) y el portal no tiene pantalla para que Administración le cree la cuenta |
| Tutores desactivados | No hay endpoint para reactivarlos |
| Borrado | No se borran convocatorias, ofertas ni plantillas |
| Datos del alumno | Administración los edita directamente; el alumno pide la corrección desde el portal (020). Solo en la convocatoria activa |
| Avisos por correo | No se envían al reabrir, reactivar, cambiar el tipo de contrato ni al resolver cambios de datos de **empresa** (los de alumno sí) |
| Convenio subido por la empresa antes de generarlo el centro | El portal no lo ofrece («en preparación por el centro»); `POST /documentos/subir` y `/documentos/empresa/:id/convenio` lo aceptan |
| «Generar convenios pendientes» | Se ejecuta dentro de la petición HTTP, sin cola ni indicador de progreso: con muchas solicitudes puede superar el tiempo de espera de un proxy |
| NSS del alumno | Su formato se valida en el formulario. El DNI/NIE se valida también en el backend (SEC-001) |
| Marcas de firma | Una plantilla sin `<<firmaEmpresa>>`, `<<firmaCentro>>`, `<<firmaAlumno>>` o `<<firmaTutorLegal>>` recibe las firmas en una «Hoja de firmas» al final. Documentos › Plantillas avisa de las marcas que faltan |
| Plantillas de convenio y anexos | No están en el repositorio: se suben en Documentos › Plantillas. Sin plantilla activa, esos documentos no se generan |
| Firma del centro | Una sola imagen (firma y sello) para todo el personal, que sube ADMINISTRADOR en Configuración › Firma del centro |

## 4. Operación

- Despliegue con Docker Compose ([`DESPLIEGUE.md`](../DESPLIEGUE.md)) y CI en GitHub Actions: pruebas del backend (unitarias y de base de datos), del frontend y de extremo a extremo.
- La zona horaria del servidor es `Europe/Madrid` (la fija `docker-compose.yml`); `CURDATE()` decide qué convocatoria está activa.
- Detrás de Caddy (HTTPS) y nginx, la API recibe la IP del cliente con `TRUST_PROXY=1`; los límites de intentos se aplican por esa IP.
- Las migraciones 025, 026 y 028 tienen prueba de base de datos propia (aplicar, reglas, deshacer, volver a aplicar); la 027 se comprobó a mano en `_verify`.
- Los ciclos (`dual_especialidades`) se gestionan en Configuración › Ciclos; el repositorio no trae ninguno.
- No se ha probado la aplicación con un lector de pantalla ni con envío de correo real a buzones externos.
