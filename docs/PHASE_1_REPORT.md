# FP Dual — Phase 1 Report: Critical security and blocked workflows

_Branch `phase-1-security-workflows` · 2026-10-27 · companion to [ROADMAP.md](ROADMAP.md) and [AUDIT.md](AUDIT.md)._

**Status: implemented except V-1 and V-2, which are blocked on database checks. Phase 1 is not complete yet.** Every other item is in code, covered by unit/API tests (no database) and, for the screens, by a browser smoke test against a mock API. Nothing has run against a real MySQL database, so the end-to-end acceptance criteria still need the manual checks in section 5.

## 1. Business decisions taken

| Decision | Choice | Effect |
| --- | --- | --- |
| SEC-3: an existing DNI submits the public form | **Prove identity** | With a portal account, the form password must be the current one; then data is updated. Without an account, stored data is kept and only empty fields are filled. |
| WF-3: how the active convocatoria is chosen | **Automatic by dates** | The server syncs `activa` from `fecha_inicio`/`fecha_fin`; overlapping ranges are rejected. |
| SEC-1: local secret | **Generated** | A random `JWT_SECRET` was appended to your local, git-ignored `backend/.env` (value never displayed). |

## 2. Progress tracker

Legend: ✅ completed and tested (no-DB tests + build/lint; see §4) · 🟡 implemented, not fully verified · ⛔ blocked · ⬜ not started.

| ID | Item | Status | Notes |
| --- | --- | --- | --- |
| SEC-1 | Mandatory `JWT_SECRET`, no fallback | ✅ | Refuses to start if missing, <32 chars or equal to the old committed secret; tokens signed with the old fallback rejected. **Production rotation is yours to do** (see §6). |
| SEC-2 | Current password; server-side forced change | ✅ | `currentPassword` required unless `must_change_password = 1` (read from DB). While the flag is set only `/auth/me` and `/auth/changePassword` work. Login stores no session before the forced change. New *Cambiar contraseña* page. |
| SEC-8 | `activo` / role / flag checked per request | ✅ | One indexed query per authenticated request. Disabled → 401 `ACCOUNT_DISABLED`; role changed → 401 `SESSION_STALE`. |
| SEC-7 (part) | Login attempt limiter | ✅ | In memory, no dependency: 5 failures per IP+identifier, 30 per IP, 15-minute window → 429 with `Retry-After`. Also applied to the student-form password check. |
| SEC-3 | Public form no longer overwrites students | ✅ | See decision above. Duplicate-application check now runs before any write. |
| SEC-4 | Principal coordinator protected | ✅ | EMPRESA gets 403 `COORDINADOR_PRINCIPAL` on edit/deactivate; list exposes `es_coordinador`; UI marks it and hides the buttons. Staff keep direct edit (same as `PUT …/datos`). |
| SEC-5 | One upload guard | ✅ | `assertCanUpload` used by `/documentos/subir`, `/documentos/reserva/:id/anexo`, `/documentos/empresa/:id/convenio`, `/documentos/alumno/:id/:tipo`. |
| SEC-6 | Template upload ADMINISTRADOR-only | ✅ | Route and Plantillas screen. Coordinators can still list/download. |
| WF-1 | Contract type reachable | ✅ code, 🟡 E2E | Inline `TipoContratoSelect` on every pending reservation (Empresas colaboradoras › Reservas and the student card in Enlazar). Full path to “Confirmada” needs the DB (§5). |
| V-1 | Student validation | ⛔ | Needs `SHOW CREATE PROCEDURE sp_validar_solicitud_alumno` and `dual_tipos_documento`. If confirmed, the fix is a procedure change (migration, needs approval). |
| V-2 | Preference tables | ⛔ | Needs `SHOW TABLES LIKE 'dual_%preferencias'`. Draft `db/migrations/011_preferencias_alumno.sql` is ready, **not applied**. |
| WF-2 | Company re-application reachable | ✅ code, 🟡 E2E | `GET /solicitudes/empresa/mia?incluir_anteriores=1` + portal card. Needs a DB with a past-year company to verify fully. |
| WF-3 | Reliable activation | ✅ code, 🟡 E2E | Transactional sync at startup, every 15 min and on reads; date validation and overlap check on create/update. Uses MySQL `CURDATE()`, so the DB server's time zone decides the switch time. |
| V-5 | Track `mail/config.js` | ✅ | `.gitignore` narrowed; the file holds no secrets. |
| WF-10 | Reset button by role | ✅ | Only ADMINISTRADOR sees it; the temporary password hides after 2 min or with *Ocultar*. |
| WF-13 | Student form submit lock | ✅ | Locks while sending, resets all state and file inputs, message adapts via `cuenta_existente`. |
| — | `.env.example` | ✅ | `backend/.env.example`, names only. |
| — | Written test script | ✅ | §5 below. |

## 3. Changes by area

**Authentication** (`middleware/auth.js`, `middleware/loginRateLimit.js` (new), `services/authService.js`, `routes/authRoute.js`, `index.js`)
- `getJwtSecret()` is read lazily; `assertJwtConfig()` runs before the server starts.
- `requireAuth` is now async and reloads `activo`, `rol` and `must_change_password`. `requireAuthAllowPasswordChange` is used only by `/auth/me` and `/auth/changePassword`.
- Login checks the password before the `activo` flag, so the response no longer reveals whether a deactivated account exists.
- `changePassword` also rejects a new password equal to the current one.

**Workflows** (`reservasService`, `solicitudesAlumnoService`, `solicitudesEmpresaService`, `convocatoriasService`)
- `GET /reservas` and `GET /solicitudes/alumno?include=full` now also return `id_tipo_contrato` (additive).
- `getMia` without the flag behaves exactly as before (so *Enlazar* is unchanged). With `incluir_anteriores=1` it adds `convocatoria_activa`, `convocatoria_abierta` and `puede_reaplicar`.
- `syncConvocatoriaActiva()` replaces `autoActivar()`. It locks the rows, deactivates first and then activates one, so the one-active trigger cannot fire. On overlapping legacy ranges, the most recent start date wins. Failures are logged.

**Authorization** (`solicitudesAlumnoService.create`, `empresaTutoresService`, `documentosService`, `documentosRoute`)
- The upload guard checks, in order: the type, the catalogue upload permission for the role, that the parent exists and belongs to the caller, the reservation state and contract family, and the “validated cannot be replaced unless `replaceIfValidated`” rule.

**Frontend**
- New: `components/TipoContratoSelect.jsx`, `pages/CambiarPassword.jsx` (route `/cambiarPassword`, menu item *Cambiar contraseña*).
- Changed: `Login.js`, `App.js`, `Header.js`, `ReservasAdmin.jsx`, `ReservaDocViewer.jsx`, `EmpresaControl.jsx`, `CompanyView/index.js`, `TutoresEmpresa.jsx`, `Plantillas.jsx`, `AdminCompanyView.jsx`, `CompanyCard.jsx`, `AddDualStudent/index.js`.
- *Reservas* list groups: *Documentos pendientes de validación* · *Documento validado · pendientes de confirmar* (new; these rows were previously in no group) · *Pendientes de tipo de contrato o documento* (now includes rejected annexes) · *Asignaciones definitivas* · *Canceladas*.

**Configuration and tests**
- `backend/.env.example`; `.gitignore`; `backend/src/mail/config.js` tracked.
- `npm test` in `backend/` runs Node's built-in test runner (no new dependency). Tests live in `backend/test/`. They stub the pool, bcrypt and the mailer, so they never touch a database or send email.
- `db/migrations/011_preferencias_alumno.sql`: draft, not applied.

### Behaviour changes users will notice
- Everyone is logged out once when the secret changes.
- A user with a temporary password cannot use the app until they set a new one.
- Staff (COORDINADOR/ADMINISTRADOR) can no longer upload Anexo II/III or Convenio through the direct endpoints. The catalogue gives them *review* only, and the UI never offered this. If the centre needs to upload a paper-signed annex, that is a catalogue change to decide.
- A company can no longer replace a **validated** convenio or annex.
- A returning student must type their **current** portal password in the public form.
- Convocatorias with overlapping dates can no longer be created or saved.

### Affected files (34)
`.gitignore`, `backend/.env.example`, `backend/package.json`, `backend/src/index.js`, `backend/src/mail/config.js`, `backend/src/middleware/auth.js`, `backend/src/middleware/loginRateLimit.js`, `backend/src/routes/authRoute.js`, `backend/src/routes/documentosRoute.js`, `backend/src/services/authService.js`, `backend/src/services/convocatoriasService.js`, `backend/src/services/documentosService.js`, `backend/src/services/empresaTutoresService.js`, `backend/src/services/reservasService.js`, `backend/src/services/solicitudesAlumnoService.js`, `backend/src/services/solicitudesEmpresaService.js`, `backend/test/auth.test.js`, `backend/test/authorization.test.js`, `backend/test/helpers/harness.js`, `backend/test/workflows.test.js`, `frontend/src/App.js`, `frontend/src/components/TipoContratoSelect.jsx`, `frontend/src/components/layout/Header/Header.js`, `frontend/src/pages/AddDualStudent/index.js`, `frontend/src/pages/AdminCompanyView/AdminCompanyView.jsx`, `frontend/src/pages/AdminCompanyView/components/CompanyCard.jsx`, `frontend/src/pages/AdminCompanyView/components/ReservaDocViewer.jsx`, `frontend/src/pages/AdminCompanyView/components/ReservasAdmin.jsx`, `frontend/src/pages/AdminDocumentsView/Plantillas.jsx`, `frontend/src/pages/CambiarPassword.jsx`, `frontend/src/pages/CompanyView/TutoresEmpresa.jsx`, `frontend/src/pages/CompanyView/index.js`, `frontend/src/pages/LinkStudents/components/student-card/EmpresaControl.jsx`, `frontend/src/pages/Login.js`; plus `db/migrations/011_preferencias_alumno.sql` (draft) and these docs. Local only (git-ignored): `backend/.env` (`JWT_SECRET` added).

## 4. Verification performed

| Check | Result |
| --- | --- |
| `cd backend && npm test` (node:test, 30 tests: SEC-1/2/3/4/5/6/8, limiter, WF-1/2/3) | **30/30 pass** |
| Server start without/with weak `JWT_SECRET` | Exits with code 1 and a clear message (both cases) |
| `node --check` on every backend source file | Pass |
| ESLint (project config, `--max-warnings 0`) on every changed frontend file | 0 warnings |
| `CI=true react-scripts build` (warnings fail the build) | Compiled successfully |
| Browser smoke test: built frontend + mock API, Chromium, 1280 px and 360 px | 16/16 checks pass: forced change stores no session before the change and sends both passwords; *Cambiar contraseña* page and menu; contract-type select, stored type preselected, POST sent; new *validado · pendientes de confirmar* group; coordinator sees no template upload; company with a past application sees the notice and re-apply card and no *Editar datos*; coordinator tutor marked without buttons; no horizontal overflow at 360 px |

**Not verified** (needs a running MySQL with your schema): every SQL statement against the real tables, triggers and procedures; the full reservation path to *Confirmada*; the activation switch against `trg_convocatorias_bu_una_activa`; re-application with real data; V-1 and V-2.

**Found while testing (pre-existing, not changed):** `frontend/package-lock.json` is out of sync with `package.json` (`npm ci` fails: missing `yaml@2.9.1`). Run `npm install` in `frontend/` once and commit the lockfile. bcrypt's native module in `backend/node_modules` is built for Windows, so the backend can only start on your PC.

## 5. Manual test script (development database)

Prerequisites: `backend/.env` has `JWT_SECRET` (done locally); `npm run dev` in `backend/`, `npm start` in `frontend/`. Use test accounts, not real people.

1. **SEC-1.** Temporarily rename `JWT_SECRET` in `.env` → `npm run dev` exits with the Spanish error. Restore it. A token copied from an old session (before this change) → any API call returns 401.
2. **SEC-2.** As admin, reset a company's password (*Empresas colaboradoras › tarjeta › Resetear contraseña*). Log in as that company with the temporary password → the *Cambiar contraseña* form appears. Navigate to `/companyMain` without changing it → you are sent to login, and no API data loads. Complete the change → you reach the portal. Then *Cambiar contraseña* in the menu: an empty or wrong current password gives an error; a correct one works.
3. **SEC-8.** Log in as a test company in one browser. In MySQL: `UPDATE dual_usuarios SET activo = 0 WHERE id_usuario = <id>;`. The next action in that browser fails (401). Re-activate it.
4. **Limiter.** Six wrong logins for one identifier → the sixth says “Demasiados intentos fallidos”. A correct login from another IP still works.
5. **SEC-3.** In the public student form, use the DNI of a test student who has an account. A wrong password gives 401, and `gf_alumnosfct` is unchanged. Their real password (with an active convocatoria and no application in it yet) is accepted, and the message says to use the usual password.
6. **SEC-4.** As a company, open *Tutores*: the coordinator shows *Coordinador principal* and has no *Editar*/*Desactivar*. Call `PATCH /tutores/<id>` for it with the company token → 403.
7. **SEC-5.** As a company with a **validated** annex, try to upload another file from *Mis reservas* → “Un documento validado no se puede reemplazar.”
8. **SEC-6.** As a coordinator, *Documentos › Plantillas* shows no upload control, and `POST /documentos/plantillas` → 403.
9. **WF-1 (acceptance: a new reservation reaches “Confirmada” via the UI).** Reserve a validated student → *Empresas colaboradoras › Reservas*: the row shows *Tipo de contrato* → choose *Contrato*. As the company, upload the Anexo II (or generate it in *Documentos › Seguimiento*). As staff, *Ver doc* → *Validar documento* → *Confirmar reserva* (the type is preselected) → the row moves to *Asignaciones definitivas*.
10. **WF-2 (acceptance: a returning company re-applies).** Use a company whose last application is in a past convocatoria while a new one is active. *Mis datos* shows the yellow notice and *Participar en la nueva convocatoria* → submit → the page now shows the new application.
11. **WF-3 (acceptance: switch on the start date without visiting the page).** Create a convocatoria starting today (no others overlapping). Restart the backend (or wait ≤15 min) without opening *Convocatorias*: `GET /convocatorias/activa` returns it and the public forms open. A convocatoria overlapping another is refused (409).
12. **V-5.** `git ls-files backend/src/mail/config.js` lists the file.
13. **WF-10 / WF-13.** Coordinators see no *Resetear contraseña*. In the student form, double-clicking *Presentar candidatura* sends one request, and all fields (including files) clear after success.

## 6. Still open before Phase 1 can be closed

1. **V-1 / V-2 (blocked).** Run on the development database and send the output:
   `SHOW CREATE PROCEDURE sp_validar_solicitud_alumno; SELECT id_tipo_documento, nombre FROM dual_tipos_documento; SHOW TABLES LIKE 'dual_%preferencias';`
   (`dual_estados_validacion` was received: 1 PENDIENTE, 2 VALIDADO, 3 RECHAZADO.) If V-1 is confirmed, I will draft a procedure change that resolves `CV`/`ANEXO_DGA` by name, for your approval. If V-2 is confirmed, approve and run `011_preferencias_alumno.sql`.
2. **Production secret (SEC-1).** Set a new random `JWT_SECRET` (≥32 chars) in production before deploying this branch. If production ever ran without it, treat every token as compromised; the new secret invalidates them all. Announce the one-time logout. Answer still pending: does production currently set it?
3. **Manual run of §5** on the development database, especially steps 9–11 (the acceptance criteria).
4. **Proxy note.** The limiter uses `req.ip`. Behind a reverse proxy, every user would share the proxy's IP unless Express `trust proxy` is configured. Production proxy settings were not supplied.

### Phase 1 acceptance criteria (ROADMAP)

| Criterion | State |
| --- | --- |
| Server refuses to start without a secret | ✅ verified |
| Token signed with the old fallback rejected | ✅ verified (test) |
| Password change without the current one → 400/401 | ✅ verified (test) |
| Deactivated user rejected within one request | ✅ verified (test); confirm on DB (§5.3) |
| New reservation reaches “Confirmada” via the UI | 🟡 UI path exists; needs §5.9 on DB |
| Returning company re-applies | 🟡 needs §5.10 on DB |
| New student is validated | ⛔ depends on V-1 |
| Convocatorias switch on the start date without visiting the page | 🟡 needs §5.11 on DB |

**Phase 1 is not marked complete.** Phase 2 has not been started.
