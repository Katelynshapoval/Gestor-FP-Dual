import { sectionLabelClass } from "./ui/cardStyles";
import StatusBadge from "./ui/StatusBadge.jsx";
import EstadoBadge from "./ui/EstadoBadge.jsx";
import BajaControls from "./BajaControls.jsx";
import ResetPasswordButton from "./ResetPasswordButton.jsx";

// «Cuenta» tab of a student or company card (staff): the portal account and
// the participation in the programme. Resetting the password and «Dar de baja»
// are Administración only; coordinators see the same information read-only.
// tipo: "alumno" | "empresa"; s: the list row (estado_validacion, motivo_baja, fecha_baja…).
export default function CuentaPanel({ tipo, idSolicitud, s, usuario, idUsuario, cuentaActiva, nombre, isAdmin, onChanged }) {
  const activa = Number(cuentaActiva) === 1;
  const box = "rounded-lg border border-surface-200 bg-white p-4";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className={box} aria-labelledby={`cuenta-acceso-${idSolicitud}`}>
          <p id={`cuenta-acceso-${idSolicitud}`} className={sectionLabelClass}>
            Acceso al portal
          </p>
          <dl className="m-0 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Usuario</dt>
              <dd className="m-0 font-mono text-charcoal-950">{usuario || "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Cuenta</dt>
              <dd className="m-0">
                {!idUsuario ? (
                  <StatusBadge variant="neutral">Sin cuenta</StatusBadge>
                ) : activa ? (
                  <StatusBadge variant="success">Activa</StatusBadge>
                ) : (
                  <StatusBadge variant="neutral">Desactivada</StatusBadge>
                )}
              </dd>
            </div>
          </dl>
          {isAdmin && idUsuario && activa && (
            <div className="mt-4 border-t border-surface-200 pt-4">
              <ResetPasswordButton idUsuario={idUsuario} nombre={nombre} />
              <p className="mb-0 mt-2 text-xs leading-5 text-muted">
                Genera una contraseña temporal que hay que cambiar al entrar. También se puede pedir un enlace por
                correo desde «¿Has olvidado tu contraseña?» en la pantalla de acceso.
              </p>
            </div>
          )}
        </section>

        <section className={box} aria-labelledby={`cuenta-programa-${idSolicitud}`}>
          <p id={`cuenta-programa-${idSolicitud}`} className={sectionLabelClass}>
            Participación en el programa
          </p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Solicitud</span>
            <EstadoBadge kind="solicitud" value={s.estado_validacion} />
          </div>
          {isAdmin ? (
            <div className="mt-4 border-t border-surface-200 pt-4">
              {s.estado_validacion !== "BAJA" && (
                <p className="mb-3 mt-0 text-xs leading-5 text-muted">
                  Dar de baja cancela sus reservas activas y desactiva la cuenta. Se puede deshacer con «Reactivar».
                </p>
              )}
              <BajaControls tipo={tipo} id={idSolicitud} s={s} nombre={nombre} onChanged={onChanged} />
            </div>
          ) : (
            s.estado_validacion === "BAJA" && (
              <p className="mb-0 mt-3 text-xs leading-5 text-muted">
                Dada de baja{s.motivo_baja ? `. Motivo: ${s.motivo_baja}` : ""}.
              </p>
            )
          )}
        </section>
      </div>
      {!isAdmin && (
        <p className="m-0 text-xs text-muted">Restablecer contraseñas y dar de baja lo hace Administración.</p>
      )}
    </div>
  );
}
