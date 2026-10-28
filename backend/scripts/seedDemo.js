#!/usr/bin/env node
// Realistic demo data for the DEVELOPMENT database (Salesianos Zaragoza, grado superior).
//
//   node scripts/seedDemo.js --dry-run     everything runs, then rolls back
//   node scripts/seedDemo.js --yes         WIPES all data and loads the demo set
//
// Wipes every data table (applications, reservations, documents, accounts, companies,
// students, specialities, audit events). Keeps the catalogues (roles, states, contract and
// document types, transports), the convocatorias, templates and schema_migrations.
//
// Logins (all accounts have must_change_password = 0):
//   ADMINISTRADOR  DEMO_ADMIN_EMAIL (default admin.demo@fpdual.test)
//   COORDINADOR    DEMO_COORD_EMAIL (default coord.demo@fpdual.test)
//   EMPRESA        user = CIF
//   ALUMNO         user = DNI
// SEC-013: every password is random and is written ONLY to backend/.demo.local.json
// (git-ignored), never printed. Use this script on a disposable development database only.
// All people and companies are fictitious; e-mails use example.com.
// Refuses NODE_ENV=production.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { connect, target, assertNotProduction } = require('./lib/connect');

// ---------------------------------------------------------------- helpers
let seed = 20261028;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function cif(letra, digits) {
  let par = 0;
  let impar = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(digits[i]);
    if (i % 2 === 0) { const d = n * 2; impar += d > 9 ? d - 9 : d; } else par += n;
  }
  return `${letra}${digits}${(10 - ((par + impar) % 10)) % 10}`;
}
const dniLetra = (n) => 'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23];
const dni = (n) => `${String(n).padStart(8, '0')}${dniLetra(n)}`;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

// A one-page PDF with a title and a few lines (enough to open and read).
function pdf(titulo, lineas = []) {
  const esc = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[()\\]/g, ' ');
  const body = ['BT /F1 16 Tf 60 780 Td (' + esc(titulo) + ') Tj ET']
    .concat(lineas.map((l, i) => `BT /F1 11 Tf 60 ${750 - i * 18} Td (${esc(l)}) Tj ET`)).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { out += `${String(o).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---------------------------------------------------------------- catalogue data
// turno 0 = diurno, 1 = vespertino. Vespertino groups: DAM and Sistemas Electrotécnicos.
const ESPECIALIDADES = [
  ['FME304', 'Programación de la Producción en Fabricación Mecánica', 0],
  ['ELE303', 'Automatización y Robótica Industrial', 0],
  ['ELE304', 'Sistemas de Telecomunicaciones e Informáticos', 0],
  ['IFC302', 'Desarrollo de Aplicaciones Multiplataforma', 0],
  ['IFC302', 'Desarrollo de Aplicaciones Multiplataforma', 1],
  ['ELE302', 'Sistemas Electrotécnicos y Automatizados', 0],
  ['ELE302', 'Sistemas Electrotécnicos y Automatizados', 1],
  ['TMV301', 'Automoción', 0],
];
const K = { FME: 'FME304:0', ROB: 'ELE303:0', TEL: 'ELE304:0', DAMD: 'IFC302:0', DAMV: 'IFC302:1', ELED: 'ELE302:0', ELEV: 'ELE302:1', AUT: 'TMV301:0' };

// estado: V = validada, P = pendiente (convenio sin validar), R = rechazada
const EMPRESAS = [
  { n: 'Talleres Mecánicos Aragón Norte S.L.', l: 'B', d: '5012345', calle: 'Calle Cobalto 14, Polígono Malpica', cp: '50016', loc: 'Zaragoza', tel: '976 470 112', web: 'www.talleresaragonnorte.example', rep: ['Ignacio Bernad Sanz', 'Administrador único'], co: ['Marta Lasheras Pardo', 'Responsable de producción'], tut: ['Julián Gracia Ibáñez', 'Jefe de taller'], ofertas: { [K.FME]: 2, [K.AUT]: 1 }, tr: [3, 2], e: 'V' },
  { n: 'Automoción Ebro S.L.', l: 'B', d: '5023456', calle: 'Avenida de Navarra 187', cp: '50013', loc: 'Zaragoza', tel: '976 331 904', web: 'www.automocionebro.example', rep: ['Fernando Omedes Lahoz', 'Gerente'], co: ['Silvia Aznar Bolea', 'Jefa de postventa'], tut: ['Rubén Cativiela Marco', 'Técnico de diagnosis'], ofertas: { [K.AUT]: 3 }, tr: [3, 4], e: 'V' },
  { n: 'Concesionario Autos Utebo S.L.', l: 'B', d: '5034567', calle: 'Carretera de Logroño, km 6', cp: '50180', loc: 'Utebo', tel: '976 770 265', web: 'www.autosutebo.example', rep: ['Joaquín Pueyo Santolaria', 'Administrador'], co: ['Beatriz Moliner Sierra', 'Responsable de taller'], tut: ['Adrián Lanuza Peña', 'Jefe de equipo'], ofertas: { [K.AUT]: 2 }, tr: [2], e: 'V' },
  { n: 'Soluciones Digitales Zaragoza S.L.', l: 'B', d: '5045678', calle: 'Calle Albareda 12, 3.º B', cp: '50004', loc: 'Zaragoza', tel: '976 215 840', web: 'www.solucionesdigitaleszgz.example', rep: ['Carmen Escudero Villa', 'Directora general'], co: ['Pablo Mainar Torres', 'Director técnico'], tut: ['Lucía Ferrer Abad', 'Desarrolladora senior'], ofertas: { [K.DAMD]: 3, [K.DAMV]: 2 }, tr: [4, 1], e: 'V' },
  { n: 'Software Sancho S.L.', l: 'B', d: '5056789', calle: 'Paseo de la Independencia 24', cp: '50004', loc: 'Zaragoza', tel: '976 230 771', web: 'www.softwaresancho.example', rep: ['Alberto Sancho Mur', 'Socio fundador'], co: ['Elena Cardiel Gómez', 'Responsable de RR. HH.'], tut: ['Sergio Laborda Remón', 'Líder de equipo'], ofertas: { [K.DAMD]: 2, [K.DAMV]: 2 }, tr: [4, 3], e: 'V' },
  { n: 'Robótica y Control Pilar S.A.', l: 'A', d: '5067890', calle: 'Calle Bari 25, PLAZA', cp: '50197', loc: 'Zaragoza', tel: '976 780 450', web: 'www.roboticapilar.example', rep: ['Teresa Gimeno Aísa', 'Consejera delegada'], co: ['Óscar Vicente Roy', 'Jefe de ingeniería'], tut: ['Cristina Alquézar Navarro', 'Ingeniera de automatización'], ofertas: { [K.ROB]: 3, [K.ELED]: 1 }, tr: [2, 3], e: 'V' },
  { n: 'Instalaciones Eléctricas Moncayo S.L.', l: 'B', d: '5078901', calle: 'Calle San Juan de la Peña 140', cp: '50015', loc: 'Zaragoza', tel: '976 521 366', web: 'www.electricasmoncayo.example', rep: ['Manuel Tejero Calvo', 'Administrador'], co: ['Raquel Sánchez Orús', 'Jefa de obra'], tut: ['David Pina Ortiz', 'Oficial de primera'], ofertas: { [K.ELED]: 2, [K.ELEV]: 2 }, tr: [3, 6], e: 'V' },
  { n: 'Telecomunicaciones Cierzo S.L.', l: 'B', d: '5089012', calle: 'Calle Miguel Servet 77', cp: '50013', loc: 'Zaragoza', tel: '976 414 593', web: 'www.telecierzo.example', rep: ['Víctor Allué Castán', 'Gerente'], co: ['Natalia Bernués Gil', 'Responsable de despliegues'], tut: ['Hugo Sebastián Lalana', 'Técnico de redes'], ofertas: { [K.TEL]: 3 }, tr: [3, 4, 5], e: 'V' },
  { n: 'Mecanizados de Precisión Cuarte S.L.', l: 'B', d: '5090123', calle: 'Polígono Entreríos, nave 9', cp: '50410', loc: 'Cuarte de Huerva', tel: '976 503 128', web: 'www.mecanizadoscuarte.example', rep: ['Ángel Asensio Fuertes', 'Administrador único'], co: ['Mónica Lacambra Sáez', 'Responsable de calidad'], tut: ['Iván Vallés Cortés', 'Jefe de CNC'], ofertas: { [K.FME]: 2 }, tr: [2], e: 'V' },
  { n: 'Ingeniería Térmica Delicias S.L.', l: 'B', d: '5001234', calle: 'Calle Tomás Bretón 51', cp: '50005', loc: 'Zaragoza', tel: '976 273 009', web: 'www.termicadelicias.example', rep: ['Rosa Marín Zapater', 'Directora'], co: ['Jaime Abadía Lorente', 'Jefe de proyectos'], tut: ['Patricia Ainsa Cebollero', 'Ingeniera de instalaciones'], ofertas: { [K.ELEV]: 1, [K.ROB]: 2 }, tr: [3], e: 'P' },
  { n: 'Grupo Logístico Plaza S.A.', l: 'A', d: '5012346', calle: 'Calle Isla de Mallorca 4, PLAZA', cp: '50197', loc: 'Zaragoza', tel: '976 300 842', web: 'www.logisticaplaza.example', rep: ['Enrique Ballarín Mora', 'Director general'], co: ['Irene Casbas Pérez', 'Responsable de sistemas'], tut: ['Álvaro Buisán Lozano', 'Administrador de sistemas'], ofertas: { [K.DAMD]: 2, [K.TEL]: 1 }, tr: [2, 3], e: 'V' },
  { n: 'Fabricaciones Metálicas Casetas S.L.', l: 'B', d: '5023457', calle: 'Polígono Casetas, calle D 18', cp: '50620', loc: 'Casetas', tel: '976 772 931', web: '', rep: ['Luis Montañés Gascón', 'Administrador'], co: ['Verónica Jarne Ruiz', 'Administración'], tut: ['Marcos Esteban Villacampa', 'Encargado de planta'], ofertas: { [K.FME]: 2, [K.AUT]: 1 }, tr: [2], e: 'R' },
];

const NOMBRES_H = ['Daniel', 'Pablo', 'Álvaro', 'Adrián', 'Hugo', 'Sergio', 'Diego', 'Jorge', 'Mario', 'Carlos', 'Iván', 'Raúl', 'Samuel', 'Nicolás', 'Marcos', 'Rubén', 'Javier', 'Alejandro'];
const NOMBRES_M = ['Lucía', 'Marta', 'Paula', 'Sara', 'Claudia', 'Nerea', 'Alba', 'Laura', 'Irene', 'Andrea', 'Carla', 'Elena', 'Noelia', 'Ainhoa', 'Cristina', 'Patricia'];
const APELLIDOS = ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Hernández', 'Jiménez', 'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Gil', 'Vázquez', 'Serrano', 'Blasco', 'Lacasa', 'Ibáñez', 'Aragüés', 'Lasierra', 'Bueno', 'Marín', 'Ortega', 'Castillo', 'Pascual', 'Español'];
const BARRIOS = [['Calle Delicias 35', '50017', 'Zaragoza'], ['Calle Compromiso de Caspe 8', '50002', 'Zaragoza'], ['Avenida Cataluña 62', '50014', 'Zaragoza'], ['Calle Doctor Cerrada 19', '50005', 'Zaragoza'], ['Calle Camino de las Torres 44', '50008', 'Zaragoza'], ['Calle Sixto Celorrio 3', '50018', 'Zaragoza'], ['Calle Mayor 21', '50180', 'Utebo'], ['Avenida Pablo Picasso 7', '50410', 'Cuarte de Huerva'], ['Calle Reina Sofía 12', '50430', 'María de Huerva'], ['Calle San Valero 5', '50720', 'Zaragoza'], ['Paseo Rosales 30', '50008', 'Zaragoza'], ['Calle Jerónimo Zurita 16', '50001', 'Zaragoza']];

// students per speciality: [key, count]
const ALUMNOS_POR_ESP = [[K.DAMD, 6], [K.DAMV, 4], [K.ELED, 4], [K.ELEV, 3], [K.ROB, 5], [K.TEL, 4], [K.FME, 4], [K.AUT, 6]];

// ---------------------------------------------------------------- main
async function main() {
  const argv = process.argv.slice(2);
  assertNotProduction(argv);
  const dry = argv.includes('--dry-run');
  if (!dry && !argv.includes('--yes')) {
    console.error('Usa --dry-run para probar sin cambios o --yes para BORRAR todos los datos y cargar la demo.');
    process.exit(1);
  }
  const { database, host } = target();
  console.log(`Base de datos: ${database} @ ${host}${dry ? ' (dry-run: se revierte)' : ''}`);
  const conn = await connect();
  const q = async (sql, p) => (await conn.query(sql, p))[0];
  const one = async (sql, p) => (await q(sql, p))[0] || null;
  const hash = (pw) => bcrypt.hash(pw, 10);
  const OUT = path.join(__dirname, '..', '.demo.local.json');
  const secrets = [];
  const stats = {};
  const inc = (k, n = 1) => { stats[k] = (stats[k] || 0) + n; };

  try {
    const roles = Object.fromEntries((await q('SELECT id_rol, nombre FROM dual_roles')).map((r) => [r.nombre, r.id_rol]));
    const conv = await one('SELECT id_convocatoria, nombre FROM dual_convocatorias WHERE activa = 1');
    if (!conv) throw new Error('No hay convocatoria activa.');
    const tipoDoc = Object.fromEntries((await q('SELECT id_tipo_documento id, nombre FROM dual_tipos_documento')).map((r) => [r.nombre, r.id]));
    const est = Object.fromEntries((await q('SELECT id_estado_validacion id, nombre FROM dual_estados_validacion')).map((r) => [r.nombre, r.id]));
    const tc = Object.fromEntries((await q('SELECT id_tipo_contrato id, nombre FROM dual_tipos_contrato')).map((r) => [r.nombre, r.id]));
    const eres = Object.fromEntries((await q('SELECT id_estado_reserva id, nombre FROM dual_estados_reserva')).map((r) => [r.nombre, r.id]));

    // ------------------------------------------------------------ wipe
    // TRUNCATE is DDL (it commits), so the real run wipes first and then loads inside one
    // transaction; if the load fails the tables stay empty: restore backups/ or run again.
    // The dry run wipes inside its transaction with DELETE (audit events are left alone).
    const TABLAS = ['dual_documento_firmas', 'dual_documento_versiones', 'dual_documentos', 'dual_empresa_cambios', 'dual_empresa_transportes',
      'dual_empresa_tutores', 'dual_eventos', 'dual_reservas', 'dual_solicitud_empresa_especialidades', 'dual_solicitud_empresa_transportes',
      'dual_solicitudes_alumno', 'dual_solicitudes_empresa', 'dual_usuarios', 'dual_especialidades',
      'ge_contactos', 'ge_domicilios', 'ge_empresas', 'gf_alumnosfct'];
    await q('SET FOREIGN_KEY_CHECKS = 0');
    if (!dry) for (const t of TABLAS) await q('TRUNCATE TABLE `' + t + '`');
    await conn.beginTransaction();
    if (dry) for (const t of TABLAS.filter((x) => x !== 'dual_eventos')) await q('DELETE FROM `' + t + '`');
    await q('SET FOREIGN_KEY_CHECKS = 1');

    // ------------------------------------------------------------ specialities
    const esp = {};
    for (const [codigo, nombre, turno] of ESPECIALIDADES) {
      const r = await q('INSERT INTO dual_especialidades (codigo, nombre, turno, activa) VALUES (?, ?, ?, 1)', [codigo, nombre, turno]);
      esp[`${codigo}:${turno}`] = { id: r.insertId, codigo };
    }
    inc('especialidades', ESPECIALIDADES.length);

    // ------------------------------------------------------------ staff
    const addUser = async (nombre, email, usuario, rol, extra = {}) => {
      const pw = crypto.randomBytes(12).toString('base64url');
      secrets.push({ rol, usuario, password: pw });
      const r = await q(
        `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, id_contacto, id_alumno, activo, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
        [nombre, email, await hash(pw), roles[rol], extra.idContacto || null, extra.idAlumno || null],
      );
      inc(`usuarios ${rol}`);
      return r.insertId;
    };
    const adminEmail = process.env.DEMO_ADMIN_EMAIL || 'admin.demo@fpdual.test';
    const coordEmail = process.env.DEMO_COORD_EMAIL || 'coord.demo@fpdual.test';
    const idAdmin = await addUser('Administración (demo)', adminEmail, adminEmail, 'ADMINISTRADOR');
    await addUser('Coordinación (demo)', coordEmail, coordEmail, 'COORDINADOR');

    // ------------------------------------------------------------ companies
    let dniSeq = 17000000;
    const nextDni = () => { dniSeq += between(137000, 411000); return dni(dniSeq); };
    const empresas = [];
    let day = 1;
    for (const e of EMPRESAS) {
      const cifValue = cif(e.l, e.d);
      const slug = norm(e.n.replace(/ S\.[LA]\.$/, '')).replace(/\./g, '');
      const emp = await q(
        `INSERT INTO ge_empresas (cif, empresa, convenio, fechaconvenio, web, observaciones, emailEmpresa, telefonoEmpresa, menosdecincotrabajadores)
         VALUES (?, ?, '', ?, ?, '', ?, ?, ?)`,
        [cifValue, e.n, e.e === 'V' ? `2026-09-${String(8 + (day % 15)).padStart(2, '0')}` : null, e.web, `contacto@${slug}.example.com`, e.tel, e.e === 'R' ? 1 : 0],
      );
      const idEmpresa = emp.insertId;
      const dom = await q(
        `INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, telefono, email, especialidad, municipio)
         VALUES (?, ?, ?, 'Zaragoza', ?, ?, ?, '', ?)`,
        [idEmpresa, e.calle, e.cp, e.loc, e.tel, `contacto@${slug}.example.com`, e.loc],
      );
      const idDom = dom.insertId;
      const contacto = async ([nombre, cargo], dniValue = nextDni()) => (await q(
        `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones, especialidad)
         VALUES (?, ?, ?, ?, ?, ?, '', '')`,
        [idDom, dniValue, nombre, `${norm(nombre)}@${slug}.example.com`, `6${between(10, 99)} ${between(100, 999)} ${between(100, 999)}`, cargo],
      )).insertId;
      const idRep = await contacto(e.rep);
      const idCoord = await contacto(e.co);
      const idTut = await contacto(e.tut);
      const fecha = `2026-09-${String(2 + (day++ % 24)).padStart(2, '0')} 1${day % 10}:${String(10 + day * 3 % 50)}:00`;
      const estado = e.e === 'V' ? 'PENDIENTE' : e.e === 'P' ? 'PENDIENTE' : 'RECHAZADO';
      const sol = await q(
        `INSERT INTO dual_solicitudes_empresa (id_empresa, id_convocatoria, id_estado_validacion, id_representante_legal, id_coordinador_empresa,
           id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto, fecha_solicitud, motivo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idEmpresa, conv.id_convocatoria, est[estado], idRep, idCoord, idDom, idDom,
          'Prácticas formativas en dual con tutor asignado, integración en el equipo y rotación por las áreas de la empresa.', fecha,
          e.e === 'R' ? 'El convenio llegó sin sellar y la empresa no ha respondido a los avisos del centro.' : null],
      );
      const idSol = sol.insertId;
      const ofertas = {};
      for (const [key, n] of Object.entries(e.ofertas)) {
        const r = await q('INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, ?)', [idSol, esp[key].id, n]);
        ofertas[key] = { id: r.insertId, plazas: n, usadas: 0 };
      }
      for (const t of e.tr) await q('INSERT INTO dual_solicitud_empresa_transportes (id_solicitud_empresa, id_transporte) VALUES (?, ?)', [idSol, t]);
      const tutores = {};
      for (const [k, idC] of [['coord', idCoord], ['tut', idTut]]) {
        tutores[k] = (await q('INSERT INTO dual_empresa_tutores (id_empresa, id_contacto, activo) VALUES (?, ?, 1)', [idEmpresa, idC])).insertId;
      }
      const idUser = await addUser(e.co[0], null, cifValue, 'EMPRESA', { idContacto: idCoord });
      // convenio
      const convEstado = e.e === 'V' ? 'VALIDADO' : e.e === 'P' ? 'PENDIENTE' : 'RECHAZADO';
      const doc = await q(
        `INSERT INTO dual_documentos (id_solicitud_empresa, id_tipo_documento, archivo, id_estado_validacion, motivo, estado_workflow, es_actual,
           id_usuario_origen, origen_documento, registrado_en)
         VALUES (?, ?, ?, ?, ?, 'SUBIDO', 1, ?, 'SUBIDA', ?)`,
        [idSol, tipoDoc.CONVENIO, pdf('Convenio de colaboracion FP Dual', [e.n, `CIF ${cifValue}`, `Convocatoria ${conv.nombre}`, 'Centro: Salesianos Zaragoza']),
          est[convEstado], e.e === 'R' ? 'Falta el sello de la empresa en todas las páginas.' : null, idUser, fecha],
      );
      await q(`INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en, firmado_por, metodo) VALUES (?, 'EMPRESA', ?, ?, ?, 'SUBIDA_FIRMADA')`,
        [doc.insertId, e.e === 'R' ? 'SIN_FIRMAR' : 'FIRMADO', e.e === 'R' ? null : fecha, e.e === 'R' ? null : idUser]);
      if (e.e === 'V') await q('UPDATE dual_solicitudes_empresa SET id_estado_validacion = ? WHERE id_solicitud_empresa = ?', [est.VALIDADO, idSol]);
      empresas.push({ ...e, cifValue, idSol, ofertas, tutores, idUser, validada: e.e === 'V' });
      inc('empresas');
    }

    // ------------------------------------------------------------ students
    const alumnos = [];
    let i = 0;
    for (const [key, n] of ALUMNOS_POR_ESP) {
      for (let k = 0; k < n; k++, i++) {
        const mujer = rnd() < 0.35;
        const nombre = pick(mujer ? NOMBRES_M : NOMBRES_H);
        const ap1 = pick(APELLIDOS);
        let ap2 = pick(APELLIDOS);
        if (ap2 === ap1) ap2 = APELLIDOS[(APELLIDOS.indexOf(ap1) + 7) % APELLIDOS.length];
        const dniValue = dni(between(18000000, 73999999));
        const [calle, cp, loc] = pick(BARRIOS);
        const full = `${nombre} ${ap1} ${ap2}`;
        const nac = `${between(1999, 2005)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`;
        const a = await q(
          `INSERT INTO gf_alumnosfct (nombre, dni, domicilio, cp, localidad, telalumno, telfamilia, email, especialidad, id_especialidad_dual, observaciones,
             nacionalidad, fechaNacimiento, emailColegio, sexo, carnetDeConducir, tieneCoche, numeroSS, situacionLaboral, idiomasConocidos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'Española', ?, ?, ?, ?, ?, ?, 'Estudiante', ?)`,
          [full, dniValue, calle, cp, loc, `6${between(10, 99)} ${between(100, 999)} ${between(100, 999)}`, `976 ${between(100, 999)} ${between(100, 999)}`,
            `${norm(nombre)}.${norm(ap1)}${between(1, 99)}@example.com`, esp[key].codigo, esp[key].id, nac,
            `${norm(nombre)}.${norm(ap1)}@alumnos.salesianos.example.com`, mujer ? 'Mujer' : 'Hombre', rnd() < 0.7 ? 1 : 0, rnd() < 0.35 ? 1 : 0,
            `50${between(10000000, 99999999)}${between(10, 99)}`, pick(['Inglés B1', 'Inglés B2', 'Inglés A2, Francés A1', 'Inglés B1, Francés A2'])],
        );
        const idAlumno = a.insertId;
        const idUser = await addUser(full, null, dniValue, 'ALUMNO', { idAlumno });
        // application state: ~74 % validated, ~17 % pending, ~9 % rejected
        const r = i % 12;
        const estado = r === 11 ? 'RECHAZADO' : r % 6 === 2 ? 'PENDIENTE' : 'VALIDADO';
        const fecha = `2026-09-${String(between(3, 28)).padStart(2, '0')} ${between(9, 20)}:${String(between(0, 59)).padStart(2, '0')}:00`;
        const sol = await q(
          `INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad, id_estado_validacion, fecha_solicitud, motivo)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [idAlumno, conv.id_convocatoria, esp[key].id, est[estado === 'RECHAZADO' ? 'RECHAZADO' : 'PENDIENTE'], fecha,
            estado === 'RECHAZADO' ? 'El expediente académico no cumple el requisito de módulos superados para acceder a la FP Dual.' : null],
        );
        const docEstado = estado === 'VALIDADO' ? 'VALIDADO' : estado === 'RECHAZADO' ? 'RECHAZADO' : 'PENDIENTE';
        for (const tipo of ['CV', 'ANEXO_DGA']) {
          if (estado === 'PENDIENTE' && tipo === 'ANEXO_DGA' && i % 2 === 0) continue; // falta el Anexo DGA
          const rechazadoAqui = estado === 'RECHAZADO' && tipo === 'CV';
          await q(
            `INSERT INTO dual_documentos (id_solicitud_alumno, id_tipo_documento, archivo, id_estado_validacion, motivo, estado_workflow, es_actual,
               id_usuario_origen, origen_documento, registrado_en)
             VALUES (?, ?, ?, ?, ?, 'SUBIDO', 1, ?, 'SUBIDA', ?)`,
            [sol.insertId, tipoDoc[tipo], pdf(tipo === 'CV' ? 'Curriculum vitae' : 'Anexo DGA', [full, `DNI ${dniValue}`, esp[key].codigo]),
              est[rechazadoAqui ? 'RECHAZADO' : estado === 'RECHAZADO' ? 'PENDIENTE' : docEstado],
              rechazadoAqui ? 'El CV no incluye la formación ni la experiencia previa.' : null, idUser, fecha],
          );
        }
        if (estado === 'VALIDADO') await q('UPDATE dual_solicitudes_alumno SET id_estado_validacion = ? WHERE id_solicitud_alumno = ?', [est.VALIDADO, sol.insertId]);
        alumnos.push({ key, full, idAlumno, idUser, idSol: sol.insertId, estado, nBuenos: 0, reserva: null });
        inc(`alumnos ${estado}`);
      }
    }

    // ------------------------------------------------------------ reservations
    const contratos = [tc.BECA, tc.CONTRATO_DE_FORMACION_EN_ALTERNANCIA, tc.CONVENIO, tc.CONVENIO, tc.BECA];
    const validados = alumnos.filter((a) => a.estado === 'VALIDADO');
    let n = 0;
    for (const a of validados) {
      const cands = empresas.filter((c) => c.validada && c.ofertas[a.key] && c.ofertas[a.key].usadas < c.ofertas[a.key].plazas);
      if (!cands.length) { inc('sin plaza disponible'); continue; }
      const modo = n++ % 10; // 0-5 confirmada, 6-7 pendiente, 8 cancelada + confirmada, 9 sin reservar
      if (modo === 9) continue;
      const make = async (c, estadoRes, tipo) => {
        const of = c.ofertas[a.key];
        of.usadas += estadoRes === 'CANCELADA' ? 0 : 1;
        const tutor = pick([c.tutores.coord, c.tutores.tut]);
        const r = await q(
          'INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad, id_estado_reserva) VALUES (?, ?, ?)',
          [a.idSol, of.id, eres.PENDIENTE],
        );
        if (tipo || estadoRes !== 'CANCELADA') {
          await q('UPDATE dual_reservas SET id_tipo_contrato = ?, id_empresa_tutor = ? WHERE id_reserva = ?', [tipo, estadoRes === 'CANCELADA' ? null : tutor, r.insertId]);
        }
        return { id: r.insertId, tutor };
      };
      const annex = async (c, resId, tipo, aprobado, firmas) => {
        const clave = tipo === tc.BECA ? 'ANEXO_III' : 'ANEXO_II';
        const d = await q(
          `INSERT INTO dual_documentos (id_reserva, id_tipo_documento, archivo, id_estado_validacion, estado_workflow, es_actual, id_usuario_origen, origen_documento, registrado_en)
           VALUES (?, ?, ?, ?, 'SUBIDO', 1, ?, 'SUBIDA', '2026-10-15 12:00:00')`,
          [resId, tipoDoc[clave], pdf(clave === 'ANEXO_III' ? 'Anexo III - Beca' : 'Anexo II - Contrato / convenio', [a.full, c.n, `Convocatoria ${conv.nombre}`]),
            est[aprobado ? 'VALIDADO' : 'PENDIENTE'], c.idUser],
        );
        const quien = { EMPRESA: c.idUser, GESTOR: idAdmin, ALUMNO: a.idUser };
        let k = 0;
        for (const rol of ['EMPRESA', 'GESTOR', 'ALUMNO']) {
          const firmado = k++ < firmas;
          await q(`INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en, firmado_por, metodo) VALUES (?, ?, ?, ?, ?, ?)`,
            [d.insertId, rol, firmado ? 'FIRMADO' : 'SIN_FIRMAR', firmado ? '2026-10-16 10:30:00' : null, firmado ? quien[rol] : null, firmado ? (rol === 'EMPRESA' ? 'SUBIDA_FIRMADA' : 'CONFIRMACION_APP') : null]);
        }
      };
      const c = pick(cands);
      if (modo <= 5 || modo === 8) {
        if (modo === 8) {
          // primer intento cancelado en otra empresa (si la hay) y después confirmada
          const otras = cands.filter((x) => x !== c);
          if (otras.length) {
            const old = await make(otras[0], 'PENDIENTE', null);
            await q('UPDATE dual_reservas SET id_estado_reserva = ?, motivo = ? WHERE id_reserva = ?',
              [eres.CANCELADA, 'La empresa prefirió otro perfil para este puesto.', old.id]);
            otras[0].ofertas[a.key].usadas -= 1;
            inc('reservas CANCELADA');
          }
        }
        const tipo = pick(contratos);
        const res = await make(c, 'PENDIENTE', tipo);
        await annex(c, res.id, tipo, true, 3);
        await q('UPDATE dual_reservas SET id_estado_reserva = ? WHERE id_reserva = ?', [eres.CONFIRMADA, res.id]);
        inc('reservas CONFIRMADA');
        a.reserva = res.id;
      } else {
        const tipo = modo === 6 ? pick(contratos) : null;
        const res = await make(c, 'PENDIENTE', tipo);
        if (tipo) await annex(c, res.id, tipo, false, 1);
        inc('reservas PENDIENTE');
      }
    }

    if (dry) { await conn.rollback(); console.log('Dry-run correcto: se ha revertido todo.'); }
    else {
      await conn.commit();
      fs.writeFileSync(OUT, JSON.stringify(secrets, null, 2), { mode: 0o600 });
      console.log(`Datos cargados. Contraseñas en ${OUT} (no se versiona).`);
    }
    console.log(JSON.stringify(stats, null, 2));
  } catch (err) {
    await conn.rollback().catch(() => {});
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    console.error('Error (todo revertido):', err.code || '', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
