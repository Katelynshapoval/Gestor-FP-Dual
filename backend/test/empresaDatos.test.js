// Company data change requests: what a company may propose, how changes are
// compared, which fields are required and how conflicts with edits made in the
// meantime are found. Pure functions, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const ed = require('../src/services/empresaDatos');

test('sanitizeProposed keeps only known fields; the CIF only when staff may change it', () => {
  const input = {
    empresa: '  ACME S.L. ', cif: ' b12345674 ', hack: 'DROP TABLE', dniCoordinador: ' 12345678z ',
    transportes: ['3', 1, 3, 'x', -2], web: null,
  };
  assert.deepEqual(ed.sanitizeProposed(input), {
    empresa: 'ACME S.L.', dniCoordinador: '12345678Z', transportes: [1, 3], web: '',
  });
  assert.equal(ed.sanitizeProposed(input, { allowCif: true }).cif, 'B12345674');
  assert.deepEqual(ed.sanitizeProposed(null), {});
  assert.deepEqual(ed.sanitizeProposed('texto'), {});
});

test('valuesEqual ignores spacing, case of DNI/CIF and the order of transports', () => {
  assert.ok(ed.valuesEqual('empresa', ' ACME ', 'ACME'));
  assert.ok(!ed.valuesEqual('empresa', 'ACME', 'acme'), 'names keep their case');
  assert.ok(ed.valuesEqual('dniRepresentante', '12345678z', '12345678Z'));
  assert.ok(ed.valuesEqual('cif', 'b12345674', 'B12345674'));
  assert.ok(ed.valuesEqual('transportes', [3, 1], ['1', '3', 3]));
  assert.ok(!ed.valuesEqual('transportes', [1], [1, 2]));
  assert.ok(ed.valuesEqual('web', null, ''));
});

test('diffProposed returns only what really changes', () => {
  const snap = { empresa: 'ACME', web: '', transportes: [1, 2] };
  assert.deepEqual(ed.diffProposed(snap, { empresa: ' ACME ', web: 'https://acme.test', transportes: [2, 1] }), {
    web: 'https://acme.test',
  });
  assert.deepEqual(ed.diffProposed(snap, {}), {});
});

test('pickSnapshot covers every field and reads transports as sorted ids', () => {
  const snap = ed.pickSnapshot({ empresa: ' ACME ', transportes: [{ id_transporte: 4 }, { id_transporte: 2 }] });
  assert.deepEqual(Object.keys(snap).sort(), Object.keys(ed.FIELD_DEFS).sort());
  assert.equal(snap.empresa, 'ACME');
  assert.deepEqual(snap.transportes, [2, 4]);
  assert.equal(snap.web, '');
});

const COMPLETO = {
  empresa: 'ACME', domicilioLegal: 'C/ Mayor 1', cpLegal: '50001', provinciaLegal: 'Zaragoza', localidadLegal: 'Zaragoza',
  dniRepresentante: '12345678Z', nombreRepresentante: 'Ana', emailRepresentante: 'a@acme.test', telefonoRepresentante: '600000000',
  dniCoordinador: '87654321X', nombreCoordinador: 'Luis', emailCoordinador: 'l@acme.test', telefonoCoordinador: '600000001',
  descripcion_puesto: 'Taller', cif: 'B12345674',
};

test('validateMerged: every required field, and a valid CIF when staff change it', () => {
  assert.equal(ed.validateMerged(COMPLETO), null);
  for (const campo of ['empresa', 'cpLegal', 'emailCoordinador', 'descripcion_puesto']) {
    const msg = ed.validateMerged({ ...COMPLETO, [campo]: '  ' });
    assert.match(msg, new RegExp(ed.FIELD_DEFS[campo].label), campo);
  }
  assert.equal(ed.validateMerged({ ...COMPLETO, cif: 'B12345675' }), null, 'the CIF is only checked when it changes');
  assert.match(ed.validateMerged({ ...COMPLETO, cif: 'B12345675' }, { allowCif: true, cifChanging: true }), /CIF/);
  assert.equal(ed.validateMerged(COMPLETO, { allowCif: true, cifChanging: true }), null);
});

test('detectConflicts: a field someone else changed since the request was made', () => {
  const original = { empresa: 'ACME', web: '', transportes: [1] };
  const ahora = { empresa: 'ACME Nueva', web: '', transportes: [1] };
  const conflictos = ed.detectConflicts(original, ahora, { empresa: 'ACME 2', web: 'https://x.test' });
  assert.deepEqual(conflictos, [{
    field: 'empresa', label: 'Razón social', original: 'ACME', actual: 'ACME Nueva', solicitado: 'ACME 2',
  }]);
  assert.deepEqual(ed.detectConflicts(original, original, { empresa: 'ACME 2' }), []);
});

test('buildDiff shows before and after, with transport names and a dash for empty', () => {
  const rows = ed.buildDiff({ web: '', transportes: [1] }, { web: 'https://x.test', transportes: [2, 1] }, { 1: 'Bus', 2: 'Tranvía' });
  assert.deepEqual(rows, [
    { field: 'web', label: 'Web', actual: '—', solicitado: 'https://x.test' },
    { field: 'transportes', label: 'Métodos de transporte', actual: 'Bus', solicitado: 'Bus, Tranvía' },
  ]);
});

test('parsePayload reads stored JSON and survives garbage', () => {
  assert.deepEqual(ed.parsePayload('{"empresa":"ACME"}'), { empresa: 'ACME' });
  assert.equal(ed.parsePayload('{roto'), null);
  assert.equal(ed.parsePayload(null), null);
  assert.deepEqual(ed.parsePayload({ a: 1 }), { a: 1 });
});
