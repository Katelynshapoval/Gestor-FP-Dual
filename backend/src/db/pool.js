require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');

// SEC-010: TLS to MySQL when the database is not on the same host.
// DBSSL=true verifies the server certificate; DBSSL_CA points to its CA file.
function sslOptions() {
  if (process.env.DBSSL !== 'true') return undefined;
  return {
    rejectUnauthorized: true,
    ...(process.env.DBSSL_CA ? { ca: fs.readFileSync(process.env.DBSSL_CA) } : {}),
  };
}

const pool = mysql.createPool({
  host: process.env.DBHOST,
  user: process.env.DBUSER,
  password: process.env.DBPASS,
  database: process.env.DBNAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  ssl: sslOptions(),
  // V-3: DATE columns come back as 'YYYY-MM-DD' strings instead of a JS Date at
  // local midnight, which JSON turned into the previous day in UTC.
  dateStrings: ['DATE'],
});

module.exports = pool;
