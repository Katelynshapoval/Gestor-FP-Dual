# Adaptación al esquema final — FP Dual

## 1. Tablas legacy usadas actualmente (a eliminar)

| Tabla | Usada en |
|-------|---------|
| `AuxiliarAlumno` | `dualStudentsService` |
| `AuxiliarEmpresa` / `auxiliarempresa` | `companyRequestService`, `linkingService`, `reservasService` |
| `gestiondual` | `linkingService`, `evaluationService`, `reservasService` |
| `evaluacion` | `evaluationService` |
| `especialidad` | `specialitiesService`, `linkingService` |
| `preferencia` | `preferencesService` |
| `posiblestransportes` | `possibleTransportsService` |
| `reservas` | `reservasService`, `linkingRoute` |
| `peticionempresa` | `linkingService` |
| `alumnospedidos` | `linkingService` |
| `users` | `usersService` |
| `userscourses` | `usersService` |
| `estadodual` | `linkingService` |
| `tipocontrato` | `linkingService` |

## 2. Endpoints actuales y su propósito

### Rutas legacy (activas en `routes/index.js`)

| Método | Ruta | Propósito |
|--------|------|-----------|
| POST | `/getPreferencesBySpeciality` | Preferencias filtradas por especialidad |
| POST | `/getUserByEmail` | Login Google (inseguro, decodifica JWT client-side) |
| POST | `/loginWithCredentials` | Login empresa por username/CIF |
| POST | `/changePassword` | Cambio de contraseña |
| GET | `/getAllSpecialities` | Lista de especialidades |
| GET | `/getAllPossibleTransports` | Lista de transportes |
| POST | `/addStudent` | Alta de candidatura de alumno |
| POST | `/addCompanyRequest` | Alta de solicitud de empresa |
| POST | `/updateConvenio/:id` | Subida de convenio (URL pública) |
| GET | `/getConvenioFile/:id` | Descarga de convenio (admin) |
| POST | `/validateConvenio/:id` | Validación de convenio |
| POST | `/reapplyCompanyRequest` | Reaplicación de empresa |
| GET | `/getAllCompanies` | Lista de empresas (admin) |
| POST | `/resetPassword/:id` | Reset de contraseña empresa |
| POST | `/getEvaluationByManagementId` | Obtener evaluación (por idGestion) |
| POST | `/createEvaluation` | Crear evaluación |
| POST | `/updateEvaluation` | Actualizar evaluación |
| POST | `/linkStudents` | Listar candidaturas (admin/empresa) |
| POST | `/getCompanyRequests` | Listar solicitudes empresa disponibles |
| POST | `/sendMail` | Enviar info candidato a empresa |
| POST | `/updateCompany1–3` | Asignar empresa a slot 1, 2 o 3 |
| POST | `/reserveStudent` | Reservar alumno (empresa) |
| POST | `/unreserveStudent` | Cancelar reserva (empresa) |
| POST | `/reservationDoc/:idGestion` | Subir documento firmado de reserva |
| GET | `/reservationDoc/:idGestion/:idAuxEmpresa` | Descargar doc firmado |
| GET | `/getAllReservations` | Listar todas las reservas (admin) |
| GET | `/linkStudents/:id/cv\|anexo2\|anexo3` | Descargar documentos |
| GET | `/linkStudents/:id/:type/validate` | Validar documento |

## 3. Mapeo legacy → nuevo esquema

### Flujo alumno
| Legacy | Nuevo |
|--------|-------|
| `AuxiliarAlumno` | `gf_alumnosfct` + `dual_solicitudes_alumno` |
| `idGestion` | `id_solicitud_alumno` |
| CV en blob de `AuxiliarAlumno` | `dual_documentos` (tipo CV) |
| Anexo2 en blob de `AuxiliarAlumno` | `dual_documentos` (tipo ANEXO_2) |
| `preferencia` + 3 selectores | `dual_preferencias` + `dual_solicitud_preferencias` (patch) |
| Estado validación numérico | `dual_estados_validacion.nombre` |

### Flujo empresa
| Legacy | Nuevo |
|--------|-------|
| `AuxiliarEmpresa` | `ge_empresas` + `ge_domicilios` + `ge_contactos` + `dual_solicitudes_empresa` |
| `idAuxEmpresa` | `id_solicitud_empresa` |
| `especialidadYCantAlumnos` (JSON) | `dual_solicitud_empresa_especialidades` |
| `metodosTransporte` (CSV/JSON) | `dual_empresa_transportes` |
| Convenio blob en `AuxiliarEmpresa` | `dual_documentos` (tipo CONVENIO) |
| Login por CIF como username | `dual_usuarios.email` resuelto vía CIF join chain |

### Flujo vinculación / reservas
| Legacy | Nuevo |
|--------|-------|
| 3 slots fijos (`idEmpresa1/2/3`) | `dual_reservas` (dinámico) |
| `estadoDual1/2/3` (numérico) | `dual_estados_reserva.nombre` |
| `tipocontrato` | `dual_tipos_contrato` |
| `reservas.documentoFirmado` | `dual_documentos` (tipo ANEXO_H, padre = reserva) |

### Evaluaciones
| Legacy | Nuevo |
|--------|-------|
| `evaluacion.idGestion` | `dual_evaluaciones.id_solicitud_alumno` |
| `notaMedia`, `idiomas`, etc. | `nota_media`, `idiomas`, etc. |
| `fecha` (en tabla evaluacion) | No existe en nuevo esquema → patch añade `updated_at` |

### Autenticación
| Legacy | Nuevo |
|--------|-------|
| Client-side `atob()` de token Google | Verificación server-side con `google-auth-library` |
| `users` tabla | `dual_usuarios` |
| `userscourses` | Sin equivalente directo → gap documentado |
| Login empresa por username=CIF | `dual_usuarios` resuelto por CIF vía join |

## 4. Diferencias semánticas relevantes

- **Reservas dinámicas**: El modelo antiguo limita a 3 empresas por alumno con slots fijos. El nuevo modelo es ilimitado (pero la unicidad alumno→confirmada es garantizada por la BD).
- **Convocatorias**: El nuevo modelo tiene `dual_convocatorias.activa` como referencia de la convocatoria vigente. El código antiguo usaba el año natural.
- **Capacidad**: `fn_cupos_disponibles` y `fn_reservas_activas` son funciones de BD necesarias para `vw_cupos_empresa_disponibles`. No están en el dump → añadidas en el patch.
- **Estado de documentos**: El nuevo modelo usa `dual_estados_validacion` (PENDIENTE/VALIDADO/RECHAZADO) por nombre, no por ID numérico hardcodeado.

## 5. Gaps del esquema y cómo se resuelven

| Gap | Resolución |
|-----|-----------|
| Preferencias de alumno sin tabla en esquema final | `db/after_schema_patch.sql`: tablas `dual_preferencias` y `dual_solicitud_preferencias` |
| `fn_reservas_activas`, `fn_cupos_disponibles` ausentes del dump | `db/after_schema_patch.sql`: implementación de las funciones |
| Stored procedures referenciados pero no en dump | `db/after_schema_patch.sql`: todos los SPs necesarios |
| `updated_at` ausente en `dual_evaluaciones` | `db/after_schema_patch.sql`: columna `updated_at` con `ON UPDATE CURRENT_TIMESTAMP` |
| URL pública de convenio usaba ID ofuscado aritmético | `db/after_schema_patch.sql`: tabla `dual_convenio_tokens` para tokens seguros |
| `userscourses` (especialidades del tutor) sin equivalente | No replicado: los tutores ven todas las solicitudes. Documentado como limitación. |
| `calendario` ligado a alumno+empresa directa | Preservado: el calendario se accede por `idAlumno`+`idEmpresa`, que se derivan de la reserva confirmada |

## 6. Migraciones aditivas requeridas

Todas en `db/after_schema_patch.sql`:

- `dual_preferencias` — catálogo de preferencias por especialidad
- `dual_solicitud_preferencias` — preferencias elegidas por el alumno en su solicitud
- `dual_convenio_tokens` — tokens seguros para subida pública de convenio
- `dual_evaluaciones.updated_at` — fecha de última actualización de evaluación
- `fn_reservas_activas(id_solicitud_empresa_especialidad)` — cuenta reservas activas
- `fn_cupos_disponibles(id_solicitud_empresa_especialidad)` — calcula plazas libres
- `sp_activar_convocatoria`, `sp_guardar_documento`, `sp_validar_*`, `sp_rechazar_*`, `sp_guardar_evaluacion`, `sp_asignar_transporte_empresa`, `sp_reservar_alumno`, `sp_cancelar_reserva`, `sp_confirmar_reserva` — procedimientos almacenados

## 7. Archivos frontend modificados y motivo

| Archivo | Motivo |
|---------|--------|
| `utils/api.js` | Añadir helpers con cabecera JWT, getJSON, getBlob |
| `globales/User.js` | Almacenar token JWT en el contexto de usuario |
| `pages/Login.js` | Verificación Google server-side; login empresa por CIF/email; forced password change |
| `pages/AddDualStudent/index.js` | Usar `/especialidades`, `/preferencias`, `/solicitudes/alumno` |
| `pages/AddCompanyRequest/index.js` | Usar `/especialidades`, `/transportes`, `/solicitudes/empresa` |
| `pages/CompanyView/index.js` | Usar `/solicitudes/empresa/mia`, `/reservas/empresa`, `/documentos/:id/descargar` |
| `pages/CompanyView/MisReservas.jsx` | API de reservas nueva; subida de ANEXO_H vía `/documentos/reserva/:id/anexoh` |
| `pages/AdminCompanyView/AdminCompanyView.jsx` | Usar `/solicitudes/empresa`, `/reservas`, nuevos formatos de datos |
| `pages/AdminCompanyView/components/CompanyCard.jsx` | Datos normalizados en lugar de JSON legacy |
| `pages/AdminCompanyView/components/ConvenioViewer.jsx` | Usar `/documentos/:id/descargar` con auth |
| `pages/AdminCompanyView/components/ReservasAdmin.jsx` | Nueva forma de datos de reservas |
| `pages/AdminCompanyView/components/ReservaDocViewer.jsx` | Usar `/documentos/:id/descargar` con auth |
| `pages/AdminCompanyView/helpers.js` | `parseEspecialidades` ahora recibe array normalizado |
| `pages/LinkStudents/hooks/useLinkStudents.js` | Reescritura completa con modelo de reservas dinámico |
| `pages/LinkStudents/components/StudentCard.jsx` | Usa `id_solicitud_alumno` en lugar de `idGestion`; reservas dinámicas |
| `pages/LinkStudents/components/student-card/EmpresaControl.jsx` | Reemplaza slots fijos por reservas dinámicas |
| `pages/LinkStudents/components/student-card/Documentos.jsx` | Usar nuevos IDs de documento |
| `pages/LinkStudents/components/student-card/Evaluacion.jsx` | Usa `id_solicitud_alumno` para navegar a evaluación |
| `components/Evaluation.js` | Usar `/evaluaciones/:idSolicitudAlumno` |
| `App.js` | Añadir ruta `/convocatorias` |
| `pages/AddConvenio.js` | Usar token seguro en lugar de ID ofuscado |

## 8. Limitaciones conocidas

- **Especialidades del tutor**: En el sistema legacy, `userscourses` limitaba qué candidaturas veía cada tutor según su especialidad asignada. El esquema final no tiene esta relación normalizada. Actualmente los tutores/coordinadores ven todas las candidaturas validadas.
- **Mail config**: La configuración de correo no está en el repositorio. Los envíos de email fallan silenciosamente (logeado en servidor).
- **Google OAuth Client ID**: Debe configurarse en variable de entorno `GOOGLE_CLIENT_ID`.
- **Funciones BD**: `fn_reservas_activas` y `fn_cupos_disponibles` no están en el dump original. Deben ejecutarse desde `db/after_schema_patch.sql` antes de usar `vw_cupos_empresa_disponibles`.
