const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const { Client: PgClient } = require('pg');
const multer = require('multer');
const archiver = require('archiver');
const mime = require('mime-types');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const LANDING_PUBLIC = path.join(__dirname, 'public');
const MYSQL_PUBLIC = path.join(__dirname, 'services', 'mySqlEditor2', 'public');
const PDF_PUBLIC = path.join(__dirname, 'services', 'pdfCreator', 'public');

const DATA_DIR = path.join(__dirname, 'data');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.yml');
const MYSQL_PIC_DIR = path.join(__dirname, 'pic');
const PDF_PIC_DIR = path.join(__dirname, 'pdf_pic');
const PDF_OUT_DIR = path.join(__dirname, 'pdf_out');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MYSQL_PIC_DIR)) fs.mkdirSync(MYSQL_PIC_DIR, { recursive: true });
if (!fs.existsSync(PDF_PIC_DIR)) fs.mkdirSync(PDF_PIC_DIR, { recursive: true });
if (!fs.existsSync(PDF_OUT_DIR)) fs.mkdirSync(PDF_OUT_DIR, { recursive: true });

app.use(express.json({ limit: '30mb' }));
app.use('/vendor/prism', express.static(path.join(__dirname, 'node_modules', 'prismjs')));
app.use('/vendor/codemirror', express.static(path.join(__dirname, 'node_modules', 'codemirror')));
app.use('/vendor/mergely', express.static(path.join(__dirname, 'node_modules', 'mergely')));
app.use('/pic', express.static(MYSQL_PIC_DIR));
app.use(express.static(LANDING_PUBLIC));
app.use('/mysql', express.static(MYSQL_PUBLIC));
app.use('/pdf', express.static(PDF_PUBLIC));

app.get('/mysql', (req, res) => {
  res.sendFile(path.join(MYSQL_PUBLIC, 'index.html'));
});

app.get('/pdf', (req, res) => {
  res.sendFile(path.join(PDF_PUBLIC, 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
  const mysqlFav = path.join(MYSQL_PUBLIC, 'favicon.ico');
  if (fs.existsSync(mysqlFav)) {
    return res.sendFile(mysqlFav);
  }
  return res.status(404).end();
});

function readConnections() {
  try {
    if (!fs.existsSync(CONNECTIONS_FILE)) return [];
    const raw = fs.readFileSync(CONNECTIONS_FILE, 'utf8');
    const data = yaml.load(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeConnections(conns) {
  const content = yaml.dump(conns, { lineWidth: 120 });
  fs.writeFileSync(CONNECTIONS_FILE, content, 'utf8');
}

function makeId() {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
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
    file: String(input.file || '').trim(),
    isProduction: !!input.isProduction
  };

  const idx = conns.findIndex((c) => c.id === conn.id);
  if (idx >= 0) conns[idx] = conn;
  else conns.push(conn);

  writeConnections(conns);
  res.json({ connection: conn });
});

app.delete('/api/connections/:id', (req, res) => {
  const next = readConnections().filter((c) => c.id !== req.params.id);
  writeConnections(next);
  res.json({ ok: true });
});

app.get('/api/schema', (req, res) => {
  const connectionId = String(req.query.connectionId || '');
  const conn = readConnections().find((c) => c.id === connectionId);

  if (!conn) return res.json({ schema: [] });

  loadSchema(conn)
    .then((schema) => res.json({ schema }))
    .catch((err) => res.status(500).json({ error: normalizeDbError(err, conn) }));
});

app.post('/api/execute', (req, res) => {
  const sql = String(req.body.sql || '').trim();
  const connectionId = String(req.body.connectionId || '');
  const conn = readConnections().find((c) => c.id === connectionId);

  if (!sql) {
    return res.json({ columns: ['message'], rows: [['No SQL provided']] });
  }

  if (!conn) {
    return res.json({ columns: ['message'], rows: [['No connection selected']] });
  }

  executeSql(conn, sql)
    .then((result) => res.json(result))
    .catch((err) => {
      const errorMessage = normalizeDbError(err, conn);
      res.status(500).json({ error: errorMessage, columns: ['error'], rows: [[errorMessage]] });
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
  const buffer = Buffer.from(match[2], 'base64');
  const filename = `img_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  const filepath = path.join(MYSQL_PIC_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  res.json({ path: filepath });
});

app.post('/api/paste-image/cleanup', (req, res) => {
  const cutoffMs = Date.now() - 2 * 60 * 60 * 1000;
  let deleted = 0;

  for (const file of fs.readdirSync(MYSQL_PIC_DIR)) {
    const full = path.join(MYSQL_PIC_DIR, file);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile() && stat.mtimeMs < cutoffMs) {
        fs.unlinkSync(full);
        deleted += 1;
      }
    } catch {
      // ignore per-file failures
    }
  }

  res.json({ deleted });
});

function getNextPdfImageNumber() {
  const nums = fs.readdirSync(PDF_PIC_DIR)
    .map((f) => {
      const m = f.match(/^(\d+)\.png$/);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => n !== null)
    .sort((a, b) => a - b);

  return nums.length === 0 ? 1 : nums[nums.length - 1] + 1;
}

function getOrderedPngFiles() {
  return fs.readdirSync(PDF_PIC_DIR)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => Number(a.replace('.png', '')) - Number(b.replace('.png', '')));
}

function sanitizePdfFileName(inputName) {
  if (!inputName || typeof inputName !== 'string') return null;
  let name = inputName.trim();
  if (!name) return null;

  name = path.basename(name);
  name = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

  if (name === '.pdf' || !name.replace(/\.pdf$/i, '').trim()) return null;
  return name;
}

app.post('/api/pdf/save-image', (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data.' });
    }

    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Unsupported image format.' });
    }

    const buffer = Buffer.from(match[2], 'base64');
    const number = getNextPdfImageNumber();
    const fileName = `${number}.png`;
    fs.writeFileSync(path.join(PDF_PIC_DIR, fileName), buffer);

    return res.json({ ok: true, fileName, index: number });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/pdf/create-pdf', (req, res) => {
  try {
    const requestedName = req.body ? req.body.fileName : null;
    const pdfFileName = sanitizePdfFileName(requestedName);
    if (!pdfFileName) return res.status(400).json({ error: 'Invalid PDF file name.' });

    const files = getOrderedPngFiles();
    if (files.length === 0) {
      return res.status(400).json({ error: 'No images found in pic folder.' });
    }

    const pdfPath = path.join(PDF_OUT_DIR, pdfFileName);
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    files.forEach((file) => {
      const imgPath = path.join(PDF_PIC_DIR, file);
      doc.addPage({ size: 'A4', margin: 20 });

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

      doc.image(imgPath, doc.page.margins.left, doc.page.margins.top, {
        fit: [pageWidth, pageHeight],
        align: 'center',
        valign: 'center'
      });
    });

    doc.end();

    stream.on('finish', () => res.json({ ok: true, file: pdfFileName, count: files.length }));
    stream.on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pdf/download-pdf', (req, res) => {
  const pdfFileName = sanitizePdfFileName(req.query.file);
  if (!pdfFileName) return res.status(400).json({ error: 'Invalid PDF file name.' });

  const pdfPath = path.join(PDF_OUT_DIR, pdfFileName);
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'PDF not found. Create it first.' });
  }

  return res.download(pdfPath, pdfFileName);
});

app.post('/api/pdf/clear', (req, res) => {
  try {
    for (const file of fs.readdirSync(PDF_PIC_DIR)) {
      fs.unlinkSync(path.join(PDF_PIC_DIR, file));
    }

    for (const file of fs.readdirSync(PDF_OUT_DIR)) {
      if (file.toLowerCase().endsWith('.pdf')) {
        fs.unlinkSync(path.join(PDF_OUT_DIR, file));
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function resolveRoot(rootInput) {
  if (!rootInput || typeof rootInput !== 'string') throw new Error('root is required');
  const absRoot = path.resolve(rootInput);
  if (!fs.existsSync(absRoot)) throw new Error('root does not exist');
  if (!fs.statSync(absRoot).isDirectory()) throw new Error('root is not a directory');
  return fs.realpathSync(absRoot);
}

function resolveSafePath(absRoot, relPath = '') {
  const fullPath = path.resolve(absRoot, relPath || '.');
  if (fullPath !== absRoot && !fullPath.startsWith(`${absRoot}${path.sep}`)) {
    throw new Error('path escapes root');
  }
  return fullPath;
}

function modeToString(mode, isDir) {
  const symbols = ['r', 'w', 'x'];
  let out = isDir ? 'd' : '-';
  const perms = mode & 0o777;

  for (let i = 2; i >= 0; i -= 1) {
    const bits = (perms >> (i * 3)) & 0b111;
    for (let j = 0; j < 3; j += 1) out += bits & (1 << (2 - j)) ? symbols[j] : '-';
  }

  return out;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['K', 'M', 'G', 'T'];
  let value = bytes;
  let idx = -1;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)}${units[idx]}`;
}

function listDirectory(absRoot, relPath = '') {
  const target = resolveSafePath(absRoot, relPath);
  const entries = fs.readdirSync(target, { withFileTypes: true });

  const mapped = entries.map((entry) => {
    const full = path.join(target, entry.name);
    const stat = fs.statSync(full);
    const itemRelPath = path.relative(absRoot, full);

    return {
      name: entry.name,
      relPath: itemRelPath,
      type: entry.isDirectory() ? 'dir' : 'file',
      mode: modeToString(stat.mode, entry.isDirectory()),
      size: stat.size,
      sizeHuman: humanSize(stat.size),
      mtime: stat.mtime.toISOString(),
      mtimeLocal: stat.mtime.toLocaleString(),
      mime: entry.isDirectory() ? null : (mime.lookup(entry.name) || 'application/octet-stream')
    };
  });

  mapped.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { cwd: target, relPath: path.relative(absRoot, target), items: mapped };
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function detectCodeLanguage(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const map = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.env': 'bash',
    '.json': 'json',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.sql': 'sql',
    '.md': 'markdown',
    '.html': 'markup',
    '.css': 'css',
    '.xml': 'markup',
    '.txt': 'none'
  };

  return map[ext] || 'none';
}

function sanitizeEntryName(input) {
  const name = path.basename(String(input || '').trim());
  if (!name || name === '.' || name === '..') {
    throw new Error('Invalid name');
  }
  return name;
}

app.get('/api/fs/list', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    res.json({ ok: true, root, ...listDirectory(root, relPath) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/fs/tree', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    const target = resolveSafePath(root, relPath);

    const dirs = fs.readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        relPath: path.relative(root, path.join(target, entry.name))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ ok: true, root, relPath: path.relative(root, target), dirs });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/fs/preview', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    const target = resolveSafePath(root, relPath);

    const stat = fs.statSync(target);
    if (stat.isDirectory()) return res.status(400).json({ ok: false, error: 'Cannot preview a directory' });

    const fileName = path.basename(target);
    const mimeType = mime.lookup(fileName) || 'application/octet-stream';

    if (mimeType.startsWith('image/')) {
      return res.json({ ok: true, type: 'image', mime: mimeType });
    }

    const maxBytes = 2 * 1024 * 1024;
    const raw = fs.readFileSync(target);
    const truncated = raw.length > maxBytes;
    const text = raw.slice(0, maxBytes).toString('utf8');

    if (/\.csv$/i.test(fileName)) {
      const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
      const rows = lines.map(parseCsvLine);
      const width = rows.reduce((m, row) => Math.max(m, row.length), 0);
      const normalized = rows.map((row) => {
        const out = [...row];
        while (out.length < width) out.push('');
        return out;
      });
      const columns = normalized[0] || [];
      const dataRows = normalized.slice(1, 2001);

      return res.json({
        ok: true,
        type: 'csv',
        truncated,
        columns,
        rows: dataRows,
        totalRows: normalized.length - 1
      });
    }

    return res.json({
      ok: true,
      type: 'text',
      language: detectCodeLanguage(fileName),
      truncated,
      content: text
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/fs/file-meta', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    const target = resolveSafePath(root, relPath);
    const stat = fs.statSync(target);
    if (!stat.isFile()) {
      return res.status(400).json({ ok: false, error: 'Not a file' });
    }
    return res.json({
      ok: true,
      mtime: stat.mtime.toISOString(),
      size: stat.size
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/fs/read-text', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    const target = resolveSafePath(root, relPath);
    const stat = fs.statSync(target);
    if (!stat.isFile()) {
      return res.status(400).json({ ok: false, error: 'Not a file' });
    }

    const maxBytes = 5 * 1024 * 1024;
    if (stat.size > maxBytes) {
      return res.status(400).json({ ok: false, error: 'File too large for text diff view (max 5MB)' });
    }

    const content = fs.readFileSync(target, 'utf8');
    return res.json({
      ok: true,
      content,
      mtime: stat.mtime.toISOString(),
      size: stat.size
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/fs/download-file', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    const target = resolveSafePath(root, relPath);
    const stat = fs.statSync(target);

    if (!stat.isFile()) return res.status(400).json({ ok: false, error: 'Not a file' });
    return res.download(target, path.basename(target));
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/fs/download-folder', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    const target = resolveSafePath(root, relPath);
    const stat = fs.statSync(target);

    if (!stat.isDirectory()) return res.status(400).json({ ok: false, error: 'Not a directory' });

    const baseName = path.basename(target) || 'folder';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
      else res.end();
    });

    archive.pipe(res);
    archive.directory(target, baseName);
    archive.finalize();
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/fs/download-zip', (req, res) => {
  try {
    const root = resolveRoot(req.query.root);
    const relPath = String(req.query.relPath || '');
    const target = resolveSafePath(root, relPath);
    const stat = fs.statSync(target);
    const baseName = path.basename(target) || 'item';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
      else res.end();
    });

    archive.pipe(res);
    if (stat.isDirectory()) {
      archive.directory(target, baseName);
    } else {
      archive.file(target, { name: baseName });
    }
    archive.finalize();
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/upload', upload.array('files', 30), (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const target = resolveSafePath(root, relPath);
    const stat = fs.statSync(target);

    if (!stat.isDirectory()) return res.status(400).json({ ok: false, error: 'Upload target is not a directory' });

    const saved = [];
    for (const file of req.files || []) {
      const safeName = path.basename(file.originalname);
      fs.writeFileSync(path.join(target, safeName), file.buffer);
      saved.push(safeName);
    }

    return res.json({ ok: true, saved });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/sync-commands', (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const target = resolveSafePath(root, relPath);
    const escapedTarget = target.replace(/"/g, '\\"');

    res.json({
      ok: true,
      target,
      unison: `unison \"$LOCAL_PATH\" \"${escapedTarget}\" -auto -batch -prefer newer`,
      cp: `cp -a \"$LOCAL_PATH\"/. \"${escapedTarget}/\"`,
      sync: `rsync -avh --progress \"$LOCAL_PATH\"/ \"${escapedTarget}/\"`
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/save-file', (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const content = String(req.body.content || '');
    const target = resolveSafePath(root, relPath);
    const stat = fs.statSync(target);

    if (!stat.isFile()) {
      return res.status(400).json({ ok: false, error: 'Target is not a file' });
    }

    fs.writeFileSync(target, content, 'utf8');
    const nextStat = fs.statSync(target);
    return res.json({
      ok: true,
      mtime: nextStat.mtime.toISOString(),
      size: nextStat.size
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/create-file', (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const name = sanitizeEntryName(req.body.name);
    const content = req.body.content === undefined ? '' : String(req.body.content);
    const folder = resolveSafePath(root, relPath);
    const filePath = path.join(folder, name);

    if (!fs.statSync(folder).isDirectory()) {
      return res.status(400).json({ ok: false, error: 'Target folder is invalid' });
    }
    if (fs.existsSync(filePath)) {
      return res.status(400).json({ ok: false, error: 'File already exists' });
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/create-folder', (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const name = sanitizeEntryName(req.body.name);
    const parent = resolveSafePath(root, relPath);
    const folderPath = path.join(parent, name);

    if (!fs.statSync(parent).isDirectory()) {
      return res.status(400).json({ ok: false, error: 'Target folder is invalid' });
    }
    if (fs.existsSync(folderPath)) {
      return res.status(400).json({ ok: false, error: 'Folder already exists' });
    }

    fs.mkdirSync(folderPath, { recursive: false });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/rename', (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const newName = sanitizeEntryName(req.body.newName);
    const source = resolveSafePath(root, relPath);
    const target = path.join(path.dirname(source), newName);

    if (!fs.existsSync(source)) {
      return res.status(404).json({ ok: false, error: 'Item not found' });
    }
    if (fs.existsSync(target)) {
      return res.status(400).json({ ok: false, error: 'Target name already exists' });
    }

    fs.renameSync(source, target);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/delete', (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const target = resolveSafePath(root, relPath);

    if (!fs.existsSync(target)) {
      return res.status(404).json({ ok: false, error: 'Item not found' });
    }

    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: false });
    } else {
      fs.unlinkSync(target);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/fs/move', (req, res) => {
  try {
    const root = resolveRoot(req.body.root);
    const relPath = String(req.body.relPath || '');
    const destinationRelPath = String(req.body.destinationRelPath || '');
    const source = resolveSafePath(root, relPath);
    const destinationFolder = resolveSafePath(root, destinationRelPath);
    const target = path.join(destinationFolder, path.basename(source));

    if (!fs.existsSync(source)) {
      return res.status(404).json({ ok: false, error: 'Item not found' });
    }
    if (!fs.statSync(destinationFolder).isDirectory()) {
      return res.status(400).json({ ok: false, error: 'Destination must be a folder' });
    }
    if (fs.existsSync(target)) {
      return res.status(400).json({ ok: false, error: 'Destination already has this name' });
    }

    fs.renameSync(source, target);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

async function loadSchema(conn) {
  if (conn.type === 'sqlite') return loadSqliteSchema(conn);
  if (conn.type === 'postgres') return loadPostgresSchema(conn);
  if (conn.type === 'mysql') return loadMysqlSchema(conn);
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
  const connection = await mysql.createConnection(buildMysqlConfig(conn));

  try {
    const [tables] = await connection.execute(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
       ORDER BY table_schema, table_name`
    );

    const schemaMap = new Map();
    for (const row of tables) {
      const schemaName = row.table_schema ?? row.TABLE_SCHEMA ?? row.schema_name;
      const tableName = row.table_name ?? row.TABLE_NAME ?? row.name;
      if (!schemaName || !tableName) continue;

      if (!schemaMap.has(schemaName)) schemaMap.set(schemaName, []);
      schemaMap.get(schemaName).push(tableName);
    }

    const result = [];
    for (const [schemaName, tableNames] of schemaMap.entries()) {
      const tablesNode = [];
      for (const tableName of tableNames) {
        const [cols] = await connection.query(
          `SELECT column_name, data_type
           FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ?
           ORDER BY ordinal_position`,
          [schemaName, tableName]
        );

        const columns = cols
          .map((col) => ({
            name: col.column_name ?? col.COLUMN_NAME ?? col.name,
            type: mapTypeToShort(col.data_type ?? col.DATA_TYPE)
          }))
          .filter((col) => !!col.name);

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
      if (!schemaMap.has(row.table_schema)) schemaMap.set(row.table_schema, []);
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

        const columns = cols.rows.map((col) => ({ name: col.column_name, type: mapTypeToShort(col.data_type) }));
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
  if (!conn.file) return [];

  const db = new Database(conn.file, { readonly: true });
  try {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    const tablesNode = tables.map((table) => {
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all().map((col) => ({
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
  if (conn.type === 'sqlite') return executeSqlite(conn, sql);
  if (conn.type === 'postgres') return executePostgres(conn, sql);
  if (conn.type === 'mysql') return executeMysql(conn, sql);
  throw new Error(`Unsupported connection type: ${conn.type}`);
}

async function executeMysql(conn, sql) {
  const connection = await mysql.createConnection({ ...buildMysqlConfig(conn), multipleStatements: false });
  try {
    const [rows, fields] = await connection.execute(sql);
    if (Array.isArray(rows)) {
      const columns = fields ? fields.map((f) => f.name) : Object.keys(rows[0] || {});
      const safeColumns = makeUniqueColumns(columns);
      const resultRows = rows.map((row) => columns.map((col) => row[col]));
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
      const columns = result.fields ? result.fields.map((f) => f.name) : Object.keys(result.rows[0] || {});
      const safeColumns = makeUniqueColumns(columns);
      const rows = result.rows.map((row) => columns.map((col) => row[col]));
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
      const columns = stmt.columns().map((col) => col.name);
      const safeColumns = makeUniqueColumns(columns);
      return { columns: safeColumns, rows: rows.map((row) => row.map((cell) => cell)) };
    }
    const info = stmt.run();
    return { columns: ['message'], rows: [[`OK. Changes: ${info.changes}`]] };
  } finally {
    db.close();
  }
}

function makeUniqueColumns(columns) {
  const counts = new Map();
  columns.forEach((name) => {
    const key = String(name);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  if (![...counts.values()].some((v) => v > 1)) return columns;

  const seen = new Map();
  return columns.map((name) => {
    const key = String(name);
    if ((counts.get(key) || 0) <= 1) return name;
    const next = (seen.get(key) || 0) + 1;
    seen.set(key, next);
    return `${name}_${next}`;
  });
}

function buildMysqlConfig(conn) {
  return {
    host: conn.host || 'localhost',
    port: conn.port ? Number(conn.port) : 3306,
    user: conn.username || '',
    password: conn.password || '',
    database: conn.database || undefined,
    connectTimeout: 30000
  };
}

function normalizeDbError(err, conn) {
  const raw = String(err && err.message ? err.message : err || 'Unknown database error');
  if (!conn || conn.type !== 'mysql') return raw;

  const host = conn.host || 'localhost';
  const port = conn.port ? Number(conn.port) : 3306;
  const code = String(err && err.code ? err.code : '').toUpperCase();
  const upper = raw.toUpperCase();

  if (code === 'ETIMEOUT' || code === 'ETIMEDOUT' || upper.includes('ETIMEOUT') || upper.includes('ETIMEDOUT')) {
    return `Timeout connecting to MySQL at ${host}:${port}. Verify host/port, firewall/security-group rules, and that MySQL allows remote access.`;
  }
  if (code === 'ECONNREFUSED' || upper.includes('ECONNREFUSED')) {
    return `Connection refused by MySQL at ${host}:${port}. Check that mysqld is running and listening on that address.`;
  }
  if (code === 'ENOTFOUND' || upper.includes('ENOTFOUND')) {
    return `Cannot resolve MySQL host "${host}". Check the hostname or DNS settings.`;
  }

  return raw;
}

app.listen(PORT, () => {
  console.log(`Support hub (single app) running at http://localhost:${PORT}`);
});
