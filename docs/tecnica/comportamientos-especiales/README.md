# Comportamientos especiales, excepciones y casos límite

> Parte de la [documentación técnica](../README.md). Lo que **no** es el camino feliz: reglas condicionales, valores ausentes, repeticiones, fallos parciales y concurrencia. Los flujos normales están en [lógica de negocio](../logica-de-negocio/README.md); los casos límite de autenticación, convocatorias y bajas están al final de sus documentos.

Cada caso indica **condición**, **comportamiento** y, cuando consta, **motivo**, **consecuencias** y **referencia** (fichero o función). 🔶 = inferido del código; ❓ = pendiente de confirmar.

| Documento | Casos |
| --- | --- |
| [Solicitudes](solicitudes.md) | Alumno con y sin cuenta · DNI sin validar en backend · ciclo de la ficha frente al de la solicitud · alta de empresa sin plantilla · empresa validada sin rechazo posible · convenio rechazado de empresa validada · reapertura fuera de plazo |
| [Datos de empresa, cupos y tutores](empresas.md) | Copia en escritura y sus excepciones · conflictos en cambios · cambio pendiente sustituido · reducción de cupo con selección · tutor desactivado en reservas |
| [Reservas](reservas.md) | Reservar dos veces · reactivación de filas · pérdida del tipo de contrato al cancelar · cambio de familia de anexo · reasignación desde confirmada · confirmación concurrente · calendario no exigido |
| [Documentos y firmas](documentos.md) | Firmas reiniciadas por cada fichero · firma declarada al subir · exención heredada · rechazo de un documento validado · documentos de reservas canceladas · regeneración · subidas simultáneas |
| [Fallos, transacciones y servicios externos](fallos-y-concurrencia.md) | Auditoría perdida tras commit · interbloqueos · errores no mapeados (500) · correo caído · Chromium o plantilla rota |
