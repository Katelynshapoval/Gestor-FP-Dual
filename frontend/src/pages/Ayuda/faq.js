// Short answers for the help page. The long form is the user manual.
export const FAQ = [
  {
    q: "He olvidado la contraseña",
    a: "En Acceder, pulsa «¿Has olvidado tu contraseña?», escribe tu usuario (correo, CIF o DNI/NIE) y abre el enlace que llega al correo. Caduca en 30 minutos y solo sirve una vez. La pantalla responde siempre lo mismo; el enlace solo llega si la cuenta existe, está activa y tiene un correo asociado.",
    href: "#recuperar",
  },
  {
    q: "No me reconoce el usuario o no me llega el correo",
    a: "El usuario depende del perfil: correo para el personal del centro, CIF para la empresa y DNI/NIE para el alumno. Si acabas de presentar la solicitud, usa el mismo identificador. Revisa también la carpeta de spam. Si sigue sin funcionar, habla con el centro.",
    href: "#faq-contrasena",
  },
  {
    q: "No puedo entrar",
    a: "«Credenciales incorrectas» es usuario o contraseña. Tras varios fallos hay que esperar unos minutos. «La cuenta está desactivada» significa que el centro tiene que reactivarla. Si la sesión caduca (unas 8 horas), vuelve a entrar: lo guardado no se pierde.",
    href: "#no-puedes-entrar",
  },
  {
    q: "El plazo está cerrado y no puedo enviar la solicitud",
    a: "Las solicitudes solo se admiten con una convocatoria activa. Con el plazo cerrado el formulario indica cuándo empieza la próxima. Quien ya participa puede entrar al portal para consultar su situación.",
    href: "#plazo",
  },
  {
    q: "Ya presenté la solicitud este curso",
    a: "Solo hay una solicitud por convocatoria. El alumno entra al portal y sustituye los documentos si todavía no están validados. La empresa entra con el CIF: si ya participó otros años, usa «Participar en la nueva convocatoria» y no el formulario público.",
    href: "#situaciones-especiales",
  },
  {
    q: "Me han rechazado un documento o el convenio",
    a: "El estado Rechazado incluye el motivo. Hay que corregirlo y subir un archivo nuevo. Un documento rechazado no se puede firmar ni validar hasta que se sustituye. El convenio de la empresa, cuando el centro lo valida, es lo que valida la solicitud.",
    href: "#faq-documentos",
  },
  {
    q: "¿Una reserva es ya la plaza definitiva?",
    a: "No. Reserva pendiente significa que una empresa está interesada. La plaza es definitiva cuando el centro confirma la reserva, con el anexo firmado por empresa, alumno y centro y validado. Un alumno puede tener varias reservas pendientes a la vez.",
    href: "#faq-plazas",
  },
  {
    q: "No puedo reservar a un alumno",
    a: "Puede ser porque la solicitud de la empresa aún no está validada, porque no quedan plazas en ese ciclo o porque el alumno ya tiene una plaza confirmada en otra empresa. Con la solicitud validada, la empresa solo puede reducir plazas: para ampliarlas hay que pedírselo al centro.",
    href: "#faq-plazas",
  },
  {
    q: "Uno de mis datos es incorrecto",
    a: "El alumno lo pide desde «Mis datos», en «Mi solicitud», con «Solicitar corrección»; la empresa, con «Editar datos». En los dos casos el centro revisa la petición antes de aplicarla. El DNI/NIE y el CIF no se pueden cambiar.",
    href: "#alumno-datos",
  },
  {
    q: "¿Qué anexo me toca y por qué no aparece?",
    a: "Lo decide el centro al indicar el tipo de contrato. Beca es el Anexo III; el resto, el Anexo II. Hasta que no está indicado el tipo, el anexo no aparece. Confirmar la reserva exige el anexo firmado por los tres y validado. El calendario no hace falta para confirmar.",
    href: "#faq-anexos",
  },
  {
    q: "No puedo cambiar un documento que ya está validado",
    a: "Validado significa que el centro ya lo ha aceptado. No se puede sustituir (salvo el calendario). Si hay que corregirlo, hay que hablar con el centro. Pendiente o rechazado sí se puede reemplazar.",
    href: "#faq-documentos",
  },
  {
    q: "Me han dado de baja",
    a: "La cuenta queda desactivada y al entrar verás ese aviso. Las reservas activas se cancelan. Administración puede reactivar la solicitud, pero las reservas canceladas no vuelven solas. Si eres un alumno de una empresa dada de baja, tu solicitud sigue abierta para otras empresas.",
    href: "#baja",
  },
  {
    q: "¿Puedo usarlo en el móvil? ¿Qué archivos valen?",
    a: "Sí. Los documentos que se suben son PDF, de 10 MB como máximo. Las plantillas del centro son DOCX. Para leer un PDF en el móvil suele ir mejor abrirlo en una pestaña nueva.",
    href: "#situaciones-especiales",
  },
];

export const PERFILES = [
  { href: "#administrador", title: "Administración", text: "Convocatorias, personal, validaciones, reservas y plantillas." },
  { href: "#coordinador", title: "Coordinación", text: "Casi lo mismo que Administración. Aquí están las diferencias." },
  { href: "#empresa", title: "Empresa", text: "Convenio, plazas, reservas, tutores y firmas." },
  { href: "#alumno", title: "Alumno", text: "Candidatura, documentos, firma del anexo y corrección de datos." },
];
