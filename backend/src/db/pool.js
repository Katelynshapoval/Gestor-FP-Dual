require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DBHOST,
  user: process.env.DBUSER,
  password: process.env.DBPASS,
  database: process.env.DBNAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // V-3: DATE columns come back as 'YYYY-MM-DD' strings instead of a JS Date at
  // local midnight, which JSON turned into the previous day in UTC.
  dateStrings: ['DATE'],
});

module.exports = pool;
