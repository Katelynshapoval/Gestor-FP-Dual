# Tutores de empresa

> Código: [`empresaTutoresService.js`](../../../backend/src/services/empresaTutoresService.js), ruta [`empresaTutoresRoute.js`](../../../backend/src/routes/empresaTutoresRoute.js). Frontend: [`TutoresEmpresa.jsx`](../../../frontend/src/pages/CompanyView/TutoresEmpresa.jsx) (portal de la empresa y, con `idEmpresa`, pestaña «Tutores» de la tarjeta de empresa del personal), [`TutorAssignSelect.jsx`](../../../frontend/src/components/TutorAssignSelect.jsx). Pruebas: `tutores.test.js`, `authorization.test.js`, `tutoresPlantillas.test.jsx`.

## 1. Modelo

Un tutor es un `ge_contactos` vinculado a la empresa por `dual_empresa_tutores` (**por empresa, sin convocatoria**). El coordinador principal es el primer tutor (alta pública; `INSERT IGNORE` en cada reaplicación). Una reserva puede tener un tutor (`dual_reservas.id_empresa_tutor`).

## 2. Resolución de la empresa

`resolveOwnedEmpresaId`: la empresa usa siempre la suya (si indica otra → 403); el personal debe indicar `idEmpresa` en la URL (si no → 400).

## 3. Operaciones

| Operación | Endpoint | Reglas | Efecto |
| --- | --- | --- | --- |
| Listar | `GET /tutores/empresa[/:idEmpresa][?activo=1]` | — | Tutores con datos de contacto, `es_coordinador` (si es coordinador de alguna solicitud de la empresa), `reservas_en_curso` (reservas no CANCELADAS de la convocatoria activa con ese tutor) y `reservas_total`; activos primero |
| Crear | `POST /tutores/empresa[/:idEmpresa]` | `nombre`, `email`, `telefono` obligatorios; `dni` opcional; `cargo` por defecto «TUTOR EMPRESA» | Bloquea la empresa; **409 `EMAIL_REPETIDO`** si otro tutor de la empresa (activo o no) tiene ese email; crea el contacto en el **domicilio de trabajo de la solicitud más reciente** (o el último domicilio de la empresa; si no hay → 400) y la fila de tutor activa. 201 |
| Editar | `PATCH /tutores/:id` | Solo campos enviados; nombre/email/teléfono no pueden vaciarse; enviar `dni` vacío lo borra. **Nadie edita aquí al coordinador principal** → 403 `COORDINADOR_PRINCIPAL` (sus datos van por `empresaDatos`, que aplica la copia en escritura WF-11). Si cambia el email: bloquea la empresa y 409 `EMAIL_REPETIDO` si lo tiene otro tutor | `UPDATE ge_contactos` **en el sitio**: cambia lo que muestran todas las reservas, de cualquier convocatoria, con ese tutor (la pantalla lo avisa) |
| Desactivar | `POST /tutores/:id/desactivar` | La empresa no desactiva a su coordinador (403); el personal sí. **409 `TUTOR_ASIGNADO`** (con `alumnos`) si tiene reservas en curso | `activo = 0` (idempotente). Las reservas antiguas lo conservan. Sin carrera con la asignación: las dos bloquean la fila del tutor y la asignación relee `activo` |
| Reactivar | `POST /tutores/:id/activar` | Mismas reglas de propiedad y coordinador que desactivar | `activo = 1` (idempotente). Evento `TUTOR/ACTIVAR` |
| Asignar a reserva | `PATCH /reservas/:id/tutor { id_empresa_tutor | null }` | Personal o empresa propietaria; reserva no CANCELADA; tutor de **la misma empresa** y **activo**; `null` o `''` lo quita | `UPDATE dual_reservas.id_empresa_tutor` (permitido también en CONFIRMADA; en CANCELADA el trigger lo rechaza). Bloquea solo la reserva. Evento `RESERVA/TUTOR` |

## 4. Interacciones

- El **Anexo II/III generado** incluye nombre, email y teléfono del tutor **en el momento de generar**; asignar o cambiar el tutor después no modifica el PDF (habría que regenerarlo mientras no esté validado).
- Al **cancelar** una reserva el tutor se conserva como historial. Un intento nuevo del mismo par (o el destino de una reasignación) es otra fila y empieza sin tutor.
- Crear, editar, desactivar y reactivar tutores registran eventos `TUTOR` (`ALTA`, `EDITAR` con solo los nombres de los campos, `DESACTIVAR`, `ACTIVAR`).
- Los tutores no se borran: las reservas (`fk_dr_empresa_tutor`) y el historial los referencian, y `ge_contactos` es una tabla compartida en la que la cuenta de la aplicación no tiene DELETE.
- La comprobación «tutor de la misma empresa» solo existe en Node.
