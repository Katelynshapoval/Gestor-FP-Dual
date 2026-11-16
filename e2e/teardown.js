// Drops the end-to-end database after the run (KEEP_E2E_DB=1 keeps it to inspect).
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

module.exports = async () => {
  if (process.env.KEEP_E2E_DB === '1') return;
  spawnSync(process.execPath, [path.join(__dirname, 'prepararDb.js'), '--drop'], { stdio: 'inherit', env: process.env });
  fs.rmSync(path.join(__dirname, '.e2e.local.json'), { force: true });
};
