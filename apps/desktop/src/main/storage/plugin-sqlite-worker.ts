/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Plugin Sqlite Worker
 */

/** A self-contained worker keeps plugin SQL off the Electron event loop and can be terminated. */
export const pluginSqliteWorker = String.raw`
process.once('message', (workerData) => {
const { DatabaseSync, constants: c } = require('node:sqlite');
let db;
try {
  const { path, request } = workerData;
  const options = { allowExtension: false, defensive: true, timeout: 250 };
  if (request.operation === 'query') {
    // Recover a hot rollback journal using only host SQL before opening a read-only query connection.
    require('node:fs').accessSync(path);
    const recovery = new DatabaseSync(path, options);
    try { recovery.prepare('SELECT count(*) FROM sqlite_schema').get(); } finally { recovery.close(); }
  }
  db = new DatabaseSync(path, { ...options, readOnly: request.operation === 'query' });
  // TEMP data stays in memory. Bound persistent growth and disallow schema-defined unsafe functions.
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA max_page_count=8192; PRAGMA hard_heap_limit=33554432;');
  if (request.operation === 'open') db.exec('PRAGMA user_version=0');
  const denied = new Set([c.SQLITE_ATTACH, c.SQLITE_DETACH, c.SQLITE_PRAGMA,
    c.SQLITE_TRANSACTION, c.SQLITE_SAVEPOINT, c.SQLITE_CREATE_VTABLE, c.SQLITE_DROP_VTABLE]);
  const readActions = new Set([c.SQLITE_SELECT, c.SQLITE_READ, c.SQLITE_FUNCTION, c.SQLITE_RECURSIVE]);
  const authorize = () => db.setAuthorizer((action, arg1, arg2) => {
    if (denied.has(action) || (action === c.SQLITE_FUNCTION && ['load_extension', 'readfile', 'writefile'].includes(String(arg2).toLowerCase()))) return c.SQLITE_DENY;
    if (request.operation === 'query' && !readActions.has(action)) return c.SQLITE_DENY;
    return c.SQLITE_OK;
  });
  const prepare = ({ sql }) => {
    const statement = db.prepare(sql);
    // prepare() accepts a prefix; reject silently ignored trailing statements.
    if (statement.sourceSQL.trim() !== sql.trim()) throw new Error('one statement required');
    statement.setReadBigInts(true);
    return statement;
  };
  let output;
  if (request.operation === 'query') {
    authorize();
    output = [];
    let bytes = 0;
    for (const row of prepare(request.statement).iterate(...request.statement.parameters)) {
      bytes += Buffer.byteLength(JSON.stringify(row, (_, value) => typeof value === 'bigint' ? value.toString() : value));
      if (output.length >= 1000 || bytes > 4 * 1024 * 1024) throw new Error('query result limit');
      for (const key of Object.keys(row)) if (typeof row[key] === 'bigint' && row[key] >= BigInt(Number.MIN_SAFE_INTEGER) && row[key] <= BigInt(Number.MAX_SAFE_INTEGER)) row[key] = Number(row[key]);
      output.push(row);
    }
  } else if (request.operation !== 'open') {
    db.exec('BEGIN IMMEDIATE');
    try {
      authorize();
      const statements = request.operation === 'transaction' ? request.statements : [request.statement];
      output = statements.map(input => prepare(input).run(...input.parameters));
      db.setAuthorizer(null);
      db.exec('COMMIT');
      if (request.operation === 'execute') output = output[0];
    } catch {
      db.setAuthorizer(null);
      db.exec('ROLLBACK');
      throw new Error('statement rejected');
    }
  }
  db.close(); db = undefined;
  process.send({ ok: true, value: output });
} catch {
  // SQLite errors can embed SQL literals, schema content and host paths.
  process.send({ ok: false });
} finally { if (db) db.close(); process.disconnect(); }
});
`;
