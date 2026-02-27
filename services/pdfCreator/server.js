const express = require('express');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3010;

const PIC_DIR = path.join(__dirname, 'pic');
const OUT_DIR = path.join(__dirname, 'out');

if (!fs.existsSync(PIC_DIR)) {
  fs.mkdirSync(PIC_DIR, { recursive: true });
}
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getNextImageNumber() {
  const files = fs.readdirSync(PIC_DIR);
  const nums = files
    .map((f) => {
      const m = f.match(/^(\d+)\.png$/);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => n !== null)
    .sort((a, b) => a - b);

  if (nums.length === 0) {
    return 1;
  }
  return nums[nums.length - 1] + 1;
}

function getOrderedPngFiles() {
  return fs
    .readdirSync(PIC_DIR)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => Number(a.replace('.png', '')) - Number(b.replace('.png', '')));
}

function sanitizePdfFileName(inputName) {
  if (!inputName || typeof inputName !== 'string') {
    return null;
  }

  let name = inputName.trim();
  if (!name) {
    return null;
  }

  name = path.basename(name);
  // Keep Unicode letters (including Hebrew), remove only unsafe filename chars.
  name = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  if (!name.toLowerCase().endsWith('.pdf')) {
    name += '.pdf';
  }

  if (name === '.pdf' || !name.replace(/\.pdf$/i, '').trim()) {
    return null;
  }
  return name;
}

app.post('/api/save-image', (req, res) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data.' });
    }

    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Unsupported image format.' });
    }

    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const number = getNextImageNumber();
    const fileName = `${number}.png`;
    const filePath = path.join(PIC_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    return res.json({ ok: true, fileName, index: number });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/create-pdf', (req, res) => {
  try {
    const requestedName = req.body ? req.body.fileName : null;
    const pdfFileName = sanitizePdfFileName(requestedName);
    if (!pdfFileName) {
      return res.status(400).json({ error: 'Invalid PDF file name.' });
    }

    const files = getOrderedPngFiles();
    if (files.length === 0) {
      return res.status(400).json({ error: 'No images found in pic folder.' });
    }

    if (!fs.existsSync(OUT_DIR)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const pdfPath = path.join(OUT_DIR, pdfFileName);
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    files.forEach((file) => {
      const imgPath = path.join(PIC_DIR, file);
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

    stream.on('finish', () => {
      return res.json({ ok: true, file: pdfFileName, count: files.length });
    });

    stream.on('error', (err) => {
      return res.status(500).json({ error: err.message });
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/download-pdf', (req, res) => {
  const pdfFileName = sanitizePdfFileName(req.query.file);
  if (!pdfFileName) {
    return res.status(400).json({ error: 'Invalid PDF file name.' });
  }

  const pdfPath = path.join(OUT_DIR, pdfFileName);
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'PDF not found. Create it first.' });
  }

  return res.download(pdfPath, pdfFileName);
});

app.post('/api/clear', (req, res) => {
  try {
    if (fs.existsSync(PIC_DIR)) {
      for (const file of fs.readdirSync(PIC_DIR)) {
        fs.unlinkSync(path.join(PIC_DIR, file));
      }
    }

    if (fs.existsSync(OUT_DIR)) {
      for (const file of fs.readdirSync(OUT_DIR)) {
        if (file.toLowerCase().endsWith('.pdf')) {
          fs.unlinkSync(path.join(OUT_DIR, file));
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
