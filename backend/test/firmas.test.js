// Signatures (migration 027): the image checks, saved signatures per person,
// the centre's shared image, the phone hand-off, and the PDF work (marks read
// from a generated file, stamping at a mark or on a "Hoja de firmas").
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const { stub, load, fakePool, mockReq, mockRes } = require('./helpers/harness');

// A real PNG of the given size: transparent with a dark diagonal stroke.
function png(ancho = 300, alto = 100) {
  const fila = 1 + ancho * 4;
  const raw = Buffer.alloc(fila * alto);
  for (let y = 0; y < alto; y += 1) {
    const x = Math.floor((y / alto) * (ancho - 1));
    raw.set([27, 42, 92, 255], y * fila + 1 + x * 4);
  }
  const chunk = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const out = Buffer.alloc(8 + datos.length + 4);
    out.writeUInt32BE(datos.length, 0);
    cuerpo.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(cuerpo) >>> 0, 8 + datos.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = png();

let st = {};
const pool = fakePool((sql, params) => {
  for (const [match, out] of st.respuestas || []) {
    if (sql.includes(match)) return typeof out === 'function' ? out(sql, params) : out;
  }
  if (sql.includes('SELECT u.id_alumno FROM dual_usuarios u')) return st.alumno ? [{ id_alumno: st.alumno }] : [];
  if (sql.startsWith('INSERT')) return { insertId: 90 };
  if (sql.startsWith('UPDATE') || sql.startsWith('DELETE')) return { affectedRows: st.afectadas ?? 1 };
  return [];
});
stub('src/db/pool', pool);
const svc = load('src/services/firmasService');
const firmaPdf = load('src/services/firmaPdf');

const ALUMNO = { id: 4, rol: 'ALUMNO' };
const EMPRESA = { id: 3, rol: 'EMPRESA' };
const ADMIN = { id: 1, rol: 'ADMINISTRADOR' };
const COORD = { id: 2, rol: 'COORDINADOR' };

async function llamar(fn, { user, body = {}, query = {}, params = {}, file, headers = {}, ...estado } = {}) {
  st = estado;
  pool.calls.length = 0;
  const res = mockRes();
  await svc[fn](mockReq({ user, body, query, params, file, get: (h) => headers[h] }), res);
  return res;
}
const sql = (inicio) => pool.calls.filter((c) => c.sql.startsWith(inicio));

// ── The image ───────────────────────────────────────────────────────────────

test('a signature must be a readable PNG of a sensible size', async () => {
  assert.deepEqual(await svc.validarPng(PNG), { ancho: 300, alto: 100 });
  const rechazos = [
    [Buffer.from('%PDF-1.4'), 'FIRMA_NO_PNG'],
    [Buffer.from('GIF89a' + 'x'.repeat(60)), 'FIRMA_NO_PNG'],
    [png(30, 10), 'FIRMA_VACIA'],
    [Buffer.concat([PNG.subarray(0, 40), Buffer.alloc(80)]), 'FIRMA_NO_PNG'],
    [Buffer.concat([PNG, Buffer.alloc(svc.MAX_BYTES.USUARIO)]), 'FIRMA_GRANDE'],
  ];
  for (const [buffer, code] of rechazos) {
    await assert.rejects(svc.validarPng(buffer), (e) => e.status === 400 && e.code === code, code);
  }
  const ancha = Buffer.from(PNG);
  ancha.writeUInt32BE(5000, 16);
  await assert.rejects(svc.validarPng(ancha), (e) => e.code === 'FIRMA_GRANDE');
  // The centre's image (signature and seal) may be heavier than a drawn one.
  const pesada = Buffer.concat([PNG, Buffer.alloc(svc.MAX_BYTES.USUARIO)]);
  assert.deepEqual(await svc.validarPng(pesada, 'CENTRO'), { ancho: 300, alto: 100 });
});

test('under 18 is counted to the day; no birth date counts as an adult', () => {
  const hoy = new Date(2026, 10, 15);
  assert.equal(svc.esMenor(new Date(2008, 10, 16), hoy), true);
  assert.equal(svc.esMenor(new Date(2008, 10, 15), hoy), false);
  assert.equal(svc.esMenor('2000-01-01', hoy), false);
  assert.equal(svc.esMenor(null, hoy), false);
  assert.equal(svc.esMenor('no es fecha', hoy), false);
});

// ── Saved signatures ────────────────────────────────────────────────────────

const fila = (id = 70) => ({ id_firma: id, imagen: PNG, ancho: 300, alto: 100, origen: 'PANTALLA', creado_en: new Date(2026, 10, 1) });

test('the first signature is created; a new one retires the previous one, audited without the image', async () => {
  let res = await llamar('putMia', { user: EMPRESA, file: { buffer: PNG }, body: { origen: 'MOVIL' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const ins = sql('INSERT INTO dual_firmas')[0];
  assert.deepEqual([ins.params[0], ins.params[1], ins.params[3], ins.params[4], ins.params[5], ins.params[6]], ['USUARIO', 3, 300, 100, 'MOVIL', 3]);
  assert.equal(sql('UPDATE dual_firmas').length, 0);
  let ev = sql('INSERT INTO dual_eventos')[0].params;
  assert.deepEqual([ev[0], ev[1], ev[2]], ['FIRMA', 90, 'CREAR']);
  assert.ok(!JSON.stringify(ev).includes(PNG.toString('base64').slice(0, 40)), 'the event never carries the image');
  assert.ok(pool.calls.some((c) => c.sql === 'COMMIT'));

  res = await llamar('putMia', { user: EMPRESA, file: { buffer: PNG }, body: { origen: 'otro' }, respuestas: [['FROM dual_firmas', [fila()]]] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sql('UPDATE dual_firmas SET activa = 0')[0].params, [70]);
  assert.equal(sql('INSERT INTO dual_firmas')[0].params[5], 'PANTALLA', 'an unknown origin is not stored');
  ev = sql('INSERT INTO dual_eventos')[0].params;
  assert.equal(ev[2], 'CAMBIAR');
  assert.deepEqual(JSON.parse(ev[8]), { titular: 'USUARIO', sustituye: 70 });
  assert.equal(res.body.firma.imagen.startsWith('data:image/png;base64,'), true);
});

test('saving refuses a missing or bad image; only a student keeps a guardian signature', async () => {
  assert.equal((await llamar('putMia', { user: ALUMNO })).statusCode, 400);
  let res = await llamar('putMia', { user: ALUMNO, file: { buffer: Buffer.from('nada') } });
  assert.deepEqual([res.statusCode, res.body.code], [400, 'FIRMA_NO_PNG']);
  assert.equal(sql('INSERT').length, 0);
  assert.equal((await llamar('putMia', { user: ALUMNO, file: { buffer: PNG }, body: { titular: 'CENTRO' } })).statusCode, 400);
  assert.equal((await llamar('putMia', { user: EMPRESA, file: { buffer: PNG }, body: { titular: 'TUTOR' } })).statusCode, 403);
  res = await llamar('putMia', { user: ALUMNO, file: { buffer: PNG }, body: { titular: 'tutor' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sql('INSERT INTO dual_firmas')[0].params.slice(0, 2), ['TUTOR', 4]);
  // Two saves at once: the unique index lets one through.
  res = await llamar('putMia', {
    user: ALUMNO, file: { buffer: PNG },
    respuestas: [['INSERT INTO dual_firmas', () => { throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }); }]],
  });
  assert.deepEqual([res.statusCode, res.body.code], [409, 'FIRMA_CONCURRENTE']);
  assert.ok(pool.calls.some((c) => c.sql === 'ROLLBACK'));
});

test('each role sees its own signature; staff see the centre\'s and only an administrator changes it', async () => {
  const centro = ['FROM dual_firmas', (_s, p) => (p[0] === 'CENTRO' ? [fila(1)] : [])];
  let res = await llamar('getMia', { user: COORD, respuestas: [centro] });
  assert.deepEqual([res.body.titular, res.body.firma.id_firma, res.body.puede_cambiar], ['CENTRO', 1, false]);
  assert.equal((await llamar('getMia', { user: ADMIN, respuestas: [centro] })).body.puede_cambiar, true);
  res = await llamar('getMia', { user: EMPRESA, respuestas: [centro] });
  assert.deepEqual([res.body.titular, res.body.firma, res.body.requiere_tutor], ['USUARIO', null, undefined]);

  const menor = ['FROM gf_alumnosfct', [{ nombre: 'Leo Gil', fechaNacimiento: new Date(Date.now() - 16 * 365.25 * 864e5), tutorLegal: ' Marta Gil ' }]];
  res = await llamar('getMia', { user: ALUMNO, alumno: 7, respuestas: [menor, ['FROM dual_firmas', (_s, p) => (p[0] === 'TUTOR' ? [fila(71)] : [fila(70)])]] });
  assert.deepEqual([res.body.requiere_tutor, res.body.tutor_nombre, res.body.firma.id_firma, res.body.firma_tutor.id_firma], [true, 'Marta Gil', 70, 71]);
  res = await llamar('getMia', { user: ALUMNO, alumno: 7, respuestas: [['FROM gf_alumnosfct', [{ nombre: 'Ana', fechaNacimiento: '1999-01-01', tutorLegal: null }]]] });
  assert.deepEqual([res.body.requiere_tutor, res.body.tutor_nombre, res.body.firma_tutor], [false, null, null]);

  res = await llamar('putCentro', { user: ADMIN, file: { buffer: PNG } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sql('INSERT INTO dual_firmas')[0].params.slice(0, 2), ['CENTRO', null]);
  assert.equal(sql('INSERT INTO dual_firmas')[0].params[5], 'FICHERO');
  assert.equal((await llamar('putCentro', { user: ADMIN })).statusCode, 400);
  assert.equal((await llamar('putCentro', { user: ADMIN, file: { buffer: Buffer.from('x') } })).statusCode, 400);
});

test('deleting erases the image and keeps the row that signed documents refer to', async () => {
  let res = await llamar('deleteMia', { user: ALUMNO });
  assert.equal(res.statusCode, 404);
  assert.equal((await llamar('deleteMia', { user: ALUMNO, query: { titular: 'CENTRO' } })).statusCode, 400);
  res = await llamar('deleteMia', { user: ALUMNO, query: { titular: 'TUTOR' }, respuestas: [['FROM dual_firmas', [fila(71)]]] });
  assert.equal(res.statusCode, 200);
  const upd = sql('UPDATE dual_firmas SET activa = 0, imagen = NULL')[0];
  assert.deepEqual(upd.params, [71]);
  assert.equal(sql('DELETE').length, 0);
  assert.deepEqual(sql('INSERT INTO dual_eventos')[0].params.slice(0, 3), ['FIRMA', 71, 'ELIMINAR']);
});

test('what each role stamps: own image, the centre\'s, and the guardian\'s for a minor', async () => {
  const todas = ['FROM dual_firmas', (_s, p) => [fila({ USUARIO: 70, TUTOR: 71, CENTRO: 1 }[p[0]])]];
  st = { respuestas: [todas, ['FROM ge_empresas', [{ empresa: 'ACME S.L.' }]], ['SELECT d.idempresa', [{ idempresa: 9 }]]] };
  let sellos = await svc.sellosPara(pool, ADMIN, 'GESTOR');
  assert.deepEqual(sellos.map((s) => [s.marca, s.id_firma, s.titulo]), [['CENTRO', 1, 'Por el centro']]);
  sellos = await svc.sellosPara(pool, EMPRESA, 'EMPRESA');
  assert.deepEqual(sellos.map((s) => [s.marca, s.id_firma, s.nombre]), [['EMPRESA', 70, 'ACME S.L.']]);

  const menor = ['FROM gf_alumnosfct', [{ nombre: 'Leo Gil', fechaNacimiento: new Date(Date.now() - 16 * 365.25 * 864e5), tutorLegal: 'Marta Gil' }]];
  st = { alumno: 7, respuestas: [todas, menor] };
  sellos = await svc.sellosPara(pool, ALUMNO, 'ALUMNO');
  assert.deepEqual(sellos.map((s) => [s.marca, s.id_firma, s.nombre]), [['ALUMNO', 70, 'Leo Gil'], ['TUTOR', 71, 'Marta Gil']]);
  st = { alumno: 7, respuestas: [['FROM dual_firmas', (_s, p) => (p[0] === 'USUARIO' ? [fila()] : [])], menor] };
  await assert.rejects(svc.sellosPara(pool, ALUMNO, 'ALUMNO'), (e) => e.status === 409 && e.code === 'SIN_FIRMA_TUTOR');
  st = {};
  await assert.rejects(svc.sellosPara(pool, ALUMNO, 'ALUMNO'), (e) => e.code === 'SIN_FIRMA_GUARDADA');
  await assert.rejects(svc.sellosPara(pool, COORD, 'GESTOR'), (e) => e.code === 'SIN_FIRMA_CENTRO');
});

// ── Phone hand-off ──────────────────────────────────────────────────────────

test('phone session: two secrets, only their hashes stored; a cap on open sessions', async () => {
  let res = await llamar('crearSesion', { respuestas: [['SELECT COUNT(*) AS n', [{ n: 3 }]]] });
  assert.equal(res.statusCode, 201);
  const { token, lectura, id, minutos } = res.body;
  assert.deepEqual([id, minutos], [90, 10]);
  assert.ok(token.length >= 40 && lectura.length >= 40 && token !== lectura);
  const ins = sql('INSERT INTO dual_firma_sesiones')[0];
  assert.match(ins.params[0], /^[0-9a-f]{64}$/);
  assert.ok(!ins.params.includes(token) && !ins.params.includes(lectura));
  assert.ok(sql('DELETE FROM dual_firma_sesiones WHERE expira_en <').length === 1, 'expired sessions are cleared');
  res = await llamar('crearSesion', { respuestas: [['SELECT COUNT(*) AS n', [{ n: 300 }]]] });
  assert.equal(res.statusCode, 429);
  assert.equal(sql('INSERT').length, 0);
});

test('phone session: one upload while it is open; the computer reads it with its own key', async () => {
  const h = { 'X-Firma-Token': 'tok' };
  let res = await llamar('enviarMovil', { headers: h });
  assert.equal(res.statusCode, 400);
  res = await llamar('enviarMovil', { headers: h, file: { buffer: Buffer.from('x') } });
  assert.equal(res.body.code, 'FIRMA_NO_PNG');
  res = await llamar('enviarMovil', { headers: h, file: { buffer: PNG } });
  assert.deepEqual([res.statusCode, res.body.estado], [200, 'RECIBIDA']);
  assert.match(sql('UPDATE dual_firma_sesiones')[0].sql, /estado = 'ABIERTA' AND expira_en > NOW\(\)/);

  const estados = [[{ estado: 'RECIBIDA', caducada: 0 }, 'RECIBIDA', /Ya se ha enviado/], [{ estado: 'ABIERTA', caducada: 1 }, 'CADUCADA', /caducado/], [null, 'CERRADA', /ya no está abierta/]];
  for (const [row, estado, mensaje] of estados) {
    res = await llamar('enviarMovil', { headers: h, file: { buffer: PNG }, afectadas: 0, respuestas: [['WHERE token_hash = ?', (s) => (s.startsWith('SELECT') ? (row ? [row] : []) : { affectedRows: 0 })]] });
    assert.deepEqual([res.statusCode, res.body.estado], [409, estado]);
    assert.match(res.body.error, mensaje);
    assert.equal((await llamar('estadoMovil', { headers: h, respuestas: [['WHERE token_hash = ?', row ? [row] : []]] })).body.estado, estado);
  }

  const lee = (row) => llamar('leerSesion', { params: { id: '6' }, headers: { 'X-Firma-Lectura': 'clave' }, respuestas: [['WHERE id_sesion = ? AND lectura_hash = ?', row ? [row] : []]] });
  assert.deepEqual((await lee({ id_sesion: 6, estado: 'ABIERTA', imagen: null, caducada: 0, segundos: 540 })).body, { estado: 'ABIERTA', segundos: 540 });
  assert.equal((await lee({ id_sesion: 6, estado: 'ABIERTA', imagen: null, caducada: 1, segundos: 0 })).body.estado, 'CADUCADA');
  res = await lee({ id_sesion: 6, estado: 'RECIBIDA', imagen: PNG, caducada: 1, segundos: 0 });
  assert.equal(res.body.imagen, `data:image/png;base64,${PNG.toString('base64')}`, 'a received drawing is still readable');
  assert.equal((await lee(null)).statusCode, 404, 'the wrong key reads nothing');
  assert.equal((await llamar('leerSesion', { params: { id: 'x' } })).statusCode, 404);

  res = await llamar('cerrarSesion', { params: { id: '6' }, headers: { 'X-Firma-Lectura': 'clave' }, respuestas: [['WHERE id_sesion = ? AND lectura_hash = ?', [{ id_sesion: 6 }]]] });
  assert.deepEqual(sql('DELETE FROM dual_firma_sesiones WHERE id_sesion')[0].params, [6]);
  res = await llamar('cerrarSesion', { params: { id: '6' } });
  assert.equal(sql('DELETE').length, 0);
  assert.equal(res.body.estado, 'CERRADA');
});

// ── Inside the PDF ──────────────────────────────────────────────────────────

async function pdfConMarcas(marcas) {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const page = doc.addPage([595, 842]);
  const annots = Object.entries(marcas).map(([destino, rect]) => doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: rect,
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(destino) },
  })));
  page.node.set(PDFName.of('Annots'), doc.context.obj(annots));
  return Buffer.from(await doc.save());
}

test('templates: each signature variable is a token, then an empty box that links to its mark', () => {
  assert.deepEqual(firmaPdf.datosDeMarcas(), {
    firmaEmpresa: '[[FIRMA:EMPRESA]]', firmaCentro: '[[FIRMA:CENTRO]]', firmaAlumno: '[[FIRMA:ALUMNO]]', firmaTutorLegal: '[[FIRMA:TUTOR]]',
  });
  const html = firmaPdf.marcasEnHtml('<p>El alumno</p><p>[[FIRMA:ALUMNO]]</p><p>[[FIRMA:OTRO]]</p>');
  assert.match(html, /<a href="https:\/\/firma\.invalid\/ALUMNO" style="display:inline-block;width:5cm;max-width:100%;height:2\.2cm/);
  assert.ok(html.includes('[[FIRMA:OTRO]]'), 'unknown marks are left as text');
  assert.equal(firmaPdf.marcasEnHtml(null), '');
  assert.deepEqual(firmaPdf.marcasEnTexto('Firma: << firmaAlumno >>\n<<firmaCentro>> <<alumno>>'), ['CENTRO', 'ALUMNO']);
  assert.deepEqual(firmaPdf.marcasEnTexto(''), []);
});

test('marks are read from the generated PDF with their page and rectangle, and the links removed', async () => {
  const pdf = await pdfConMarcas({
    'https://firma.invalid/ALUMNO': [368.254, 94.9, 510, 157.15],
    'https://firma.invalid/CENTRO': [209, 80, 365, 171],
    'https://firma.invalid/NADIE': [10, 10, 200, 100],
    'https://firma.invalid/EMPRESA': [60, 90, 65, 95],
    'https://example.com/': [10, 200, 100, 220],
  });
  const { pdf: limpio, posiciones } = await firmaPdf.leerMarcas(pdf);
  assert.deepEqual(posiciones, {
    CENTRO: { p: 2, x: 209, y: 80, w: 156, h: 91 },
    ALUMNO: { p: 2, x: 368.25, y: 94.9, w: 141.75, h: 62.25 },
  }, 'unknown marks and boxes squeezed to nothing are ignored');
  const annots = (await PDFDocument.load(limpio)).getPages()[1].node.lookup(PDFName.of('Annots'));
  assert.equal(annots.size(), 2, 'only the two foreign links stay (the unknown mark and the real link)');

  const sinMarcas = Buffer.from(await (await PDFDocument.create()).save());
  assert.equal((await firmaPdf.leerMarcas(sinMarcas)).posiciones, null);
  const roto = Buffer.from('%PDF-gen');
  assert.deepEqual(await firmaPdf.leerMarcas(roto), { pdf: roto, posiciones: null }, 'an unreadable file has no marks');
});

test('stamping: inside the mark when there is one, otherwise on one Hoja de firmas that fills up', async () => {
  const base = await pdfConMarcas({});
  const marcas = { ALUMNO: { p: 2, x: 368, y: 95, w: 142, h: 62 } };
  let r = await firmaPdf.estampar(base, marcas, [{ marca: 'ALUMNO', png: PNG, titulo: 'El alumno', nombre: 'Ana' }]);
  assert.deepEqual(r.ubicaciones, { ALUMNO: 'MARCA' });
  assert.deepEqual(r.posiciones, marcas);
  assert.equal((await PDFDocument.load(r.pdf)).getPageCount(), 2);

  r = await firmaPdf.estampar(r.pdf, r.posiciones, [
    { marca: 'ALUMNO', png: PNG, titulo: 'El alumno', nombre: 'Ana' },
    { marca: 'TUTOR', png: PNG, titulo: 'Tutor/a legal', nombre: 'Иван Ñuñez — 测试' },
  ], { nombreDocumento: 'Anexo II', fecha: new Date(2026, 10, 5) });
  assert.deepEqual(r.ubicaciones, { ALUMNO: 'MARCA', TUTOR: 'HOJA' });
  assert.deepEqual(r.posiciones._hoja, { p: 3, n: 1 });
  r = await firmaPdf.estampar(r.pdf, r.posiciones, [{ marca: 'CENTRO', png: PNG, titulo: 'Por el centro', nombre: null }]);
  assert.deepEqual(r.posiciones._hoja, { p: 3, n: 2 }, 'the same sheet takes the next place');
  assert.equal((await PDFDocument.load(r.pdf)).getPageCount(), 3);

  // A mark on a page the file no longer has, and a full sheet: a new sheet.
  r = await firmaPdf.estampar(base, { EMPRESA: { p: 9, x: 1, y: 1, w: 100, h: 40 }, _hoja: { p: 2, n: 8 } }, [{ marca: 'EMPRESA', png: PNG, titulo: 'Por la empresa' }]);
  assert.deepEqual([r.ubicaciones.EMPRESA, r.posiciones._hoja], ['HOJA', { p: 3, n: 1 }]);

  await assert.rejects(firmaPdf.estampar(Buffer.from('%PDF-roto'), null, [{ marca: 'ALUMNO', png: PNG, titulo: 'x' }]));
  await assert.rejects(firmaPdf.estampar(base, null, [{ marca: 'ALUMNO', png: Buffer.from('no'), titulo: 'x' }]));
});

test('the image keeps its proportions, centred in the box; text is made safe for the PDF font', () => {
  assert.deepEqual(firmaPdf.encajar({ width: 300, height: 100 }, { x: 10, y: 20, w: 150, h: 100 }), { x: 10, y: 45, width: 150, height: 50 });
  assert.deepEqual(firmaPdf.encajar({ width: 100, height: 200 }, { x: 0, y: 0, w: 150, h: 100 }), { x: 50, y: 0, width: 50, height: 100 });
  assert.equal(firmaPdf.textoSeguro('  María Ñuñez  '), 'María Ñuñez');
  assert.equal(firmaPdf.textoSeguro('Иван 测'), '???? ?');
  assert.equal(firmaPdf.textoSeguro('x'.repeat(80), 10).length, 10);
  assert.equal(firmaPdf.textoSeguro(null), '');
});
