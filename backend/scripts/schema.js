#!/usr/bin/env node
// Schema tools (read-only against the database).
//   node scripts/schema.js baseline            writes db/000_baseline.sql from DBNAME
//   node scripts/schema.js dump <file>          normalised schema dump of DBNAME
//   node scripts/schema.js diff <otherSchema>   compares DBNAME with another schema on the same server
// Only lookup tables are exported as data (ids the procedures and code rely on).
// No student, company, user or document rows are ever written.
const fs = require('fs');
const path = require('path');
const { connect, target } = require('./lib/connect');
const { dumpSchema, diffSchemas } = require('./lib/schemaDump');

const EXCLUDE = ['schema_migrations'];
const LOOKUP_TABLES = [
  'dual_roles',
  'dual_estados_validacion',
  'dual_estados_reserva',
  'dual_tipos_documento',
  'dual_tipos_contrato',
  'dual_transportes',
];

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function render(objects, seeds, sourceDb) {
  const out = [];
  out.push(
    '-- 000_baseline.sql',
    `-- Schema baseline generated from \`${sourceDb}\` by backend/scripts/schema.js.`,
    '-- Equals the result of the retired scripts in db/legacy_migrations (002–011 as',
    '-- actually applied). Structure plus lookup rows only: no personal data.',
    '-- Applied automatically by `npm run db:migrate -- up` on an empty database.',
    '-- Do not edit by hand: later changes go in db/migrations/NNN_*.sql.',
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  );
  for (const o of objects) {
    out.push(`-- ${o.kind} ${o.name}`);
    if (o.kind === 'TABLE' || o.kind === 'VIEW') {
      out.push(`${o.sql};`, '');
    } else {
      out.push('DELIMITER $$', `${o.sql}$$`, 'DELIMITER ;', '');
    }
  }
  out.push('-- Lookup rows (fixed ids)');
  for (const { table, rows } of seeds) {
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const values = rows.map((r) => `(${cols.map((c) => sqlValue(r[c])).join(', ')})`).join(',\n  ');
    out.push(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES\n  ${values};`);
  }
  out.push('', 'SET FOREIGN_KEY_CHECKS = 1;', '');
  return out.join('\n');
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const db = target().database;
  const conn = await connect();
  try {
    if (cmd === 'baseline') {
      const objects = await dumpSchema(conn, db, { exclude: EXCLUDE });
      const seeds = [];
      for (const table of LOOKUP_TABLES) {
        const [rows] = await conn.query(`SELECT * FROM \`${table}\` ORDER BY 1`);
        seeds.push({ table, rows });
      }
      const file = path.join(__dirname, '..', '..', 'db', '000_baseline.sql');
      fs.writeFileSync(file, render(objects, seeds, db));
      console.log(`Escrito ${file}: ${objects.length} objetos.`);
    } else if (cmd === 'dump' && arg) {
      const objects = await dumpSchema(conn, db, { exclude: EXCLUDE });
      fs.writeFileSync(arg, objects.map((o) => `-- ${o.kind} ${o.name}\n${o.sql}\n`).join('\n'));
      console.log(`Escrito ${arg}: ${objects.length} objetos.`);
    } else if (cmd === 'diff' && arg) {
      const a = await dumpSchema(conn, db, { exclude: EXCLUDE });
      const b = await dumpSchema(conn, arg, { exclude: EXCLUDE });
      const diff = diffSchemas(a, b);
      if (!diff.length) console.log(`Sin diferencias entre ${db} y ${arg}.`);
      for (const d of diff) console.log(`${d.change.padEnd(9)} ${d.kind} ${d.name}`);
      process.exitCode = diff.length ? 2 : 0;
    } else {
      console.log('Uso: node scripts/schema.js baseline | dump <file> | diff <otherSchema>');
      process.exitCode = 1;
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.code || '', err.message);
  process.exit(1);
});
