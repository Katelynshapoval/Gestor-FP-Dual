# Tutores de empresa

> Código: [`empresaTutoresService.js`](../../../backend/src/services/empresaTutoresService.js), ruta [`empresaTutoresRoute.js`](../../../backend/src/routes/empresaTutoresRoute.js). Frontend: [`TutoresEmpresa.jsx`](../../../frontend/src/pages/CompanyView/TutoresEmpresa.jsx), [`TutorAssignSelect.jsx`](../../../frontend/src/components/TutorAssignSelect.jsx). Pruebas: `authorization.test.js`.

## 1. Modelo

Un tutor es un `ge_contactos` vinculado a la empresa por `dual_empresa_tutores` (**por empresa, sin convocatoria**). El coordinador principal es el primer tutor (alta pública; `INSERT IGNORE` en cada reaplicación). Una reserva puede tener un tutor (`dual_reservas.id_empresa_tutor`).

## 2. Resolución de la empresa

`resolveOwnedEmpresaId`: la empresa usa siempre la suya (si indica otra → 403); el personal debe indicar `idEmpresa` en la URL (si no → 400).

## 3. Operaciones

| Operación | Endpoint | Reglas | Efecto |
| --- | --- | --- | --- |
| Listar | `GET /tutores/empresa[/:idEmpresa][?activo=1]` | — | Tutores con datos de contacto y `es_coordinador` (si es coordinador de alguna solicitud de la empresa); activos primero |
| Crear | `POST /tutores/empresa[/:idEmpresa]` | `nombre`, `email`, `telefono` obligatorios; `dni` opcional; `cargo` por defecto «TUTOR EMPRESA» | Bloquea la empresa; crea el contacto en el **domicilio de trabajo de la solicitud más reciente** (o el último domicilio de la empresa; si no hay → 400) y la fila de tutor activa. 201 |
| Editar | `PATCH /tutores/:id` | Solo campos enviados; nombre/email/teléfono no pueden vaciarse; enviar `dni` vacío lo borra. **La empresa no puede editar al coordinador principal** → 403 `COORDINADOR_PRINCIPAL`; el personal sí | `UPDATE ge_contactos` **en el sitio**: cambia lo que muestran todas las reservas, de cualquier convocatoria, con ese tutor. Si el tutor es el coordinador y lo edita el personal, **no** se aplica la copia en escritura de `empresaDatos` |
| Desactivar | `POST /tutores/:id/desactivar` | Misma protección del coordinador para la empresa | `activo = 0` (idempotente). **No** se quita de las reservas que ya lo tienen. **No existe endpoint para reactivar** |
| Asignar a reserva | `PATCH /reservas/:id/tutor { id_empresa_tutor | null }` | Personal o empresa propietaria; reserva no CANCELADA; tutor de **la misma empresa** y **activo**; `null` o `''` lo quita | `UPDATE dual_reservas.id_empresa_tutor` (permitido también en CONFIRMADA). Sin auditoría |

## 4. Interacciones

- El **Anexo II/III generado** incluye nombre, email y teléfono del tutor **en el momento de generar**; asignar o cambiar el tutor después no modifica el PDF (habría que regenerarlo mientras no esté validado).
- Al **reactivar** una reserva cancelada (mismo par o destino de reasignación) el tutor se borra; al **cancelar** se conserva como historial.
- La comprobación «tutor de la misma empresa» solo existe en Node.
