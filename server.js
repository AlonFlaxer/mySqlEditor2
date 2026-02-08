const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const { Client: PgClient } = require('pg');
const livereload = require('livereload');

const app = express();
const PORT = 3010;
const DATA_DIR = path.join(__dirname, 'data');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.yml');
const PIC_DIR = path.join(__dirname, 'pic');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pic', express.static(PIC_DIR));
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

if (process.env.NODE_ENV === 'development') {
  const lrServer = livereload.createServer();
  lrServer.watch([
    path.join(__dirname, 'public'),
    path.join(__dirname, 'server.js')
  ]);
}

function readConnections() {
  try {
    if (!fs.existsSync(CONNECTIONS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(CONNECTIONS_FILE, 'utf8');
    const data = yaml.load(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch (err) {
    return [];
  }
}

function writeConnections(conns) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const content = yaml.dump(conns, { lineWidth: 120 });
  fs.writeFileSync(CONNECTIONS_FILE, content, 'utf8');
}

function makeId() {
  return 'c_' + Math.random().toString(36).slice(2, 10);
}

app.get('/api/connections', (req, res) => {
  res.json({ connections: readConnections() });
});

app.post('/api/connections', (req, res) => {
  const input = req.body || {};
  const conns = readConnections();

  const conn = {
    id: input.id || makeId(),
    name: String(input.name || '').trim() || 'Untitled',
    type: String(input.type || '').trim() || 'mysql',
    host: String(input.host || '').trim(),
    port: String(input.port || '').trim(),
    database: String(input.database || '').trim(),
    username: String(input.username || '').trim(),
    password: String(input.password || '').trim(),
    file: String(input.file || '').trim()
  };

  const idx = conns.findIndex(c => c.id === conn.id);
  if (idx >= 0) {
    conns[idx] = conn;
  } else {
    conns.push(conn);
  }

  writeConnections(conns);
  res.json({ connection: conn });
});

app.delete('/api/connections/:id', (req, res) => {
  const conns = readConnections();
  const next = conns.filter(c => c.id !== req.params.id);
  writeConnections(next);
  res.json({ ok: true });
});

app.get('/api/schema', (req, res) => {
  const connectionId = String(req.query.connectionId || '');
  const conns = readConnections();
  const conn = conns.find(c => c.id === connectionId);

  if (!conn) {
    return res.json({ schema: [] });
  }

  loadSchema(conn)
    .then(schema => res.json({ schema }))
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.post('/api/execute', (req, res) => {
  const sql = String(req.body.sql || '').trim();
  const connectionId = String(req.body.connectionId || '');
  const conns = readConnections();
  const conn = conns.find(c => c.id === connectionId);

  if (!sql) {
    return res.json({
      columns: ['message'],
      rows: [['No SQL provided']]
    });
  }

  if (!conn) {
    return res.json({
      columns: ['message'],
      rows: [['No connection selected']]
    });
  }

  executeSql(conn, sql)
    .then(result => res.json(result))
    .catch(err => {
      res.status(500).json({ error: err.message, columns: ['error'], rows: [[err.message]] });
    });
});

app.post('/api/paste-image', (req, res) => {
  const dataUrl = String(req.body.dataUrl || '');
  if (!dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image data' });
  }

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image data' });
  }

  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  if (!fs.existsSync(PIC_DIR)) {
    fs.mkdirSync(PIC_DIR, { recursive: true });
  }

  const filename = `img_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  const filepath = path.join(PIC_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  res.json({ path: filepath });
});

app.post('/api/paste-image/cleanup', (req, res) => {
  const cutoffMs = Date.now() - 2 * 60 * 60 * 1000;
  if (!fs.existsSync(PIC_DIR)) {
    return res.json({ deleted: 0 });
  }
  let deleted = 0;
  const entries = fs.readdirSync(PIC_DIR);
  for (const file of entries) {
    const full = path.join(PIC_DIR, file);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile() && stat.mtimeMs < cutoffMs) {
        fs.unlinkSync(full);
        deleted += 1;
      }
    } catch (err) {
      // ignore
    }
  }
  res.json({ deleted });
});

async function loadSchema(conn) {
  if (conn.type === 'sqlite') {
    return loadSqliteSchema(conn);
  }
  if (conn.type === 'postgres') {
    return loadPostgresSchema(conn);
  }
  if (conn.type === 'mysql') {
    return loadMysqlSchema(conn);
  }
  throw new Error(`Unsupported connection type: ${conn.type}`);
}

function mapTypeToShort(type) {
  const t = String(type || '').toLowerCase();
  if (/(int|serial|bigint|smallint|tinyint)/.test(t)) return 'i';
  if (/(char|text|varchar|uuid|json|enum|set)/.test(t)) return 's';
  if (/(bool)/.test(t)) return 'b';
  if (/(date|time|year)/.test(t)) return 'd';
  if (/(decimal|numeric|float|double|real)/.test(t)) return 'n';
  return 'u';
}

async function loadMysqlSchema(conn) {
  const connection = await mysql.createConnection({
    host: conn.host || 'localhost',
    port: conn.port ? Number(conn.port) : 3306,
    user: conn.username || '',
    password: conn.password || '',
    database: conn.database || undefined
  });

  try {
    const [tables] = await connection.execute(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
       ORDER BY table_schema, table_name`
    );

    const schemaMap = new Map();
    for (const row of tables) {
      if (!schemaMap.has(row.table_schema)) {
        schemaMap.set(row.table_schema, []);
      }
      schemaMap.get(row.table_schema).push(row.table_name);
    }

    const result = [];
    for (const [schemaName, tableNames] of schemaMap.entries()) {
      const tablesNode = [];
      for (const tableName of tableNames) {
        const [cols] = await connection.execute(
          `SELECT column_name, data_type
           FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ?
           ORDER BY ordinal_position`,
          [schemaName, tableName]
        );

        const columns = cols.map(col => ({
          name: col.column_name,
          type: mapTypeToShort(col.data_type)
        }));

        tablesNode.push({ name: tableName, type: 'table', children: columns });
      }
      result.push({ name: schemaName, type: 'schema', children: tablesNode });
    }
    return result;
  } finally {
    await connection.end();
  }
}

async function loadPostgresSchema(conn) {
  const client = new PgClient({
    host: conn.host || 'localhost',
    port: conn.port ? Number(conn.port) : 5432,
    user: conn.username || '',
    password: conn.password || '',
    database: conn.database || undefined
  });

  await client.connect();
  try {
    const tables = await client.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
       ORDER BY table_schema, table_name`
    );

    const schemaMap = new Map();
    for (const row of tables.rows) {
      if (!schemaMap.has(row.table_schema)) {
        schemaMap.set(row.table_schema, []);
      }
      schemaMap.get(row.table_schema).push(row.table_name);
    }

    const result = [];
    for (const [schemaName, tableNames] of schemaMap.entries()) {
      const tablesNode = [];
      for (const tableName of tableNames) {
        const cols = await client.query(
          `SELECT column_name, data_type
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [schemaName, tableName]
        );

        const columns = cols.rows.map(col => ({
          name: col.column_name,
          type: mapTypeToShort(col.data_type)
        }));

        tablesNode.push({ name: tableName, type: 'table', children: columns });
      }
      result.push({ name: schemaName, type: 'schema', children: tablesNode });
    }
    return result;
  } finally {
    await client.end();
  }
}

async function loadSqliteSchema(conn) {
  if (!conn.file) {
    return [];
  }
  const db = new Database(conn.file, { readonly: true });
  try {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    const tablesNode = tables.map(table => {
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all().map(col => ({
        name: col.name,
        type: mapTypeToShort(col.type)
      }));
      return { name: table.name, type: 'table', children: columns };
    });
    return [{ name: 'main', type: 'schema', children: tablesNode }];
  } finally {
    db.close();
  }
}

async function executeSql(conn, sql) {
  if (conn.type === 'sqlite') {
    return executeSqlite(conn, sql);
  }
  if (conn.type === 'postgres') {
    return executePostgres(conn, sql);
  }
  if (conn.type === 'mysql') {
    return executeMysql(conn, sql);
  }
  throw new Error(`Unsupported connection type: ${conn.type}`);
}

async function executeMysql(conn, sql) {
  const connection = await mysql.createConnection({
    host: conn.host || 'localhost',
    port: conn.port ? Number(conn.port) : 3306,
    user: conn.username || '',
    password: conn.password || '',
    database: conn.database || undefined,
    multipleStatements: false
  });

  try {
    const [rows, fields] = await connection.execute(sql);
    if (Array.isArray(rows)) {
      const columns = fields ? fields.map(f => f.name) : Object.keys(rows[0] || {});
      const safeColumns = makeUniqueColumns(columns, fields);
      const resultRows = rows.map(row => columns.map(col => row[col]));
      return { columns: safeColumns, rows: resultRows };
    }
    const info = rows || {};
    return { columns: ['message'], rows: [[`OK. Affected rows: ${info.affectedRows || 0}`]] };
  } finally {
    await connection.end();
  }
}

async function executePostgres(conn, sql) {
  const client = new PgClient({
    host: conn.host || 'localhost',
    port: conn.port ? Number(conn.port) : 5432,
    user: conn.username || '',
    password: conn.password || '',
    database: conn.database || undefined
  });

  await client.connect();
  try {
    const result = await client.query(sql);
    if (Array.isArray(result.rows)) {
      const columns = result.fields ? result.fields.map(f => f.name) : Object.keys(result.rows[0] || {});
      const safeColumns = makeUniqueColumns(columns, result.fields);
      const rows = result.rows.map(row => columns.map(col => row[col]));
      return { columns: safeColumns, rows };
    }
    return { columns: ['message'], rows: [['OK']] };
  } finally {
    await client.end();
  }
}

async function executeSqlite(conn, sql) {
  if (!conn.file) {
    return { columns: ['message'], rows: [['Missing SQLite file path']] };
  }
  const db = new Database(conn.file);
  try {
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      const rows = stmt.raw(true).all();
      const columns = stmt.columns().map(col => col.name);
      const safeColumns = makeUniqueColumns(columns, null);
      const tableRows = rows.map(row => row.map(cell => cell));
      return { columns: safeColumns, rows: tableRows };
    }
    const info = stmt.run();
    return { columns: ['message'], rows: [[`OK. Changes: ${info.changes}`]] };
  } finally {
    db.close();
  }
}

function makeUniqueColumns(columns, fields) {
  const counts = new Map();
  columns.forEach(name => {
    const key = String(name);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  if (![...counts.values()].some(v => v > 1)) return columns;

  const seen = new Map();
  return columns.map((name, idx) => {
    const key = String(name);
    if ((counts.get(key) || 0) <= 1) return name;
    const next = (seen.get(key) || 0) + 1;
    seen.set(key, next);
    return `${name}_${next}`;
  });
}

app.listen(PORT, () => {
  console.log(`mySqlEditor2 running on http://localhost:${PORT}`);
});
