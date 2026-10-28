# FP Dual — Database Improvement · Stage 2 Report

_FP Dual · 2026-10-28 · branch `database-improvements-stage-2` (based on the committed Stage 1, not pushed). Plan: [DATABASE_IMPROVEMENT_PLAN.md](DATABASE_IMPROVEMENT_PLAN.md). Findings: [DATABASE_AUDIT.md](DATABASE_AUDIT.md). Previous stage: [DATABASE_STAGE_1_REPORT.md](DATABASE_STAGE_1_REPORT.md)._

**Status: complete. Migration 018 was applied to `proyecto_dual` on 2026-10-28 at 15:57 with your approval and verified (§12).** Nothing is pushed or merged; Stage 3 has not started.

## 1. Summary

| Objective | Result |
| --- | --- |
| Every attempt is its own record | The unique key `(alumno, oferta)` is replaced by a unique key on the **active** pair only. Re-booking always inserts a new row, and reassignment inserts a new row linked through `id_reserva_origen`. Tested with real MySQL. |
| Cancelled attempts are history | A CANCELADA row is final: the update trigger refuses any change to state, contract type, tutor or reason. Re-activation code removed from both procedures. |
| Contract type, tutor, documents and reason preserved | Cancellations no longer clear the contract type (D5). Tutor, reason and documents stay with the attempt, and a new attempt starts empty. |
| Transitions and audit atomic | Procedures no longer open, commit or roll back. `src/db/transaction.js` owns the transaction, and the audit events are written on the same connection before the single COMMIT. An event that cannot be written rolls the transition back (fault-injected). |
| Standard transaction ownership and locking | One helper. One lock order: student application → company application → offers (ascending) → reservations. Nothing changes a reservation's state without holding its offer. Locking counts use pinned indexes. |
| Correct under concurrency | Real concurrent sessions: last place, confirm vs book, two confirmations, quota cut vs booking, and an 80-operation stress test. Invariants hold, with no deadlock and no retry in 8 consecutive full runs. |
| *Baja* atomic | Application state, accounts, every reservation cancellation and every event are one transaction. Emails are sent only after COMMIT. |
| Quota reduction | Goes through the common cancellation procedure with an event per reservation, plus an `OFERTA/CUPO` event. All or nothing. |
| Audit coverage | New entities `OFERTA` (quota change, new offer) and `TUTOR` (create, edit, deactivate), plus `RESERVA/TUTOR` for tutor assignment. |

## 2. Database objects (migration 018)

File: `db/migrations/018_reservas_por_intento_y_transacciones.sql`. Rollback: `db/rollback/018_reservas_por_intento_y_transacciones.down.sql`.

| Object | Change |
| --- | --- |
| `dual_reservas` | − `uq_dual_reservas_alumno_oferta`.<br>+ generated `id_alumno_activo` (application id while PENDIENTE/CONFIRMADA) and unique `uq_dr_par_activo (id_alumno_activo, id_solicitud_empresa_especialidad)`.<br>+ `id_reserva_origen` (self-FK, unique: an attempt is replaced at most once).<br>+ `ix_dr_solicitud_alumno` (FK index once the old key is gone; also the pinned index for per-student locks). |
| `trg_dr_bi_reglas` | Locking reads (FOR SHARE) for applications, offer and counts. Checks that `id_reserva_origen` is a cancelled reservation of the same application. |
| `trg_dr_bu_reglas` | CANCELADA is final (any real change refused; a no-op is allowed). `id_reserva_origen` is immutable. The "cancelled cannot have a contract type" rule is removed (D5). Reactivation branch removed. |
| `trg_dsee_bu_cupo` (017) | Counts with a locking read instead of `fn_reservas_activas`, which is a plain read. |
| `sp_reservar_alumno`, `sp_reasignar_reserva`, `sp_confirmar_reserva`, `sp_cancelar_reserva`, `sp_cancelar_reserva_admin` | No `START TRANSACTION`/`COMMIT`/`ROLLBACK` and no rollback handler. Each refuses to run when `@@autocommit = 1` (SQLSTATE 45001, which the API reports as 500). Every procedure takes locks in the 018 order, and eligibility is checked before places. Re-booking always inserts. Cancellations keep the contract type. |
| `dual_eventos` | `chk_de_entidad` + `OFERTA`, `TUTOR`. `estado_anterior/nuevo` VARCHAR(30) → (40). `ix_de_entidad` → `ix_de_entidad_fecha (entidad, id_entidad, creado_en)`. |

**Supporting indexes reviewed.** `ix_dr_solicitud_alumno` was needed: without it the FK on `id_solicitud_alumno` would have no index of its own once the old unique key was dropped. `ix_dual_reservas_oferta_estado` (existing) serves the per-offer counts. No other index is needed. The new unique keys cover the active-pair and origin lookups.

**Unchanged:** the four protected tables (byte-identical definitions, verified on both databases), `uq_dual_reservas_confirmada_alumno` (one placement per student), every other table, procedure and trigger.

**Pre-migration checks (guard `sp_018_comprobar`, stops without changes):** lookup ids are PENDIENTE=1, CONFIRMADA=2, CANCELADA=3 (the generated keys use them); no duplicate active pair; no offer over quota.

**Post-migration checks:** listed at the end of the migration file (old key absent, generated column consistent, autocommit guard active, event count unchanged by the migration).

## 3. Backend and frontend files

| File | Change |
| --- | --- |
| `backend/src/db/transaction.js` (new) | `inTransaction(fn)`: one connection, `SET autocommit = 0`, READ COMMITTED for that transaction, one COMMIT. Any error rolls back. A deadlock restarts the **whole** `fn` on a new connection (at most 2 retries). Lock-wait timeouts are not retried. Autocommit is restored before release, and a broken connection is destroyed. `HttpError` carries business refusals. |
| `backend/src/services/reservasTx.js` (new) | The only module that calls the five procedures (statically tested). Each function runs the procedure and writes its audit event on the caller's connection. It also has the lock helpers (`bloquearSolicitudDeReserva`, `bloquearOfertas`, `bloquearParaConfirmar`). |
| `backend/src/services/reservasService.js` | `reservar`, `reservarAdmin`, `cancelar`, `cancelarAdmin`, `reasignar`, `confirmar` and `setTipoContrato` run through `inTransaction`. Confirmation checks (annex, signatures) are now inside the transaction, under locks. Emails go out after COMMIT. Pair-reuse helpers removed. The detail response gains `id_reserva_origen` and `relacionadas` (origin, successor, earlier/later attempts on the same offer; a company sees only its own). |
| `backend/src/services/bajaService.js` | *Baja* is one transaction. The partial-failure path (`pendientes`) is gone: the response keeps the field, always empty. |
| `backend/src/services/solicitudesEmpresaService.js` | Quota reduction goes through `inTransaction` + `reservasTx.cancelarPendiente`, with an `OFERTA/CUPO` event. It locks only the offer, where it used to lock five joined tables including protected-table rows. New offers record `OFERTA/ALTA`. |
| `backend/src/services/empresaTutoresService.js` | `TUTOR` events (ALTA, EDITAR with field names only, DESACTIVAR) and `RESERVA/TUTOR`. Tutor assignment locks only the reservation (`FOR UPDATE OF r`); it used to lock the joined offer and company application too, in the wrong order. |
| `backend/src/services/documentosService.js` | `lockDocumento` locks the parent (reservation/application) before the document. This is the order of uploads and confirmations; the previous order was inverted. |
| `backend/src/services/auditLog.js` | `OFERTA`, `TUTOR`. `recordEventAfterCommit` removed. |
| `frontend/src/components/reservas/ReservaDetalle.jsx` | New card **«Intentos relacionados»** (Reasignada desde / Reasignada a / Intento anterior / posterior con esta oferta, each with its state and a «Ver» button that opens it in the same panel). After a reassignment the panel switches to the new reservation. No other screen needed changes: lists already group by state, and CANCELADA rows appear under «Canceladas». |
| `db/README.md` | 018 deployment pairing, manual procedure calls, guard recovery, rollback limits. |

## 4. Tests

**Real MySQL** (`proyecto_dual_verify`, synthetic data only, separate connections; the database is dropped after each run):

| Suite | Result |
| --- | --- |
| `test/db/stage2.db.test.js` (new) | **21/21**, repeated **8 consecutive runs, all clean** (plus 3 earlier runs). |
| `test/db/stage1.db.test.js` | 14/14. |
| `test/db/phase2.db.test.js` (rewritten reservation scenario for 018) | 6/6 on a migrated verify database with synthetic data. |

The 21 Stage 2 tests:

1. Synthetic fixtures.
2. 018 applies; the four protected tables are unchanged.
3. Protected tables equal `proyecto_dual`'s.
4. Rollback restores 017 exactly, and 018 re-applies.
5. All five procedures refuse autocommit.
6. Static check: no procedure call outside `reservasTx.js`, no `recordEventAfterCommit`.
7. Last place, raw sessions and through the backend (3 rounds).
8. Confirmation vs new booking of the same student, both orders.
9. Two simultaneous confirmations for one student.
10. Cancel and re-book: new row; contract type, tutor, reason and annex stay with the first attempt; a duplicate active pair is refused; the detail shows the earlier attempt.
11. A cancelled row cannot be reactivated or edited.
12. Invalid transitions refused.
13. Reassignment records the origin; events on both; a second successor is refused.
14. Audit fault injection.
15. *Baja* fault injection.
16. Quota cut vs booking, both orders.
17. Quota reduction through the backend, including fault injection.
18. Stress test.
19. Every reservation created by the backend has exactly one RESERVAR event and a last event matching its state.
20. No InnoDB deadlock during the suite.
21. Rollback refused once attempts exist.

**Mocked (no database):** backend `npm test` 94 pass, 41 skipped (DB suites without `DB_INTEGRATION`), **1 fail**: `mail/config: development defaults to log mode`. This failure predates Stage 1: the test reads `MAIL_MODE` from the local `.env`. New `test/stage2.test.js` 7/7 (helper protocol, deadlock retry of the whole function and its bound, no retry on lock-wait timeout, broken connection destroyed, event before COMMIT and email after, refusal rolls back and sends nothing). `test/phase5.test.js` baja tests rewritten for the atomic behaviour (the old test asserted the partial-failure path that Stage 2 removes).

**Static and build:** frontend ESLint `--max-warnings 0` on `.js/.jsx`: 0. Frontend tests 28/28. `react-scripts build`: compiled successfully. `node --check` on every backend file: OK. A basic backend ESLint pass (no project config exists) reports only the existing Express error handler's required `_next` parameter.

**Browser (built-in browser, synthetic data):** the Stage 2 backend ran against `proyecto_dual_verify` on port 3002 behind a static server on port 3005; your dev servers were not touched.
- Logged in as a synthetic administrator.
- «Reservas» groups active and cancelled attempts separately, and cancelled rows show their contract type.
- The reassigned reservation's panel shows «Reasignada desde»; «Ver» switches to the origin.
- The origin is read-only, shows its reason, and links «Intento anterior» and «Reasignada a».
- The first attempt still shows Beca, its tutor and its validated Anexo III.
- The API log showed no errors.

## 5. Concurrency results

| Scenario (real sessions) | Result |
| --- | --- |
| Two bookings for the last place | B waits on the offer lock; when A commits, B is refused «No quedan plazas». 1 active reservation. The same race through the backend 3×: one success, one refusal, one RESERVAR event. |
| Confirmation, then a booking of the same student | The booking waits on the student application, then «ya tiene una reserva confirmada». |
| Booking, then a confirmation | The confirmation waits, then confirms and cancels the new pending sibling («Alumno asignado a otra empresa.»). Exactly one placement. |
| Two confirmations of one student at once | One succeeds; the other gets «Solo una reserva PENDIENTE puede confirmarse». A direct SQL insert of a second confirmed row is refused too. |
| Quota cut, then a booking | The booking waits, then «No quedan plazas». |
| Booking, then a quota cut | The cut waits, then the floor trigger refuses it. Never over-allocated. |
| 8 workers × 10 random operations (book, confirm, cancel, reassign) | Only business refusals. No over-quota offer, no student with two placements, no pair with two active attempts. |
| InnoDB «LATEST DETECTED DEADLOCK» across the suite | Unchanged in 8/8 runs; no retry logged. |

**One deadlock found and designed out.** The first stress run hit a real deadlock:
- a booking held the offer index entries while waiting for a reservation row;
- a cancellation held that row and needed the index entry to change the state.

The fix is the "offer before state change" rule plus pinned indexes and READ COMMITTED (all in the migration header). After that, no deadlock in any run. Deadlocks are still retried (bounded) as a safety net.

**Other defects found by these tests and fixed before any report:**
- Rollback guard messages over MySQL's 128-character limit.
- Wrong index order after rollback.
- Lock-order inversions in tutor assignment and document review.
- Places checked before eligibility: a withdrawn student booked onto a full offer was told «No quedan plazas» instead of the real reason. This caused 1 failure in 4 runs; a deterministic test now covers it.

## 6. Audit-event atomicity

- Every reservation transition writes its event(s) inside `fn` on the transaction's connection. There is no code path that logs after commit.
- Fault injection with a temporary `BEFORE INSERT` trigger on `dual_eventos`:
  - a booking whose RESERVAR event fails leaves no reservation;
  - a confirmation whose sibling CANCELAR event fails leaves the reservation PENDIENTE, the sibling PENDIENTE and no CONFIRMAR event.
- Fault injection on a reservation update:
  - a *baja* whose second cancellation fails leaves the application VALIDADO, the account active, the first cancellation undone and no events;
  - a quota cut whose cancellation fails leaves the quota, the reservation and the events untouched.
- No duplicate events: re-booking an active pair is refused (it used to return the existing id silently). Confirmation writes one CONFIRMAR plus one CANCELAR per cancelled sibling. Reassignment writes REASIGNAR on the origin and RESERVAR on the new attempt.
- Events record entity, id, action, previous/new state, user id and role, reason, and a JSON detail (ids only), with a millisecond timestamp. The audit trail stays append-only.

## 7. Historical data

- **New behaviour:** every attempt keeps its contract type, tutor, reason, documents and signatures. Reassignment links are stored on the row and in the events.
- **Existing rows are not rewritten.** On `proyecto_dual` today: 16 reservations, 7 of them cancelled and **all 7 without a contract type**, because the old rules cleared it. That cannot be recovered except partly from `RESERVA/TIPO_CONTRATO` events, and 018 does not attempt it. One reservation has non-current documents; it is likely a pre-018 re-activation whose two attempts share an id, and that can't be split.
- Rows created before 018 have `id_reserva_origen` NULL; earlier reassignments are visible only in the events.

## 8. Rollback

- **Safe only right after 018:** the rollback is exact (tested: the schema equals the 017 dump, including index order) **only while no student/offer pair has a second attempt and no OFERTA/TUTOR event exists**.
- **Usually not possible:** both conditions arise with normal use, often within the first session (any quota change writes an OFERTA event). Once they exist, the down script's guard **stops without changing anything** (tested). Restoring the old unique key would mean deleting valid historical attempts, and the audit trail is append-only.
- **Real way back:** restore the verified backup taken right before 018, losing every change made since.
- **Data lost even by a successful rollback:** `id_reserva_origen` (the events keep the links).
- **Deployment order:** deploy the previous backend before running the rollback.

## 9. Known limitations and risks

1. **Branch and database must match.** `proyecto_dual` now has 018, so the backend must run from `database-improvements-stage-2` (or a branch that contains it). The Stage 1 branch `database-improvements` alone would call the new procedures without a transaction and get SQLSTATE 45001.
2. **Manual procedure calls.** Calls from Workbench need `SET autocommit = 0; … COMMIT;` (documented in `db/README.md`).
3. **SQLSTATE 45001** (procedure called without a transaction) surfaces as HTTP 500 by design: it is a programming error, not a user error.
4. **Wider responses.** The detail endpoint returns `relacionadas`, and the lists return cancelled attempts as separate rows (they already did). No API field was removed; `pendientes` in the *baja* response is always empty.
5. **Coarser locking.** The offer row is the serialisation point for its reservations. That is correct and cheap at the centre's scale; under very heavy concurrent booking on one offer, requests queue briefly.
6. **Lookup ids.** The generated keys depend on PENDIENTE=1 and CONFIRMADA=2. The 018 guard checks this, and so did the pre-existing confirmed-placement key.
7. **Hard-coded ids in Node.** `bloquearParaConfirmar` and `bajaService` use state ids 1/2 in two queries, consistent with the generated keys. A future lookup reseed must keep the ids.

## 10. Procedure to activate 018 in `proyecto_dual` (approved and carried out, see §12)

- **Database identity (read-only, just now):** `proyecto_dual`, migrations 000, 012–017.
- **Pre-flight of the 018 guards:** lookup ids 1/2/3; 0 duplicate active pairs; 0 offers over quota → 018 would apply.
- **Expected data changes:** none to existing rows. Generated `id_alumno_activo` is filled for the 9 active reservations, and `id_reserva_origen` is NULL everywhere. Procedures and triggers are replaced, and `dual_eventos` is altered (no rows changed).
- **Procedure:**
  1. Stop your backend.
  2. `npm run db:backup` and `npm run db:backup -- verify <file>`.
  3. `npm run db:migrate -- up --yes --to 018`.
  4. Verify: clean-install diff equals `proyecto_dual`, protected tables unchanged, post-migration queries, the Phase 2 DB suite on `proyecto_dual`.
  5. Start the Stage 2 backend; smoke test with the seeded accounts.
- **Rollback limits:** §8. Realistically, after the first quota change or re-booking, only the backup restore.

## 11. Items requiring your approval

1. Merging, pushing or opening a PR for `database-improvements` / `database-improvements-stage-2`: nothing has been pushed.
2. Starting Stage 3.

## 12. Application to `proyecto_dual` (2026-10-28)

| Step | Result |
| --- | --- |
| Identity | `proyecto_dual` @ localhost, migrations 000, 012–017, 018 pending; working tree clean on `database-improvements-stage-2`. |
| 1. Stop the backend | Your `npm run dev` (nodemon) on 3001 stopped; the frontend dev server on 3000 left running. **The backend is not running now: start it with `npm run dev` in `backend/` (this branch).** |
| 2. Backup | `backups/proyecto_dual_20261028_145704.sql` (896,808 bytes, timestamp UTC). Verified by restore: 30 tables, schema, row counts and checksums identical. |
| 3. Apply | `npm run db:migrate -- up --yes --to 018`: 22 statements; recorded at 15:57:16; no pending migrations. |
| 4. Schema | Identical to a clean install of the repository at 018 (`schema.js diff`: no differences). Guard procedure not left behind. |
| 4. Protected tables | `ge_contactos`, `ge_domicilios`, `ge_empresas`, `gf_alumnosfct`: definitions byte-identical to the audit-time dump. |
| 4. Post-migration queries | Old pair key absent. `id_alumno_activo` set exactly on the 9 active reservations. `id_reserva_origen` NULL on all 16. Calling a procedure with autocommit on fails with SQLSTATE 45001. |
| 4. Data | Unchanged: 16 reservations (7 pending, 2 confirmed, 7 cancelled), 46 documents, 22 audit events, 18 + 11 applications. |
| 4. DB tests | Phase 2 suite on `proyecto_dual`: 6/6, including re-booking as a new attempt; its temporary rows were removed and every count is identical afterwards. Stage 2 suite on a fresh isolated database: 21/21. |
| 5. Smoke test (Stage 2 backend on port 3002 against `proyecto_dual`, seeded test accounts, read-only) | Logins 200 for staff, company (by CIF) and student. Staff lists 200 (applications 18, companies 11, reservations 16, Seguimiento, panel). Detail endpoint 200 with `relacionadas` and `id_reserva_origen` for all 16 reservations. Company and student portals 200. No error in the server log. No row or event written. |

**Deliberately not exercised on `proyecto_dual`:** bookings, cancellations, quota changes and tutor changes. Each would write permanent audit events or new attempts, and the first OFERTA/TUTOR event or second attempt for a pair makes the 018 rollback impossible (§8). They are covered by the isolated tests. From the first such action onwards, the only way back is restoring `proyecto_dual_20261028_145704.sql`.
