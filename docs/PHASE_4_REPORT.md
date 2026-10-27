# FP Dual — Phase 4 Report: UX, navigation, notifications and accessibility

_Branch `phase-4-ux-accessibility`, created from `main` @ `e41c08a` (Phase 3) · 2026-10-27 · companion to [ROADMAP.md](ROADMAP.md), [AUDIT.md](AUDIT.md) and [PHASE_3_REPORT.md](PHASE_3_REPORT.md)._

**Status: implemented and committed on the branch (nothing pushed or merged). Phase 4 is NOT marked complete.** Three acceptance items need you (§9): turning on real email delivery, a manual screen-reader pass, and your review of the new screens.

## 1. Starting point and Phase 3 closure

- `main` = `origin/main` = `e41c08a` contained all of Phase 3. The new branch starts there.
- **The Phase 3 authenticated browser checks were run first** (test accounts from `backend/.pruebas.local.json`, which you allowed me to read). Full reservation lifecycle in the browser, by role:
  - company reserves the test student → staff set the contract type → Anexo II appears → company uploads it (company signature) → student signs → centre signs → staff validate → staff confirm → staff reassign to EMPRESA PRUEBA B;
  - the reassigned reservation starts with no inherited annex (WF-4);
  - a company gets 403 on another company's reservation (`/reservas/2`, `/reservas/6`).
- **Bug found and fixed (commit `4c351cd`):** setting “Contrato de formación en alternancia” always failed with HTTP 500. The audit row stored the type name (36 characters) in `dual_eventos.estado_nuevo` (`varchar(30)`), and strict SQL mode rolled the whole change back. It is a Phase 2 bug; the mock test had encoded it. Fixed in code (ids in the state columns, names in `detalle`), **no migration**.
- With that, the Phase 3 completion criteria are met; [PHASE_3_REPORT.md](PHASE_3_REPORT.md) is updated.

## 2. Decisions taken (2026-10-27)

| Topic | Decision |
| --- | --- |
| Notifications (WF-19) | Mapping approved as proposed (§4). Delivery logged only until you enable it. |
| SEC-11 — companies | **No change**: companies keep seeing name, DNI, email, phone and CV of eligible students. |
| SEC-11 — students | Students see a standard text instead of the free-text cancellation reason (list and detail). |
| SEC-11 — `GET /usuarios` | ADMINISTRADOR only. |
| Forced password change | Self-registered companies are no longer forced to change the password they chose. Passwords reset by an administrator still force a change. |
| Test logins | Read `backend/.pruebas.local.json` (dev only). Passwords were typed into the local login form only; never printed in reports or commits. |

## 3. Summary of changes

### Batch A — Navigation and foundations (`e98179e`)

- **One menu definition** (`src/navigation.js`) per role:

  | Role | Menu |
  | --- | --- |
  | ADMINISTRADOR, COORDINADOR | Panel · Alumnos · Empresas · Reservas · Documentos · Convocatorias |
  | EMPRESA | Mi empresa · Alumnos disponibles |
  | ALUMNO | Mi proceso Dual |
  | Visitors | Inicio · Solicitud de alumno · Solicitud de empresa · Acceder |

  “Cambiar contraseña” and “Cerrar sesión” sit in an account area at the bottom of the sidebar/drawer. Staff no longer see the public forms in the menu (D.1).
- **New paths** `/panel`, `/alumnos`, `/empresas`, `/reservas`, `/documentos`. Old paths (`/linkStudents`, `/companiesView`, `/documentsView`) redirect and keep their query string.
- **One layout route**: the layout no longer remounts per page. The sidebar collapses **only** with its own button and remembers the choice; outside clicks no longer collapse it.
- **Mobile drawer**: `inert` while closed (links unreachable by Tab), focus moves in on open, Tab is trapped, Escape closes, focus returns to the menu button, page scroll locked.
- **Every page** has its own `document.title`, a “Saltar al contenido” link, and focus moves to the content after navigation.
- **Reservas** is its own page (it was a tab inside Empresas colaboradoras).
- **Home**: visitors get a landing page with the convocatoria status; signed-in users go straight to their home (staff → Panel).

### Batch B — Dashboard and lists (`3f373ba`)

- **`GET /panel/resumen`** (staff only) — counts for one convocatoria, the active one by default, computed on the server:
  - student and company applications awaiting review (`COUNT`);
  - company data changes awaiting approval (`COUNT`);
  - documents waiting for the centre (same query as Seguimiento, `accionPendiente=CENTRO`);
  - pending reservations by situation (same grouping as the Reservas page).
- **Panel page**: each card opens the list **already filtered** (two clicks to any pending item). Skeleton, error with retry, “no convocatoria” and “nothing pending” states; convocatoria selector. No grand total, because an annex awaiting validation is both a document and a reservation task.
- **Shared filter pattern** (`FilterBar`, `SearchField`, `FilterSelect`, `useUrlFilters`, `utils/busqueda.js`):

  | List | Search | Filters |
  | --- | --- | --- |
  | Alumnos (staff) | name, DNI/NIE, email, company | convocatoria (active by default, “Todas” and each past one), especialidad, application state, reservation situation |
  | Alumnos disponibles (company) | name, DNI/NIE | especialidad |
  | Empresas | company, CIF, coordinator, municipality | convocatoria (active by default), application state, convenio, especialidad, pending changes, sort |
  | Reservas | student, DNI/NIE, company, tutor | convocatoria (active by default), situation, especialidad |
  | Documentos › Seguimiento | (unchanged, server-side) | now read from and written to the URL |

  Accent- and case-insensitive search; result count announced politely; “Quitar filtros”; empty states that say whether the filters or the convocatoria are empty. Filters live in the URL (back button, bookmarks, dashboard links). Filtering stays in the browser on the lists already loaded; server-side pagination remains Phase 5 (PM-1), and the parameter names follow Seguimiento's query contract so Phase 5 can move them to the server.
- Contract types are shown with readable labels everywhere (Seguimiento showed `CONTRATO_DE_FORMACION_EN_ALTERNANCIA`).

### Batch C — Notifications, data rules, forms, portals (`4f11f1d`, `ddcae5a`, `fdd8519`)

- **Notifications** — see §4.
- **SEC-11 and the password rule** — see §2; enforced in the backend.
- **Public forms in steps** (`components/forms/StepForm.jsx`), both rebuilt on one values object:

  | Form | Steps |
  | --- | --- |
  | Student | Ciclo · Datos personales · Contacto y movilidad · Documentos · Cuenta · Revisión y envío |
  | Company | Empresa · Responsable legal · Coordinador · Puesto y ciclos · Cuenta · Revisión y envío |

  - **On every field:** visible label, required marker (“*” plus “(obligatorio)” for screen readers), hint, and an inline error wired with `aria-invalid`/`aria-describedby`.
  - **“Siguiente”:** checks only the current step, lists the problems in an error summary that takes focus, and links each problem to its field.
  - **When the step changes:** focus moves to the step heading.
  - **Review step:** every section has a “Modificar” button.
  - **While submitting:** progress message, duplicate submission blocked, and a warning before leaving the page with unsent data.
  - **After sending:** a success panel replaces the form.
  - **Fields, rules and endpoints:** unchanged. The company form adds a password confirmation (browser only); postcodes are checked as 5 digits in the browser.
- **Open/closed banner** (`ConvocatoriaBanner`, new public `GET /convocatorias/estado`): Home and both forms show whether applications are open, the active convocatoria and its dates; when closed, the form is not shown and the next opening date is given.
- **Keyboard bug fixed**: the ciclo and transport pickers were `div onClick` with an inert checkbox, so a keyboard user could not select a ciclo. They are real checkboxes now (also in the company re-application form).
- **Portals**: a “Qué tienes pendiente” block on both portals, built only from data the portal already loads:

  | Portal | What it shows |
  | --- | --- |
  | Student | documents to upload or re-upload (with the reason), annexes to sign, rejected application, “in review”, “validated, waiting for companies”, confirmed placement |
  | Company | documents to upload, per reservation the annex/calendar to upload, re-upload or sign, re-application, data changes waiting for approval, “waiting for convenio validation”, link to available students |

  Accessible `Tabs` (one tab stop, arrows/Home/End, labelled panel; wrap on phones). The student portal says personal data is read-only and changes go through the centre (no self-service, as required). Read-only data no longer looks like inputs (job description, transports).
- **Visual consistency**:
  - section titles are real headings;
  - raw `gray-*` classes are mapped to the theme tokens;
  - `brand-500` text is replaced where contrast failed;
  - the login button uses `.btn-primary`.

### Batch D — Accessibility and responsiveness (`fe6b01b` and fixes in earlier batches)

Every finding of the axe and keyboard runs was fixed (§6).

## 4. Notifications (WF-19)

`backend/src/services/notificaciones.js` is the single place for event emails.

| Event | Trigger (after commit) | Recipients |
| --- | --- | --- |
| Student application validated / rejected | `aplicarTransicion` VALIDAR/RECHAZAR | Student (reason included on rejection) |
| Company application validated / rejected | same, and convenio validation that validates the company | Company coordinator |
| Document rejected | `documentosService.rechazar` | Student (application documents) or company coordinator (company and reservation documents) |
| Reservation created | company `reservar` | Student |
| Reservation created by the centre | `reservarAdmin`, reassignment | Student and company |
| Reservation cancelled by the company | `cancelar`; quota reduction | Student (the company already gets its quota email) |
| Reservation cancelled by the centre | `cancelarAdmin`, reassignment origin | Student and company |
| Other pending reservations cancelled by a confirmation | `confirmar` | The companies that lost the student |
| Reservation confirmed | `confirmar` | Student and company |
| Reopen (RECHAZADO → PENDIENTE) | — | Nobody |

- **When:** after the transaction commits; never inside it.
- **Failures:** callers do not wait. A failure is logged and never changes the API response; a missing address is logged and skipped.
- **Data:** each notification re-reads its data, so nothing from a rolled-back request is sent.
- **Templates:** concise Spanish, HTML-escaped (SEC-10). No DNI, phone or free-text cancellation reason. Rejection reasons go only to the party who must correct something.
- **Delivery** (`mail/config.js`), applying to every email of the application, including the existing submission and quota emails:

  | Setting | Effect |
  | --- | --- |
  | `MAIL_MODE=log` | Writes `[correo:log] no enviado · para a***@dominio · «asunto»` and sends nothing. **Default unless `NODE_ENV=production`.** |
  | `MAIL_MODE=smtp` | Sends through Gmail as before. |
  | `MAIL_REDIRECT_TO` | Optional: delivers everything to one address, for template checks. |

  `.env.example` documents the settings.
- **⚠ Deployment:** production must run with `MAIL_MODE=smtp` or `NODE_ENV=production`. Otherwise no email leaves the server.
- **Template check (2026-10-27):** `node scripts/probarCorreos.js` sends every template once from the test records. It refuses to run unless `MAIL_MODE=smtp` and `MAIL_REDIRECT_TO` are set, and it changes no data. It was run with the redirect to the owner's address: 12 emails, all accepted by Gmail. The only variant not sent is "document rejected" for a student document, because the test student has none uploaded.

## 5. API changes

| Change | Compatibility |
| --- | --- |
| **New** `GET /panel/resumen?convocatoria=<id>` (staff) | Additive |
| **New** `GET /convocatorias/estado` (public): `{ abierta, activa, proxima }` | Additive; `/convocatorias/activa` unchanged |
| `GET /reservas/alumno` returns `motivo: null`; `GET /reservas/:id/detalle` hides `reserva.motivo` for ALUMNO | Approved SEC-11 rule |
| `GET /usuarios`: ADMINISTRADOR only (was also COORDINADOR) | No screen used it |
| Self-registration of a company: `must_change_password = 0` | Approved rule |
| Audit event for `POST /reservas/:id/tipo-contrato`: type ids in `estado_*`, names in `detalle` | Bug fix (§1) |
| No migration, no schema change | — |

## 6. Accessibility (WCAG 2.2 AA, practical pass)

- **Automated:** axe-core 4.11.1 (already in `node_modules` via the ESLint plugin; served temporarily from the dev server, not committed), rule sets WCAG 2.0/2.1/2.2 A+AA and best practices, on the real rendered pages:
  - public: Inicio, Acceder, both forms (including the error state);
  - staff: Panel, Alumnos (card expanded), Empresas (card expanded), Reservas, reservation panel, reason dialog, Documentos, Convocatorias, Cambiar contraseña;
  - company: four portal tabs, data edit form, tutors;
  - student: portal.
- **Fixed from the runs:**
  - unnamed expand buttons on company cards;
  - unlabelled quota inputs;
  - read-only checkboxes without labels;
  - toast container outside landmarks;
  - heading jump in Seguimiento;
  - one contrast failure (`text-brand-500` tabs in the student card).

  Final run: **0 violations** on every page and state listed above. (The reason-dialog counter flagged once during its fade-in animation and passes once it has finished.)
- **Keyboard checks in the browser:**
  - mobile drawer: inert when closed, focus in, trap, Escape, focus return. The first run found focus stuck on the menu button; fixed by not animating `visibility` on open;
  - portal tabs: arrow keys, one tab stop;
  - company form: Space selects a ciclo, Tab reaches its labelled places field;
  - dialogs: Escape closes stacked dialogs one at a time (Phase 3 `Modal`);
  - forms: focus to the error summary, then to the step heading.
- **Code fixes beyond axe:**
  - labels linked in tutor editing, convocatoria editing, forced password change and change-rejection reason;
  - login: error announced, h1, contrast-safe button;
  - file inputs no longer `display:none`, so they are keyboard-reachable;
  - `text-gray-400` (≈2.5:1) replaced by `text-muted`.
- **Not claimed:** no screen reader (NVDA/VoiceOver) session was run, and automated checks do not prove compliance. Lighthouse was not run.

## 7. Screens tested and viewport sizes

All against the real development backend and database (`proyecto_dual`), signed in with the test accounts, in the in-app browser.

| Screen | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Inicio (visitor) | ✅ | — | ✅ |
| Student form (steps, errors, minor → guardian) | ✅ | ✅ | — |
| Company form (steps, keyboard ciclo selection) | — | ✅ | — |
| Panel | ✅ | ✅ (axe) | ✅ |
| Alumnos, Empresas (expanded), Reservas, Documentos, Convocatorias | ✅ overflow check | ✅ axe | ✅ |
| Reservation panel | ✅ | ✅ | ✅ (Phase 3 run) |
| Student portal | ✅ | — | — |
| Company portal | — | ✅ | ✅ (Phase 3 run) |
| Mobile drawer | ✅ | — | — |

- **Horizontal overflow:** none at 360 px on any staff page, both portals or the forms, once one bug was fixed. Screen-reader text in the tab bar had widened phone pages to 379 px.
- **Screenshots:** `docs/screenshots/phase4/` holds the panel, filters, home, both forms and both portals. They show only test (“PRUEBA”) records. The old screenshots in `frontend/screenshots/` predate Phases 3–4.

## 8. Tests

| Kind | What | Result |
| --- | --- | --- |
| **Mocks**, backend (`npm test`) | 63 earlier + **12 Phase 4**: panel counts and scoping, staff-only route, convocatoria status, notification recipients per event, escaping and no personal data, failure handling, log mode by default, SEC-11 rules, company password rule. One Phase 2 test updated (type ids in the audit row; only reads after COMMIT). | **75 pass, 0 fail**, 6 DB tests skipped |
| **Mocks**, frontend (`react-scripts test`) | 17 earlier + **10 Phase 4**: menus per role, active path, search, contract labels, Tabs keyboard model, step-form errors and value retention, pending-action rules for both portals | **27 pass** |
| **Static** | `eslint --ext .js,.jsx --max-warnings 0 src` (earlier phases did not pass `--ext`, so `.jsx` files were not linted; six errors in a Phase 3 test fixed), `CI=true react-scripts build` | 0 warnings; *Compiled successfully* |
| **Real dev DB, through the API** | `/panel/resumen` against each list (1 / 2 / 27 / 8 matched the filtered lists); company 403 on `/panel/resumen`; staff cancellation, company reservation and company cancellation on test records with the logged emails (one per recipient, correct recipients, nothing sent); student gets `motivo: null`, staff get the reason; coordinator 403 on `/usuarios` | All as expected |
| **Not run** | `DB_INTEGRATION=1` tests: they write and delete temporary rows, not approved for this phase. A form submission (it would create a company/student). Real SMTP delivery. | — |

**Rows written to the dev DB** by the checks above (test records only):
- the Phase 3 lifecycle: reservations 25 and 26, one test Anexo II PDF, its signatures and validation;
- the Phase 4 events: reservation 26 cancelled by staff, reservation 25 reactivated and cancelled by the company;
- the audit events of all of these, which cannot be deleted.

## 9. Pending issues and limitations

- **Your approval needed:**
  1. **Real email**: choose when to set `MAIL_MODE=smtp` (or `MAIL_REDIRECT_TO=<your address>` first, to read the templates).
  2. **Screen-reader pass**: a short NVDA or VoiceOver check of a form and a portal.
  3. **Review of the new screens**: menu, Panel, forms and portals.
- **Not exercised end to end on the real DB:**
  - validation and rejection emails (the test applications are already validated);
  - document rejection;
  - confirmation email (the confirmation itself was run before notifications existed).

  They are covered by mocked tests only.
- **In-app navigation away from a half-filled form** is not blocked: only closing or reloading the tab warns. Blocking router navigation needs the data router (`createBrowserRouter`), a larger change.
- **The company portal still shows four tabs** on top of the new pending block; merging tabs was out of scope.
- **Inherited and unchanged:**
  - D6 (convenio rejection of a validated company) and D3 (quota rights) stay open;
  - the baseline has not been rebuilt on an empty schema;
  - the two quota editors are still not merged (PM-7).
- **`.claude/launch.json`** (dev server preview config) is untracked; delete it or keep it locally.

## 10. Deferred to Phase 5

- Server-side filtering, search and pagination for Alumnos, Empresas and Reservas (PM-1); the URL parameters are ready to be sent to the server.
- Dashboard counters cached or computed per convocatoria in SQL only; `documentos_accion_centro` still builds the Seguimiento list in memory (PM-1).
- Rate limits on public forms; PDF signature check and download headers (SEC-9).
- An automated browser test suite (Playwright or similar, needs a new dev dependency) and axe in CI.
- `TutorAssignSelect` N+1 (PM-2); unused routes and dependencies.

## 11. Completion criteria

| Criterion | State |
| --- | --- |
| Navigation intuitive and role-appropriate | ✅ Implemented and browser-checked for all four roles |
| Staff see pending tasks and open records directly | ✅ Panel cards open filtered lists; counts matched the lists |
| Forms communicate availability and validation clearly | ✅ Banner, closed state, inline errors, summary, review |
| Portals communicate statuses and required actions | ✅ Pending block on both portals |
| Cohesive visual design on the major screens | ✅ Shared components and tokens. 🟡 Your review pending |
| Approved notifications work without duplication | 🟡 One email per event per recipient in tests and on the real DB (log mode); not all events exercised on the real DB; real delivery not enabled |
| Backend enforces the approved personal-data rules | ✅ Verified through the API |
| Keyboard and responsive usability materially improved | ✅ axe 0 violations on the listed pages; no overflow at 360 px. 🟡 No screen-reader session |
| Existing workflows keep working | ✅ Full lifecycle run in the browser before the changes; afterwards reserve, cancel (company and staff), panel, lists, forms (without submitting) and portals re-checked. 🟡 Contract type → confirmation not re-run after the selector change |
| Tests and build pass | ✅ 75 + 27 tests, lint 0, build OK |

**Phase 4 is not marked complete** until the three items in §9 are done or waived. Phase 5 has not been started.
