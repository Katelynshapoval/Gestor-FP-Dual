# Corrección de la auditoría de seguridad

**Fecha:** 28 de octubre de 2026 · **Rama:** `security-fixes` (sale de `remove-preferencias`) · **Informe:** [security-audit.md](security-audit.md)

No hay migraciones: ningún cambio toca el esquema de `proyecto_dual`.

| ID | Estado | Qué se ha hecho |
|---|---|---|
| SEC-001 | Corregido | Si el DNI ya tiene ficha y no tiene cuenta, el formulario público responde 401 y no crea la cuenta, no escribe la ficha ni abre la solicitud. El DNI/NIE se valida en el servidor. |
| SEC-002 | Corregido (sin cambio de esquema) | Con la solicitud `VALIDADO`, la empresa ya no puede añadir ciclos ni subir plazas (403 `REQUIERE_CENTRO`). Sí puede reducirlas. Administración y coordinación pueden seguir ampliando. Máximo de plazas por ciclo: `MAX_PLAZAS_POR_CICLO` (20 por defecto). La pantalla de empresa oculta «Añadir ciclo» cuando la solicitud está validada. |
| SEC-003 | Corregido en parte | Las dos altas públicas tienen límite por IP (10/hora) y un límite global (300/día), configurables. `TRUST_PROXY` fija los saltos de proxy. **Pendiente:** la cuenta de empresa sigue activa desde el alta. Hasta que el centro la valida no ve alumnos, y con SEC-002 ya no puede ampliar después. El límite sigue en memoria, para un solo proceso. |
| SEC-004 | Corregido | Los comandos `<< >>` de las plantillas solo resuelven nombres de variable (`razonSocial`, `$fila.codigo`). No se ejecuta JavaScript (`runJs` propio, sin `node:vm`). Chromium genera el PDF sin JavaScript y sin red: se cancela cualquier petición que no sea `data:`. |
| SEC-005 | Corregido (backend) | `npm audit --omit=dev` en el backend da 0 avisos. Actualizados: mysql2 3.24, multer 2.5, express 4.22, nodemailer 10.2, morgan 1.12, puppeteer 25, bcrypt 6 y docx-templates 4.15. Eliminadas las dependencias que no se usaban: body-parser, crypto-browserify, google-auth-library y soffice. Los avisos del frontend (cadena de `react-scripts`) siguen como deuda de construcción. |
| SEC-006 | Corregido | El JWT lleva una huella del hash de la contraseña, y `requireAuth` lo rechaza si ya no coincide. Cambiar, restablecer o reasignar la contraseña cierra las sesiones anteriores, y `changePassword` devuelve un token nuevo. Algoritmo fijado a HS256. |
| SEC-007 | Corregido | Cabeceras `nosniff`, `X-Frame-Options`, `Referrer-Policy` y una CSP restrictiva. HSTS cuando la petición es HTTPS. Sin `X-Powered-By`. En producción, Morgan no registra la query. Límite de 100 KB en los cuerpos JSON y URL-encoded. |
| SEC-008 | Corregido | Cada PDF subido tiene que llevar la firma `%PDF-`. La descarga se sirve como `attachment`, y la SPA ya la lee como blob. |
| SEC-009 | Corregido | `forgotPassword` da la misma respuesta 200 en todos los casos. El alta de alumno usa un único mensaje para todos los rechazos de identidad. Se mantiene el 409 por CIF repetido en el alta de empresa (sirve para no duplicar empresas). |
| SEC-010 | Corregido en parte | TLS opcional hacia MySQL (`DBSSL`, `DBSSL_CA`). **Pendiente, fuera del código:** cuenta de MySQL con privilegio mínimo (no `root`), cifrado del disco y de los backups, y cifrado por columna si el centro lo exige. |
| SEC-011 | Corregido en parte | El HTML del manual pasa por DOMPurify. **Pendiente:** llevar la sesión a una cookie `HttpOnly` con CSRF. Es un rediseño de la sesión y queda para un cambio aparte. |
| SEC-012 | Corregido | El nombre y el tipo de la descarga de plantillas los genera el servidor (`plantilla-<clave>-v<n>.docx`). Se limpia el nombre original y se comprueba la firma ZIP al subir. |
| SEC-013 | Corregido | `seedDemo.js` genera contraseñas aleatorias en `backend/.demo.local.json` (ignorado por Git), sin correos personales (`DEMO_ADMIN_EMAIL` y `DEMO_COORD_EMAIL`). |

## Efectos al desplegar

- Todas las sesiones abiertas caducan una vez: los tokens anteriores no llevan la huella de la contraseña.
- Una ficha de alumno sin cuenta ya no puede darse de alta desde el formulario. Hoy no hay ninguna con solicitud. Si apareciera, el portal todavía no tiene una pantalla para que administración cree la cuenta.
- Si se vuelve a cargar la demo, las contraseñas ya no son el identificador: están en `backend/.demo.local.json`.
