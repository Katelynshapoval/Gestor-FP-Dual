#!/usr/bin/env node
// Builds the end-to-end database: <E2E_DB>_verify (default proyecto_dual_e2e_verify),
// created from the repository only (000_baseline + db/migrations) by
// backend/scripts/verifyDb.js, which refuses any name that does not end in
// _verify. It never reads or writes the development database.
//
// Seeds SYNTHETIC data only: an active convocatoria, one ciclo, an administrator,
// a coordinator and a validated company with places in that ciclo (and its portal account).
// Random passwords go to e2e/.e2e.local.json (git-ignored), read by the tests.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const BACKEND = path.join(__dirname, '..', 'backend');
const E2E_DB = process.env.E2E_DB || 'proyecto_dual_e2e';
const DB = `${E2E_DB}_verify`;
const requireBackend = (m) => require(require.resolve(m, { paths: [BACKEND] }));

// Same check digit as the backend (helpers/dbHelpers.cifValido).
function cif(letra, digits) {
  let par = 0;
  let impar = 0;
  for (let i = 0; i < 7; i += 1) {
    const n = Number(digits[i]);
    if (i % 2 === 0) { const d = n * 2; impar += d > 9 ? d - 9 : d; } else par += n;
  }
  return `${letra}${digits}${(10 - ((par + impar) % 10)) % 10}`;
}

function verifyDb(...args) {
  const r = spawnSync(process.execPath, [path.join(BACKEND, 'scripts', 'verifyDb.js'), ...args], {
    env: { ...process.env, DBNAME: E2E_DB }, stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`verifyDb ${args.join(' ')} falló`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('No en producción.');
  if (process.argv.includes('--drop')) {
    verifyDb('drop');
    return;
  }
  verifyDb('create');

  const { connect } = require(path.join(BACKEND, 'scripts', 'lib', 'connect'));
  const bcrypt = requireBackend('bcrypt');
  const conn = await connect(DB);
  const clave = () => crypto.randomBytes(12).toString('base64url');
  const datos = {
    admin: { email: 'admin.e2e@example.test', password: clave() },
    coordinador: { email: 'coord.e2e@example.test', password: clave() },
    empresa: { cif: cif('B', '7654321'), password: clave() },
  };
  try {
    const hoy = new Date();
    const y = hoy.getFullYear();
    await conn.query(
      "INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES (?, ?, ?, 1)",
      [`${y}/${y + 1} E2E`, `${y - 1}-01-01`, `${y + 1}-12-31`]);
    const conv = (await conn.query('SELECT id_convocatoria FROM dual_convocatorias WHERE activa = 1'))[0][0].id_convocatoria;
    const [esp] = await conn.query("INSERT INTO dual_especialidades (codigo, nombre, turno) VALUES ('E2E_DAW', 'Desarrollo de aplicaciones web', 0)");
    datos.ciclo = 'Desarrollo de aplicaciones web';

    await conn.query(
      `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, activo, must_change_password)
       VALUES ('Coordinación E2E', ?, ?, (SELECT id_rol FROM dual_roles WHERE nombre = 'COORDINADOR'), 1, 0)`,
      [datos.coordinador.email, await bcrypt.hash(datos.coordinador.password, 10)]);
    await conn.query(
      `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, activo, must_change_password)
       VALUES ('Administración E2E', ?, ?, (SELECT id_rol FROM dual_roles WHERE nombre = 'ADMINISTRADOR'), 1, 0)`,
      [datos.admin.email, await bcrypt.hash(datos.admin.password, 10)]);

    const [e] = await conn.query("INSERT INTO ge_empresas (cif, empresa, observaciones) VALUES (?, 'Talleres Ficticios E2E S.L.', '')", [datos.empresa.cif]);
    const [d] = await conn.query(
      "INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, especialidad) VALUES (?, 'Calle Ficticia 1', '50000', 'Zaragoza', 'Zaragoza', '')",
      [e.insertId]);
    const [c] = await conn.query(
      `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones)
       VALUES (?, '00000000T', 'Coordinadora Ficticia', 'empresa.e2e@example.test', '600000000', 'Gerente', '')`, [d.insertId]);
    const [s] = await conn.query(
      `INSERT INTO dual_solicitudes_empresa
         (id_empresa, id_convocatoria, id_representante_legal, id_coordinador_empresa, id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
       VALUES (?, ?, ?, ?, ?, ?, 'Desarrollo web')`, [e.insertId, conv, c.insertId, c.insertId, d.insertId, d.insertId]);
    await conn.query("UPDATE dual_solicitudes_empresa SET id_estado_validacion = fn_id_estado_validacion('VALIDADO') WHERE id_solicitud_empresa = ?", [s.insertId]);
    await conn.query(
      'INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos) VALUES (?, ?, 2)',
      [s.insertId, esp.insertId]);
    await conn.query(
      `INSERT INTO dual_usuarios (nombre_mostrar, password_hash, id_rol, id_contacto, activo, must_change_password)
       VALUES ('Talleres Ficticios E2E', ?, (SELECT id_rol FROM dual_roles WHERE nombre = 'EMPRESA'), ?, 1, 0)`,
      [await bcrypt.hash(datos.empresa.password, 10), c.insertId]);
    datos.empresa.nombre = 'Talleres Ficticios E2E S.L.';
  } finally {
    await conn.end();
  }
  fs.writeFileSync(path.join(__dirname, '.e2e.local.json'), JSON.stringify(datos, null, 2));
  console.log(`✓ ${DB} preparada para las pruebas de extremo a extremo.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
