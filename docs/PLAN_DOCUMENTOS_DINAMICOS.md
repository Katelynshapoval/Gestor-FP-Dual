# Plan: dynamic documents, one convenio per company, documents in emails

Status: **parts A and B done** (migrations 025 and 026 applied 2026-11-12). Part B as built: inherited copies, renewals (CICLOS / MANUAL «Sustituir convenio»), company and admin emails, Panel card, company warnings; the company stays validated during a renewal. Part C done (no migration): emails attach any active generated document of the request they are about, chosen by ámbito; emails about no request explain why they only take fixed PDFs.

## What was asked

1. Document generation must be dynamic: the centre can **add** documents and change their template.
   New documents are always **generated from a template** (.docx).
2. The **convenio is one per company**. A new one is needed only when the company **changes the ciclos it asks for**.
   Convenios companies already have **count** as their convenio.
3. In the email templates, an admin must be able to attach a document and the recipient gets the
   **filled-in document** of that company or reservation (today only Convenio and Anexo II/III, on 9 emails).
4. Keep the styles consistent with the rest of the app.

## Today

| Piece | Where | Problem |
| --- | --- | --- |
| List of documents | `documentCatalogue.js` (`CATALOGUE`, 13 entries) | Written in code; a new document needs a programmer |
| What a generated document can fill in | `documentGenerationConfig.js` | One hand-written loader per document (CONVENIO, ANEXO_II, ANEXO_III) |
| Which parent a document type belongs to | DB triggers `trg_dd_bi_*` / `trg_dd_bu_*` (migration 012) | Names hardcoded in SQL: a new type is accepted on any parent |
| Templates | `dual_documento_plantillas` + Documentos › Plantillas | Already versioned and swappable ✅ |
| Convenio | one per **company application** (per convocatoria) | Regenerated and re-signed every year |
| Email attachments | `correoPlantillas.DOCUMENTOS` | Fixed map: 9 emails × 3 documents |

## Design

### A. Document types in the database (migration 025)

`dual_tipos_documento` gets the columns the code now keeps in `CATALOGUE`:

| Column | Meaning |
| --- | --- |
| `nombre_mostrar` | Name shown in the app ("Anexo IV") |
| `ambito` | `solicitud_alumno` · `solicitud_empresa` · `reserva` |
| `generado` | Made from a template (always 1 for new types) |
| `firma_empresa`, `firma_centro`, `firma_alumno` | Who signs (same signing flow as Anexo II/III) |
| `requerido` | Blocks validating the student / the company, or confirming the reservation |
| `familia_contrato` | Reservation only: `NULL` = all, `beca`, `contrato` |
| `activo` | Hidden from new requests when off (never deleted: old documents keep it) |
| `es_sistema` | The 13 existing types: their rules stay as today and cannot be edited, only their template |
| `orden` | Order in the lists |

- The existing rows are filled with exactly what `CATALOGUE` says today, so nothing changes for them.
- The parent triggers read `ambito` from the table instead of the hardcoded names.
- `dual_eventos.chk_de_entidad` allows `TIPO_DOCUMENTO` (create/edit/deactivate are audited).

**Code:** `CATALOGUE` stays as the source of the 13 system types' special rules (CV, Anexo DGA, calendario, Anexo G, Excel…).
Custom types are loaded from the table and turned into the same shape, so `documentosWorkflow`, the lists, the
panel and the signing flow handle them without special cases. A short cache, refreshed when a type is saved.

**Data a template can use:** one shared list per ámbito instead of one per document:
- company application: the convenio's variables today (company, representative, CIF, ciclos, convocatoria…)
- reservation: the Anexo II/III variables today (student, company, ciclo, contract type, tutor…)
- student application: new list (student, DNI, ciclo, convocatoria, contact data)

The Plantillas page shows the variables each template can use.

**Required custom documents:** checked in the backend where the rules already live (`estadoReglas`, student and
company validation, reservation confirmation). Only documents that are **current** for that request count; a
reservation document limited to `beca` is not required on a `contrato` reservation.

**Screens (Configuración › Documentos):** list of types, "Nuevo documento" dialog (name, ámbito, signers,
required, beca/contrato), edit, activate/deactivate. Template upload stays in Documentos › Plantillas and the new
types appear there automatically. Same components and styles as Correos/Convocatorias (cards, `Modal`, chips,
`InlineNotice`), phone layout included.

### B. One convenio per company (migration 026)

- New table `dual_convenio_ciclos (id_documento, id_especialidad)`: the ciclos a convenio covers.
  Backfilled from each current convenio's application.
- `dual_documentos.id_documento_origen` (nullable FK to itself) and `origen_documento` allows `HEREDADO`.
- **New application (reapply):** if the company's latest **validated** convenio covers exactly the ciclos it now asks
  for, the new application gets a `HEREDADO` copy (same file, validated, signatures kept, pointing to the original)
  and **no new convenio is generated or signed**. Otherwise a new one is generated as today.
- **Ciclo added mid-year** (`addEspecialidad`): the convenio no longer covers the ciclos → the current one goes to
  history and a new one is generated (the company is told, as with any new convenio).
- Existing convenios count automatically: the backfill gives them their ciclos.
- ⚠️ The convenio template prints `convocatoria` and `fechaPeticion`. A convenio that lasts several years should not
  print them; I will flag it on the Plantillas page, but the template text is yours to change.

### C. Documents in emails

`correoPlantillas.DOCUMENTOS` stops being a fixed map. Each email already has a context (student application,
company application, reservation); an admin may attach **any active generated document of that ámbito**,
including the new ones. Reservation documents limited to beca/contrato are attached only when the reservation has
that family (as today with Anexo II/III). The dropdown in Correos › Adjuntos lists them; emails with no request
(password reset, footer) keep only "Subir PDF", with a line explaining why.
No new migration: `dual_correo_adjuntos.documento` already stores the type name.

## Order of work and approvals

1. Migration 025 + rollback, tested on `proyecto_dual_verify` → **your approval** → backup → apply.
2. Backend + screens for document types; tests.
3. Migration 026 + rollback, tested on `_verify` → **your approval** → backup → apply.
4. Convenio reuse; tests.
5. Email attachments for every ámbito; tests.
6. Manual, FAQ, technical docs; check every screen in the browser (desktop and phone).

Each migration's rollback refuses to run once custom types or inherited convenios exist, as 022–024 do.
