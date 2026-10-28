// Phase 2 integration tests against the REAL development database.
// Skipped unless DB_INTEGRATION=1. Requires migrations 012–015 applied.
//
//   DB_INTEGRATION=1 node --test test/db/phase2.db.test.js
//
// What they write: one temporary reservation (and its documents) for a
// student/offer pair that had no reservation row, removed again in `after`.
// Nothing else is modified. Refuses to run with NODE_ENV=production.
const test = require('node:test');
const assert = require('node:assert/strict');

const enabled = process.env.DB_INTEGRATION === '1' && process.env.NODE_ENV !== 'production';
const opts = { skip: enabled ? false : 'DB_INTEGRATION=1 no definido' };

let conn;
const created = { reservas: [], documentos: [] };

test.before(async () => {
  if (!enabled) return;
  const { connect } = require('../../scripts/lib/connect');
  conn = await connect();
});

test.after(async () => {
  if (!conn) return;
  try {
    if (created.documentos.length) {
      await conn.query('DELETE FROM dual_documento_firmas WHERE id_documento IN (?)', [created.documentos]);
      await conn.query('DELETE FROM dual_documento_versiones WHERE id_documento IN (?)', [created.documentos]);
      await conn.query('DELETE FROM dual_documentos WHERE id_documento IN (?)', [created.documentos]);
    }
    if (created.reservas.length) {
      await conn.query('DELETE FROM dual_reservas WHERE id_reserva IN (?)', [created.reservas]);
    }
  } finally {
    await conn.end();
  }
});

async function sqlError(promise) {
  try {
    await promise;
  } catch (err) {
    return err.sqlMessage || err.message;
  }
  return null;
}

test('baseline and migrations are recorded', opts, async () => {
  const [rows] = await conn.query('SELECT version FROM schema_migrations ORDER BY version');
  const versions = rows.map((r) => r.version);
  for (const v of ['000', '012', '013', '014', '015']) assert.ok(versions.includes(v), `falta ${v}`);
});

test('V-1: the student validation procedure asks for CV and ANEXO_DGA by name', opts, async () => {
  // A non-existent application has no documents: the procedure stops before any UPDATE.
  const msg = await sqlError(conn.query('CALL sp_validar_solicitud_alumno(-1)'));
  assert.match(msg, /CV y el Anexo DGA/);
});

test('triggers resolve document types by name (ANEXO_DGA cannot hang from a reservation)', opts, async () => {
  const [[r]] = await conn.query('SELECT id_reserva FROM dual_reservas LIMIT 1');
  if (!r) return;
  const msg = await sqlError(conn.query(
    `INSERT INTO dual_documentos (id_reserva, id_tipo_documento, id_estado_validacion, origen_documento)
     VALUES (?, fn_id_tipo_documento('ANEXO_DGA'), fn_id_estado_validacion('PENDIENTE'), 'SUBIDA')`,
    [r.id_reserva],
  ));
  assert.match(msg, /no corresponde al registro padre/);
});

test('D5: the audit trail is append-only', opts, async (t) => {
  // Row triggers only fire on matching rows, so target a real event; the
  // trigger refuses the statement, so nothing is changed.
  const [[ev]] = await conn.query('SELECT MIN(id_evento) AS id, COUNT(*) AS n FROM dual_eventos');
  if (!ev.id) return t.skip('dual_eventos está vacía');
  assert.match(await sqlError(conn.query('UPDATE dual_eventos SET accion = accion WHERE id_evento = ?', [ev.id])) || '', /no se puede modificar/);
  assert.match(await sqlError(conn.query('DELETE FROM dual_eventos WHERE id_evento = ?', [ev.id])) || '', /no se puede borrar/);
  const [[after]] = await conn.query('SELECT COUNT(*) AS n FROM dual_eventos');
  assert.equal(Number(after.n), Number(ev.n));
});

test('V-6: gf_alumnosfct.dni is unique', opts, async () => {
  const [idx] = await conn.query("SHOW INDEX FROM gf_alumnosfct WHERE Key_name = 'uq_gf_alumnosfct_dni'");
  assert.equal(idx.length, 1);
  assert.equal(Number(idx[0].Non_unique), 0);
});

// Finds a validated student and a validated offer of the same speciality and
// convocatoria, with a free place, no row for the pair and no confirmed placement.
async function freePair() {
  const [rows] = await conn.query(
    `SELECT sa.id_solicitud_alumno, ee.id_solicitud_empresa_especialidad AS id_oferta
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_solicitud_empresa_especialidades ee ON ee.id_especialidad = sa.id_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
                                       AND se.id_convocatoria = sa.id_convocatoria
      WHERE sa.id_estado_validacion = fn_id_estado_validacion('VALIDADO')
        AND se.id_estado_validacion = fn_id_estado_validacion('VALIDADO')
        AND fn_cupos_disponibles(ee.id_solicitud_empresa_especialidad) > 0
        AND NOT EXISTS (SELECT 1 FROM dual_reservas r
                         WHERE r.id_solicitud_alumno = sa.id_solicitud_alumno
                           AND r.id_solicitud_empresa_especialidad = ee.id_solicitud_empresa_especialidad)
        AND NOT EXISTS (SELECT 1 FROM dual_reservas r
                         WHERE r.id_solicitud_alumno = sa.id_solicitud_alumno
                           AND r.id_estado_reserva = fn_id_estado_reserva('CONFIRMADA'))
      LIMIT 1`,
  );
  return rows[0] || null;
}

test('WF-4 / WF-5: cancel and re-book retires the old annex; confirmation needs type and validated annex', opts, async (t) => {
  const pair = await freePair();
  if (!pair) return t.skip('no hay un par alumno/oferta libre en la base de desarrollo');

  const [[first]] = await conn.query('CALL sp_reservar_alumno(?, ?)', [pair.id_solicitud_alumno, pair.id_oferta]);
  const idReserva = first[0].id_reserva;
  created.reservas.push(idReserva);

  // Confirmation without a contract type, then with a type but no annex.
  assert.match(await sqlError(conn.query('CALL sp_confirmar_reserva(?, NULL)', [idReserva])), /tipo de contrato/);
  const [[beca]] = await conn.query("SELECT id_tipo_contrato FROM dual_tipos_contrato WHERE nombre = 'BECA'");
  await conn.query('UPDATE dual_reservas SET id_tipo_contrato = ? WHERE id_reserva = ?', [beca.id_tipo_contrato, idReserva]);
  assert.match(await sqlError(conn.query('CALL sp_confirmar_reserva(?, NULL)', [idReserva])), /firmado y validado/);
  assert.match(await sqlError(conn.query('CALL sp_confirmar_reserva(?, ?)', [idReserva, beca.id_tipo_contrato + 1])), /no coincide/);

  // An annex is uploaded and validated, then the reservation is cancelled.
  const [res] = await conn.query("CALL sp_guardar_documento(NULL, NULL, ?, fn_id_tipo_documento('ANEXO_III'), ?)",
    [idReserva, Buffer.from('%PDF-1.4 test')]);
  const idDoc = res[0][0].id_documento;
  created.documentos.push(idDoc);
  await conn.query('CALL sp_validar_documento(?)', [idDoc]);
  await conn.query('CALL sp_cancelar_reserva(?, ?)', [idReserva, 'Prueba de integración Phase 2']);

  // Re-booking the same pair reuses the row but starts clean.
  const [[again]] = await conn.query('CALL sp_reservar_alumno(?, ?)', [pair.id_solicitud_alumno, pair.id_oferta]);
  assert.equal(again[0].id_reserva, idReserva);
  const [[row]] = await conn.query(
    `SELECT er.nombre AS estado, r.id_tipo_contrato, r.id_empresa_tutor FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva WHERE r.id_reserva = ?`,
    [idReserva],
  );
  assert.deepEqual([row.estado, row.id_tipo_contrato, row.id_empresa_tutor], ['PENDIENTE', null, null]);
  const [[doc]] = await conn.query('SELECT es_actual FROM dual_documentos WHERE id_documento = ?', [idDoc]);
  assert.equal(Number(doc.es_actual), 0, 'the old annex stays in history but is no longer current');

  // With the type set again, the retired annex cannot support a confirmation.
  await conn.query('UPDATE dual_reservas SET id_tipo_contrato = ? WHERE id_reserva = ?', [beca.id_tipo_contrato, idReserva]);
  assert.match(await sqlError(conn.query('CALL sp_confirmar_reserva(?, NULL)', [idReserva])), /firmado y validado/);
  await conn.query('CALL sp_cancelar_reserva(?, ?)', [idReserva, 'Fin de la prueba de integración']);
});
