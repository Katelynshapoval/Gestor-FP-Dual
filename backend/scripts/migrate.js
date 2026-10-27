#!/usr/bin/env node
// Migration runner (no dependency besides mysql2/dotenv).
//
//   npm run db:migrate -- status
//       Lists applied and pending migrations. Read-only.
//   npm run db:migrate -- mark-baseline --yes
//       For an EXISTING database built with the retired scripts: creates
//       schema_migrations and records 000_baseline as applied without running it.
//   npm run db:migrate -- up --yes [--to 013]
//       Empty database: runs db/000_baseline.sql first. Then every pending
//       db/migrations/NNN_*.sql in order, each recorded with its checksum.
//
// MySQL commits DDL implicitly, so a failing file can be partly applied: the
// runner stops, records nothing for that file and prints the statement that
// failed. Use the matching db/rollback/NNN_*.down.sql before retrying.
// Writing commands require --yes and refuse NODE_ENV=production unless
// --allow-production is also given.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connect, target, assertNotProduction } = require('./lib/connect');
const { splitSqlScript } = require('./lib/sqlScript');

const DB_DIR = path.join(__dirname, '..', '..', 'db');
const BASELINE = { version: '000', name: '000_baseline', file: path.join(DB_DIR, '000_baseline.sql') };

function checksum(text) {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function listMigrations() {
  const dir = path.join(DB_DIR, 'migrations');
  return fs.readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: f.slice(0, 3), name: f.replace(/\.sql$/, ''), file: path.join(dir, f) }));
}

async function ensureTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version     CHAR(3)      NOT NULL,
       name        VARCHAR(120) NOT NULL,
       checksum    CHAR(64)     DEFAULT NULL,
       applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       applied_by  VARCHAR(100) DEFAULT NULL,
       mode        VARCHAR(10)  NOT NULL DEFAULT 'RUN',
       PRIMARY KEY (version)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  );
}

async function applied(conn) {
  const [exists] = await conn.query("SHOW TABLES LIKE 'schema_migrations'");
  if (!exists.length) return null;
  const [rows] = await conn.query('SELECT version, name, checksum, mode, applied_at FROM schema_migrations ORDER BY version');
  return rows;
}

async function tableCount(conn) {
  const [[r]] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'schema_migrations'",
  );
  return Number(r.n);
}

async function runFile(conn, migration, mode = 'RUN') {
  const text = fs.readFileSync(migration.file, 'utf8');
  const statements = splitSqlScript(text);
  console.log(`→ ${migration.name} (${statements.length} sentencias)`);
  for (const [i, sql] of statements.entries()) {
    try {
      await conn.query(sql);
    } catch (err) {
      console.error(`✗ ${migration.name}: falló la sentencia ${i + 1}/${statements.length}: ${err.code || ''} ${err.message}`);
      console.error(sql.split('\n').slice(0, 8).join('\n'));
      throw Object.assign(new Error('MIGRATION_FAILED'), { handled: true });
    }
  }
  const [[who]] = await conn.query('SELECT CURRENT_USER() AS u');
  await conn.query(
    'INSERT INTO schema_migrations (version, name, checksum, applied_by, mode) VALUES (?, ?, ?, ?, ?)',
    [migration.version, migration.name, checksum(text), who.u, mode],
  );
  console.log(`✓ ${migration.name}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const yes = argv.includes('--yes');
  const toIdx = argv.indexOf('--to');
  const to = toIdx > -1 ? argv[toIdx + 1] : null;
  const { host, database } = target();
  console.log(`Base de datos: ${database} @ ${host}`);

  const conn = await connect();
  try {
    const done = await applied(conn);
    const doneSet = new Set((done || []).map((r) => r.version));
    const all = listMigrations();

    if (cmd === 'status') {
      if (!done) console.log('schema_migrations no existe (base anterior al baseline o vacía).');
      for (const r of done || []) console.log(`  aplicada  ${r.name} (${r.mode}, ${r.applied_at})`);
      for (const m of all) {
        if (!doneSet.has(m.version)) console.log(`  pendiente ${m.name}`);
        else {
          const rec = done.find((r) => r.version === m.version);
          if (rec.checksum && rec.checksum !== checksum(fs.readFileSync(m.file, 'utf8'))) {
            console.log(`  ¡AVISO! ${m.name} cambió después de aplicarse.`);
          }
        }
      }
      return;
    }

    if (cmd !== 'mark-baseline' && cmd !== 'up') {
      console.log('Uso: status | mark-baseline --yes | up --yes [--to NNN]');
      process.exitCode = 1;
      return;
    }
    assertNotProduction(argv);
    if (!yes) {
      console.error('Añade --yes para confirmar que quieres escribir en esta base de datos.');
      process.exitCode = 1;
      return;
    }

    if (cmd === 'mark-baseline') {
      if (doneSet.has('000')) return console.log('El baseline ya está registrado.');
      if (await tableCount(conn) === 0) {
        console.error('La base está vacía: usa "up" para crearla desde el baseline.');
        process.exitCode = 1;
        return;
      }
      await ensureTable(conn);
      const [[who]] = await conn.query('SELECT CURRENT_USER() AS u');
      await conn.query(
        "INSERT INTO schema_migrations (version, name, checksum, applied_by, mode) VALUES ('000', ?, ?, ?, 'MARK')",
        [BASELINE.name, checksum(fs.readFileSync(BASELINE.file, 'utf8')), who.u],
      );
      console.log('✓ 000_baseline registrado sin ejecutar (base existente).');
      return;
    }

    // up
    if (!doneSet.has('000')) {
      if (await tableCount(conn) > 0) {
        console.error('La base ya tiene tablas pero no tiene baseline registrado. Ejecuta antes "mark-baseline --yes" tras comprobar que coincide (scripts/schema.js diff).');
        process.exitCode = 1;
        return;
      }
      await ensureTable(conn);
      await runFile(conn, BASELINE);
    }
    let left = 0;
    for (const m of all) {
      if (doneSet.has(m.version)) continue;
      if (to && m.version > to) { left += 1; continue; }
      await runFile(conn, m);
    }
    console.log(left ? `Hecho. Quedan ${left} migración(es) pendientes después de ${to}.` : 'Sin migraciones pendientes.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  if (!err.handled) console.error(err.code || '', err.message);
  process.exit(1);
});
