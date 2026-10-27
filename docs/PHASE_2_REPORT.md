# FP Dual — Phase 2 Report: Database baseline and business-rule integrity

_Branch `phase-2-db-integrity` (from `main` @ `10ce247`, which contains Phase 1) · 2026-10-27 · companion to [ROADMAP.md](ROADMAP.md), [AUDIT.md](AUDIT.md), [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md) and [../db/README.md](../db/README.md)._

**Status: implemented in code; baseline recorded and migrations 012–015 all applied to `proyecto_dual` (2026-10-27, each with your approval). 6/6 DB tests and 53/53 mock tests pass. Phase 2 is NOT complete:**
- Writes through the API are not yet checked on the DB (manual checks in §8).
- The rebuild from the baseline on an empty schema has not been run.
- D6 is open.

**015 on the real development database** (applied 09:49:15, 5/5 statements):
- The self-check passed (no duplicates, no unnormalised DNIs).
- `uq_gf_alumnosfct_dni` replaced `ix_gf_alumnosfct_dni`, and the temporary check procedure was dropped.
- All 17 students are unchanged.
- `EXPLAIN … WHERE dni = ?` is resolved through the unique key (const lookup).

Full DB suite **6/6 pass**: migrations recorded, V-1, triggers by name, append-only audit trail, unique DNI, and cancel → re-book plus confirmation rules. Cleanup verified: 14 reservations, 45 documents, 0 signatures, 6 events, 17 students. The read-only backend smoke test gives the same results as after 014.

**012 on the real development database:**
- All 3 functions, 11 procedures and 8 triggers were recreated. `fn_id_*` resolve CANCELADA = 3, VALIDADO = 2, ANEXO_DGA = 6.
- No data changed: still 14 reservations and 45 current documents.
- DB tests: *V-1 by name*, *triggers by name*, and *cancel → re-book retires the annex and clears type and tutor; confirmation refuses a missing type, an unvalidated annex and a different type*. **3/3 pass.** Their temporary reservation and annex were removed; counts were identical afterwards.

**013 on the real development database** (applied 09:46:04, 13/13 statements):
- `dual_eventos` exists with its two immutability triggers.
- `dual_documento_firmas.firmado_por` / `metodo` and `dual_documentos.firmas_exentas_legacy` exist, with all 5 constraints.
- Exactly documents **32, 33, 34, 35, 36, 49** (validated legacy convenios) are exempt. Each has one `EXENCION_FIRMA_LEGACY` event (events 1–6, no user).
- No other data changed.
- DB test *append-only audit trail* passes. UPDATE and DELETE on a real event are both refused, and the count is unchanged. **4/4 DB tests pass** (012 + 013); the temporary rows were cleaned up again.
- The D5 test first targeted `id_evento = 0`, which matches no row, so the trigger could never fire. It now targets an existing event.
- Not covered on the DB yet: signature rows written by the backend (`SUBIDA_FIRMADA` / `CONFIRMACION_APP`) and events written by the API. These need the backend running, so after 014.
- Still not run at that point: *migrations recorded* (needs 014–015) and *unique DNI* (needs 015).

**014 on the real development database** (applied 09:47:32, 8/8 statements):
- `dual_solicitud_empresa_transportes` was created with both FKs. `transportes_conocidos` exists (NOT NULL, default 1).
- Backfill: 22 company-wide rows were copied to 22 per-application rows, with **0 mismatches**. All 9 applications are `transportes_conocidos = 1`, because every company has one application, so no history was marked unknown.
- `dual_empresa_transportes` is untouched (22 rows).
- DB tests 4/4 pass again. Mock tests 53/53. Cleanup verified: 14 reservations, 45 documents, 0 signatures, 6 events.
- **Read-only smoke test of the Phase 2 backend against the real DB** (a guard refused every non-SELECT):
  - `GET /reservas` (14), `GET /solicitudes/empresa/todas` (9, transports per application, all known), `loadEmpresaDatosRead`, Seguimiento (`queryStaffPage`, `buildStaffList`) all work on the real schema.
  - Dates come back as strings (`2026-09-01`, V-3).
  - The 6 exempt convenios show *Validado* with no signatures.
  - Convenio 37 shows *Rechazado*.
  - **The two pending legacy convenios 38 and 39 (applications 7 and 8) now show *Pendiente de firma (empresa)*:** D1 in effect. Staff can validate them once the company signs or uploads the signed file.
- Not covered on the DB yet: writes through the API (uploads, signatures, validations, events). They need the backend running with real logins (manual checks in §8).

## 1. Database verification (Batch A, read-only)

Target confirmed before any query:

- MySQL **8.0.44** on this PC: host `Kateryna`, `localhost:3306`, schema **`proyecto_dual`**, user `root@localhost`.
- Time zone `SYSTEM` (Romance Standard Time); binary log ON.
- Small test data: 17 students, 9 companies (one application each), 14 reservations, 45 documents.
- `proyecto_dual_old` (a different, legacy schema) was ignored.

Every check ran inside `START TRANSACTION READ ONLY`.

| Item | Finding | Status |
| --- | --- | --- |
| **V-1** | **Confirmed.** `sp_validar_solicitud_alumno` requires types id 1 (`CV`) and id 2 (`ANEXO_2`). New applications store `ANEXO_DGA` (id 6), so every new student validation fails. | Fixed in 012 (by name: `CV` + `ANEXO_DGA`). **Not applied.** |
| **V-2** | `dual_preferencias` and `dual_solicitud_preferencias` exist, created 2026-10-27 01:25, and match `011_preferencias_alumno.sql` exactly. Both are empty. | Resolved on this DB. **Please confirm you ran 011.** |
| Migration 006 | `dual_convenio_tokens` is absent. No code reads or writes it. | Retired; not in the baseline. |
| Migration 007 | Only partly applied: the tutor table and column exist, but the live `sp_reasignar_reserva` is the older version without the tutor reset. | Completed by 012. |
| PM-4 | Procedures and triggers compare against ids 1/2/3. `trg_dd_*` knew only the legacy types. | 012. |
| V-4 | No migration history. `after_schema_patch.sql` is obsolete and unsafe to re-run. | Baseline + runner. |
| WF-4 | Visible in data: reservation **3** is CANCELADA and still has a validated, current Anexo H. | 012 retires documents on reactivation. |
| V-6 | 0 duplicate DNIs, 0 not normalised (binary comparison), 0 unusual formats. | 015 is safe here; it re-checks itself. |
| Data | All 45 documents have `origen = LEGACY`; 0 signature rows and 0 archived versions. Convocatorias 2 and 3 overlap by 3 days (Phase 1 picks the newest). | — |
| Views | `vw_*` still use numeric ids. No code uses them. | Left as they are (noted). |

**Repository vs database:** `db/000_baseline.sql` was generated from this database, so its object definitions equal the live ones by construction (58 objects; `DEFINER` and `AUTO_INCREMENT` normalised).

**Not yet verified:** that the baseline runs cleanly on an empty server. That needs an empty schema (see §7).

## 2. Business decisions

| # | Decision (yours) | How it is implemented |
| --- | --- | --- |
| D1 | All applicable signatures before validation. An upload can count as the uploader's attestation, distinct from cryptographic verification. Staff still review. Legacy exemption only for explicitly identified records. | `estadoReglas.documentoValidable`. Signatures record a **method**: `SUBIDA_FIRMADA` (uploader declared it) or `CONFIRMACION_APP` (pressed *Firmar*), plus `firmado_por`. Validation still requires staff. Exemption is a per-row flag `firmas_exentas_legacy`, set by 013 only on legacy documents that were **already VALIDADO** with no signature rows. On this DB that is 6 convenios (ids 32–36, 49), each logged as `EXENCION_FIRMA_LEGACY`. Pending or rejected legacy documents must collect signatures. |
| D2 | Correct, signed and validated annex before confirming. Use the stored type. Allow correction while no file is uploaded. | `tipoContratoCambiable` + `reservaConfirmable` in Node; `sp_confirmar_reserva` re-checks the stored type and the current validated annex under its lock. A rejected annex of the old family moves to history when the type changes. |
| D3 | **Do not change** company quota and ciclo permissions. | Unchanged. Still undecided; documented, not implemented. |
| D4 | Transports per application; do not invent history. | New table `dual_solicitud_empresa_transportes`. 014 copies the company-wide set only to each company's **most recent** application; older ones get `transportes_conocidos = 0`, shown as *"No registrado"*. On this DB every company has a single application, so all 9 keep their data. |
| D5 | Append-only audit trail. | `dual_eventos` (entity, id, action, previous/new state, user id and role, reason, small JSON detail; ids only). Triggers refuse `UPDATE` and `DELETE`. |
| D6 | Rejecting a convenio should affect company validation, without forcing cancellation of confirmed placements. **Needs a safer design.** | **Not implemented.** Rejecting a convenio of a validated company keeps the current behaviour (company unchanged); the event records `empresa_validada_sin_cambios`. Proposal in §3. |
| D7 | Reopen rejected applications in the active convocatoria, logged. | `POST /solicitudes/{alumno,empresa}/:id/reabrir`, plus a *Reabrir solicitud* button on the student card. |
| D8 | Migrations prepared with effects and rollbacks; ask before applying; check DNI duplicates first; never merge or delete students. | 012–015 plus `db/rollback/`. 015 aborts itself on duplicates or unnormalised values. **Nothing applied** (§6). |

**Rule derived from existing behaviour (please confirm):** validating or rejecting an application now only works from PENDIENTE, and a rejected document must be replaced before it can be validated. The UI already offered these actions only for pending items; the API now enforces the same (roadmap: "each illegal transition returns 400").

## 3. Proposal for D6 (for your approval, not implemented)

**"Convenio pendiente de regularizar"**: an exception state derived from the data. It needs no new column and no cancellations.

- **Trigger.** The company application is VALIDADO, but its current convenio is RECHAZADO (or a new one is PENDIENTE review).
- **Effects while open:**
  - The application **stays VALIDADO**.
  - **Confirmed reservations are untouched.**
  - **New reservations** for that company are refused with a clear message.
  - **Pending reservations cannot be confirmed** until the convenio is valid again.
  - Staff see the company flagged *Convenio pendiente de regularizar* in *Empresas colaboradoras*, with the rejection reason.
  - Every step is logged.
- **Resolution:**
  - (a) The company uploads a corrected convenio, staff validate it, and the exception closes on its own.
  - (b) Staff deliberately reject the whole application, which is only allowed when it has no confirmed reservations. Confirmed ones must first be resolved individually, by cancelling or reassigning each placement with its own reason.
- **Effort.** Backend checks in `reservar`/`confirmar` plus one flag in the company list. No migration.

## 4. Implemented changes

| Item | Change | Files |
| --- | --- | --- |
| V-4 baseline | Schema dump to `000_baseline.sql` (lookup rows only). Retired scripts moved to `db/legacy_migrations/`. Runner with `status`, `mark-baseline`, `up` and a `schema_migrations` table (checksums). Schema `diff` tool. Production guard. | `db/000_baseline.sql`, `db/README.md`, `db/legacy_migrations/*` (moved), `backend/scripts/{migrate,schema}.js`, `backend/scripts/lib/{connect,schemaDump,sqlScript}.js`, `backend/package.json` (`db:migrate`, `db:schema`) |
| PM-4, V-1, WF-4, WF-5 (DB) | Migration 012: `fn_id_estado_reserva`, `fn_id_estado_validacion`, `fn_id_tipo_documento`. Every reservation, validation and document procedure and trigger resolves by name. V-1 fix. Reactivation retires documents and clears the tutor. Confirmation uses the stored type and needs the validated annex. Document triggers know the current catalogue. | `db/migrations/012_*.sql`, `db/rollback/012_*.down.sql` (exact pre-012 bodies taken from the baseline) |
| PM-5 / D5, D1 | Migration 013: `dual_eventos` (append-only), signature `firmado_por`/`metodo`, explicit legacy exemptions. `auditLog.recordEvent` runs inside the transaction; `recordEventAfterCommit` is used after procedures that commit themselves. | `db/migrations/013_*.sql`, `backend/src/services/auditLog.js` |
| D1 / WF-6 | Signatures apply to every document with a file and signers unless explicitly exempt. Signature method labels. `validar` locks the document, checks the rules and logs. `firmar` and `firmarContexto` share one transactional path. | `documentCatalogue.js`, `documentosWorkflow.js`, `documentosService.js`, `estadoReglas.js` (new) |
| WF-7 | A validated convenio validates only a **PENDIENTE** company, in the same transaction. A *Rechazar convenio* button (with reason) was added to the convenio viewer. Company status on rejection is unchanged (D6). | `documentosService.js`, `ConvenioViewer.jsx`, `AdminCompanyView.jsx` |
| WF-5 / D2 | `setTipoContrato` locks and applies the D2 rule, retires a rejected old-family annex and logs. `confirmar` checks the stored type, annex, signatures and validation, calls the procedure with the **stored** type and logs (including sibling cancellations). | `reservasService.js` |
| WF-4 (Node) | Annex lookups in the reservation lists use only the current version. The four duplicated SQL `CASE` blocks are replaced by `anexoClaveSql()` next to `anexoClaveForContrato()`. | `reservasService.js`, `documentCatalogue.js` |
| Annex generation | Refused for cancelled reservations and for the wrong contract family. | `documentosService.js` |
| PM-6 | `saveByClave` runs the procedure, provenance, signature reset, uploader attestation and audit event in **one transaction**, or joins the caller's. A new file is never exempt. | `documentosStore.js`, `documentGenerationService.js` |
| D7 / WF-18 | Shared transition helper (lock, rule, change, event). Validate/reject only from PENDIENTE. Reopen endpoints. | `solicitudTransiciones.js` (new), `solicitudesAlumnoService.js`, `solicitudesEmpresaService.js`, both route files, `useLinkStudents.js`, `LinkStudents/index.js`, `StudentCard.jsx`, `EstadoSolicitud.jsx` |
| D4 / WF-11 | Migration 014. Reads and writes go to `dual_solicitud_empresa_transportes` (create, reapply, staff edit, approved change request, lists). The company portal shows *"No registrado"* for unknown history. | `db/migrations/014_*.sql`, `empresaDatos.js`, `solicitudesEmpresaService.js`, `CompanyView/index.js` |
| WF-11 | Coordinator copy-on-write: before the coordinator contact is edited (staff edit, approved change, re-application with new values), the other applications move to a frozen copy with the old values. The live contact keeps its id, so the account and tutor entry stay linked. | `empresaDatos.js` (`freezeCoordinadorForOtherSolicitudes`), `solicitudesEmpresaService.js` |
| V-3 | `dateStrings: ['DATE']` on the pool: DATE columns arrive as `YYYY-MM-DD`. The screens already handle strings (`split('T')[0]` is a no-op; `formatDate` adds T12:00). | `db/pool.js` |
| V-6 | DNI lookups use `dni = ?` (indexed; locks one row). Migration 015 adds `uq_gf_alumnosfct_dni` after a self-check. | `solicitudesAlumnoService.js`, `authService.js`, `db/migrations/015_*.sql` |
| Docs | State-transition tables, DB guide, this report, roadmap status. | `docs/STATE_TRANSITIONS.md`, `db/README.md`, `docs/PHASE_2_REPORT.md`, `docs/ROADMAP.md` |

### Behaviour changes users will notice (after migrations)

- Annexes, convenios and calendars cannot be validated while a signature is missing. The error names who still has to sign.
- A company uploading its signed convenio or annex counts as the company's signature. The centre and the student still sign with *Firmar*.
- The **auto-generated convenio** can no longer be validated until the company signs it (in practice, uploads it). WF-6 asked for exactly this.
- Confirmation fails with a clear message when the annex is missing, unsigned or not validated, or when the request carries another contract type.
- A contract type can no longer be changed while its annex file is under review or validated: reject the file first.
- A validated application can no longer be rejected through the API, and a rejected one must be reopened before it can be validated.
- Pending reservations that only have a legacy **Anexo H** need an Anexo II/III before confirmation. Already confirmed ones are not affected.

## 5. Migrations

| File | Effect | Changes data? | Rollback | Applied? |
| --- | --- | --- | --- | --- |
| `000_baseline.sql` | Full schema for empty databases. On this DB: record only (`mark-baseline`). | No | — | **Recorded (MARK)** 2026-10-27 09:43:24, with your approval |
| `012_reglas_por_nombre_y_reservas.sql` | 3 functions, 11 procedures, 8 triggers. | No | Restores the exact previous bodies | **Applied** 2026-10-27 09:43:35 (44/44 statements), with your approval |
| `013_auditoria_y_firmas.sql` | `dual_eventos` + 2 triggers; 2 signature columns; exemption flag; 6 exemptions + 6 events. | Flags 6 rows | Drops them (**export the audit trail first**) | **Applied** 2026-10-27 09:46:04 (13/13), with your approval |
| `014_transportes_por_solicitud.sql` | New table + `transportes_conocidos`; backfill latest application only. | Inserts copies; old table kept | Restores the company table from the latest known application | **Applied** 2026-10-27 09:47:32 (8/8), with your approval |
| `015_dni_unico.sql` | Self-check, then unique key on `dni` replaces the plain index. | No (aborts on problems) | Restores the plain index | **Applied** 2026-10-27 09:49:15 (5/5), with your approval |

## 6. How to apply (needs your approval, one step at a time)

From `backend/`, against `proyecto_dual`:

1. Take a backup: MySQL Workbench › Data Export of `proyecto_dual` (structure + data).
2. `npm run db:migrate -- status`: read-only, shows 000 and 012–015 pending.
3. `npm run db:migrate -- mark-baseline --yes`: creates `schema_migrations` and records 000 without running it.
4. `npm run db:migrate -- up --yes --to 012`, then run `npm test`, then the DB tests (step 7).
5. `up --yes --to 013`, `--to 014`, `--to 015`: one at a time, checking `status` after each.
6. Start the backend (`npm run dev`) and run the manual checks in §8.
7. `DB_INTEGRATION=1 node --test test/db/phase2.db.test.js`: real-database tests. They create one temporary reservation and its annex and delete them afterwards. The only lasting trace is gaps in auto-increment counters.

## 7. Tests and verification

| Kind | What | Result |
| --- | --- | --- |
| **Real development database** | Read-only identity, schema, procedure, trigger and data checks; migration pre-checks (DNI, trigger compatibility for 014's update, exemption count for 013). | Done; findings in §1 and §2 |
| **Real development database** | `test/db/phase2.db.test.js` (6 tests): migrations recorded, V-1 by name, trigger by name, append-only audit trail, unique DNI, cancel → re-book retires annex and clears type/tutor, confirmation checks. | **6/6 pass** (after 015, 2026-10-27). Run with `DB_INTEGRATION=1 node --test test/db/phase2.db.test.js` |
| **Mocks** (`npm test`, node:test, fake pool) | 30 Phase 1 tests + 23 Phase 2 tests. The Phase 2 tests cover the splitter; migration/rollback pairing and a baseline with no `DEFINER` and no personal tables; D1 (signatures, explicit exemption, guards); D2 (type correction and confirmation); D7 transitions; validation/rejection services; convenio cascade only for PENDIENTE; D6 behaviour preserved; transactional save with attestation, and rollback on failure; contract-type lock and retirement; confirmation with stored type and sibling events; current-annex lists; reopen; company rejection rule; coordinator copy-on-write; per-application transports; V-3/V-6. | **53/53 pass** (6 DB tests skipped) |
| **Static** | `node --check` on every changed backend file; ESLint `--max-warnings 0` on the changed frontend files; `CI=true react-scripts build`. | Pass. The first build failed in an untouched file (`AddCompanyRequest`) because of a stale `node_modules/.cache`. After moving the cache to `%TEMP%\fpdual_cra_cache_backup`: *Compiled successfully* |
| **Browser** | — | **Not done.** The new buttons (*Rechazar convenio*, *Reabrir solicitud*) and the "No registrado" text are unverified in a browser |

**Unverified:**
- Every new SQL file on a real server (syntax and behaviour).
- The baseline on an empty schema. Allow a throwaway schema such as `proyecto_dual_rebuild` and I'll run `up` there plus `db:schema diff`.
- Concurrency of the changed procedures (two reservations for the last place). The locking order is unchanged, but it has not been exercised.
- All end-to-end flows through the UI.

## 8. Manual checks after applying (development database)

1. **V-1.** A new student with CV and Anexo DGA validated → *Validar alumno* succeeds.
2. **D1.** Upload an Anexo II as the company → it shows *Firmado (declarada al subir)* for the company and *Sin firmar* for the centre and student → *Validar* says who is missing → sign as the centre and as the student → *Validar* works.
3. **D2.** On a pending reservation with no annex, switch Beca ↔ Contrato freely. After the company uploads the annex, switching is refused. Reject it → switching works and the rejected file moves to history.
4. **WF-5.** Confirm with a validated and fully signed annex → *Confirmada*. A forced request with another `id_tipo_contrato` → 400.
5. **WF-4 (acceptance).** Cancel a reservation that has an annex, then reserve the same student/offer again → no annex, no type, no tutor.
6. **D7.** Reject a student, then *Reabrir solicitud* → back to pending. With no active convocatoria → refused.
7. **D4/WF-11.** In the active convocatoria change the coordinator's phone and the transports → earlier applications (if any) keep their values.
8. **V-3.** `GET /convocatorias` shows `fecha_inicio` exactly as stored.
9. **Audit.** `SELECT entidad, id_entidad, accion, estado_anterior, estado_nuevo, id_usuario FROM dual_eventos ORDER BY id_evento DESC LIMIT 20;`

## 9. Acceptance criteria (ROADMAP Phase 2)

| Criterion | State |
| --- | --- |
| A clean database built from the repo matches production (`--no-data` diff empty) | 🟡 The baseline equals the dev DB by construction. The rebuild on an empty schema is not run. **Production was never inspected** (no access): the diff against production remains yours to run |
| Each illegal transition returns 400 through the API | 🟡 Covered by mock tests (§7). On the DB: the procedure-level refusals (confirmation without type, without validated annex, with another type; wrong document parent) are verified. The HTTP 400s with real logins are **not yet** run (§8) |
| Cancel-and-rebook shows no inherited annex | ✅ Verified on the real DB: the re-booked reservation has no current annex, no type and no tutor, and the retired annex cannot support a confirmation. The UI view is not yet checked in a browser |
| Deliverables: baseline + numbered migrations; state tables; API smoke tests | ✅ Baseline + 012–015 + rollbacks; state tables; 23 mock API tests; 6 DB tests passing; read-only backend smoke test |

### Phase 2 items

| Item | State |
| --- | --- |
| V-4, PM-4 | ✅ code + migration applied; DB-level checks pass where covered |
| WF-4 | ✅ code + migration applied; DB-level checks pass where covered |
| WF-5 | ✅ code + migration applied; DB-level checks pass where covered |
| WF-6 | ✅ code + migration applied; DB-level checks pass where covered |
| WF-7 | 🟡 validation side done; rejection → company effect waits for **D6** |
| WF-11 (coordinator + transports) | ✅ code + migration applied; DB-level checks pass where covered |
| PM-6 | ✅ code + migration applied; DB-level checks pass where covered |
| V-3 | ✅ code (no migration) |
| V-6 | ✅ code + 015 applied; unique key verified |
| PM-5 | ✅ code + migration applied; DB-level checks pass where covered |
| WF-18 | ✅ code (mock-tested); not yet exercised on the DB. Company reopen is API-only: the company card has no review actions today |
| Phase 1 carry-overs | **V-1:** ✅ fixed by 012 and verified on the DB. **V-2:** ✅ tables present. **End-to-end UI testing on the DB:** still outstanding (§8) |

## 10. Risks and open points

- **The backend on this branch needs 012–015.** They are now applied on the dev DB. **Do not deploy it to production** before the same migrations and a production schema diff.
- **D6 is open.** A validated company whose convenio is rejected stays validated (unchanged behaviour), but nothing flags it yet.
- **D3 is open.** Companies can still raise quotas and add ciclos after validation.
- **Production schema unknown.** The baseline describes your development DB. If production differs (for example, 007 also only partly applied, or 011 missing), compare it with `db:schema diff` before `mark-baseline` there.
- **Audit gaps by design.**
  - Events for procedures that commit themselves are written right after the commit; a failure there is logged to the console, not returned to the user.
  - Earlier history (before 013) is not reconstructed.
- **Tutor history.** A past reservation's tutor shows the tutor's *current* contact details. Copy-on-write covers the principal coordinator on applications, not the tutor records.
- **`dual_empresa_transportes`** is no longer read or written. Drop it in a later migration once 014 is accepted.
- **Signatures are declarations, not cryptographic checks.** PDF signature verification is Phase 5 (SEC-9).
- **Stale build cache.** The frontend's `node_modules/.cache` caused a false build error. The cache was moved to `%TEMP%\fpdual_cra_cache_backup`; delete it whenever you like.

**Phase 2 is not complete.** Migrations 012–015 are applied and verified on the development database. What remains: the manual end-to-end checks with real logins (§8), the rebuild of the baseline on an empty schema (needs your OK for a throwaway schema), and the D6 decision (D3 stays deferred). Phase 3 has not been started.
