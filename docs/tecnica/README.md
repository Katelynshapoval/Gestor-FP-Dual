# Documentación técnica de FP Dual

Referencia técnica interna del portal FP Dual: arquitectura, modelo de datos, reglas de negocio, comportamientos especiales, API y operación. Describe **cómo funciona realmente** el sistema según el código, las migraciones y las pruebas del repositorio, con la base de datos en la migración 028. Las medidas de seguridad, incluidas las de la auditoría SEC-001 a SEC-013, están en [seguridad y permisos](seguridad-y-permisos.md).

## Cómo leer esta documentación

- Cada afirmación describe el código, las migraciones o las pruebas del repositorio, con referencia al fichero o función.
- Si esta documentación contradice el código, **prevalece el código**.

## Índice

### Arquitectura
- [Visión general](arquitectura/vision-general.md): qué es, tecnologías, topología, organización del repositorio, roles.
- [Componentes](arquitectura/componentes.md): módulos del backend y del frontend, dependencias entre servicios, patrones de código.
- [Flujos de datos](arquitectura/flujos-de-datos.md): diagramas de secuencia de los procesos principales.

### Base de datos
- [Visión general](base-de-datos/vision-general.md): motor, capas, tablas protegidas, estados, inventario, herramientas.
- [Modelo de datos](base-de-datos/modelo-de-datos.md): tablas y columnas con su significado.
- [Relaciones](base-de-datos/relaciones.md): diagramas ER, cardinalidades, relaciones implícitas, copia en escritura, borrado e impacto de cambios.
- [Integridad y transacciones](base-de-datos/integridad-y-transacciones.md): restricciones, funciones, procedimientos, triggers, transacciones, bloqueos y consultas clave.
- [Migraciones](base-de-datos/migraciones.md): sistema, historia 012–027, compatibilidad y despliegue.

### Lógica de negocio
- [Resumen, máquinas de estado y reglas transversales](logica-de-negocio/README.md)
- [Autenticación y cuentas](logica-de-negocio/autenticacion-y-cuentas.md) · [Convocatorias](logica-de-negocio/convocatorias.md) · [Solicitudes de alumno](logica-de-negocio/solicitudes-alumno.md) · [Solicitudes de empresa](logica-de-negocio/solicitudes-empresa.md) · [Tutores](logica-de-negocio/tutores-empresa.md) · [Reservas](logica-de-negocio/reservas.md) · [Documentos y firmas](logica-de-negocio/documentos-y-firmas.md) · [Baja y reactivación](logica-de-negocio/baja-y-reactivacion.md) · [Panel y seguimiento](logica-de-negocio/panel-y-seguimiento.md)

### Comportamientos especiales
- [Índice](comportamientos-especiales/README.md)
- [Solicitudes](comportamientos-especiales/solicitudes.md) · [Empresas, cupos y tutores](comportamientos-especiales/empresas.md) · [Reservas](comportamientos-especiales/reservas.md) · [Documentos](comportamientos-especiales/documentos.md) · [Fallos y concurrencia](comportamientos-especiales/fallos-y-concurrencia.md)

### API e integraciones
- [Convenciones, errores e integraciones externas](api-e-integraciones/README.md)
- [Referencia de endpoints](api-e-integraciones/referencia-endpoints.md)
- [Correo electrónico y notificaciones](api-e-integraciones/correo-electronico.md)

### Transversales
- [Procesos, scripts y pruebas](procesos/README.md)
- [Seguridad y permisos](seguridad-y-permisos.md)
- [Configuración](configuracion.md)
- [Decisiones técnicas](decisiones-tecnicas.md)
- [Limitaciones conocidas](limitaciones.md)

## Búsqueda rápida

| Busco… | Ir a |
| --- | --- |
| Una tabla o columna | [Modelo de datos](base-de-datos/modelo-de-datos.md) |
| Por qué una operación devuelve 400/409 | [Mapeo de errores](api-e-integraciones/README.md#mapeo-de-errores-sql), [triggers](base-de-datos/integridad-y-transacciones.md#4-triggers) y el documento de su dominio |
| Quién puede hacer algo | [Matriz de permisos](seguridad-y-permisos.md#2-matriz-de-permisos-por-funcionalidad) |
| Qué pasa al cancelar/confirmar/reasignar una reserva | [Reservas](logica-de-negocio/reservas.md), [casos especiales](comportamientos-especiales/reservas.md) |
| Por qué falta una firma o no se puede validar un documento | [Documentos y firmas](logica-de-negocio/documentos-y-firmas.md), [casos especiales](comportamientos-especiales/documentos.md) |
| Qué correo se envía y a quién | [Correo](api-e-integraciones/correo-electronico.md#3-eventos-y-destinatarios) |
| Qué se audita | [`dual_eventos`](base-de-datos/modelo-de-datos.md#dual_eventos-013) y [quién es dueño de cada transacción](base-de-datos/integridad-y-transacciones.md#51-quién-es-dueño-de-cada-transacción) |
| Cómo aplicar una migración | [Migraciones](base-de-datos/migraciones.md) y [`db/README.md`](../../db/README.md) |
| Qué afecta a qué | [Impacto de los cambios](base-de-datos/relaciones.md#54-impacto-de-los-cambios-más-comunes) |

## Glosario

| Término | Significado en el código |
| --- | --- |
| Convocatoria | Curso académico del programa (`dual_convocatorias`); solo una activa, por fechas |
| Solicitud | Participación de un alumno (`dual_solicitudes_alumno`) o empresa (`dual_solicitudes_empresa`) en una convocatoria |
| Oferta | Ciclo y número de plazas de una solicitud de empresa (`dual_solicitud_empresa_especialidades`, `id_solicitud_empresa_especialidad`, `idOferta`) |
| Ciclo / especialidad | Ciclo formativo con turno (`dual_especialidades`) |
| Reserva | Asignación de una solicitud de alumno a una oferta (`dual_reservas`) |
| Plazas ocupadas | Reservas PENDIENTE + CONFIRMADA de una oferta |
| Tipo de contrato / familia | Beca → Anexo III; resto → Anexo II |
| Documento actual | `es_actual = 1`; los demás son historial |
| Estado de revisión / estado operativo | `id_estado_validacion` del documento / estado derivado de fichero + revisión + firmas |
| GESTOR / Centro | ADMINISTRADOR o COORDINADOR actuando como firmante o revisor |
| Personal | ADMINISTRADOR o COORDINADOR |
| Coordinador principal | Contacto de la empresa ligado a su usuario EMPRESA (`id_coordinador_empresa`); también tutor |
| Baja | Retirada del programa por Administración (estado `BAJA`) |
| Tablas protegidas | `ge_empresas`, `ge_domicilios`, `ge_contactos`, `gf_alumnosfct`: las comparten otras aplicaciones del centro, así que su estructura no se modifica |
| Copia en escritura | Clonar datos compartidos entre convocatorias antes de editarlos |

## Otra documentación

- [`docs/MANUAL_DE_USUARIO.md`](../MANUAL_DE_USUARIO.md): manual de uso por rol. La aplicación lo muestra en la página **Ayuda** (`/ayuda`), así que lo que se cambie aquí se ve allí sin tocar el código.
- [`db/README.md`](../../db/README.md): operación de migraciones, copias y verificación (en inglés).

## Mantenimiento de esta documentación

- Al añadir una migración: actualizar [migraciones](base-de-datos/migraciones.md), el [modelo de datos](base-de-datos/modelo-de-datos.md) y, si cambia un procedimiento o trigger, [integridad](base-de-datos/integridad-y-transacciones.md).
- Al añadir o cambiar un endpoint: [referencia de endpoints](api-e-integraciones/referencia-endpoints.md), la [matriz de permisos](seguridad-y-permisos.md) y el documento del dominio.
- Al cambiar una regla de `estadoReglas.js` o del catálogo: el documento del dominio y sus [casos especiales](comportamientos-especiales/README.md).
- Cuando cambia una limitación: actualizar [limitaciones](limitaciones.md) y el documento del dominio.
- Al editar el manual de usuario: cada capítulo (`##`) y cada apartado al que se quiera enlazar (`###`) necesita su `<a id="…"></a>` justo antes; sin él, la página Ayuda no lo trata como capítulo ni lo encuentra el buscador. Si se renombra un ancla, revisar los `href` de [`faq.js`](../../frontend/src/pages/Ayuda/faq.js). Las capturas van en `docs/manual/imagenes/` y se enlazan como `manual/imagenes/<archivo>`.
