# FP Dual — State transitions (Phase 2)

_Enforced by the backend (`backend/src/services/estadoReglas.js`, plus the procedures and triggers of migration 012). Any other transition returns **400 or 409** through the API. Every row marked 📝 writes one event to `dual_eventos`._

## Student and company applications (`solicitud`)

| From | Action | To | Who | Conditions |
| --- | --- | --- | --- | --- |
| — | Submit | PENDIENTE | Public form / company | Active convocatoria (trigger). |
| PENDIENTE | Validate 📝 | VALIDADO | Staff | **Student:** current CV and Anexo DGA validated (Node and `sp_validar_solicitud_alumno`). **Company:** current CONVENIO validated and at least one ciclo (`sp_validar_solicitud_empresa`). Validating a signed convenio of a PENDIENTE company also validates the application in the same transaction. |
| PENDIENTE | Reject 📝 | RECHAZADO | Staff | A reason is required. |
| RECHAZADO | Reopen 📝 | PENDIENTE | Staff | Active convocatoria only (D7). The rejection reason is cleared from the row; it stays in the audit trail. |
| VALIDADO | — | — | — | No review transition (only Baja below). A rejected convenio does **not** change a validated company (D6 is open). |
| PENDIENTE / VALIDADO / RECHAZADO | Baja 📝 | BAJA | **ADMINISTRADOR** | Phase 5, migration 016. A reason is required; it is kept in the event (the row keeps `motivo` NULL, as the triggers require). In the same transaction the portal account is deactivated (student: its user; company: every EMPRESA user of the company). Afterwards every PENDIENTE or CONFIRMADA reservation of the application is cancelled with `sp_cancelar_reserva_admin` 📝 and the other side is notified. |
| BAJA | Reactivar 📝 | the state before the baja | **ADMINISTRADOR** | Read from the last BAJA event; a RECHAZADO one gets back the reason of its last RECHAZAR event. The account(s) are reactivated. Cancelled reservations are **not** restored. |

## Reservations (`reserva`)

| From | Action | To | Who | Conditions |
| --- | --- | --- | --- | --- |
| — | Reserve 📝 | PENDIENTE | Company (own offer, active convocatoria) / staff | Student and company VALIDADO, same convocatoria and speciality, a free place, no confirmed placement. |
| CANCELADA | Reserve again 📝 | PENDIENTE | Company / staff | Same as above. **WF-4:** the row's documents become non-current (`es_actual = 0`, kept as history), and the contract type and tutor are cleared. |
| PENDIENTE | Set contract type 📝 | PENDIENTE | Staff | Any type while no annex file of the current family is pending or validated (D2). If the current family's annex was rejected, it is moved to history. A change within the same family (for example Contrato ↔ Otro, both Anexo II) is always allowed. |
| PENDIENTE | Confirm 📝 | CONFIRMADA | Staff | A stored contract type is required. A different type in the request is refused. The current annex of that family (III for beca, II otherwise) must have a file, every signature and status VALIDADO (D2). The student's other pending reservations are cancelled 📝. |
| PENDIENTE | Cancel 📝 | CANCELADA | Company (own) / staff | A reason is required. The tutor and documents are kept as history. |
| CONFIRMADA | Cancel 📝 | CANCELADA | Staff | A reason is required. |
| PENDIENTE / CONFIRMADA | Reassign 📝 | origin CANCELADA, destination PENDIENTE | Staff | A different offer with a free place. A reactivated destination row starts clean (WF-4). |
| CONFIRMADA | Set contract type | — | — | Refused. |

## Documents (`documento`)

Review status (`dual_estados_validacion`) and signatures are separate. Only the **current** version (`es_actual = 1`) can be reviewed or signed.

| From | Action | To | Who | Conditions |
| --- | --- | --- | --- | --- |
| no file | Upload / generate 📝 | PENDIENTE | Catalogue uploader / staff (generation) | The SEC-5 upload guard applies. Annexes need the matching contract family. The reservation must not be CANCELADA. The previous file is archived in `dual_documento_versiones`. Every signature is reset. When the uploader is a signer, its signature is recorded as **SUBIDA_FIRMADA** (D1). |
| PENDIENTE | Sign 📝 | PENDIENTE | Each signer role | Method **CONFIRMACION_APP**, with `firmado_por`. Not on a rejected file, and not on a cancelled reservation. |
| PENDIENTE | Validate 📝 | VALIDADO | Staff | The type requires review. **Every applicable signature is present** (D1). Exempt: rows flagged `firmas_exentas_legacy` by migration 013 only. |
| PENDIENTE / VALIDADO | Reject 📝 | RECHAZADO | Staff | A reason is required. The file must be current. |
| RECHAZADO | Upload again 📝 | PENDIENTE | Uploader | New version. |
| VALIDADO | Upload again | — | — | Refused unless the catalogue allows replacement (`replaceIfValidated`). |
| RECHAZADO | Validate | — | — | Refused: the file must be replaced first. |

**Signatures are attestations, not cryptographic checks.** `SUBIDA_FIRMADA` means "the signer uploaded a file and declares it carries their signature". `CONFIRMACION_APP` means "the signer pressed *Firmar* in the app". Staff still review the file. PDF signature verification is Phase 5 (SEC-9).
