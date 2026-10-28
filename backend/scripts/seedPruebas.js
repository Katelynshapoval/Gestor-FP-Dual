#!/usr/bin/env node
// Test accounts and data for browser checks on the DEVELOPMENT database.
//
//   node scripts/seedPruebas.js --yes
//
// Creates (once; later runs only report what exists), all marked "PRUEBA":
//   * ADMINISTRADOR  prueba.admin@fpdual.test
//   * COORDINADOR    prueba.coord@fpdual.test
//   * two companies (A with a portal account, B without) with a VALIDADO
//     application in the active convocatoria and one offer each for one
//     speciality, so a student can be reserved at A and reassigned to B
//   * one student with a VALIDADO application and a portal account
// Passwords are generated and written ONLY to backend/.pruebas.local.json
// (git-ignored); they are never printed. Accounts have must_change_password = 0.
// The applications are set to VALIDADO directly (test fixtures): no convenio
// or student documents are created for them.
// Refuses NODE_ENV=production. Nothing is deleted.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { connect, target, assertNotProduction } = require('./lib/connect');

const OUT = path.join(__dirname, '..', '.pruebas.local.json');
const ESPECIALIDAD = Number(process.env.PRUEBA_ESPECIALIDAD || 5);

function password() {
  return crypto.randomBytes(12).toString('base64url');
}

// Valid CIF for letter B + 7 digits (same algorithm as helpers/dbHelpers.cifValido).
function cif(digits) {
  let par = 0;
  let impar = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(digits[i]);
    if (i % 2 === 0) {
      const d = n * 2;
      impar += d > 9 ? d - 9 : d;
    } else par += n;
  }
  return `B${digits}${(10 - ((par + impar) % 10)) % 10}`;
}

function dni(num) {
  return `${num}${'TRWAGMYFPDXBNJZSQVHLCKE'[Number(num) % 23]}`;
}

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function rolId(conn, nombre) {
  return (await one(conn, 'SELECT id_rol FROM dual_roles WHERE nombre = ?', [nombre])).id_rol;
}

async function validado(conn) {
  return (await one(conn, "SELECT id_estado_validacion AS id FROM dual_estados_validacion WHERE nombre = 'VALIDADO'")).id;
}

async function ensureStaff(conn, rol, email, nombre, secrets) {
  const found = await one(conn, 'SELECT id_usuario FROM dual_usuarios WHERE email = ?', [email]);
  if (found) return { id: found.id_usuario, created: false };
  const pw = password();
  const [r] = await conn.query(
    `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, activo, must_change_password)
     VALUES (?, ?, ?, ?, 1, 0)`,
    [nombre, email, await bcrypt.hash(pw, 10), await rolId(conn, rol)],
  );
  secrets[rol] = { usuario: email, password: pw };
  return { id: r.insertId, created: true };
}

async function ensureEmpresa(conn, { letra, cifDigits, conCuenta, idConvocatoria }, secrets) {
  const cifValue = cif(cifDigits);
  const existing = await one(conn, 'SELECT idempresa FROM ge_empresas WHERE cif = ?', [cifValue]);
  if (existing) return { cif: cifValue, created: false };

  const nombre = `EMPRESA PRUEBA ${letra} (FASE 3)`;
  const [emp] = await conn.query(
    `INSERT INTO ge_empresas (cif, empresa, convenio, web, observaciones, emailEmpresa, telefonoEmpresa)
     VALUES (?, ?, '', '', 'Datos de prueba (Phase 3).', ?, '976000000')`,
    [cifValue, nombre, `empresa${letra.toLowerCase()}@fpdual.test`],
  );
  const idEmpresa = emp.insertId;
  const [dom] = await conn.query(
    `INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, telefono, email, especialidad, municipio)
     VALUES (?, 'Calle Prueba 1', '50001', 'Zaragoza', 'Zaragoza', '', '', '', 'Zaragoza')`,
    [idEmpresa],
  );
  const idDom = dom.insertId;
  const contacto = async (dniValue, nombreC, email, cargo) => {
    const [c] = await conn.query(
      `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones, especialidad)
       VALUES (?, ?, ?, ?, '600000000', ?, 'Datos de prueba.', '')`,
      [idDom, dniValue, nombreC, email, cargo],
    );
    return c.insertId;
  };
  const idRep = await contacto(dni(`9999${cifDigits.slice(-3)}1`), `Representante Prueba ${letra}`, `rep${letra.toLowerCase()}@fpdual.test`, 'Administrador');
  const idCoord = await contacto(dni(`9999${cifDigits.slice(-3)}2`), `Coordinador Prueba ${letra}`, `coord${letra.toLowerCase()}@fpdual.test`, 'COORDINADOR DUAL');

  const [sol] = await conn.query(
    `INSERT INTO dual_solicitudes_empresa
       (id_empresa, id_convocatoria, id_estado_validacion, id_representante_legal, id_coordinador_empresa,
        id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
     VALUES (?, ?, 1, ?, ?, ?, ?, 'Puesto de prueba para la verificación de la fase 3.')`,
    [idEmpresa, idConvocatoria, idRep, idCoord, idDom, idDom],
  );
  const idSolicitud = sol.insertId;
  await conn.query('UPDATE dual_solicitudes_empresa SET id_estado_validacion = ? WHERE id_solicitud_empresa = ?', [await validado(conn), idSolicitud]);
  await conn.query(
    'INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, 2)',
    [idSolicitud, ESPECIALIDAD],
  );
  await conn.query('INSERT INTO dual_solicitud_empresa_transportes (id_solicitud_empresa, id_transporte) VALUES (?, 3)', [idSolicitud]);
  await conn.query('INSERT INTO dual_empresa_tutores (id_empresa, id_contacto, activo) VALUES (?, ?, 1)', [idEmpresa, idCoord]);

  if (conCuenta) {
    const pw = password();
    await conn.query(
      `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, id_contacto, activo, must_change_password)
       VALUES (?, NULL, ?, ?, ?, 1, 0)`,
      [`Coordinador Prueba ${letra}`, await bcrypt.hash(pw, 10), await rolId(conn, 'EMPRESA'), idCoord],
    );
    secrets.EMPRESA = { usuario: cifValue, password: pw, empresa: nombre };
  }
  return { cif: cifValue, created: true };
}

async function ensureAlumno(conn, idConvocatoria, secrets) {
  const dniValue = dni('99990003');
  const existing = await one(conn, 'SELECT idalumno FROM gf_alumnosfct WHERE dni = ?', [dniValue]);
  if (existing) return { dni: dniValue, created: false };
  const esp = await one(conn, 'SELECT codigo FROM dual_especialidades WHERE id_especialidad = ?', [ESPECIALIDAD]);
  const [a] = await conn.query(
    `INSERT INTO gf_alumnosfct (nombre, dni, domicilio, cp, localidad, telalumno, email, especialidad, id_especialidad_dual, observaciones)
     VALUES ('ALUMNO PRUEBA (FASE 3)', ?, 'Calle Prueba 2', '50001', 'Zaragoza', '600000003', 'alumno.prueba@fpdual.test', ?, ?, 'Datos de prueba (Phase 3).')`,
    [dniValue, esp?.codigo || '', ESPECIALIDAD],
  );
  const idAlumno = a.insertId;
  const [s] = await conn.query(
    'INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad, id_estado_validacion) VALUES (?, ?, ?, 1)',
    [idAlumno, idConvocatoria, ESPECIALIDAD],
  );
  await conn.query('UPDATE dual_solicitudes_alumno SET id_estado_validacion = ? WHERE id_solicitud_alumno = ?', [await validado(conn), s.insertId]);
  const pw = password();
  await conn.query(
    `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, id_alumno, activo, must_change_password)
     VALUES ('ALUMNO PRUEBA (FASE 3)', NULL, ?, ?, ?, 1, 0)`,
    [await bcrypt.hash(pw, 10), await rolId(conn, 'ALUMNO'), idAlumno],
  );
  secrets.ALUMNO = { usuario: dniValue, password: pw };
  return { dni: dniValue, created: true };
}

async function main() {
  const argv = process.argv.slice(2);
  assertNotProduction(argv);
  if (!argv.includes('--yes')) {
    console.error('Añade --yes para crear los datos de prueba en la base de desarrollo.');
    process.exit(1);
  }
  const { database, host } = target();
  console.log(`Base de datos: ${database} @ ${host}`);
  const conn = await connect();
  const secrets = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  try {
    const conv = await one(conn, 'SELECT id_convocatoria, nombre FROM dual_convocatorias WHERE activa = 1');
    if (!conv) throw new Error('No hay convocatoria activa.');
    await conn.beginTransaction();
    const report = {
      ADMINISTRADOR: await ensureStaff(conn, 'ADMINISTRADOR', 'prueba.admin@fpdual.test', 'PRUEBA Administración', secrets),
      COORDINADOR: await ensureStaff(conn, 'COORDINADOR', 'prueba.coord@fpdual.test', 'PRUEBA Coordinación', secrets),
      EMPRESA_A: await ensureEmpresa(conn, { letra: 'A', cifDigits: '9990001', conCuenta: true, idConvocatoria: conv.id_convocatoria }, secrets),
      EMPRESA_B: await ensureEmpresa(conn, { letra: 'B', cifDigits: '9990002', conCuenta: false, idConvocatoria: conv.id_convocatoria }, secrets),
      ALUMNO: await ensureAlumno(conn, conv.id_convocatoria, secrets),
    };
    await conn.commit();
    fs.writeFileSync(OUT, JSON.stringify(secrets, null, 2));
    for (const [k, v] of Object.entries(report)) console.log(`${k.padEnd(14)} ${v.created ? 'creado' : 'ya existía'}`);
    console.log(`Convocatoria: ${conv.nombre}. Credenciales en ${path.relative(process.cwd(), OUT)} (no se versiona).`);
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Error:', err.code || '', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
