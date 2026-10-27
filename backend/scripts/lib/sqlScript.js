// Splits a MySQL script into single statements, honouring the client-side
// DELIMITER command used by the migration files (mysql2 cannot run it).
// Comments are kept inside statements; empty statements are dropped.
function splitSqlScript(text) {
  const statements = [];
  let delimiter = ';';
  let buffer = [];

  const flush = () => {
    const sql = buffer.join('\n').trim();
    buffer = [];
    const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('').trim();
    if (code) statements.push(sql);
  };

  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const directive = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (directive) {
      flush();
      delimiter = directive[1];
      continue;
    }
    const trimmed = line.trimEnd();
    if (trimmed.endsWith(delimiter) && !/^\s*--/.test(trimmed)) {
      buffer.push(trimmed.slice(0, trimmed.length - delimiter.length));
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return statements;
}

module.exports = { splitSqlScript };
