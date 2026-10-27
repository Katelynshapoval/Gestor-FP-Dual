# FP Dual — Phase 3 Report: Frontend workflow consolidation

_Branch `phase-3-frontend-consolidation`, created from `main` @ `82f0356` (Phase 2) · 2026-10-27 · companion to [ROADMAP.md](ROADMAP.md), [AUDIT.md](AUDIT.md), [PHASE_2_REPORT.md](PHASE_2_REPORT.md) and [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md)._

**Status: implemented and committed (5 commits, nothing pushed). Phase 3 is NOT complete.**

Automated tests pass, the production build is clean, and several flows were checked against the real development backend and database:
- the read-only endpoint checks;
- session expiry in the browser;
- the public registration form at desktop and phone width.

**Still unverified:** the authenticated workflows in the browser for each role (the full reservation lifecycle through the new panel). They need test logins; see §8.

## 1. Starting point

- **Git:** `main` already contained the Phase 2 commit (`82f0356`, fast-forwarded locally); the tree was clean. The new branch starts there.
- **Phase 2 blockers carried over** (unchanged, not needed by Phase 3):
  - D6 is open: rejecting a convenio does not change the company, and the convenio viewer keeps that behaviour.
  - D3 is deferred: company quota rights are unchanged.
  - The baseline has not been rebuilt on an empty schema.
- **Phase 2 manual API checks:** largely covered by the Phase 3 checks below where possible; the authenticated ones are in §8.
- **No business rule was changed.** Every new screen rule reads the Phase 2 rules from the backend (catalogue projection, `estadoReglas`). WF-12 enforces fields the backend already required; it asks the company for them instead of inventing them.

## 2. Summary of changes

### A. Shared foundations

| Introduced | Purpose |
| --- | --- |
| `components/ui/Modal.jsx` | One accessible dialog: `role="dialog"`, `aria-modal`, labelled by its title, Escape, focus trap, initial focus on content, focus returns to the opener, scroll lock. Stacked dialogs: only the top one reacts. |
| `components/ui/MotivoDialog.jsx` | One reason dialog (cancel, reject, reassign, reopen): required or optional reason, counter, extra fields, submit lock. Errors are shown inside the dialog, which stays open. |
| `components/ui/PdfViewer.jsx` | One PDF viewer: authenticated download, *Descargar*, *Nueva pestaña*, review state, signatures (with how they were recorded), rejection reason, actions supplied by the screen, loading/error/retry. On phones it shows an "Abrir PDF" button instead of the iframe. |
| `utils/labels.js` + `components/ui/EstadoBadge.jsx` | One Spanish label and colour for every `solicitud`, `reserva`, `validacion`, `documento`, `firma` and `rol` value. Unknown values are shown as they are. |
| `components/ui/ReadField.jsx`, `utils/fechas.js` | Shared read-only field (no longer styled as an input) and date-only formatter. |
| `utils/api.js` | Errors carry `status`, a stable `code` and `body`. Network failures become `NETWORK`. A 401 on a call that carried a session token ends the session once; login and password forms are excluded. |
| `context/UserContext.js` | Session expiry comes from the JWT's own `exp`, not a client 8-hour timer. The session ends automatically at expiry. The reason is shown once on the login page. |
| `.btn-danger` | One style for destructive actions. Positive actions use `.btn-primary` (D.2). |

### B. Reservation workflow

- **`GET /reservas/:id/detalle`** is available to staff, the owning company and the student; anyone else gets 403. It returns:
  - the reservation;
  - its current Anexo II/III and Calendario, projected by the document catalogue **for the caller's role**;
  - a confirmation checklist computed with the same rule the confirm endpoint applies (`reglas.reservaConfirmable`);
  - permitted actions with the reason when one is not permitted;
  - for staff only, the document history (retired versions and legacy Anexo H).
- **`components/reservas/ReservaDetalle.jsx`** is one panel for the whole lifecycle:
  - state;
  - contract type, with the D2 family lock explained;
  - documents through the shared `DocumentoItem` (view, upload, generate or regenerate, sign, validate, reject);
  - tutor;
  - confirmation checklist and *Confirmar reserva*, sent without a type so the stored one is used;
  - *Cancelar reserva* (staff use `cancelar-admin`; companies use `cancelar`, pending only);
  - *Reasignar*, including confirmed reservations (WF-8);
  - document history.
- **The panel is used from:**
  - *Enlazar* › student card › Reservas;
  - *Empresas colaboradoras* › Reservas tab and each company card;
  - *Documentos › Seguimiento*, via *Gestionar reserva* on reservation documents;
  - the **company portal** › Mis reservas (one annex upload path, PM-7);
  - the **student portal** › Mis reservas, view and sign.
- **`DocumentoItem`** is the single document component. Viewing goes through `PdfViewer`, and validate/reject are offered only when the backend sets `puede_revisar` (sign-then-validate, D1). Upload shows the attestation note: uploading declares the uploader's signature.
- **Real document badges (WF-15).** Reservation lists include `documentos_resumen` (annex and calendar state). `ReservaResumenBadges` shows them, so "Confirmada" no longer turns the A2/A3 and Cal chips green.

### C. Workflow fixes

| Item | Change |
| --- | --- |
| **WF-8** | `GET /reservas/ofertas-elegibles?reasignar_desde=<id>` lists destinations for confirmed students too (the origin offer is excluded). *Reasignar* is in the panel for pending and confirmed reservations. |
| **WF-9** | Reservations carry `id_solicitud_empresa`, `convocatoria` and `convocatoria_activa`. Company cards show only their **own application's** reservations. The *Curso* filter is the application's convocatoria, not the submission date. The Reservas tab defaults to the active convocatoria. The company list uses the **current** convenio version and its real state (rejected is shown as rejected). |
| **WF-12** | The registration form collects the coordinator's DNI/NIE and the legal representative's email, phone and position. When the work address differs, it collects the full work address. Nothing is copied from another person or field. The backend now also validates the CIF, both DNI/NIE and the password length (`CIF_INVALIDO`, `DNI_INVALIDO`, `PASSWORD_CORTA`). The specialities and transports catalogue shows an error with retry. |
| **WF-14** | Enlazar keeps loading, error (with retry), empty, empty-by-filters, "no application", "pending validation" and "rejected" as separate states. The company's application status is its own request, so a failed call is an error, never "not validated". The company banner now says a reservation is final only when the centre confirms it. |
| **WF-16** | Expired or invalid session: cleared, the user is sent to the login page with a message, without a loop. |
| **WF-17** | The student portal recognises a missing application by `404`/`SIN_SOLICITUD`, not by message text. The company re-application tells `SOLICITUD_EXISTENTE` apart from `SIN_CONVOCATORIA` (before, any 409 said "ya existe"). |
| **F (states)** | Loading, error and retry, and empty states in Enlazar, *Empresas colaboradoras*, the company portal (per tab), the student portal, the reservation panel and the PDF viewer. Lists refresh after every action in the panel, and the panel reloads itself. Submit locks are on the dialogs, document actions and reservation creation. |
| **D.2 / D.4** | Header role label. Student-status badges in Enlazar and the student portal. ARIA tabs in *Empresas colaboradoras*, the student card and both portals. `aria-expanded`/`aria-label` on card toggles. Labelled tutor, offer and login fields. |

### D. Removed (verified no remaining callers)

- **Components:** `DocViewer.jsx`, `ReservaDocViewer.jsx`, `ConvenioViewer.jsx`, `AppHeader.jsx`, `DocumentViewAction.jsx`.
- **Inline reason modals (five):** `StudentCard.CancelModal`, `EmpresaControl.MotivoModal` and `ReassignModal`, `ReservasAdmin.CancelModal`, `CompanyView/MisReservas.CancelModal`.
- **Seguimiento:** its inline reject dialog and the `VARIANT`/`ACTOR` copies.
- **Company portal:** `SubirDocReserva`, the second annex upload path.
- **Helpers:** `buildPostOptions`, `validDate`, `buildYearOptions`, `reservaEstadoClass`, `openDocumento`, `statusIconClass`; the `getCourseLabel` date heuristic; the unused modal CSS.
- **Moved onto `Modal`:** `AsignarAlumnoModal`, `CupoReductionDialog` and the global `ConfirmDialog`.
- **Backend routes:** none removed (as instructed). `POST /documentos/firmar`, `/documentos/alumno/:id/:tipo`, `/documentos/empresa/:id/convenio`, `GET /usuarios`, `GET /solicitudes/empresa` and `GET /solicitudes/alumno/:id[/documentos]` still exist for possible external callers.

## 3. API changes and compatibility

| Change | Compatibility |
| --- | --- |
| **New** `GET /reservas/:id/detalle` | Additive. |
| **New** query `reasignar_desde` on `GET /reservas/ofertas-elegibles` | Additive. Without it the response is unchanged. |
| `code` on error bodies: `AUTH_REQUIRED`, `TOKEN_INVALID`, `FORBIDDEN`, `REGLA_NEGOCIO`, `DUPLICADO`, `RESTRICCION`, `INTERNAL`, `SIN_SOLICITUD`, `SIN_CONVOCATORIA`, `SOLICITUD_EXISTENTE`, `CIF_INVALIDO`, `DNI_INVALIDO`, `PASSWORD_CORTA`, plus the Phase 2 ones | Additive; `error` messages are unchanged. |
| `GET /reservas`, `/reservas/empresa`, `/reservas/alumno`: new fields `documentos_resumen`, `tipo_contrato_clave`, `id_solicitud_empresa`, `id_convocatoria_empresa`; `/reservas` also `convocatoria`, `convocatoria_activa` | Additive. |
| `GET /solicitudes/empresa/todas`: new `id_convocatoria`, `convocatoria_estado`; the convenio lookup is the **current version** (previously an arbitrary row) | Additive plus a correctness fix. |
| `GET /solicitudes/alumno?include=full`: reservations gain `documentos_resumen`, `tipo_contrato_clave`, `id_solicitud_empresa`, and **lose `id_documento_reserva`** | It meant "any document of the reservation, any version". No screen used it; `documentos_resumen` replaces it. External callers, if any, must switch. |
| `POST /solicitudes/empresa`: new 400s for an invalid CIF, an invalid DNI/NIE or a password under 8 characters | Same checks the form already made; the backend now enforces them too. |

## 4. Files

**Backend:**
- `src/middleware/auth.js`
- `src/helpers/dbHelpers.js`
- `src/routes/reservasRoute.js`
- `src/services/reservasService.js`
- `src/services/documentosWorkflow.js`
- `src/services/solicitudesAlumnoService.js`
- `src/services/solicitudesEmpresaService.js`
- `test/phase3.test.js` (new)

**Frontend, new files:**
- `components/ui/{Modal,MotivoDialog,PdfViewer,EstadoBadge,ReadField}.jsx`
- `components/reservas/{ReservaDetalle,ReservaResumenBadges}.jsx`
- `utils/{labels,fechas}.js`
- `setupTests.js`
- tests: `utils/{api,labels}.test.js`, `components/ui/Dialogs.test.jsx`, `components/reservas/ReservaResumenBadges.test.jsx`

**Frontend, changed files:**
- `App.js`, `context/UserContext.js`, `utils/{api,documentos,formatValidation,reservaEstados}.js`
- `components/{DocumentoItem,TipoContratoSelect,TutorAssignSelect,CupoReductionDialog}.jsx`
- `components/feedback/ToastProvider.jsx`, `components/layout/Header/Header.js`, `components/ui/cardStyles.js`
- `pages/Login.js`, `pages/AddCompanyRequest/index.js`
- `pages/AdminCompanyView/{AdminCompanyView.jsx,helpers.js,components/{CompanyCard,ReservasAdmin,AsignarAlumnoModal}.jsx}`
- `pages/AdminDocumentsView/Seguimiento.jsx`
- `pages/CompanyView/{index.js,MisReservas.jsx}`
- `pages/LinkStudents/{index.js,hooks/useLinkStudents.js,utils/filters.js,components/StudentCard.jsx,components/student-card/{Documentos,EmpresaControl,EstadoSolicitud}.jsx}`
- `pages/StudentMain/{index.js,MisDatos.jsx,MisReservas.jsx}`
- `pages/Convocatorias/Convocatorias.jsx`
- `styles/{forms,main}.css`

**Removed files:** see §2.D.

## 5. Tests and checks

| Kind | What | Result |
| --- | --- | --- |
| **Mocks**, backend (`npm test`) | 30 Phase 1 + 23 Phase 2 + **10 Phase 3**. Phase 3 covers: detail endpoint (staff/company/student/other roles, checklist, actions, no-type case), WF-15 summaries, WF-9 fields, WF-8, WF-12 validation, error codes, DNI/NIE check. | **63 pass, 0 fail**; 6 DB tests skipped by default |
| **Mocks**, frontend (`react-scripts test`, Jest + Testing Library, already in `package.json`) | API errors and session expiry; labels; Modal (labelling, Escape, focus return, stacking, focus trap); MotivoDialog (required, inline error, optional); real document badges | **17 pass** (4 suites) |
| **Static** | ESLint `--max-warnings 0` on all of `frontend/src`; `node --check` on changed backend files; `CI=true react-scripts build` | 0 warnings; pass; *Compiled successfully* |
| **Real dev DB, read-only** | Detail endpoint for all 14 reservations, `GET /reservas`, `include=full`, both ofertas modes, run against `proyecto_dual` with a guard that refuses any non-SELECT | All 200. WF-8: a confirmed student had **1** destination with `reasignar_desde`, **0** without. WF-15: the two confirmed legacy reservations (2, 6) correctly show their Anexo II/III as *Pendiente de generar*, with the legacy Anexo H in the staff history |
| **Browser** (in-app browser, your running dev servers, real backend) | Registration form (desktop and 375 px); session expiry with an invalid token in storage | New fields present; the work-address toggle reveals 4 required fields; **no horizontal overflow at 375 px**. Invalid token → API 401 `TOKEN_INVALID` → session cleared → `/login` with "Tu sesión ha caducado…"; each request was sent only twice (React StrictMode in development), with **no loop** |
| **Not run** | The form was **not submitted** (it would create a company). No authenticated screen was opened in the browser. | — |

## 6. Visual and browser verification

- **Checked:**
  - the public form layout at 375 px;
  - the login page notice;
  - the redirect without a loop.
- **Not checked in a browser:**
  - `ReservaDetalle` and the other staff, company and student screens (they need logins);
  - focus behaviour with a real screen reader;
  - the 768 px layout.
- **Phase 4:** screenshots at 360/768/1280 px.

## 7. Outstanding issues and deferrals

- **Authenticated E2E (blocks completion).** Not yet exercised in a browser for any role:
  - the reservation lifecycle (type → annex upload/generation → three signatures → validation → confirmation → cancel/reassign);
  - WF-14 states as a company;
  - the portals.
- **PM-7 leftovers:**
  - the two quota editors (`CompanyCard.EspecialidadList` and `EspecialidadCuposEditor`) are **not** merged;
  - `formatDocumentDate` (date + time) remains alongside `formatFecha`.

  Both are low risk and left for later to avoid unrelated churn.
- **PM-9:** the field aliases in `GET /solicitudes/empresa/todas` (`razonSocial`, `idAuxEmpresa`, `fechaPeticion`) are kept for compatibility. New fields follow one convention.
- **Deferred to Phase 4:**
  - mobile drawer accessibility (`inert`, Escape);
  - navigation and menu labels (D.1);
  - the dashboard;
  - notifications;
  - the full accessibility pass;
  - the forced password change after self-registration (D.3, a behaviour decision).
- **Deferred to Phase 5:**
  - server-side pagination (PM-1);
  - the `TutorAssignSelect` N+1 requests (PM-2: one request per open panel now, still per reservation in lists where it appears);
  - removing unused backend routes and dependencies.
- **Unchanged and noted:**
  - D6: rejecting the convenio of a validated company keeps the company validated (the dialog says so);
  - D3: company quota rights.

## 8. What I need to finish Phase 3

To run the authenticated browser checks against your development database, I need **one** of:

1. **Test credentials** you type in chat (or put in a git-ignored local file) for one ADMINISTRADOR, one COORDINADOR, one EMPRESA and one ALUMNO account. The EMPRESA and ALUMNO should share a pending reservation.
2. **Approval to create dedicated test accounts** on `proyecto_dual`:
   - a test administrator and coordinator;
   - a test company with its application, convenio and one offer;
   - a test student with a validated application.

   Passwords would be generated and recorded only in a git-ignored local file. The run creates real rows (a reservation, uploaded test PDFs, signatures and audit events). Audit events cannot be deleted by design; everything else can be cancelled or left marked as test data.

The checks would cover the full lifecycle above for each role, plus permission restrictions (e.g. a company cannot see another company's reservation), WF-14 as a company, and the portals at 375 px.

### Completion criteria (Phase 3 prompt / ROADMAP)

| Criterion | State |
| --- | --- |
| A full reservation workflow can be managed through the unified interface, per role | 🟡 Implemented and covered by mocks and read-only DB checks; **not run end to end in a browser** |
| Relevant screens reuse the same shared components | ✅ One viewer, one reason dialog, one document component, one reservation panel, one modal |
| Status labels and indicators consistent and accurate | ✅ `labels.js` everywhere touched; WF-15 badges driven by real document state (verified on DB data) |
| Session expiration and API errors handled reliably | ✅ Browser-verified for expiry; codes covered by tests |
| Convocatoria-specific records not mixed | ✅ Code + DB fields; 🟡 not checked in the browser with staff login |
| Company registration no longer fabricates data | ✅ Form and backend; browser render checked; submission not run |
| Loading, empty and error states consistent | ✅ In the screens listed in §2.C; 🟡 authenticated screens not browser-checked |
| No regression; frontend builds; tests pass | ✅ 63 + 17 tests, lint 0, build OK; 🟡 regressions in authenticated flows not ruled out by a browser run |

**Phase 3 is not marked complete** until §8 is done. Phase 4 has not been started.
