# FP Dual — Database Improvement · Stage 1 Report

_FP Dual · 2026-10-28 · branch `database-improvements` (not committed, not pushed). Plan: [DATABASE_IMPROVEMENT_PLAN.md](DATABASE_IMPROVEMENT_PLAN.md). Findings: [DATABASE_AUDIT.md](DATABASE_AUDIT.md)._

**Status: complete. Migration 017 was applied to `proyecto_dual` on 2026-10-28 at 10:32 with your approval, and verified (§8).** Nothing is committed or pushed; Stage 2 has not started.

## 1. What Stage 1 changes

| Finding | Database (migration 017) | Backend |
| --- | --- | --- |
| **DB-01** ciclo stored on the student | `dual_solicitudes_alumno.id_especialidad INT NOT NULL` (FK, index), copied from `gf_alumnosfct`. Triggers `trg_dsa_bi_reglas`, `trg_dr_bi_reglas` read it; `trg_dsa_bu_reglas` refuses changing it while the application has active reservations. `vw_alumnos_disponibles` reads it. | The application insert stores the ciclo of the form. Ten queries in five services read `sa.id_especialidad` instead of `a.id_especialidad_dual`. `gf_alumnosfct.id_especialidad_dual` is still written (latest ciclo). |
| **DB-03** duplicate current documents | Generated `dual_documentos.padre_actual` + unique `uq_dd_actual (padre_actual, id_tipo_documento)`. `sp_guardar_documento` finds the current row with a locking read. | `documentosStore.saveByClave` locks the parent row **before any other read**. `mapSqlError`: `uq_dd_actual` → 409 `DOCUMENTO_CONCURRENTE`. |
| **DB-10** quota floor | Trigger `trg_dsee_bu_cupo`: places cannot be reduced below the active (PENDIENTE/CONFIRMADA) reservations. | None needed (the quota editor already cancels the chosen reservations first; a refusal maps to 400). |
| **DB-08** CIF lookups lock the company table | — | `cif = ?` instead of `UPPER(TRIM(cif)) = ?` in registration (`FOR UPDATE`), login and company-data edits; uses `uq_ge_empresas_cif`. All stored CIFs were verified normalised; both write paths normalise. |
| DB-07 (part) | — | `mapSqlError`: deadlock / lock-wait timeout → 409 `CONCURRENCIA` instead of 500. |

**Tooling added:** `npm run db:backup` (+ `verify`), `scripts/verifyDb.js` (isolated `<DBNAME>_verify`), and a fix to `scripts/lib/schemaDump.js`: views compared across two schemas were always reported as different (MySQL qualifies the names unless the schema is the connection default). With the fix, `schema.js diff` works across schemas for the first time.

**Protected tables:** not altered. 017 only reads `gf_alumnosfct` (for the copy and the guards); the new foreign key goes from `dual_solicitudes_alumno` to `dual_especialidades`.

## 2. Files

| File | Change |
| --- | --- |
| `db/migrations/017_integridad_especialidad_documentos_cupos.sql` | New. Guards, column + copy, 3 triggers, view, `padre_actual` + unique key, `sp_guardar_documento`, quota trigger, audit queries. |
| `db/rollback/017_integridad_especialidad_documentos_cupos.down.sql` | New. Restores the 012 triggers, the baseline view and procedure; drops the new objects. Data-loss warning at the top. |
| `db/README.md` | Backup and verification commands; guard recovery; 017 rollback warning and deployment order; stale "015 → 012" fixed. |
| `backend/src/services/solicitudesAlumnoService.js`, `reservasService.js`, `documentosWorkflow.js`, `documentosService.js`, `notificaciones.js` | Speciality from the application. |
| `backend/src/services/documentosStore.js` | Parent lock first. |
| `backend/src/services/authService.js`, `empresaDatos.js`, `solicitudesEmpresaService.js` | CIF lookups. |
| `backend/src/helpers/dbHelpers.js` | Error mapping. |
| `backend/scripts/backup.js`, `verifyDb.js` (new), `lib/schemaDump.js`, `seedPruebas.js`, `package.json` | Tooling; seed inserts the application ciclo. |
| `backend/test/stage1.test.js` (new, 4 tests), `test/db/stage1.db.test.js` (new, 14 tests), `test/db/phase2.db.test.js` (fixture query) | Tests. |
| `.gitignore` | `backups/`. |

## 3. Safety steps performed

1. **Working tree**: clean `main` at `ffede73` (only the two audit documents untracked); branch `database-improvements` created.
2. **Backup**: `backups/proyecto_dual_20261028_091002.sql` (893,629 bytes; timestamp in UTC), `mysqldump --single-transaction --routines --triggers --events --hex-blob`. **Verified** by restoring it into a scratch schema: schema identical, all 30 tables identical in row count and `CHECKSUM TABLE`. Scratch schema dropped. `backups/` is ignored by Git. (The first verification run showed that the `mysql` client strips `--` comments from routine bodies on restore; the tool now restores with `--comments`.)
3. **Clean install check (open since Phase 2)**: `proyecto_dual_verify` built only from `000_baseline.sql` + 012–016 is **identical** to `proyecto_dual` (`schema.js diff`: no differences).
4. **Isolated test of 017** on `proyecto_dual_verify` with synthetic data only (fictitious CIFs, DNIs and `example.test` emails); the database was dropped afterwards.
5. **Read-only pre-flight of 017's guards on `proyecto_dual`**: all zero — no student with two applications, no application without a speciality, no reservation in another ciclo's offer, no duplicate current document, no offer over quota (18 applications would be copied).

## 4. Test results

| Suite | Result |
| --- | --- |
| Backend unit (`npm test`) | 87 pass, 20 skipped (DB tests without `DB_INTEGRATION`), **1 fail: `mail/config: development defaults to log mode`** — fails identically on `main` before any change (the test deletes `MAIL_MODE`, then the module reloads it from the local `.env`). Not related to Stage 1. |
| New unit tests `test/stage1.test.js` | 4/4: application insert stores the requested ciclo (re-application with another ciclo); no service reads `a.id_especialidad_dual`; CIF lookup uses `emp.cif = ?`; error mapping. |
| New DB tests `test/db/stage1.db.test.js` (on `_verify`) | **14/14** — see below. |
| Phase 2 DB tests on the migrated `_verify` | 6/6, including the cancel/re-book/confirmation scenario through the new `trg_dr_bi_reglas`. |
| Frontend (`react-scripts test`) | 28/28 (no frontend change). |
| `node --check` new scripts | OK. |
| `EXPLAIN` registration CIF lookup on `proyecto_dual` | New `cif = ?`: const lookup on `uq_ge_empresas_cif`. Old `UPPER(TRIM(cif)) = ?`: full index scan of every row (`type=index`, 11 rows), which with `FOR UPDATE` locked them all. |

The 14 DB tests check, in order:

1. Synthetic fixtures on the 016 schema.
2. Guard: a student with two applications stops 017; the schema is unchanged.
3. Guard: duplicate current documents stop 017.
4. 017 applies; every application gets its student's ciclo; the column is `NOT NULL`; the guard procedure is gone; **the four protected tables are identical before and after**.
5. **The protected tables of the verification database equal those of `proyecto_dual`.**
6. **A student re-applies in the next convocatoria with another ciclo: the first application keeps ciclo A**, can still be placed in a ciclo-A offer (refused before 017), and is refused for a ciclo-B offer.
7. `documentosWorkflow.buildStaffList` (real backend code against the verification database) lists each application under its own ciclo.
8. An application without ciclo is refused; the ciclo cannot change while reservations are active.
9. **A second current document for the same parent and type is refused**; history rows are allowed; replacement keeps one current row.
10. **Three concurrent first uploads through `saveByClave`** succeed and leave one current document plus two archived versions.
11. An upload inside a transaction whose snapshot predates another upload updates that upload's row instead of duplicating it.
12. **Places cannot be reduced below active reservations**; raising and reducing to a still-sufficient value work.
13. The refusal maps to HTTP 400.
14. Rollback restores the exact 016 schema; 017 can be applied again once the data allows it.

**Defects found and fixed during the isolated tests** (none reached `proyecto_dual`):

- Concurrent uploads: the first version of the parent lock came after a plain read, which under REPEATABLE READ fixed the transaction's snapshot too early; the second writer hit the new unique key. Fixed by locking first **and** making the procedure's lookup a locking read (test 11 covers the case where a caller's snapshot is already fixed).
- Rollback file: a missing `DELIMITER ;` merged two statements.

## 5. Behaviour notes

- **Imported student without an account** (row exists, no portal user): before, the application silently took the speciality already stored on the student and ignored the form. Now the application stores the ciclo chosen in the form; the student row still keeps its stored value (identity not proven). This is the intended DB-01 behaviour; tell me if the old one was wanted.
- `trg_dsa_bi_reglas` no longer checks `gf_alumnosfct.id_especialidad_dual`; it checks the application's own ciclo.
- The plan mentioned checking that the ciclo is *active* on insert; not done, because it would change behaviour (Stage 1 is "no visible change"). Also dropped from the plan: a composite index on `(id_convocatoria, id_especialidad, id_estado_validacion)` — no query needs it yet; a plain FK index was added.
- After a **rollback** of 017, re-applying it stops at its guard if a returning student changed ciclo in between (their earlier reservations no longer match the student's latest ciclo). That is the guard refusing to copy a wrong value; the rollback header and `db/README.md` describe the manual correction.
- If 017 is stopped by a guard, only `sp_017_comprobar` is left behind (same as 015): drop it, fix the data, re-run.
- `test/db/phase2.db.test.js` now uses `sa.id_especialidad`, so running it against `proyecto_dual` requires 017 to be applied first.

## 6. Procedure to apply 017 to `proyecto_dual` (approved and carried out, see §8)

1. Stop the backend.
2. `npm run db:backup` and `npm run db:backup -- verify <file>` (a fresh backup; the one above predates any later data change).
3. `npm run db:migrate -- up --yes --to 017`
4. `npm run db:migrate -- status` → 017 applied; `node scripts/schema.js diff proyecto_dual_verify` after `node scripts/verifyDb.js create --to 017` → no differences; confirm the four protected tables unchanged.
5. `DB_INTEGRATION=1 node --test test/db/phase2.db.test.js` against `proyecto_dual`.
6. Start the Stage 1 backend; smoke test: student application, document upload, quota change, company login by CIF.

Rollback: deploy the previous backend, run `db/rollback/017_…down.sql`, delete the `schema_migrations` row (warning in the file), or restore the backup.

## 7. Not done (by instruction)

Nothing committed, merged or pushed; Stage 2 not started.

## 8. Application to `proyecto_dual` (2026-10-28)

| Step | Result |
| --- | --- |
| 1. Stop the backend | Your `npm run dev` (nodemon) was running and had already reloaded the Stage 1 code from the working tree, i.e. new code on the pre-017 schema; a student application would have failed in that state. Stopped (frontend dev server left running). **It is not running now: start it again with `npm run dev` in `backend/`.** |
| 2. Fresh backup | `backups/proyecto_dual_20261028_093207.sql` (893,629 bytes, timestamp UTC). Verified by restore: 30 tables, schema, row counts and checksums identical. |
| 3. Apply | `npm run db:migrate -- up --yes --to 017` → 19 statements, all applied; recorded in `schema_migrations` at 10:32:18; no pending migrations. |
| 4. Schema | `proyecto_dual` is identical to a clean install of the repository at 017 (`schema.js diff`: no differences). Guard procedure not left behind. New trigger and unique key present. |
| 4. Protected tables | `ge_contactos`, `ge_domicilios`, `ge_empresas`, `gf_alumnosfct`: definitions byte-identical to the audit-time dump. |
| 4. Data | 18/18 applications have `id_especialidad`, all equal to their student's ciclo (as expected: no student had two applications); 0 reservations in an offer of another ciclo; 45 current documents all keyed by `padre_actual`; row counts of reservations (16), documents (46), events (22) unchanged. |
| 5. DB tests | Phase 2 DB tests on `proyecto_dual`: 6/6 (they create and remove one temporary reservation; counts identical afterwards). Stage 1 DB tests on a fresh isolated database: 14/14. |
| 6. Smoke test (Stage 1 backend on `proyecto_dual`, seeded test accounts) | Logins 200 for staff, company (by CIF, the new lookup) and student. Staff lists (applications 18, companies 11, reservations 16, Seguimiento, panel) 200; every application shows its ciclo. Company: own application, offers, eligible students, reservations, documents 200. Student: own application (with ciclo), reservations, documents 200. Quota of a test-company offer raised 2→3 and restored to 2: both 200. No error in the server log. |

Not exercised on `proyecto_dual` to avoid adding data: a new student application and a document upload. Both are covered by the isolated tests (§4) and by the unit test of the application insert.

Rollback if ever needed: restore `backups/proyecto_dual_20261028_093207.sql`, or deploy the previous backend and run `db/rollback/017_…down.sql` (read its warning) and `DELETE FROM schema_migrations WHERE version = '017';`.
