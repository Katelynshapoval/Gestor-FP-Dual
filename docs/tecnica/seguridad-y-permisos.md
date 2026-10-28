# Seguridad y permisos

> Parte de la [documentación técnica](README.md). Flujo de autenticación en [autenticación y cuentas](logica-de-negocio/autenticacion-y-cuentas.md).

## 1. Capas de control de acceso

1. **`requireAuth`**: token válido y cuenta activa con el mismo rol en BD; bloqueo por cambio de contraseña pendiente.
2. **`requireRole(...)`** en cada ruta: lista de roles admitidos.
3. **Propiedad en el servicio**: la empresa solo accede a lo de su empresa (`getCompanyIdFromUser`), el alumno a lo suyo (`getStudentIdFromUser`). Funciones: `resolveSolicitudForUser`, `resolveOwnedEmpresaId`, `assertCanUpload`, `canDownloadDocumento`, comprobaciones en `getDetalle`, `cancelar`, `firmarContexto`, `assignToReserva`.
4. **Catálogo de documentos**: quién sube, firma, revisa o ve cada tipo.
5. **Frontend**: `RequireRole` y menús por rol. **No es seguridad**: solo evita mostrar pantallas inútiles.

## 2. Matriz de permisos por funcionalidad

| Funcionalidad | ADMIN | COORD | EMPRESA | ALUMNO | Público |
| --- | :-: | :-: | :-: | :-: | :-: |
| Enviar solicitud de alumno / empresa | | | | | ✔ |
| Reaplicar la empresa | | | ✔ | | |
| Ver/validar/rechazar/reabrir solicitudes | ✔ | ✔ | | | |
| Dar de baja / reactivar | ✔ | | | | |
| Crear/editar convocatorias | ✔ | | | | |
| Ver convocatorias (lista) | ✔ | ✔ | | | estado y activa |
| Editar datos de empresa directamente | ✔ | ✔ | | | |
| Pedir cambio de datos | | | ✔ propia | | |
| Aprobar/rechazar cambios | ✔ | ✔ | | | |
| Añadir ciclos / cambiar cupos | ✔ | ✔ | ✔ propia | | |
| Tutores (crear, editar, desactivar) | ✔ | ✔ | ✔ propia (no el coordinador) | | |
| Asignar tutor a reserva | ✔ | ✔ | ✔ propia | | |
| Ver alumnos disponibles | | | ✔ | | |
| Reservar | ✔ (`/admin`) | ✔ (`/admin`) | ✔ ofertas propias | | |
| Cancelar reserva | ✔ (pendiente o confirmada) | ✔ | ✔ propia, pendiente | | |
| Reasignar, tipo de contrato, confirmar | ✔ | ✔ | | | |
| Ficha de reserva | ✔ | ✔ | ✔ propia | ✔ propia | |
| Subir documentos | según catálogo | según catálogo | según catálogo | CV/Anexo DGA propios | |
| Firmar | GESTOR | GESTOR | EMPRESA | ALUMNO | |
| Validar/rechazar documentos | ✔ | ✔ | | | |
| Generar documentos | ✔ | ✔ | | | |
| Subir plantillas | ✔ | | | | |
| Ver/descargar plantillas | ✔ | ✔ | | | |
| Seguimiento y panel | ✔ | ✔ | | | |
| Contraseña temporal, `/usuarios` | ✔ | | | | |
| Alta, edición, baja y reactivación de personal | ✔ | | | | |

## 3. Medidas implementadas

| Medida | Detalle | Referencia |
| --- | --- | --- |
| Secreto JWT obligatorio | ≥ 32 caracteres; se rechaza el antiguo secreto del repositorio; sin él el servidor no arranca | `middleware/auth.js`, `index.js` |
| Estado de cuenta por petición | Desactivación y cambio de rol efectivos en la siguiente petición | `requireAuth` |
| Cambio de contraseña seguro | Contraseña actual obligatoria salvo cambio forzado leído de BD | `authService.changePassword` |
| Contraseñas | bcrypt coste 10; mínimo 8 caracteres en todos los caminos | `authService`, altas, recuperación |
| Limitación de intentos | Login, formulario de alumno con cuenta, recuperación | `loginRateLimit.js` |
| Recuperación de contraseña | No envía el enlace si la cuenta no existe, está desactivada o no tiene correo. El enlace es de un solo uso y va ligado al hash; la clave es distinta de la de sesión | `passwordResetService.js` |
| Formulario público sin sobrescritura | Alumno existente: o prueba su contraseña o solo se rellenan campos vacíos; empresa existente: 409 | `solicitudesAlumnoService`, `solicitudesEmpresaService` |
| Coordinador protegido | La empresa no lo edita desde Tutores | `empresaTutoresService` |
| Guarda única de subidas | Tipo, rol, propiedad, estado de reserva, familia, no reemplazar validados | `documentosService.assertCanUpload` |
| Plantillas solo ADMINISTRADOR | `docx-templates` ejecuta código de la plantilla | `documentosRoute` |
| Escapado en correos | `escapeHtml` en todas las interpolaciones | `notificaciones.js` |
| Minimización | Sin DNI, teléfonos ni motivo de cancelación en correos; alumnos sin motivo libre; `/usuarios` solo admin | varios |
| SQL parametrizado | En todos los servicios | — |
| Auditoría inmutable | `dual_eventos` con triggers que impiden modificarla | migración 013 |
| Credenciales fuera del repositorio | `.env` ignorado; `mail/config.js` lee del entorno; `backups/` y `.pruebas.local.json` ignorados | `.gitignore` |

## 4. Riesgos y limitaciones conocidos

| Riesgo | Situación | Dónde |
| --- | --- | --- |
| Conexión a MySQL como `root` | Confirmado en desarrollo; rutinas y vistas `SQL SECURITY DEFINER` con `root` | BD |
| Datos personales sensibles en claro | `numeroSS`, fecha de nacimiento, DNI del tutor legal en `gf_alumnosfct` (tabla protegida); ficheros con DNI y firmas como BLOB sin cifrado a nivel de aplicación | BD |
| Sin retención ni anonimización | No se puede borrar a nadie (FK `RESTRICT` + auditoría inmutable) | BD |
| Tokens en `localStorage` | Accesibles a cualquier script de la página (riesgo XSS) 🔶 | `UserContext.js` |
| Tokens no revocables por cambio de contraseña | Ver [autenticación § 3](logica-de-negocio/autenticacion-y-cuentas.md#3-validación-de-cada-petición--requireauth) | `requireAuth` |
| Sin límite de envíos en formularios públicos | El alta de empresa y el alta de alumno nuevo no tienen limitador ni anti-automatización | formularios públicos |
| Validación de PDF por MIME declarado | Sin inspección de contenido ni verificación de firmas | `multer` |
| Sin cabeceras de seguridad ni CORS explícito | No hay `helmet`, CSP ni configuración CORS; depende del proxy de despliegue 🔶 | `index.js` |
| `trust proxy` sin configurar | Afecta a la IP del limitador detrás de un proxy 🔶 | `index.js` |
| Contraseña temporal de alumnos y empresas sin auditoría | El reseteo de personal sí queda en `dual_eventos` (`USUARIO`). El de alumnos y empresas no. Ver [autenticación § 6](logica-de-negocio/autenticacion-y-cuentas.md#6-contraseña-temporal--post-usuariosidresetpassword-administrador) | `authService.resetPassword` |
| Firmas no criptográficas | `CONFIRMACION_APP` / `SUBIDA_FIRMADA` son atestaciones | migración 013 |

No se han encontrado credenciales en el código versionado; `backend/.env.example` solo contiene nombres de variables.
