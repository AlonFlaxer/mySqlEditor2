function setStatus(msg, isError = false) {
  $('#status').text(msg).css('color', isError ? '#dc2626' : '#111827');
}

let currentPdfFile = '';

function openPdfModal() {
  $('#pdfModal').removeClass('hidden');
  $('#pdfFileName').trigger('focus').trigger('select');
}

function closePdfModal() {
  $('#pdfModal').addClass('hidden');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToPng(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function saveImageDataUrl(dataUrl) {
  const pngDataUrl = await dataUrlToPng(dataUrl);

  const resp = await fetch('/api/pdf/save-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: pngDataUrl })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Failed to save image.');
  }

  const thumb = `
    <div class="thumb">
      <img src="${pngDataUrl}" alt="${data.fileName}" />
      <div class="label">${data.fileName}</div>
    </div>
  `;
  $('#thumbs').append(thumb);
  setStatus(`Saved ${data.fileName}`);
}

async function saveImageFile(file) {
  const dataUrl = await fileToDataUrl(file);
  await saveImageDataUrl(dataUrl);
}

$('#pasteBox').on('paste', async function (e) {
  const items = (e.originalEvent.clipboardData || window.clipboardData).items;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].type.startsWith('image/')) {
      e.preventDefault();
      try {
        setStatus('Saving pasted image...');
        const file = items[i].getAsFile();
        await saveImageFile(file);
      } catch (err) {
        setStatus(err.message, true);
      }
      return;
    }
  }
  setStatus('Clipboard has no image.', true);
});

$('#btnClipboard').on('click', async function () {
  try {
    setStatus('Reading clipboard image...');
    if (!navigator.clipboard || !navigator.clipboard.read) {
      throw new Error('Clipboard read API not supported by this browser.');
    }

    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        await saveImageFile(new File([blob], 'clipboard-image.png', { type: blob.type }));
        return;
      }
    }
    throw new Error('Clipboard has no image.');
  } catch (err) {
    setStatus(err.message, true);
  }
});

async function createPdfWithName(rawFileName) {
  try {
    const fileName = (rawFileName || '').trim();
    if (!fileName) {
      throw new Error('File name is required.');
    }

    setStatus('Creating PDF...');
    const resp = await fetch('/api/pdf/create-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName })
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || 'Failed to create PDF.');
    }

    currentPdfFile = data.file;
    setStatus(`PDF "${data.file}" created from ${data.count} image(s).`);
    $('#btnDownload').prop('disabled', false);
  } catch (err) {
    setStatus(err.message, true);
  }
}

$('#btnCreatePdf').on('click', function () {
  openPdfModal();
});

$('#btnModalCancel').on('click', function () {
  closePdfModal();
});

$('#btnModalCreate').on('click', async function () {
  const fileName = $('#pdfFileName').val();
  closePdfModal();
  await createPdfWithName(fileName);
});

$('#pdfFileName').on('keydown', async function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const fileName = $('#pdfFileName').val();
    closePdfModal();
    await createPdfWithName(fileName);
  }
});

$('#btnDownload').on('click', function () {
  if (!currentPdfFile) {
    setStatus('Create PDF first.', true);
    return;
  }
  window.location.href = `/api/pdf/download-pdf?file=${encodeURIComponent(currentPdfFile)}`;
});

$('#btnClear').on('click', async function () {
  try {
    const resp = await fetch('/api/pdf/clear', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || 'Failed to clear.');
    }

    $('#thumbs').empty();
    $('#btnDownload').prop('disabled', true);
    currentPdfFile = '';
    setStatus('Cleared pic folder and PDF.');
  } catch (err) {
    setStatus(err.message, true);
  }
});
