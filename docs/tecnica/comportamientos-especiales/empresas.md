# Comportamientos especiales: datos de empresa, cupos y tutores

> Volver al [índice](README.md). Flujos normales: [solicitudes de empresa](../logica-de-negocio/solicitudes-empresa.md) · [tutores](../logica-de-negocio/tutores-empresa.md).

## Datos de empresa

### Copia en escritura de domicilios y representante
- **Contexto**: `empresaDatos.applyEmpresaDatos` (edición del centro y aprobación de cambios).
- **Condición**: el domicilio o el representante que se edita lo usa también otra solicitud (normalmente de un año anterior, porque la reaplicación reutiliza los ids).
- **Comportamiento**: se **clona** la fila y la solicitud actual pasa a apuntar al clon antes de editarla; las demás conservan los valores antiguos. Si legal y trabajo eran la misma fila: se independiza la del año actual y, si los nuevos valores de trabajo difieren de los legales, se crea una segunda fila para el trabajo.
- **Referencia**: `ensureExclusiveDomicilio`, `cloneDomicilio`.

### Copia inversa del coordinador
- **Comportamiento**: al editar el coordinador, primero se mueven **las otras** solicitudes a un clon congelado y luego se edita la fila original.
- **Motivo**: el usuario EMPRESA y la fila de tutor están ligados al id del contacto original (comentario en `freezeCoordinadorForOtherSolicitudes`).
- **Excepción**: si el personal edita al coordinador desde **Tutores** (`PATCH /tutores/:id`), se modifica en el sitio **sin** copia: cambia también en todas las solicitudes anteriores.

### Datos sin historial
- **Comportamiento**: `ge_empresas` (razón social, CIF, web, teléfono, email, observaciones) y los tutores se editan en el sitio. Las pantallas de años anteriores muestran los valores nuevos; los PDF ya generados conservan los del día.

### Cambio de CIF
- **Comportamiento**: solo el personal (`PUT …/datos`). Se valida el formato y que no lo use otra empresa (409). La empresa no puede pedirlo (403 si `cif` viene en el cuerpo). Tras el cambio, **el login de la empresa pasa a ser el nuevo CIF**.

### Solicitud de cambio pendiente sustituida
- **Condición**: la empresa envía una segunda solicitud de cambio con otra pendiente.
- **Comportamiento**: se **reemplaza** el `payload` de la pendiente (nuevo `snapshot` incluido) y se reinicia su fecha (200, no 201). No queda rastro de la propuesta anterior.
- **Motivo**: índice único `uq_dec_solicitud_pendiente`.

### Conflicto al aprobar
- **Condición**: algún campo propuesto cambió (por el centro u otra aprobación) desde que la empresa envió la propuesta.
- **Comportamiento**: 409 con la lista `conflictos` (original, actual, solicitado) y `requires_confirm: true`. Reintentando con `confirmar_conflicto: true` se aplica lo propuesto sobre lo actual.
- **Referencia**: `empresaDatos.detectConflicts`.

### Aprobación de cambios fuera de la convocatoria activa
- **Comportamiento**: pedir cambios y editar datos exige convocatoria activa, pero **aprobar no**: una propuesta enviada en plazo puede aprobarse después de cerrar la convocatoria y modifica los datos de esa solicitud (y de `ge_empresas`).
- **Motivo**: no documentado.

## Ofertas y cupos

### Reducción de plazas con reservas pendientes
- **Condición**: nueva cantidad < reservas activas (pendientes + confirmadas) y ≥ confirmadas.
- **Comportamiento**: primera llamada → 409 `requires_selection` con las pendientes y cuántas hay que cancelar. Segunda llamada con `confirmar_cancelaciones: true` e `ids_reservas_cancelar` con **exactamente** ese número de pendientes → se cancelan (motivo «Cupo reducido por la empresa.» o «…por administración.») y se cambia la cantidad, todo en una transacción. Si se envían más, menos o ids que no son pendientes de esa oferta → vuelve a 409.
- **Consecuencias**: cada cancelación tiene su evento `CANCELAR` y el cambio de cupo su evento `OFERTA/CUPO` (desde la 018). El coordinador recibe un resumen (con nombre y DNI de cada alumno) y cada alumno un aviso de cancelación.
- **Referencia**: `solicitudesEmpresaService.updateCupoEspecialidad`; `CupoReductionDialog.jsx`.

### Reducción por debajo de las confirmadas
- **Comportamiento**: 400 «No se puede reducir el número de plazas por debajo de los alumnos ya confirmados…». Respaldo en BD: `trg_dsee_bu_cupo`.

### Plazas a cero
- **Comportamiento**: permitido en la edición (`cantidad ≥ 0`), no en el alta. La oferta sigue existiendo (no hay borrado de ofertas) y cuenta para «≥ 1 especialidad» al validar 🔶.

### Ampliar plazas o añadir ciclos con la solicitud validada
- **Comportamiento** (SEC-002): mientras la solicitud **no** está VALIDADO, la empresa puede subir plazas y añadir ciclos activos en la convocatoria activa, sin aprobación. Una vez validada, solo puede **reducir**: subir plazas o añadir un ciclo → 403 `REQUIERE_CENTRO`, y la pantalla oculta «Añadir ciclo» y lo explica. El personal puede ampliar siempre. Nadie puede pasar de `MAX_PLAZAS_POR_CICLO` (20) por ciclo.
- **Motivo**: con la solicitud validada, ampliar le daría acceso a alumnos que el centro no le ofreció.
- **Auditoría**: `OFERTA/ALTA` y `OFERTA/CUPO`.

### Cupos de solicitudes no validadas
- **Comportamiento**: `updateCupoEspecialidad` y `addEspecialidad` no comprueban el estado de la solicitud; solo que sea de la convocatoria activa. El personal podría modificar cupos de una solicitud RECHAZADO o en BAJA 🔶.

## Tutores

### Tutor desactivado que sigue en reservas
- **Comportamiento**: desactivar un tutor no lo quita de sus reservas; las fichas muestran `tutor_activo = 0`. No puede asignarse a reservas nuevas. **No hay forma de reactivarlo** desde la aplicación; habría que crearlo de nuevo (otro contacto) o reactivarlo en BD.

### Tutor creado sin solicitud previa
- **Comportamiento**: el contacto se crea en el domicilio de trabajo de la solicitud más reciente de la empresa; si la empresa no tiene solicitudes, en su último domicilio; si no tiene ninguno → 400.

### El coordinador principal no se gestiona desde Tutores (para la empresa)
- **Comportamiento**: editar o desactivar al coordinador desde Tutores con rol EMPRESA → 403 `COORDINADOR_PRINCIPAL`. Se considera coordinador si lo es de **cualquier** solicitud de la empresa. Debe cambiarse con una solicitud de cambio de datos.

### Asignar tutor no regenera el anexo
- **Comportamiento**: el Anexo II/III generado lleva el tutor del momento de la generación; asignarlo después no lo cambia. Ver [documentos](documentos.md#generar-o-regenerar).
