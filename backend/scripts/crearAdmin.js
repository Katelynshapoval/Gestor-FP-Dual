#!/usr/bin/env node
// Creates a staff account (the first administrator of a new installation, or
// one more later) with a temporary password that must be changed at the first
// login. Works on any database, production included: it only adds one account.
//
//   node scripts/crearAdmin.js --email ana@centro.es --nombre "Ana Ruiz" --yes
//   node scripts/crearAdmin.js --email ... --nombre ... --rol COORDINADOR --yes
//   node scripts/crearAdmin.js --email ana@centro.es --restablecer --yes
//        (an existing account: new temporary password, and reactivated)
//
// npm run db:admin -- --email ... (development), ./deploy/fpdual.sh admin (server).
// The temporary password is shown ONCE on the terminal and stored nowhere.
// The creation is audited (dual_eventos, entidad USUARIO) like one made in
// the application, with no user as author.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { connect, target } = require('./lib/connect');

const ROLES = ['ADMINISTRADOR', 'COORDINADOR'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function args(argv) {
  const out = { yes: argv.includes('--yes'), restablecer: argv.includes('--restablecer') };
  for (const k of ['email', 'nombre', 'rol']) {
    const i = argv.indexOf(`--${k}`);
    if (i > -1) out[k] = argv[i + 1];
  }
  return out;
}

function uso(msg) {
  if (msg) console.error(msg);
  console.error('Uso: crearAdmin.js --email <correo> --nombre "<nombre>" [--rol ADMINISTRADOR|COORDINADOR] --yes');
  console.error('     crearAdmin.js --email <correo> --restablecer --yes');
  process.exit(1);
}

async function main() {
  const a = args(process.argv.slice(2));
  const email = String(a.email || '').trim().toLowerCase();
  const rol = String(a.rol || 'ADMINISTRADOR').toUpperCase();
  if (!EMAIL_RE.test(email)) uso('Falta un --email válido.');
  if (!ROLES.includes(rol)) uso(`--rol tiene que ser ${ROLES.join(' o ')}.`);
  if (!a.restablecer && !String(a.nombre || '').trim()) uso('Falta --nombre.');
  if (!a.yes) uso('Añade --yes para confirmar.');

  const { database, host } = target();
  console.log(`Base de datos: ${database} @ ${host}`);
  const conn = await connect();
  const password = crypto.randomBytes(9).toString('base64url');
  try {
    await conn.beginTransaction();
    const [[existe]] = await conn.query(
      `SELECT u.id_usuario, r.nombre AS rol FROM dual_usuarios u JOIN dual_roles r ON r.id_rol = u.id_rol
        WHERE LOWER(u.email) = ? FOR UPDATE`,
      [email],
    );
    let id;
    let accion;
    if (existe) {
      if (!a.restablecer) throw new Error(`Ya existe una cuenta con ${email}. Usa --restablecer para darle una contraseña temporal nueva.`);
      if (!ROLES.includes(existe.rol)) throw new Error(`${email} es una cuenta de ${existe.rol}: este script solo gestiona personal del centro.`);
      await conn.query(
        'UPDATE dual_usuarios SET password_hash = ?, must_change_password = 1, activo = 1 WHERE id_usuario = ?',
        [await bcrypt.hash(password, 10), existe.id_usuario],
      );
      id = existe.id_usuario;
      accion = 'RESTABLECER_PASSWORD';
    } else {
      if (a.restablecer) throw new Error(`No hay ninguna cuenta con ${email}.`);
      const [r] = await conn.query(
        `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, activo, must_change_password)
         VALUES (?, ?, ?, (SELECT id_rol FROM dual_roles WHERE nombre = ?), 1, 1)`,
        [String(a.nombre).trim(), email, await bcrypt.hash(password, 10), rol],
      );
      id = r.insertId;
      accion = 'ALTA';
    }
    await conn.query(
      `INSERT INTO dual_eventos (entidad, id_entidad, accion, estado_nuevo, detalle)
       VALUES ('USUARIO', ?, ?, ?, ?)`,
      [id, accion, existe ? existe.rol : rol, JSON.stringify({ activo: 1, origen: 'scripts/crearAdmin.js' })],
    );
    await conn.commit();
    console.log('');
    console.log(existe ? `Contraseña restablecida para ${email}.` : `Cuenta de ${rol} creada.`);
    console.log(`  Usuario:              ${email}`);
    console.log(`  Contraseña temporal:  ${password}`);
    console.log('Apúntala ahora: no se guarda en ningún sitio. Al entrar la primera vez pedirá cambiarla.');
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Error (no se ha cambiado nada):', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
