const ROOT_KEY = 'support.fileManager.root';
const LAYOUT_KEY = 'support.fileManager.layout';
const EDITOR_THEME_KEY = 'support.fileManager.editorTheme';
const FOCUS_KEY = 'support.fileManager.editorFocus';

const rootInput = document.getElementById('rootPath');
const setRootBtn = document.getElementById('setRootBtn');
const refreshTreeBtn = document.getElementById('refreshTreeBtn');
const treeEl = document.getElementById('tree');
const currentPathEl = document.getElementById('currentPath');
const entriesBody = document.getElementById('entriesBody');
const upBtn = document.getElementById('upBtn');
const newFileBtn = document.getElementById('newFileBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const downloadFolderBtn = document.getElementById('downloadFolderBtn');
const previewTitle = document.getElementById('previewTitle');
const previewContainer = document.getElementById('previewContainer');
const uploadInput = document.getElementById('uploadInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadMsg = document.getElementById('uploadMsg');
const syncBtn = document.getElementById('syncBtn');
const syncOut = document.getElementById('syncOut');
const fmLayout = document.querySelector('.fm');
const leftHandle = document.getElementById('leftHandle');
const rightHandle = document.getElementById('rightHandle');
const fmModalOverlay = document.getElementById('fmModalOverlay');
const fmModalTitle = document.getElementById('fmModalTitle');
const fmModalMessage = document.getElementById('fmModalMessage');
const fmModalInput = document.getElementById('fmModalInput');
const fmModalCancelBtn = document.getElementById('fmModalCancelBtn');
const fmModalOkBtn = document.getElementById('fmModalOkBtn');
const fmHelpOverlay = document.getElementById('fmHelpOverlay');
const fmHelpCloseBtn = document.getElementById('fmHelpCloseBtn');
const fmConflictOverlay = document.getElementById('fmConflictOverlay');
const fmConflictLoadBtn = document.getElementById('fmConflictLoadBtn');
const fmConflictDiffBtn = document.getElementById('fmConflictDiffBtn');
const fmDiffOverlay = document.getElementById('fmDiffOverlay');
const fmDiffMergeRightToLeftBtn = document.getElementById('fmDiffMergeRightToLeftBtn');
const fmDiffMergeLeftToRightBtn = document.getElementById('fmDiffMergeLeftToRightBtn');
const fmDiffSaveBtn = document.getElementById('fmDiffSaveBtn');
const fmDiffDropBtn = document.getElementById('fmDiffDropBtn');
let winMergeDiff = null;
let winMergeLoadPromise = null;

let root = localStorage.getItem(ROOT_KEY) || '/home/ubuntu/projects';
let currentRelPath = '';
let currentItems = [];
const layout = { left: 300, right: 520 };
let activeCodeMirror = null;
let activePreviewItem = null;
let editorTheme = localStorage.getItem(EDITOR_THEME_KEY) || 'default';
let editorFocus = localStorage.getItem(FOCUS_KEY) === '1';
let activeEditorSizer = null;
let modalResolve = null;
let isEditorDirty = false;
let openedFileMtime = null;
let openedServerContent = null;
let dirtyWatchTimer = null;
let conflictActive = false;
let latestServerSnapshot = null;
let compareSelectedRelPath = null;
let diffMode = 'conflict';
let diffCompareLeftRelPath = null;
let diffCompareRightRelPath = null;
let showEditorAlert = null;

rootInput.value = root;

function isDesktopLayout() {
  return window.innerWidth > 1024;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyLayout() {
  if (!isDesktopLayout()) {
    fmLayout.classList.remove('editor-focus');
  } else if (editorFocus) {
    fmLayout.classList.add('editor-focus');
  } else {
    fmLayout.classList.remove('editor-focus');
    fmLayout.style.setProperty('--left-pane', `${layout.left}px`);
    fmLayout.style.setProperty('--right-pane', `${layout.right}px`);
  }

  if (activeEditorSizer) {
    requestAnimationFrame(activeEditorSizer);
  }
  if (activeCodeMirror) {
    requestAnimationFrame(() => activeCodeMirror.refresh());
  }
}

function readLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed.left)) layout.left = parsed.left;
    if (Number.isFinite(parsed.right)) layout.right = parsed.right;
  } catch {
    // ignore invalid local storage payload
  }
}

function saveLayout() {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function setEditorFocus(on) {
  editorFocus = !!on;
  localStorage.setItem(FOCUS_KEY, editorFocus ? '1' : '0');
  applyLayout();
}

function initPaneResize() {
  const handleDrag = (type, ev) => {
    if (!isDesktopLayout()) return;

    ev.preventDefault();
    const startX = ev.clientX;
    const startLeft = layout.left;
    const startRight = layout.right;

    const minLeft = 180;
    const minRight = 260;
    const minCenter = 360;
    const handlesWidth = 16;
    const totalWidth = fmLayout.clientWidth;

    const onMove = (moveEv) => {
      const dx = moveEv.clientX - startX;

      if (type === 'left') {
        const maxLeft = totalWidth - startRight - minCenter - handlesWidth;
        layout.left = clamp(startLeft + dx, minLeft, maxLeft);
      } else {
        const maxRight = totalWidth - startLeft - minCenter - handlesWidth;
        layout.right = clamp(startRight - dx, minRight, maxRight);
      }

      applyLayout();
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      saveLayout();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  leftHandle.addEventListener('pointerdown', (ev) => handleDrag('left', ev));
  rightHandle.addEventListener('pointerdown', (ev) => handleDrag('right', ev));
}

function esc(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function apiJson(url, options) {
  const method = (options && options.method ? options.method : 'GET').toUpperCase();
  const hasQuery = String(url).includes('?');
  const finalUrl = method === 'GET'
    ? `${url}${hasQuery ? '&' : '?'}_t=${Date.now()}`
    : url;
  const finalOptions = method === 'GET'
    ? { ...options, cache: 'no-store' }
    : options;

  const res = await fetch(finalUrl, finalOptions);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  let data = null;

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 180)}`);
    }
    throw new Error(`Expected JSON response but received: ${text.slice(0, 180)}`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
  }
  return data;
}

async function postJson(url, payload) {
  return apiJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function closeModal(value) {
  fmModalOverlay.classList.add('hidden');
  if (modalResolve) {
    const resolve = modalResolve;
    modalResolve = null;
    resolve(value);
  }
}

function openHelpModal() {
  fmHelpOverlay.classList.remove('hidden');
  setTimeout(() => fmHelpCloseBtn.focus(), 0);
}

function closeHelpModal() {
  fmHelpOverlay.classList.add('hidden');
}

function openModal({ title, message, defaultValue = '', showInput = false, okLabel = 'OK' }) {
  fmModalTitle.textContent = title || 'Action';
  fmModalMessage.textContent = message || '';
  fmModalInput.value = defaultValue;
  fmModalInput.style.display = showInput ? 'block' : 'none';
  fmModalOkBtn.textContent = okLabel;
  fmModalOverlay.classList.remove('hidden');

  if (showInput) {
    setTimeout(() => {
      fmModalInput.focus();
      fmModalInput.select();
    }, 0);
  } else {
    setTimeout(() => fmModalOkBtn.focus(), 0);
  }

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

async function promptModal(title, message, defaultValue = '') {
  const result = await openModal({ title, message, defaultValue, showInput: true, okLabel: 'Confirm' });
  if (result === null) return null;
  return String(result).trim();
}

async function confirmModal(title, message, okLabel = 'Confirm') {
  const result = await openModal({ title, message, showInput: false, okLabel });
  return result === true;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lazy-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.lazySrc = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadStyle(href) {
  const existing = document.querySelector(`link[data-lazy-href="${href}"]`);
  if (existing) return Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.lazyHref = href;
  document.head.appendChild(link);
  return Promise.resolve();
}

async function ensureWinMergeDiff() {
  if (winMergeDiff) return winMergeDiff;
  if (winMergeLoadPromise) return winMergeLoadPromise;

  winMergeLoadPromise = (async () => {
    await loadStyle('/vendor/mergely/lib/mergely.css');
    await loadScript('/vendor/mergely/lib/mergely.min.js');
    await loadScript('/modules/winmerge-diff-module.js');

    if (!window.WinMergeDiffModule) {
      throw new Error('WinMergeDiffModule not available');
    }

    winMergeDiff = new window.WinMergeDiffModule({
      overlayId: 'fmDiffOverlay',
      containerId: 'fmMergelyContainer',
      errorId: 'fmDiffError',
      prevBtnId: 'fmDiffPrevBtn',
      nextBtnId: 'fmDiffNextBtn',
      mergeRightToLeftBtnId: 'fmDiffMergeRightToLeftBtn',
      mergeLeftToRightBtnId: 'fmDiffMergeLeftToRightBtn',
      applyLeftBtnId: 'fmDiffApplyLeftBtn',
      applyRightBtnId: 'fmDiffApplyRightBtn',
      closeBtnId: 'fmDiffCloseBtn'
    });

    return winMergeDiff;
  })();

  try {
    return await winMergeLoadPromise;
  } finally {
    if (!winMergeDiff) winMergeLoadPromise = null;
  }
}

async function confirmDiscardDirtyChanges() {
  if (!isEditorDirty) return true;
  return confirmModal(
    'Unsaved Changes',
    'You have unsaved changes. Leave without saving?',
    'Leave'
  );
}

function stopDirtyWatch() {
  if (dirtyWatchTimer) {
    clearInterval(dirtyWatchTimer);
    dirtyWatchTimer = null;
  }
}

function isTextFilePreviewActive() {
  return !!(activePreviewItem && activeCodeMirror);
}

async function fetchServerTextSnapshot() {
  if (!activePreviewItem) return null;
  try {
    return await apiJson(
      `/api/fs/read-text?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(activePreviewItem.relPath)}`
    );
  } catch {
    const preview = await apiJson(
      `/api/fs/preview?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(activePreviewItem.relPath)}`
    );
    if (preview.type !== 'text') {
      throw new Error('Server file is not a text preview');
    }
    return {
      ok: true,
      content: preview.content || '',
      mtime: openedFileMtime,
      size: null
    };
  }
}

async function fetchServerMeta() {
  if (!activePreviewItem) return null;
  try {
    return await apiJson(
      `/api/fs/file-meta?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(activePreviewItem.relPath)}`
    );
  } catch {
    const parentRel = activePreviewItem.relPath.split('/').slice(0, -1).join('/');
    const listing = await apiJson(
      `/api/fs/list?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(parentRel)}`
    );
    const found = (listing.items || []).find((it) => it.relPath === activePreviewItem.relPath);
    if (!found) throw new Error('File no longer exists');
    return { ok: true, mtime: found.mtime, size: found.size };
  }
}

async function fetchTextSnapshotByRelPath(relPath, fallbackMtime = null) {
  try {
    return await apiJson(
      `/api/fs/read-text?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(relPath)}`
    );
  } catch {
    const preview = await apiJson(
      `/api/fs/preview?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(relPath)}`
    );
    if (preview.type !== 'text') {
      throw new Error('Only text files can be compared');
    }
    return {
      ok: true,
      content: preview.content || '',
      mtime: fallbackMtime,
      size: null
    };
  }
}

function setDiffMode(mode) {
  diffMode = mode;
  if (mode === 'compare') {
    fmDiffSaveBtn.textContent = 'Save Left File';
    fmDiffDropBtn.textContent = 'Save Right File';
    fmDiffMergeRightToLeftBtn.style.display = '';
    fmDiffMergeLeftToRightBtn.style.display = '';
    fmDiffMergeRightToLeftBtn.textContent = 'Merge File 2 -> File 1';
    fmDiffMergeLeftToRightBtn.textContent = 'Merge File 1 -> File 2';
    return;
  }
  fmDiffSaveBtn.textContent = 'Save';
  fmDiffDropBtn.textContent = 'Drop Changes';
  fmDiffMergeRightToLeftBtn.textContent = 'Merge Server -> Local';
  fmDiffMergeLeftToRightBtn.textContent = 'Merge Local -> Server';
  fmDiffMergeRightToLeftBtn.style.display = '';
  fmDiffMergeLeftToRightBtn.style.display = '';
}

async function openCompareDiff(rightItem) {
  if (!compareSelectedRelPath) {
    throw new Error('No file selected for compare. Use "Set for Compare" first.');
  }
  if (compareSelectedRelPath === rightItem.relPath) {
    throw new Error('Choose a different file to compare.');
  }

  const leftSnap = await fetchTextSnapshotByRelPath(compareSelectedRelPath);
  const rightSnap = await fetchTextSnapshotByRelPath(rightItem.relPath, rightItem.mtime || null);
  const diffModule = await ensureWinMergeDiff();
  setDiffMode('compare');
  diffCompareLeftRelPath = compareSelectedRelPath;
  diffCompareRightRelPath = rightItem.relPath;

  diffModule.open({
    leftText: leftSnap.content || '',
    rightText: rightSnap.content || '',
    onClose: () => {
      diffCompareLeftRelPath = null;
      diffCompareRightRelPath = null;
      conflictActive = false;
    }
  });
}

async function checkDirtyConflict() {
  if (!isTextFilePreviewActive() || conflictActive) return;

  try {
    const snap = await fetchServerTextSnapshot();
    const meta = await fetchServerMeta();
    const changedByMtime = openedFileMtime && meta.mtime !== openedFileMtime;
    const changedByContent = openedServerContent !== null && snap.content !== openedServerContent;
    const changedOnServer = changedByMtime || changedByContent;
    if (!changedOnServer) return;

    if (isEditorDirty) {
      latestServerSnapshot = snap;
      conflictActive = true;
      if (fmConflictOverlay) {
        fmConflictOverlay.classList.remove('hidden');
      } else {
        alert('File changed on server while you have unsaved changes.');
        conflictActive = false;
      }
      return;
    }

    if (activeCodeMirror) {
      const cursor = activeCodeMirror.getCursor();
      const scroll = activeCodeMirror.getScrollInfo();
      activeCodeMirror.setValue(snap.content || '');
      activeCodeMirror.setCursor(cursor);
      activeCodeMirror.scrollTo(scroll.left, scroll.top);
    }
    openedFileMtime = meta.mtime || snap.mtime || openedFileMtime;
    openedServerContent = snap.content || '';
    latestServerSnapshot = null;
    if (showEditorAlert) {
      showEditorAlert('Server updated. Editor refreshed.');
    }
    await loadList(currentRelPath);
  } catch {
    // Ignore transient polling errors.
  }
}

function startDirtyWatch() {
  stopDirtyWatch();
  if (!isTextFilePreviewActive()) return;
  dirtyWatchTimer = setInterval(checkDirtyConflict, 4000);
}

async function refreshCurrentView() {
  await loadList(currentRelPath);
  await loadTree(currentRelPath);
}

function createRowMenu(item) {
  const details = document.createElement('details');
  details.className = 'row-menu';
  details.innerHTML = `<summary title="Actions">☰</summary>`;
  const menu = document.createElement('div');
  menu.className = 'row-menu-list';

  function addAction(label, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      details.open = false;
      try {
        await handler();
      } catch (err) {
        alert(err.message || 'Action failed');
      }
    };
    menu.appendChild(btn);
  }

  addAction('Zip', async () => {
    window.location.href = `/api/fs/download-zip?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(item.relPath)}`;
  });

  if (item.type === 'file') {
    addAction('Set for Compare', async () => {
      compareSelectedRelPath = item.relPath;
      uploadMsg.classList.remove('error');
      uploadMsg.textContent = `Compare source set: ${item.name}`;
    });

    addAction('Compare with Selected', async () => {
      await openCompareDiff(item);
    });
  }

  addAction('Rename', async () => {
    const nextName = await promptModal('Rename', `New name for "${item.name}"`, item.name);
    if (!nextName) return;
    await postJson('/api/fs/rename', { root, relPath: item.relPath, newName: nextName });
    await refreshCurrentView();
  });

  addAction('Delete', async () => {
    const ok = await confirmModal('Delete', `Delete "${item.name}"?`, 'Delete');
    if (!ok) return;
    await postJson('/api/fs/delete', { root, relPath: item.relPath });
    await refreshCurrentView();
  });

  addAction('Move', async () => {
    const destinationRelPath = await promptModal(
      'Move',
      'Destination folder relative to root (use "." for root)',
      '.'
    );
    if (destinationRelPath === null) return;
    await postJson('/api/fs/move', { root, relPath: item.relPath, destinationRelPath });
    await refreshCurrentView();
  });

  details.appendChild(menu);
  return details;
}

function formatRel(relPath) {
  return relPath || '.';
}

async function loadTree(relPath = '') {
  const data = await apiJson(`/api/fs/tree?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(relPath)}`);
  const ul = document.createElement('ul');
  const current = document.createElement('li');

  const rootBtn = document.createElement('button');
  rootBtn.className = 'tree-btn';
  rootBtn.textContent = relPath || '/';
  rootBtn.onclick = async () => {
    if (!(await confirmDiscardDirtyChanges())) return;
    currentRelPath = relPath;
    loadList(currentRelPath);
  };

  current.appendChild(rootBtn);

  if (data.dirs.length) {
    const childUl = document.createElement('ul');
    for (const dir of data.dirs) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'tree-btn';
      btn.textContent = dir.name;
      btn.onclick = async () => {
        if (!(await confirmDiscardDirtyChanges())) return;
        currentRelPath = dir.relPath;
        await loadList(currentRelPath);
        await loadTree(dir.relPath);
      };
      li.appendChild(btn);
      childUl.appendChild(li);
    }
    current.appendChild(childUl);
  }

  ul.appendChild(current);
  treeEl.innerHTML = '';
  treeEl.appendChild(ul);
}

async function loadList(relPath = '') {
  const data = await apiJson(`/api/fs/list?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(relPath)}`);
  currentRelPath = data.relPath;
  currentPathEl.textContent = `Path: ${data.cwd}`;
  currentItems = data.items;

  entriesBody.innerHTML = '';
  for (const item of data.items) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'entry-link';
    link.href = '#';
    link.textContent = item.type === 'dir' ? `${item.name}/` : item.name;
    link.onclick = async (ev) => {
      ev.preventDefault();
      if (!(await confirmDiscardDirtyChanges())) return;
      if (item.type === 'dir') {
        await loadList(item.relPath);
        await loadTree(item.relPath);
      } else {
        await previewFile(item);
      }
    };
    nameTd.appendChild(link);

    const modeTd = document.createElement('td');
    modeTd.textContent = item.mode;

    const sizeTd = document.createElement('td');
    sizeTd.textContent = item.sizeHuman;

    const modTd = document.createElement('td');
    modTd.textContent = item.mtimeLocal;

    const actionTd = document.createElement('td');
    actionTd.appendChild(createRowMenu(item));

    tr.append(nameTd, modeTd, sizeTd, modTd, actionTd);
    entriesBody.appendChild(tr);
  }
}

function buildCsvPreview(columns, rows) {
  const wrapper = document.createElement('div');
  let page = 1;
  let pageSize = 25;
  let sortIndex = -1;
  let sortAsc = true;
  let filter = '';

  const controls = document.createElement('div');
  controls.className = 'smart-controls';
  controls.innerHTML = `
    <input id="csvFilter" class="input" placeholder="Filter rows" style="max-width: 200px;">
    <select id="csvPageSize" style="max-width: 100px;">
      <option value="25">25</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
  `;

  const tableWrap = document.createElement('div');
  tableWrap.className = 'smart-table';

  function render() {
    let filtered = rows;
    if (filter) {
      const f = filter.toLowerCase();
      filtered = rows.filter((r) => r.join(' ').toLowerCase().includes(f));
    }

    if (sortIndex >= 0) {
      filtered = [...filtered].sort((a, b) => {
        const left = String(a[sortIndex] || '');
        const right = String(b[sortIndex] || '');
        return sortAsc ? left.localeCompare(right) : right.localeCompare(left);
      });
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);

    let html = '<table><thead><tr>';
    columns.forEach((col, idx) => {
      html += `<th data-idx="${idx}">${esc(col || `col_${idx + 1}`)}</th>`;
    });
    html += '</tr></thead><tbody>';

    for (const row of visible) {
      html += '<tr>';
      columns.forEach((_, idx) => {
        html += `<td>${esc(row[idx] || '')}</td>`;
      });
      html += '</tr>';
    }

    html += `</tbody></table><div class="path-bar">Rows: ${filtered.length} | Page ${page}/${totalPages}</div>`;
    tableWrap.innerHTML = html;

    tableWrap.querySelectorAll('th').forEach((th) => {
      th.onclick = () => {
        const idx = Number(th.dataset.idx);
        if (sortIndex === idx) {
          sortAsc = !sortAsc;
        } else {
          sortIndex = idx;
          sortAsc = true;
        }
        render();
      };
    });
  }

  controls.querySelector('#csvFilter').addEventListener('input', (ev) => {
    filter = ev.target.value;
    page = 1;
    render();
  });

  controls.querySelector('#csvPageSize').addEventListener('change', (ev) => {
    pageSize = Number(ev.target.value);
    page = 1;
    render();
  });

  wrapper.append(controls, tableWrap);
  render();
  return wrapper;
}

function buildCodePreview(content, language) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="smart-controls">
      <button id="focusEditorBtn">Focus Editor</button>
      <button id="restoreLayoutBtn">Restore Layout</button>
      <button id="helpBtn">Help</button>
      <button id="findBtn">Find</button>
      <button id="replaceBtn">Replace</button>
      <button id="saveBtn">Save</button>
      <button id="downloadEditedBtn">Download Edited</button>
      <select id="themeSelect" style="max-width:130px;">
        <option value="default">Default</option>
        <option value="material">Material</option>
      </select>
      <span class="msg" id="editorMsg"></span>
    </div>
    <textarea id="codeEditor" class="code-box"></textarea>
  `;

  const editor = wrap.querySelector('#codeEditor');
  const focusEditorBtn = wrap.querySelector('#focusEditorBtn');
  const restoreLayoutBtn = wrap.querySelector('#restoreLayoutBtn');
  const helpBtn = wrap.querySelector('#helpBtn');
  const findBtn = wrap.querySelector('#findBtn');
  const replaceBtn = wrap.querySelector('#replaceBtn');
  const saveBtn = wrap.querySelector('#saveBtn');
  const downloadEditedBtn = wrap.querySelector('#downloadEditedBtn');
  const themeSelect = wrap.querySelector('#themeSelect');
  const editorMsg = wrap.querySelector('#editorMsg');
  let editorMsgTimer = null;
  const modeMap = {
    javascript: 'javascript',
    typescript: 'text/x-typescript',
    python: 'python',
    bash: 'shell',
    json: 'application/json',
    yaml: 'yaml',
    sql: 'text/x-sql',
    markdown: 'markdown',
    markup: 'xml',
    css: 'css',
    none: null
  };
  const cmMode = modeMap[language] ?? null;

  editor.value = content;
  const cm = CodeMirror.fromTextArea(editor, {
    lineNumbers: true,
    mode: cmMode,
    theme: editorTheme,
    lineWrapping: false,
    viewportMargin: Infinity,
    styleActiveLine: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    extraKeys: {
      'Ctrl-Space': 'autocomplete',
      'Cmd-Space': 'autocomplete',
      'Ctrl-F': 'findPersistent',
      'Cmd-F': 'findPersistent',
      'Ctrl-H': 'replace',
      'Cmd-Alt-F': 'replace'
    }
  });

  const sizeEditor = () => {
    const controlsHeight = wrap.querySelector('.smart-controls').offsetHeight || 0;
    const availableHeight = Math.max(220, previewContainer.clientHeight - controlsHeight - 10);
    cm.setSize('100%', availableHeight);
  };

  sizeEditor();
  activeCodeMirror = cm;
  activeEditorSizer = sizeEditor;
  themeSelect.value = editorTheme;
  showEditorAlert = (text) => {
    if (editorMsgTimer) {
      clearTimeout(editorMsgTimer);
      editorMsgTimer = null;
    }
    editorMsg.textContent = text;
    editorMsg.classList.add('error');
    editorMsgTimer = setTimeout(() => {
      editorMsg.textContent = '';
      editorMsg.classList.remove('error');
      editorMsgTimer = null;
    }, 3000);
  };

  const refreshEditor = () => {
    if (!activeCodeMirror) return;
    requestAnimationFrame(() => {
      if (!activeCodeMirror) return;
      activeCodeMirror.refresh();
    });
  };

  refreshEditor();
  setTimeout(refreshEditor, 0);
  setTimeout(refreshEditor, 50);
  setTimeout(sizeEditor, 0);

  focusEditorBtn.onclick = () => setEditorFocus(true);
  restoreLayoutBtn.onclick = () => setEditorFocus(false);
  helpBtn.onclick = () => openHelpModal();
  findBtn.onclick = () => cm.execCommand('findPersistent');

  replaceBtn.onclick = () => {
    cm.execCommand('replace');
  };

  themeSelect.onchange = () => {
    editorTheme = themeSelect.value;
    localStorage.setItem(EDITOR_THEME_KEY, editorTheme);
    cm.setOption('theme', editorTheme);
    refreshEditor();
  };

  const saveFile = async () => {
    if (!activePreviewItem) return;
    try {
      if (editorMsgTimer) {
        clearTimeout(editorMsgTimer);
        editorMsgTimer = null;
      }
      editorMsg.textContent = '';
      editorMsg.classList.remove('error');
      const res = await fetch('/api/fs/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root,
          relPath: activePreviewItem.relPath,
          content: cm.getValue()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Save failed');
      }

      editorMsg.textContent = 'Saved.';
      editorMsg.classList.add('error');
      isEditorDirty = false;
      openedFileMtime = data.mtime || openedFileMtime;
      openedServerContent = activeCodeMirror ? activeCodeMirror.getValue() : openedServerContent;
      latestServerSnapshot = null;
      conflictActive = false;
      fmConflictOverlay.classList.add('hidden');
      startDirtyWatch();
      editorMsgTimer = setTimeout(() => {
        editorMsg.textContent = '';
        editorMsg.classList.remove('error');
        editorMsgTimer = null;
      }, 3000);
      await loadList(currentRelPath);
    } catch (err) {
      editorMsg.classList.add('error');
      editorMsg.textContent = err.message;
    }
  };

  saveBtn.onclick = saveFile;
  cm.addKeyMap({
    'Ctrl-S': () => saveFile(),
    'Cmd-S': () => saveFile()
  });
  cm.on('change', () => {
    isEditorDirty = true;
    startDirtyWatch();
  });

  downloadEditedBtn.onclick = () => {
    const name = activePreviewItem ? activePreviewItem.name : 'edited.txt';
    const blob = new Blob([cm.getValue()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return wrap;
}

async function previewFile(item) {
  const url = `/api/fs/preview?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(item.relPath)}`;
  const data = await apiJson(url);

  previewTitle.textContent = `${item.name} (${item.mime || ''})`;
  previewContainer.innerHTML = '';
  activePreviewItem = item;
  activeCodeMirror = null;
  activeEditorSizer = null;
  isEditorDirty = false;
  openedFileMtime = item.mtime || null;
  openedServerContent = null;
  latestServerSnapshot = null;
  conflictActive = false;
  showEditorAlert = null;
  fmConflictOverlay.classList.add('hidden');
  fmDiffOverlay.classList.add('hidden');
  stopDirtyWatch();

  if (data.type === 'image') {
    const img = document.createElement('img');
    img.className = 'preview-img';
    img.src = `/api/fs/download-file?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(item.relPath)}`;
    previewContainer.appendChild(img);
    return;
  }

  if (data.type === 'csv') {
    previewContainer.appendChild(buildCsvPreview(data.columns, data.rows));
    return;
  }

  openedServerContent = data.content || '';
  previewContainer.appendChild(buildCodePreview(data.content || '', data.language || 'none'));
  startDirtyWatch();
}

setRootBtn.onclick = async () => {
  if (!(await confirmDiscardDirtyChanges())) return;
  root = rootInput.value.trim();
  if (!root) return;
  localStorage.setItem(ROOT_KEY, root);
  syncOut.textContent = '';
  previewTitle.textContent = 'No file selected';
  previewContainer.innerHTML = '';
  activePreviewItem = null;
  activeEditorSizer = null;
  isEditorDirty = false;
  openedFileMtime = null;
  openedServerContent = null;
  latestServerSnapshot = null;
  conflictActive = false;
  showEditorAlert = null;
  stopDirtyWatch();
  await loadTree('');
  await loadList('');
};

refreshTreeBtn.onclick = () => loadTree(currentRelPath);

upBtn.onclick = async () => {
  if (!(await confirmDiscardDirtyChanges())) return;
  if (!currentRelPath) return;
  const parent = currentRelPath.split('/').slice(0, -1).join('/');
  await loadList(parent);
  await loadTree(parent);
};

newFileBtn.onclick = async () => {
  const name = await promptModal('New File', 'Enter new file name', '');
  if (!name) return;
  try {
    await postJson('/api/fs/create-file', { root, relPath: currentRelPath, name, content: '' });
    await refreshCurrentView();
  } catch (err) {
    alert(err.message);
  }
};

newFolderBtn.onclick = async () => {
  const name = await promptModal('New Folder', 'Enter new folder name', '');
  if (!name) return;
  try {
    await postJson('/api/fs/create-folder', { root, relPath: currentRelPath, name });
    await refreshCurrentView();
  } catch (err) {
    alert(err.message);
  }
};

downloadFolderBtn.onclick = () => {
  const url = `/api/fs/download-folder?root=${encodeURIComponent(root)}&relPath=${encodeURIComponent(currentRelPath)}`;
  window.location.href = url;
};

uploadBtn.onclick = async () => {
  try {
    uploadMsg.classList.remove('error');
    const files = uploadInput.files;
    if (!files || files.length === 0) {
      uploadMsg.textContent = 'Select one or more files first.';
      return;
    }

    const form = new FormData();
    form.append('root', root);
    form.append('relPath', currentRelPath);
    for (const file of files) {
      form.append('files', file);
    }

    const res = await fetch('/api/fs/upload', {
      method: 'POST',
      body: form
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    uploadMsg.textContent = `Uploaded: ${data.saved.join(', ')}`;
    await loadList(currentRelPath);
  } catch (err) {
    uploadMsg.classList.add('error');
    uploadMsg.textContent = err.message;
  }
};

syncBtn.onclick = async () => {
  try {
    const data = await apiJson('/api/fs/sync-commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root, relPath: currentRelPath })
    });

    syncOut.textContent = [
      `Target folder: ${data.target}`,
      '',
      `1) unison command:`,
      data.unison,
      '',
      `2) cp command:`,
      data.cp,
      '',
      `3) sync command:`,
      data.sync
    ].join('\n');
  } catch (err) {
    syncOut.textContent = err.message;
  }
};

fmConflictLoadBtn.onclick = async () => {
  if (!activeCodeMirror) return;
  try {
    const snap = latestServerSnapshot || await fetchServerTextSnapshot();
    if (!snap) return;
    activeCodeMirror.setValue(snap.content || '');
    isEditorDirty = false;
    openedFileMtime = snap.mtime || openedFileMtime;
    openedServerContent = snap.content || '';
    latestServerSnapshot = null;
    conflictActive = false;
    fmConflictOverlay.classList.add('hidden');
    if (winMergeDiff) winMergeDiff.close();
    stopDirtyWatch();
  } catch (err) {
    alert(err.message || 'Failed to load server file');
  }
};

fmConflictDiffBtn.onclick = async () => {
  try {
    const snap = latestServerSnapshot || await fetchServerTextSnapshot();
    if (!snap || !activeCodeMirror) return;
    latestServerSnapshot = snap;
    fmConflictOverlay.classList.add('hidden');
    const diffModule = await ensureWinMergeDiff();
    setDiffMode('conflict');
    diffModule.open({
      leftText: activeCodeMirror.getValue(),
      rightText: snap.content || '',
      onApplyLeft: (mergedLocal) => {
        if (activeCodeMirror) {
          activeCodeMirror.setValue(mergedLocal);
          isEditorDirty = true;
          startDirtyWatch();
        }
      },
      onApplyRight: (mergedServer) => {
        if (activeCodeMirror) {
          activeCodeMirror.setValue(mergedServer);
          isEditorDirty = true;
          startDirtyWatch();
        }
      },
      onClose: () => {
        if (latestServerSnapshot) {
          openedFileMtime = latestServerSnapshot.mtime || openedFileMtime;
          openedServerContent = latestServerSnapshot.content || openedServerContent;
        }
        setDiffMode('conflict');
        conflictActive = false;
      }
    });
  } catch (err) {
    alert(err.message || 'Failed to build diff');
  }
};

fmDiffSaveBtn.onclick = async () => {
  try {
    if (!winMergeDiff) return;
    const merged = winMergeDiff.getLeft();

    if (diffMode === 'compare') {
      if (!diffCompareLeftRelPath) return;
      await postJson('/api/fs/save-file', {
        root,
        relPath: diffCompareLeftRelPath,
        content: merged
      });
      uploadMsg.classList.remove('error');
      uploadMsg.textContent = `Saved left file: ${diffCompareLeftRelPath}`;
      await refreshCurrentView();
      return;
    }

    if (!activePreviewItem) return;
    const data = await postJson('/api/fs/save-file', {
      root,
      relPath: activePreviewItem.relPath,
      content: merged
    });

    if (activeCodeMirror) {
      activeCodeMirror.setValue(merged);
    }
    isEditorDirty = false;
    openedFileMtime = data.mtime || openedFileMtime;
    openedServerContent = merged;
    latestServerSnapshot = null;
    conflictActive = false;
    stopDirtyWatch();
    winMergeDiff.close();
    await loadList(currentRelPath);
  } catch (err) {
    alert(err.message || 'Failed to save merged content');
  }
};

fmDiffDropBtn.onclick = () => {
  if (!winMergeDiff) return;
  const rightText = winMergeDiff.getRight();

  if (diffMode === 'compare') {
    if (!diffCompareRightRelPath) return;
    postJson('/api/fs/save-file', {
      root,
      relPath: diffCompareRightRelPath,
      content: rightText
    }).then(async () => {
      uploadMsg.classList.remove('error');
      uploadMsg.textContent = `Saved right file: ${diffCompareRightRelPath}`;
      await refreshCurrentView();
    }).catch((err) => {
      alert(err.message || 'Failed to save right file');
    });
    return;
  }

  if (activeCodeMirror) {
    activeCodeMirror.setValue(rightText);
  }
  isEditorDirty = false;
  if (latestServerSnapshot) {
    openedFileMtime = latestServerSnapshot.mtime || openedFileMtime;
    openedServerContent = latestServerSnapshot.content || rightText;
  } else {
    openedServerContent = rightText;
  }
  latestServerSnapshot = null;
  conflictActive = false;
  stopDirtyWatch();
  winMergeDiff.close();
};

fmModalCancelBtn.onclick = () => closeModal(null);
fmModalOkBtn.onclick = () => {
  if (fmModalInput.style.display === 'none') closeModal(true);
  else closeModal(fmModalInput.value);
};

fmModalOverlay.onclick = (ev) => {
  if (ev.target === fmModalOverlay) closeModal(null);
};
fmHelpOverlay.onclick = (ev) => {
  if (ev.target === fmHelpOverlay) closeHelpModal();
};
fmHelpCloseBtn.onclick = () => closeHelpModal();
fmConflictOverlay.onclick = (ev) => {
  if (ev.target === fmConflictOverlay) {
    fmConflictOverlay.classList.add('hidden');
    conflictActive = false;
  }
};
fmDiffOverlay.onclick = (ev) => {
  if (ev.target === fmDiffOverlay && winMergeDiff) winMergeDiff.close();
};

fmModalInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    closeModal(fmModalInput.value);
  } else if (ev.key === 'Escape') {
    ev.preventDefault();
    closeModal(null);
  }
});

window.addEventListener('beforeunload', (ev) => {
  if (!isEditorDirty) return;
  ev.preventDefault();
  ev.returnValue = '';
});

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!fmModalOverlay.classList.contains('hidden')) {
    ev.preventDefault();
    closeModal(null);
    return;
  }
  if (!fmHelpOverlay.classList.contains('hidden')) {
    ev.preventDefault();
    closeHelpModal();
    return;
  }
  if (!fmDiffOverlay.classList.contains('hidden')) {
    ev.preventDefault();
    if (winMergeDiff) winMergeDiff.close();
    return;
  }
  if (!fmConflictOverlay.classList.contains('hidden')) {
    ev.preventDefault();
    fmConflictOverlay.classList.add('hidden');
    conflictActive = false;
  }
});

(async function init() {
  try {
    readLayout();
    applyLayout();
    initPaneResize();
    window.addEventListener('resize', () => {
      applyLayout();
      if (activeEditorSizer) {
        requestAnimationFrame(activeEditorSizer);
      }
    });
    await loadTree('');
    await loadList('');
  } catch (err) {
    treeEl.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
})();
