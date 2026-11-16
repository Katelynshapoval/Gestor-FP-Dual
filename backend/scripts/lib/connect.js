// Connection for the DB scripts. Reads backend/.env like the app does.
//
// Scripts (migrations, backups, the demo seed, verification databases) need
// the schema owner: DBADMIN_USER / DBADMIN_PASS. The backend itself runs with
// DBUSER / DBPASS, an account without schema rights (scripts/cuentaApp.js).
// Without DBADMIN_USER the scripts use DBUSER, as on a computer with a single
// account.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

const admin = () => (process.env.DBADMIN_USER
  ? { user: process.env.DBADMIN_USER, password: process.env.DBADMIN_PASS }
  : { user: process.env.DBUSER, password: process.env.DBPASS });

function target(database) {
  return {
    host: process.env.DBHOST,
    user: admin().user,
    database: database === undefined ? process.env.DBNAME : database,
  };
}

async function connect(database) {
  return mysql.createConnection({
    ...target(database),
    password: admin().password,
    charset: 'utf8mb4',
    dateStrings: true,
  });
}

// Scripts that write refuse to run in production unless explicitly allowed.
function assertNotProduction(argv) {
  if (process.env.NODE_ENV === 'production' && !argv.includes('--allow-production')) {
    console.error('NODE_ENV=production: este script no se ejecuta en producción sin --allow-production.');
    process.exit(1);
  }
}

// Password of target().user, for the mysql / mysqldump command-line tools.
const adminPassword = () => admin().password || '';

module.exports = { connect, target, adminPassword, assertNotProduction };
