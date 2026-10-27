// Schema-only dump (no table data) built from SHOW CREATE, normalised so two
// databases can be compared: DEFINER clauses and AUTO_INCREMENT counters are
// removed. Read-only: runs inside a READ ONLY transaction.
const OBJECT_KINDS = ['TABLE', 'FUNCTION', 'VIEW', 'PROCEDURE', 'TRIGGER'];

function normalise(sql) {
  return String(sql)
    .replace(/\r\n/g, '\n')
    .replace(/ DEFINER=`[^`]*`@`[^`]*`/g, '')
    .replace(/ AUTO_INCREMENT=\d+/g, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

async function dumpSchema(conn, schema, { exclude = [] } = {}) {
  await conn.query('SET SESSION TRANSACTION READ ONLY');
  await conn.query('START TRANSACTION READ ONLY');
  const objects = [];
  try {
    const [tables] = await conn.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [schema],
    );
    for (const t of tables) {
      if (exclude.includes(t.name)) continue;
      if (t.type === 'VIEW') {
        const [[r]] = await conn.query(`SHOW CREATE VIEW \`${schema}\`.\`${t.name}\``);
        objects.push({ kind: 'VIEW', name: t.name, sql: normalise(r['Create View']) });
      } else {
        const [[r]] = await conn.query(`SHOW CREATE TABLE \`${schema}\`.\`${t.name}\``);
        objects.push({ kind: 'TABLE', name: t.name, sql: normalise(r['Create Table']) });
      }
    }
    const [routines] = await conn.query(
      `SELECT ROUTINE_TYPE AS type, ROUTINE_NAME AS name FROM information_schema.ROUTINES
        WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_NAME`,
      [schema],
    );
    for (const r of routines) {
      const [[x]] = await conn.query(`SHOW CREATE ${r.type} \`${schema}\`.\`${r.name}\``);
      objects.push({ kind: r.type, name: r.name, sql: normalise(x['Create Procedure'] || x['Create Function']) });
    }
    const [triggers] = await conn.query(
      `SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = ? ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`,
      [schema],
    );
    for (const t of triggers) {
      const [[x]] = await conn.query(`SHOW CREATE TRIGGER \`${schema}\`.\`${t.name}\``);
      objects.push({ kind: 'TRIGGER', name: t.name, sql: normalise(x['SQL Original Statement']) });
    }
  } finally {
    await conn.query('ROLLBACK');
  }
  return objects.sort((a, b) =>
    OBJECT_KINDS.indexOf(a.kind) - OBJECT_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
}

// Returns [{ kind, name, change: 'missing'|'extra'|'different' }]
function diffSchemas(expected, actual) {
  const key = (o) => `${o.kind} ${o.name}`;
  const a = new Map(expected.map((o) => [key(o), o]));
  const b = new Map(actual.map((o) => [key(o), o]));
  const out = [];
  for (const [k, o] of a) {
    if (!b.has(k)) out.push({ kind: o.kind, name: o.name, change: 'missing' });
    else if (b.get(k).sql !== o.sql) out.push({ kind: o.kind, name: o.name, change: 'different' });
  }
  for (const [k, o] of b) if (!a.has(k)) out.push({ kind: o.kind, name: o.name, change: 'extra' });
  return out;
}

module.exports = { dumpSchema, diffSchemas, normalise };
