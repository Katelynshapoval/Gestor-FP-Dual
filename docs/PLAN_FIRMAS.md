# Plan: real signatures on documents (students and centre)

Status: **built** (2026-11-15). Migration 027 applied to `proyecto_dual` at 16:37 after the verified backup
`proyecto_dual_20261115_153650.sql`. Stages 0–6 done. Checked in a real browser against an isolated copy
(`_verify` database): centre image, sign-all, first signature through the phone QR, signing on a phone, and
the stamped PDFs. As built: § 10.

## 1. What was asked

1. The student creates a signature when registering, drawn on a pad like
   [Firma-salesianos](https://mariobujo.github.io/Firma-salesianos/). It is stored in the database.
2. In documents the student signs, the image is placed **at its position in the document**.
3. The centre signs with **one image that holds signature and seal** (Lobato provides it).
4. A **"sign all"** button, so nobody signs one by one.
5. A preview of each document (**last page only**) with arrows to move between documents.
6. The signature is asked for **once**; it changes only when the person asks.
7. Signers: the student, and the centre (ADMINISTRADOR and COORDINADOR).
8. Sign from the **phone** by scanning a code, because drawing with a mouse is bad.
9. Styles consistent with the rest of the app.

## 2. Today

| Piece | Where | Problem |
| --- | --- | --- |
| "Firmar" button | `POST /documentos/:id/firmar` (`documentosService.firmar`) | Only records "signed" (`CONFIRMACION_APP`). The PDF does not change: no signature is visible |
| Signature rows | `dual_documento_firmas` (one per document and role: EMPRESA, GESTOR, ALUMNO) | Stores who and when, no image |
| Generation | `documentGenerationService`: .docx template → HTML → PDF (Chromium) | Templates have no place for signatures |
| Signing many | Seguimiento and each document card | One click and one request per document |
| Preview | `PdfViewer` (whole PDF in an iframe; on phones opens a new tab) | Cannot show one page; poor on phones |
| Student registration | Public form `/addDualStudent` creates the account | No signature step |

What stays as it is: who signs each document type, "all signatures before validating", the audit trail
(`dual_eventos`), a new file resets signatures, uploading a hand-signed PDF (`SUBIDA_FIRMADA`).

## 3. Design in one paragraph

Each person has **one saved signature image**. The centre has **one shared image** (signature + seal).
Templates get three new variables, `<<firmaAlumno>>`, `<<firmaCentro>>` and `<<firmaEmpresa>>`, that mark
where each signature goes. When a document is generated, the server remembers the position of each mark.
"Firmar" (one document or many) **stamps the saved image into the PDF at that position** and records the
signature as today. A new screen, **Firmar documentos**, shows the last page of each pending document with
arrows and one button to sign them all. The signature can be drawn on screen or on a phone through a QR code.

## 4. Parts

### 4.1 Saved signatures (migration 027)

| Table / column | Content |
| --- | --- |
| `dual_firmas` | `id_firma`, `titular` (`USUARIO` / `CENTRO`), `id_usuario` (NULL for the centre), `imagen` (PNG, MEDIUMBLOB), `ancho`, `alto`, `origen` (`PANTALLA` / `MOVIL` / `FICHERO`), `activa`, `creado_en`, `creado_por`. One active row per user and one active centre row (generated column + unique index, the pattern already used in `uq_dd_actual`) |
| `dual_firma_sesiones` | Phone hand-off (§ 4.5): `token_hash`, `id_usuario` (NULL during public registration), `estado`, `imagen`, `expira_en` |
| `dual_documentos.firma_posiciones` | JSON: for each role, page and rectangle of its mark in the current file. NULL = the file has no marks |
| `dual_documento_firmas.id_firma` | Which saved image was stamped |
| `chk_ddf_metodo` | New value `FIRMA_IMAGEN` |
| `chk_de_entidad` | New value `FIRMA` (create / change / delete a signature is audited, without the image) |

Changing a signature inserts a new row and deactivates the old one. Old rows stay because documents
already signed refer to them; documents already signed **do not change**.

Image rules, checked on the server: PNG by content (first bytes), ≤ 300 KB, ≤ 1600 × 800 px, must load
as an image. The pad sends a PNG with transparent background, dark ink, trimmed to the strokes.

### 4.2 Where the signature goes

- Template variables `<<firmaAlumno>>`, `<<firmaCentro>>`, `<<firmaEmpresa>>`, listed in Documentos ›
  Plantillas with the other variables. The admin puts each one where that person signs.
- At generation each variable becomes an empty box of fixed size (student and company 5.5 × 2.2 cm,
  centre 6 × 3.5 cm because of the seal). After Chromium makes the PDF, the server reads the page and
  rectangle of each box and saves them in `firma_posiciones`.
- At signing, `pdf-lib` (new backend dependency, no Chromium) draws the image inside the rectangle,
  keeping its proportions, and saves the PDF **in the same row**. Signatures of the others are not reset:
  the content is the same, one image was added. The event `FIRMAR` stores the SHA-256 of the file before
  and after.
- **Spike done (2026-11-15): the box is a link.** Each box is an empty
  `<a href="https://firma.invalid/ALUMNO">` with a fixed size. Chromium writes it as a PDF link annotation
  with its exact rectangle; `pdf-lib` reads page and rectangle and removes the annotation, so no link stays
  in the document. Tested with the same Chromium settings as generation (no JavaScript, no network, A4,
  2 cm margins), three boxes in a table on page 2 of 2: all three found on the right page, and a rectangle
  drawn from the stored position covers the box exactly. The server needs only `pdf-lib`; `pdfjs-dist`
  drew the last page correctly for the check, which is what the preview will do.
  Not tested yet: a real .docx template through `docx-templates` and `mammoth` (stage 2). Note: when the
  row of boxes is wider than the page, Chromium shrinks the page slightly (boxes came out 3 % smaller); the
  stored rectangle is the real one, so the stamp still fits.

**Files without marks** (uploaded PDFs such as Calendario or a scanned annex, templates without the
variable, documents generated before this feature): the signature goes on a **"Hoja de firmas"** page added
at the end (document name, each signer's name, date, image). Plantillas warns when the active template of a
type lacks the variable of one of its signers.

### 4.3 Creating a signature (once)

One component, `FirmaPad`, used everywhere:

| Where | Behaviour |
| --- | --- |
| Public student form `/addDualStudent` | New step "Tu firma". See question Q3 (required or optional) |
| First time someone presses Firmar without a signature | The pad opens first; after saving, signing continues |
| "Mi firma" in the account page (`/cambiarPassword` becomes "Mi cuenta") | Shows the current signature, **Cambiar firma**, date of the last change |
| Configuración › Firma del centro (ADMINISTRADOR) | Upload the image from Lobato (PNG, or JPG converted to PNG; option "quitar fondo blanco"). Preview on a sample box |

Pad details: `signature_pad` library (smooth strokes, pressure, ~10 KB), canvas scaled to the device pixel
ratio, `touch-action: none`, buttons Deshacer / Limpiar / Guardar, "Guardar" disabled until there is a real
stroke, baseline and "Firma aquí" hint, keyboard-reachable buttons. On a wide screen without touch the
first option offered is **"Firmar con el móvil"**; drawing with the mouse stays available.

### 4.4 Firmar documentos (sign all)

Entry points: a button **"Firmar documentos (N)"** in the student's home and Mis documentos, in the company
area (if Q2 = yes), and for staff in Panel and Documentos › Seguimiento (it takes the documents of the
current filter, so a coordinator can sign "all Anexo II of 2º DAM").

Full-screen dialog, in the app's existing Modal / button / badge styles:

```
┌ Firmar documentos ─────────────────────────────── 3 de 12 ─ ✕ ┐
│                                                               │
│   ‹    ┌───────────────────────────────┐    ›                 │
│        │  last page of the document    │      Anexo II        │
│        │                               │      Hugo Bueno      │
│        │   Empresa   Centro   Alumno   │      Acme S.L.       │
│        │   ✔ firma  [tu firma] ······  │      ☑ Incluir       │
│        └───────────────────────────────┘      Ver completo    │
│                    ● ● ◉ ● ● ● ●                              │
│  Tu firma: [imagen]  Cambiar          [ Firmar 12 documentos ]│
└───────────────────────────────────────────────────────────────┘
```

- The last page is drawn with `pdfjs-dist` (new frontend dependency, loaded only when this dialog or the
  viewer opens). It works on phones, where the iframe does not.
- **The user's signature is shown already placed in its box** (semi-transparent) before signing, so they
  see the result. Other people's signatures already in the file are simply part of the page.
- Arrows, ← → keys, swipe on touch, counter, dots (a number list above 15 documents).
- "Incluir" per document (on by default) to leave one out. "Ver completo" opens the normal viewer.
- If the signature will go on a Hoja de firmas, the panel says so.
- **Firmar N documentos** → one confirmation ("Vas a firmar 12 documentos con tu firma guardada") →
  `POST /documentos/firmar-lote { ids }`. Each document is its own transaction. The result lists signed
  and failed documents with the reason; failures stay in the dialog to retry.
- The single "Firmar" button on each card keeps working and stamps the image too.

Backend rules of each signature are the existing ones (`documentoFirmable`, ownership, current version,
not rejected, reservation not cancelled), plus: the signer has an active signature (409 `SIN_FIRMA_GUARDADA`).

### 4.5 Signing from the phone (QR)

1. On the computer: "Firmar con el móvil" → `POST /firmas/sesiones` → a QR (drawn in the browser with the
   `qrcode` package, no external service) of `APP_URL/firma-movil#<token>`.
2. The phone opens that page **without logging in**: only the pad, full screen, landscape hint. "Enviar"
   uploads the image to that session.
3. The computer asks every 2 s; when the image arrives it shows it: **Usar esta firma** / **Repetir**.
   Only then is it saved (logged-in user) or kept in the form (public registration).

Safety: random 32-byte token, only its hash stored, in the URL fragment (not sent in logs), valid 10
minutes, one upload, rate-limited. The token can only **upload one image to that session**: it reads
nothing and signs nothing. The image is saved to an account only by the logged-in computer session.

Needs the phone to reach the app: `APP_URL` must be an address the phone can open. In development that
means running Vite with `--host` and `APP_URL=http://<PC LAN IP>:3000` on the same Wi-Fi. If `APP_URL` is
`localhost` the dialog explains this instead of showing a useless QR.

A student already on the phone does not need the QR: the whole flow works on a phone.

## 5. Scenarios

### Signature

| Scenario | What happens |
| --- | --- |
| Student registers | Draws the signature in the form (screen or phone). Saved with the account |
| Student registered before this feature | Asked the first time they sign |
| Wants to change it | Mi cuenta › Cambiar firma. Signed documents keep the old image; next signatures use the new one. Audited |
| Empty or one-dot drawing | "Guardar" disabled; the server also rejects an image that is too small |
| File that is not a PNG, too big | 400 with the reason |
| Centre image not uploaded yet | Staff see "Falta la firma del centro". Admin gets a link to upload it; a coordinator is told to ask an administrator |
| Admin replaces the centre image | New signatures use it; signed documents do not change. Audited |
| Staff looks at a student's signature | Not possible: the image is returned only to its owner. Staff see it only inside signed documents |
| Staff signs as a student | Not possible: the role decides which signature is applied. (An admin can already reset a password; that is audited) |
| Student in baja | Account inactive, cannot sign. The image stays (question Q6) |

### Phone

| Scenario | What happens |
| --- | --- |
| QR expired (10 min) or already used | The phone says so; the computer offers "Generar otro código" |
| Computer dialog closed before sending | Session cancelled; the phone gets "Esta sesión ya no está abierta" |
| Phone sends, user presses Repetir | New session and QR; the first image is discarded |
| Someone else scans the QR | They could only send a drawing, which the user sees and rejects on the computer |
| Phone has no connection to the app | Hint about the same network / address; drawing on screen remains |
| Sessions never finished | Deleted when expired, on the next session request |

### Signing

| Scenario | What happens |
| --- | --- |
| Sign one | Same button as today; now stamps the image |
| Sign all | § 4.4. Partial success is normal and reported per document |
| A document changed while the dialog was open (regenerated, rejected, signed by a colleague) | That document fails with its reason (`VERSION_ANTERIOR`, rejected, "ya estaba firmado" counts as done); the rest are signed |
| Two staff press sign-all at once | Row locks already serialise it; the second gets "La firma ya estaba registrada" |
| Student and centre sign the same document at the same moment | Same lock: stamped one after the other, both kept |
| Nothing to sign | The button is not shown; the dialog says "No tienes documentos pendientes de firma" |
| Regenerate after signatures | As today: signatures reset, with the existing warning. Signing again is one click |
| Company uploads a scanned signed annex | As today: new file, signatures reset, company counts as signed. The file has no marks, so student and centre go on the Hoja de firmas |
| Validated document | Cannot be signed or changed (as today) |
| Rejected document, cancelled reservation | Cannot be signed (as today); not offered in the dialog |
| Template has no mark for a signer | Hoja de firmas; warning in Plantillas |
| Documents signed with the old button (`CONFIRMACION_APP`, no image) | Stay valid as they are. Not re-stamped |
| Document with legacy exemption | No signatures asked (as today) |
| Stamping fails (damaged or protected PDF) | Nothing is recorded; the document is reported as failed. An uploaded PDF that `pdf-lib` cannot open keeps the current confirmation-only signature (question Q5) |
| Emails with attached documents | Send the current file, so they carry the signatures made so far |
| Inherited convenio (026) | The copy is the signed file; nothing to do |
| Stored size | A signature adds ~20–60 KB per document |

## 6. What this signature is

A drawn image placed on a PDF is a **simple electronic signature**, like a scanned handwritten one. It is
not a certificate signature (Cl@ve, FNMT). The proof is the record: who (account), when, which image,
the file's hash before and after, all in the append-only audit trail. `decisiones-tecnicas.md` already
says signatures are attestations; this adds the visible image. Worth confirming with the teacher that this
is enough for the Anexos (it is what the current paper-and-scan process amounts to).

Privacy: the signature is personal data. It is shown only to its owner, never listed, never in logs or
events, and the registration step says what it is used for.

## 7. Dependencies

| Package | Where | Why |
| --- | --- | --- |
| `pdf-lib` | backend | Stamp images, add the Hoja de firmas, read box positions |
| `signature_pad` | frontend | Smooth drawing with touch and pressure |
| `pdfjs-dist` | frontend (lazy) | Draw one page; fixes phone preview |
| `qrcode` | frontend | QR drawn locally |

## 8. Stages

Each stage is usable on its own. Migration 027 needs approval, a backup and a rollback file first.

| Stage | Content |
| --- | --- |
| 0 | ✅ Spike: read box positions from a generated PDF (§ 4.2) |
| 1 | Migration 027. Saved signatures: API, `FirmaPad`, Mi firma, centre image in Configuración |
| 2 | Template variables, positions at generation, stamping on Firmar, Hoja de firmas fallback, Plantillas warning |
| 3 | Firmar documentos dialog: last-page preview, arrows, sign all, `firmar-lote` |
| 4 | Phone hand-off with QR |
| 5 | Signature step in the public student form |
| 6 | Tests (stamping, batch, permissions, sessions), technical docs and user manual with new screenshots |

## 9. Questions before starting

| # | Question | Proposal |
| --- | --- | --- |
| Q1 | The teacher wrote "al generarlo, metes la imagen". Is the student's signature inserted automatically at generation, or when the student presses Firmar? | **When they press Firmar** (after seeing the document). It matches the sign-all screen the teacher described, and a signature placed without the person acting is not a signature |
| Q2 | Does the **company** also sign in the app with a drawn signature? | **Yes**, same pad. Otherwise the company prints, signs and scans, the scan has no marks, and the other two signatures cannot go "in position" on Anexo II/III |
| Q3 | Signature step at registration: required or skippable? | **Skippable**, and asked at the first signing. A required step blocks students filling the form on a PC with a mouse and no phone at hand |
| Q4 | Centre: one shared image for all staff, or one per administrator/coordinator? | **One shared image** (what the teacher described), uploaded only by ADMINISTRADOR, used by both roles. The audit trail still records which person applied it |
| Q5 | Files without marks: Hoja de firmas at the end, or keep the click-only signature for them? | **Hoja de firmas** |
| Q6 | Is a student's signature deleted on baja or at the end of the convocatoria? | Keep (decision D7: no automatic deletion), with a manual "Eliminar mi firma" |
| Q7 | Should the **convenio** also carry the centre's signature? Today only the company signs it | Ask the teacher. If yes: new convenios only, already validated ones stay valid |
| Q8 | Under-18 students: must the legal guardian (already in the student record) sign too? | Ask the teacher. Not in this plan |

## 10. As built

Answers: Q1 on Firmar · Q2 companies sign in the app too · Q3 skippable · Q4 one shared centre image ·
Q5 Hoja de firmas · Q6 kept, with "Eliminar" in Mi firma · **Q7 yes**, the centre signs the convenio ·
**Q8 yes**, a guardian signs for under-18 students · a drawn signature with the audit record is enough.

| Decision | What was done | Why |
| --- | --- | --- |
| Convenio signed by the centre (Q7) | CONVENIO signers are EMPRESA and GESTOR. Convenios validated before 027 stay valid (`signersAddedLater`) | Asking for a signature on an already validated file would reopen every existing convenio |
| Guardian (Q8) | A second saved signature (`TUTOR`) on the student's account; while the student is under 18, signing stamps both. Template variable `<<firmaTutorLegal>>` | The guardian has no account. A separate account and login for one signature is more than the process needs |
| Validated documents | Cannot be signed any more | Signing now changes the file |
| Single "Firmar" buttons | Open the same dialog with one document | One flow: preview, first-time signature, confirmation |
| Phone session | A relay with two secrets, tied to no account | The same code serves the public registration form, where no account exists yet |
| Registration | The form offers the student's own signature only; the guardian's is asked in the portal | Keeps the public form short |
| Staff sign-all | One button in Documentos; chips by document type inside the dialog | Filters of the list do not need to be repeated |
| Position reading | Empty link boxes read back with `pdf-lib` (spike, § 4.2) | Exact rectangles, no second PDF library on the server |

Not done / to know:
- The centre's image is **not uploaded**: an administrator has to upload Lobato's image in Configuración ›
  Firma del centro before staff can sign.
- The active templates need the signature variables added in Word (Documentos › Plantillas lists them and
  warns which are missing). Until then signatures go on the Hoja de firmas.
- Existing unvalidated convenios now also need the centre's signature before validation.
- The email texts still say "sign and upload" for the convenio (they are editable in Configuración › Correos).
- No screenshots of the new screens in the user manual yet.
- No `test/db/stage027.db.test.js`: 027 was checked by hand on `_verify` (apply, rollback, apply).
