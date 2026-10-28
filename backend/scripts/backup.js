#!/usr/bin/env node
// Full logical backup of DBNAME with mysqldump (read-only for the database).
//
//   npm run db:backup                     writes backups/<db>_<timestamp>.sql
//   npm run db:backup -- verify <file>    restores <file> into a scratch schema
//                                         <db>_backupcheck, compares it with DBNAME
//                                         (schema dump + CHECKSUM TABLE per table)
//                                         and drops the scratch schema again.
//
// Structure, data (BLOBs as hex), routines, triggers and views; one consistent
// snapshot (--single-transaction). The file contains personal data: backups/ is
// ignored by Git. The password reaches mysqldump through MYSQL_PWD, never argv.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { connect, target } = require('./lib/connect');
const { dumpSchema, diffSchemas } = require('./lib/schemaDump');

const BIN_DIR = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 8.0/bin';
const OUT_DIR = path.join(__dirname, '..', '..', 'backups');

function bin(name) {
  const full = path.join(BIN_DIR, process.platform === 'win32' ? `${name}.exe` : name);
  return fs.existsSync(full) ? full : name;
}

function run(cmd, args, { input, output } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, MYSQL_PWD: process.env.DBPASS || '' } });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    if (output) child.stdout.pipe(output);
    if (input) fs.createReadStream(input).pipe(child.stdin);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} terminó con código ${code}: ${stderr.trim()}`))));
  });
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
}

async function backup() {
  const { host, user, database } = target();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${database}_${stamp()}.sql`);
  const out = fs.createWriteStream(file);
  await run(bin('mysqldump'), [
    `--host=${host}`, `--user=${user}`,
    '--single-transaction', '--routines', '--triggers', '--events', '--hex-blob',
    '--no-tablespaces', '--set-gtid-purged=OFF', '--default-character-set=utf8mb4',
    database,
  ], { output: out });
  await new Promise((r) => out.end(r));
  console.log(`Copia escrita: ${file} (${fs.statSync(file).size} bytes)`);
  return file;
}

async function checksums(conn, schema) {
  const [tables] = await conn.query(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY 1",
    [schema],
  );
  const out = {};
  for (const { t } of tables) {
    const [[c]] = await conn.query(`CHECKSUM TABLE \`${schema}\`.\`${t}\` EXTENDED`);
    const [[n]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${schema}\`.\`${t}\``);
    out[t] = `${n.n}:${c.Checksum}`;
  }
  return out;
}

async function verify(file) {
  const { host, user, database } = target();
  const scratch = `${database}_backupcheck`;
  const conn = await connect(null);
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await conn.query(`CREATE DATABASE \`${scratch}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    // --comments: the client strips "--" comments from routine bodies otherwise.
    await run(bin('mysql'), [`--host=${host}`, `--user=${user}`, '--default-character-set=utf8mb4', '--comments', scratch], { input: file });

    // dumpSchema leaves its connection read-only, so it gets its own one.
    const reader = await connect(null);
    let diff;
    try {
      diff = diffSchemas(await dumpSchema(reader, database), await dumpSchema(reader, scratch));
    } finally {
      await reader.end();
    }
    const a = await checksums(conn, database);
    const b = await checksums(conn, scratch);
    const dataDiff = Object.keys({ ...a, ...b }).filter((t) => a[t] !== b[t]);
    for (const d of diff) console.log(`esquema ${d.change} ${d.kind} ${d.name}`);
    for (const t of dataDiff) console.log(`datos   ${t}: ${a[t]} ≠ ${b[t]}`);
    console.log(`${Object.keys(a).length} tablas comparadas.`);
    if (diff.length || dataDiff.length) {
      process.exitCode = 2;
      console.log('✗ La copia NO coincide con la base de datos.');
    } else {
      console.log('✓ La copia restaurada coincide con la base de datos (esquema, filas y checksums).');
    }
  } finally {
    await conn.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await conn.end();
  }
}

const [cmd, arg] = process.argv.slice(2);
(cmd === 'verify' ? verify(arg) : backup()).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
