// Connection for the DB scripts. Reads backend/.env like the app does.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

function target(database) {
  return {
    host: process.env.DBHOST,
    user: process.env.DBUSER,
    database: database === undefined ? process.env.DBNAME : database,
  };
}

async function connect(database) {
  return mysql.createConnection({
    ...target(database),
    password: process.env.DBPASS,
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

module.exports = { connect, target, assertNotProduction };
