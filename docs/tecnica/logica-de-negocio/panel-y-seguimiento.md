# Panel y seguimiento documental

> Código: [`panelService.js`](../../../backend/src/services/panelService.js), [`documentosWorkflow.buildStaffList`](../../../backend/src/services/documentosWorkflow.js), [`documentStaffQuery.js`](../../../backend/src/services/documentStaffQuery.js). Frontend: [`Panel.jsx`](../../../frontend/src/pages/Panel/Panel.jsx), [`Seguimiento.jsx`](../../../frontend/src/pages/AdminDocumentsView/Seguimiento.jsx). Pruebas: `phase4.test.js`.

## 1. Seguimiento — `GET /documentos/seguimiento` (personal)

**Qué hace**: lista paginada de **todos los documentos esperados** (existan o no) de solicitudes y reservas, con su estado operativo y quién debe actuar.

**Cómo** (`buildStaffList` + `buildStaffPage`):
1. Carga **todas** las solicitudes de alumno, todas las de empresa y todas las reservas **no canceladas**, de **todas las convocatorias**.
2. Carga sus documentos actuales, firmas y plantillas activas.
3. Genera un elemento por documento esperado y lo proyecta para el centro:
   - por solicitud de alumno: CV y Anexo DGA;
   - por solicitud de empresa: Convenio, Anexo XIV, Anexo G y Excel;
   - por reserva: anexo de su familia (solo si tiene tipo de contrato) y Calendario.
4. Filtra **en memoria** por `convocatoria`, `documento`, `estado`, `alumno`, `empresa`, `especialidad`, `contexto`, `accionPendiente` (`CENTRO`, `ALUMNO`, `EMPRESA`, `NINGUNA`) y `search` (subcadena en alumno, DNI, empresa, CIF y nombre del documento; minúsculas).
5. Ordena: primero los que necesitan acción; luego convocatoria más reciente; luego actividad más reciente (`registrado_en`); desempate estable.
6. Pagina con `pageSize` ∈ {10, 20, 50} (por defecto 10); una página fuera de rango se ajusta a la última.

**Respuesta**: `{ items, pagination, summary: { total, pendientes, accionCentro }, filtros: { convocatorias, documentos, alumnos, empresas, especialidades, estados (con recuento), contextos, acciones } }`. Las opciones de filtro se calculan sobre la convocatoria elegida.

**Coste**: proporcional a todos los años acumulados; no hay filtro en SQL (ver [limitaciones](../limitaciones-y-pendientes.md#2-rendimiento)).

## 2. Panel — `GET /panel/resumen?convocatoria=<id>` (personal)

Convocatoria: la pedida; si no se pide, la activa o, si no hay, la más reciente. Si se pide una inexistente o no hay ninguna → `{ convocatoria: null, contadores: null }`.

| Contador | Cálculo |
| --- | --- |
| `solicitudes_alumno_pendientes` / `solicitudes_empresa_pendientes` | Solicitudes PENDIENTE de la convocatoria |
| `cambios_empresa_pendientes` | `dual_empresa_cambios` PENDIENTE de solicitudes de la convocatoria |
| `documentos_accion_centro` | Total de Seguimiento con `convocatoria` y `accionPendiente = CENTRO` (reconstruye toda la lista) |
| `reservas` | Reservas PENDIENTE de la convocatoria agrupadas por su anexo: `sinTipo` (sin tipo de contrato), `listas` (anexo VALIDADO), `revisar` (PENDIENTE_VALIDACION), `firmas` (PENDIENTE_FIRMA), `documento` (resto: falta subir/generar o rechazado) |

Cada tarjeta del panel abre el listado correspondiente con los filtros ya aplicados en la URL.
