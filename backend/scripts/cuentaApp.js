#!/usr/bin/env node
// Creates or updates the MySQL account the backend runs with (DBUSER / DBPASS)
// and gives it only what the application uses:
//   SELECT, INSERT, UPDATE and EXECUTE on the database, and DELETE only on the
//   tables the backend deletes from (BORRADO below).
// No CREATE, ALTER, DROP, TRIGGER or GRANT: a bug or an injection in the API
// cannot change the schema, drop the audit triggers or read other databases.
// Migrations, backups and the demo seed run with a separate owner account
// (DBADMIN_USER / DBADMIN_PASS, read by scripts/lib/connect.js).
//
//   node scripts/cuentaApp.js --yes [--host <host>] [--pruebas]
//
// Connects with DBADMIN_USER / DBADMIN_PASS, which must be able to create
// accounts and grant (root). --host is where the backend connects from:
// localhost on a development computer, % in Docker (the default there).
// --pruebas also lets the account use <DBNAME>_verify and <DBNAME>_e2e_verify
// (the DB tests and end-to-end tests run the backend on them) with DELETE on
// the whole database, because they are rebuilt before their tables exist.
// Run it again after a migration that adds a table the backend deletes from.
const { connect, target, assertNotProduction } = require('./lib/connect');

// Every `DELETE FROM` in backend/src. A new one needs its table here.
const BORRADO = ['dual_correo_adjuntos', 'dual_firma_sesiones', 'dual_solicitud_empresa_transportes'];
const PERMISOS = 'SELECT, INSERT, UPDATE, EXECUTE';

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Uso: cuentaApp.js --yes [--host <host>] [--pruebas]   (crea o actualiza la cuenta DBUSER de la aplicación)');
    process.exit(1);
  }
  assertNotProduction(process.argv);
  const usuario = process.env.DBUSER;
  const clave = process.env.DBPASS;
  const base = process.env.DBNAME;
  const host = arg('--host') || process.env.DBAPP_HOST || 'localhost';
  const { user: admin } = target();
  if (!usuario || !clave || !base) {
    console.error('Faltan DBUSER, DBPASS o DBNAME.');
    process.exit(1);
  }
  if (usuario === 'root' || usuario === admin) {
    console.error(`DBUSER (${usuario}) es la cuenta de administración: la aplicación necesita una cuenta propia.`);
    process.exit(1);
  }
  if (clave.length < 16) {
    console.error('DBPASS debe tener al menos 16 caracteres.');
    process.exit(1);
  }

  const conn = await connect(null);
  try {
    console.log(`Cuenta ${usuario}@${host} en ${base} (como ${admin})`);
    await conn.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [usuario, host, clave]);
    await conn.query('ALTER USER ?@? IDENTIFIED BY ?', [usuario, host, clave]);
    // Start from nothing, so a permission removed here is removed there too.
    await conn.query('REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@?', [usuario, host]);
    await conn.query(`GRANT ${PERMISOS} ON ??.* TO ?@?`, [base, usuario, host]);
    for (const tabla of BORRADO) {
      await conn.query('GRANT DELETE ON ??.?? TO ?@?', [base, tabla, usuario, host]);
    }
    if (process.argv.includes('--pruebas')) {
      for (const prueba of [`${base}_verify`, `${base}_e2e_verify`]) {
        await conn.query(`GRANT ${PERMISOS}, DELETE ON ??.* TO ?@?`, [prueba, usuario, host]);
      }
    }
    const [permisos] = await conn.query('SHOW GRANTS FOR ?@?', [usuario, host]);
    for (const fila of permisos) console.log(`  ${Object.values(fila)[0]}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.sqlMessage || err.message);
  process.exit(1);
});
