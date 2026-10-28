# Comportamientos especiales, excepciones y casos límite

> Parte de la [documentación técnica](../README.md). Referencia central de todo lo que **no** es el camino feliz: reglas condicionales, valores ausentes, repeticiones, fallos parciales, concurrencia y decisiones no evidentes.

## Formato de cada caso

Cada caso se describe con estos apartados:

- **Contexto**: funcionalidad o módulo.
- **Condición**: cuándo ocurre.
- **Comportamiento**: qué hace exactamente el sistema.
- **Motivo**: solo si consta en código, comentarios o informes; si no, se indica «no documentado».
- **Consecuencias**: datos, procesos o pantallas afectados.
- **Referencia**: ficheros, funciones, procedimientos o pruebas.
- **Ejemplo**, cuando ayuda.

Salvo que se marque 🔶 (inferido) o ❓ (pendiente de confirmar), el comportamiento está confirmado por el código o por pruebas.

## Índice por dominio

| Documento | Casos |
| --- | --- |
| [Autenticación y cuentas](autenticacion.md) | Orden de resolución del identificador · cuenta desactivada con contraseña correcta · sesiones tras cambio de contraseña · limitador en memoria y proxy · recuperación sin APP_URL · contraseña temporal sin auditoría · cambio de rol |
| [Convocatorias](convocatorias.md) | Desfase de hasta 15 min · edición de convocatorias pasadas · solapamientos heredados · sin convocatoria activa |
| [Solicitudes](solicitudes.md) | Alumno con y sin cuenta · DNI sin validar en backend · ciclo de la ficha frente al de la solicitud · preferencias inválidas · alta de empresa sin plantilla · DNI de contactos sin normalizar · empresa validada sin rechazo posible · convenio rechazado de empresa validada · reapertura fuera de plazo |
| [Datos de empresa, cupos y tutores](empresas.md) | Copia en escritura y sus excepciones · conflictos en cambios · cambio pendiente sustituido · aprobación fuera de plazo · reducción de cupo con selección · cupos de solicitudes no validadas · transportes inválidos · tutor desactivado en reservas · edición de tutores sin historial |
| [Reservas](reservas.md) | Reservar dos veces · reactivación de filas · pérdida del tipo de contrato al cancelar · cambio de familia de anexo · reasignación desde confirmada · confirmación concurrente · reservas del personal en convocatorias cerradas · calendario no exigido |
| [Documentos y firmas](documentos.md) | Firmas reiniciadas por cada fichero · firma declarada al subir · documentos generados sin firmas · exención heredada · rechazo de un documento validado · documentos de reservas canceladas · regeneración · descarga del convenio por el alumno · subidas simultáneas · plantilla con versión duplicada |
| [Bajas](bajas.md) | Desactivación global de cuentas · cancelaciones parciales · reactivación sin reservas ni plazo · BAJA sin migración |
| [Fallos, transacciones y servicios externos](fallos-y-concurrencia.md) | Auditoría perdida tras commit · interbloqueos · errores no mapeados (500) · correo caído · Chromium o plantilla rota · ventanas entre comprobación y bloqueo |

## Preguntas frecuentes → dónde está la respuesta

| Pregunta | Respuesta |
| --- | --- |
| ¿Qué pasa si falta la especialidad de un alumno? | [solicitudes § ciclo](solicitudes.md#ciclo-de-la-ficha-frente-al-ciclo-de-la-solicitud) y trigger `trg_dsa_bi_reglas` |
| ¿Qué pasa si un usuario repite una reserva? | [reservas § reservar dos veces](reservas.md#reservar-dos-veces-el-mismo-par) |
| ¿Qué pasa si se repite una firma? | [documentos § firma repetida](documentos.md#firma-repetida) |
| ¿Por qué se pierde el tipo de contrato de una reserva cancelada? | [reservas § tipo de contrato](reservas.md#el-tipo-de-contrato-se-pierde-al-cancelar) |
| ¿Qué pasa si falla el correo? | [fallos § correo](fallos-y-concurrencia.md#el-servidor-de-correo-falla) |
| ¿Qué pasa si no hay plantilla activa? | [solicitudes § alta sin plantilla](solicitudes.md#alta-de-empresa-sin-plantilla-de-convenio) y [documentos § regeneración](documentos.md#generar-o-regenerar) |
| ¿Cuándo se bloquea editar datos de empresa? | [empresas](empresas.md#aprobación-de-cambios-fuera-de-la-convocatoria-activa) y [lógica de negocio § reglas transversales](../logica-de-negocio/README.md#reglas-transversales) |
| ¿Qué pasa si la reserva ya está en otro estado? | [reservas](reservas.md) y [`docs/STATE_TRANSITIONS.md`](../../STATE_TRANSITIONS.md) |
| ¿Qué partes se ven afectadas por un cambio? | [relaciones § impacto](../base-de-datos/relaciones.md#54-impacto-de-los-cambios-más-comunes) |
