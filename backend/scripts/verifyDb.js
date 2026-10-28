#!/usr/bin/env node
// Isolated verification database (decision D8): <DBNAME>_verify on the same
// server, built ONLY from the repository (000_baseline + db/migrations) and
// filled with synthetic data by the DB tests. It never reads or copies rows
// from DBNAME.
//
//   node scripts/verifyDb.js create [--to NNN]   drop, recreate and migrate it
//   node scripts/verifyDb.js migrate --to NNN    apply pending migrations up to NNN
//   node scripts/verifyDb.js rollback NNN        run db/rollback/NNN_*.down.sql and
//                                                delete its schema_migrations row
//   node scripts/verifyDb.js drop
//
// Every command prints the target and refuses any name that does not end in _verify.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { connect, target } = require('./lib/connect');
const { splitSqlScript } = require('./lib/sqlScript');

const VERIFY = `${target().database}_verify`;
const DB_DIR = path.join(__dirname, '..', '..', 'db');

function assertVerifyName(name) {
  if (!/_verify$/.test(name)) throw new Error(`Nombre no permitido: ${name}`);
}

function migrate(to) {
  const args = [path.join(__dirname, 'migrate.js'), 'up', '--yes'];
  if (to) args.push('--to', to);
  const r = spawnSync(process.execPath, args, { env: { ...process.env, DBNAME: VERIFY }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('La migración falló en la base de verificación.');
}

async function rollback(version) {
  const file = fs.readdirSync(path.join(DB_DIR, 'rollback')).find((f) => f.startsWith(`${version}_`));
  if (!file) throw new Error(`No hay rollback para ${version}.`);
  const conn = await connect(VERIFY);
  try {
    for (const sql of splitSqlScript(fs.readFileSync(path.join(DB_DIR, 'rollback', file), 'utf8'))) {
      await conn.query(sql);
    }
    await conn.query('DELETE FROM schema_migrations WHERE version = ?', [version]);
    console.log(`✓ rollback ${file} aplicado en ${VERIFY}`);
  } finally {
    await conn.end();
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const toIdx = process.argv.indexOf('--to');
  const to = toIdx > -1 ? process.argv[toIdx + 1] : null;
  assertVerifyName(VERIFY);
  console.log(`Base de verificación: ${VERIFY} @ ${target().host}`);

  if (cmd === 'create' || cmd === 'drop') {
    const conn = await connect(null);
    try {
      await conn.query(`DROP DATABASE IF EXISTS \`${VERIFY}\``);
      if (cmd === 'create') {
        await conn.query(`CREATE DATABASE \`${VERIFY}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
      }
    } finally {
      await conn.end();
    }
    if (cmd === 'create') migrate(to);
    console.log(cmd === 'create' ? '✓ creada' : '✓ eliminada');
  } else if (cmd === 'migrate') {
    migrate(to);
  } else if (cmd === 'rollback' && arg) {
    await rollback(arg);
  } else {
    console.log('Uso: create [--to NNN] | migrate --to NNN | rollback NNN | drop');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
