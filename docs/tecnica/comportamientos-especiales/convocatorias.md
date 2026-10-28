# Comportamientos especiales: convocatorias

> Volver al [índice](README.md). Flujo normal en [convocatorias](../logica-de-negocio/convocatorias.md).

### Desfase de hasta 15 minutos al cambiar de día
- **Contexto**: cualquier operación que usa `getActiveConvocatoria` (altas públicas, reaplicación) o `c.activa = 1` en SQL.
- **Condición**: el día en que empieza o termina una convocatoria, entre la medianoche (zona horaria de MySQL) y la siguiente sincronización.
- **Comportamiento**: esas operaciones leen el indicador almacenado, que solo cambia al sincronizar (cada 15 min o al abrir una pantalla que llame a `GET /convocatorias*`). Durante ese intervalo pueden aceptarse solicitudes en la convocatoria que acaba de terminar o rechazarse en la que acaba de empezar 🔶. El trigger `trg_dsa_bi_reglas` comprueba el mismo indicador, así que no lo evita.
- **Referencia**: [`convocatoriasService.js`](../../../backend/src/services/convocatoriasService.js), [`dbHelpers.getActiveConvocatoria`](../../../backend/src/helpers/dbHelpers.js).
- **Ejemplo**: fin el 30/06. A las 00:05 del 01/07 nadie ha abierto la portada y el último intervalo fue a las 23:55: un alumno puede enviar su solicitud a la convocatoria cerrada hasta las 00:10.

### Sin convocatoria activa
- **Comportamiento**: altas públicas → 409 «…El plazo de solicitud está cerrado.»; reaplicar → 409 `SIN_CONVOCATORIA`; `GET /convocatorias/activa` → 404; las empresas no ven alumnos disponibles ni pueden reservar; el personal **sí** puede seguir validando, reservando (`/reservas/admin`), confirmando y gestionando documentos de convocatorias pasadas. No se pueden editar datos de empresa ni cupos (todo exige activa).

### Edición de una convocatoria pasada
- **Condición**: `PUT /convocatorias/:id` sobre una convocatoria terminada.
- **Comportamiento**: se permite (solo se prohíbe editar la activa). Si las nuevas fechas incluyen hoy y no se solapan con otra, la sincronización la **reactiva**.
- **Motivo**: el comentario del código dice «future»; la implementación no lo exige. Discrepancia.
- **Consecuencias**: reabrir una convocatoria pasada reactiva su ventana de edición (reaplicar, reabrir, cupos…).

### Convocatorias solapadas heredadas
- **Comportamiento**: si varias contienen hoy, se activa la de `fecha_inicio` más reciente (desempate por id). La creación y la edición ya no permiten solapes (409).
- **Referencia**: prueba `phase3.test.js` (WF-3).

### Nombre duplicado
- **Comportamiento**: índice único → 409 `DUPLICADO` «Ya existe un registro con esos datos.».
