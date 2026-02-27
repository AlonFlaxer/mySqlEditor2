const connectModal = new bootstrap.Modal(document.getElementById('connectModal'));
const pasteModal = new bootstrap.Modal(document.getElementById('pasteModal'));
const historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
const builderModal = new bootstrap.Modal(document.getElementById('builderModal'));
const jsonModal = new bootstrap.Modal(document.getElementById('jsonModal'));

const connectionsList = document.getElementById('connectionsList');
const connectionSelect = document.getElementById('connectionSelect');
const treeView = document.getElementById('treeView');
const sqlInput = document.getElementById('sqlInput');
const resultTable = document.getElementById('resultTable');
const tableContextMenu = document.getElementById('tableContextMenu');

const form = document.getElementById('connectionForm');
const connId = document.getElementById('connId');
const connName = document.getElementById('connName');
const connType = document.getElementById('connType');
const connHost = document.getElementById('connHost');
const connPort = document.getElementById('connPort');
const connDb = document.getElementById('connDb');
const connUser = document.getElementById('connUser');
const connPass = document.getElementById('connPass');
const connFile = document.getElementById('connFile');
const connProd = document.getElementById('connProd');
const queryTabs = document.getElementById('queryTabs');
const historyList = document.getElementById('historyList');
const statusLine = document.getElementById('statusLine');
const pasteArea = document.getElementById('pasteArea');
const pastePreview = document.getElementById('pastePreview');
const pasteResult = document.getElementById('pasteResult');
const copyPastePathBtn = document.getElementById('copyPastePathBtn');
const pasteHint = document.getElementById('pasteHint');
const workspace = document.querySelector('.workspace');
const commandPane = document.querySelector('.command-pane');
const commandBody = commandPane.querySelector('.command-body');
const paneSplitter = document.getElementById('paneSplitter');
const toggleSchemaBtn = document.getElementById('toggleSchemaBtn');
const toggleSchemaTopBtn = document.getElementById('toggleSchemaTopBtn');
const resultViews = document.getElementById('resultViews');
const resultControls = document.getElementById('resultControls');
const restoreCommandBtn = document.getElementById('restoreCommandBtn');
const splashLogo = document.getElementById('splashLogo');
const brandLogo = document.querySelector('.brand-logo');
const jsonModalBody = document.getElementById('jsonModalBody');
const jsonDecodeBtn = document.getElementById('jsonDecodeBtn');
let jsonModalRaw = '';
const autocompleteBox = document.createElement('div');
autocompleteBox.className = 'sql-autocomplete';
commandPane.appendChild(autocompleteBox);
const findReplaceBar = document.createElement('div');
findReplaceBar.className = 'sql-find-replace';
findReplaceBar.innerHTML = `
  <input type="text" class="form-control form-control-sm sql-find-input" placeholder="Find" />
  <input type="text" class="form-control form-control-sm sql-replace-input" placeholder="Replace" />
  <button type="button" class="btn btn-outline-light btn-sm sql-find-next-btn">Next</button>
  <button type="button" class="btn btn-outline-secondary btn-sm sql-find-prev-btn">Prev</button>
  <button type="button" class="btn btn-outline-light btn-sm sql-replace-btn">Replace</button>
  <button type="button" class="btn btn-outline-light btn-sm sql-replace-all-btn">Replace All</button>
  <button type="button" class="btn btn-outline-secondary btn-sm sql-find-close-btn" title="Close">X</button>
`;
commandBody.insertBefore(findReplaceBar, sqlInput);
const findInput = findReplaceBar.querySelector('.sql-find-input');
const replaceInput = findReplaceBar.querySelector('.sql-replace-input');
const findNextBtn = findReplaceBar.querySelector('.sql-find-next-btn');
const findPrevBtn = findReplaceBar.querySelector('.sql-find-prev-btn');
const replaceBtn = findReplaceBar.querySelector('.sql-replace-btn');
const replaceAllBtn = findReplaceBar.querySelector('.sql-replace-all-btn');
const findCloseBtn = findReplaceBar.querySelector('.sql-find-close-btn');
const autocompleteMirror = document.createElement('div');
autocompleteMirror.style.position = 'absolute';
autocompleteMirror.style.visibility = 'hidden';
autocompleteMirror.style.whiteSpace = 'pre-wrap';
autocompleteMirror.style.wordWrap = 'break-word';
autocompleteMirror.style.top = '0';
autocompleteMirror.style.left = '-9999px';
document.body.appendChild(autocompleteMirror);

let lastResult = { columns: [], rows: [] };
let currentView = 'table';
let smartState = {
  page: 1,
  pageSize: 20,
  search: '',
  sorts: []
};
let tableState = {
  sorts: []
};
let tableDiff = {
  compareId: ''
};
let smartSearchInput = null;
let smartSearchBtn = null;

const SCHEMA_HIDDEN_KEY = 'schema_hidden';

let connections = [];
let activeId = '';
let tabs = [];
let activeTabId = '';
let history = [];
let resultHistory = [];
const ACTIVE_CONNECTION_KEY = 'sql_editor_active_connection';
let schemaIndex = { tables: new Map(), simple: new Map() };
let autocomplete = {
  open: false,
  items: [],
  activeIndex: 0,
  start: 0,
  end: 0
};
let showReplaceControls = false;
let builderState = {
  tables: new Map(),
  links: [],
  activeColumn: null,
  dragging: null
};

const TABS_KEY = 'sql_editor_tabs';
const HISTORY_KEY = 'sql_editor_history';
const RESULT_HISTORY_KEY = 'sql_editor_result_history';

document.getElementById('connectBtn').addEventListener('click', () => {
  connectModal.show();
  loadConnections();
});

document.getElementById('historyBtn').addEventListener('click', () => {
  historyModal.show();
});

const builderBtn = document.getElementById('builderBtn');
const builderCanvas = document.getElementById('builderCanvas');
const builderLinks = document.getElementById('builderLinks');
const builderTableSelect = document.getElementById('builderTableSelect');
const builderAddBtn = document.getElementById('builderAddBtn');
const builderClearBtn = document.getElementById('builderClearBtn');
const builderApplyBtn = document.getElementById('builderApplyBtn');
const builderSql = document.getElementById('builderSql');

if (builderBtn) {
  builderBtn.addEventListener('click', () => {
    openBuilderFromSql();
    builderModal.show();
  });
}

if (builderAddBtn) {
  builderAddBtn.addEventListener('click', () => {
    const name = builderTableSelect.value;
    if (!name) return;
    addBuilderTable(name);
    updateBuilderSql();
  });
}

if (builderClearBtn) {
  builderClearBtn.addEventListener('click', () => {
    resetBuilder();
    updateBuilderSql();
  });
}

if (builderApplyBtn) {
  builderApplyBtn.addEventListener('click', () => {
    if (!builderSql) return;
    sqlInput.value = builderSql.value;
    syncActiveTab();
    builderModal.hide();
  });
}

if (builderSql) {
builderSql.addEventListener('input', () => {
  parseSqlToBuilder(builderSql.value);
});
}


document.getElementById('pasteImageBtn').addEventListener('click', () => {
  pastePreview.innerHTML = '';
  pasteResult.value = '';
  pasteHint.textContent = '';
  pasteHint.classList.remove('error');
  pasteModal.show();
  fetch('/api/paste-image/cleanup', { method: 'POST' }).catch(() => {});
  setTimeout(() => pasteArea.focus(), 0);
});

function runSplashIntro() {
  if (!splashLogo) return;
  const splashImg = splashLogo.querySelector('img');
  if (!splashImg || !brandLogo) return;

  requestAnimationFrame(() => {
    const splashRect = splashImg.getBoundingClientRect();
    const brandRect = brandLogo.getBoundingClientRect();

    const splashCenterX = splashRect.left + splashRect.width / 2;
    const splashCenterY = splashRect.top + splashRect.height / 2;
    const brandCenterX = brandRect.left + brandRect.width / 2;
    const brandCenterY = brandRect.top + brandRect.height / 2;

    const dx = brandCenterX - splashCenterX;
    const dy = brandCenterY - splashCenterY;
    const scale = brandRect.height / splashRect.height;

    splashImg.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
    splashLogo.classList.add('splash-exit');

    setTimeout(() => {
      splashLogo.classList.add('splash-hide');
      setTimeout(() => {
        splashLogo.classList.add('splash-hidden');
      }, 550);
    }, 950);
  });
}

function setSchemaHidden(hidden) {
  document.body.classList.toggle('schema-hidden', hidden);
  if (toggleSchemaBtn) toggleSchemaBtn.textContent = hidden ? 'Show' : 'Hide';
  if (toggleSchemaTopBtn) toggleSchemaTopBtn.textContent = '';
  localStorage.setItem(SCHEMA_HIDDEN_KEY, hidden ? '1' : '0');
}

if (toggleSchemaBtn) {
  toggleSchemaBtn.addEventListener('click', () => {
    setSchemaHidden(!document.body.classList.contains('schema-hidden'));
  });
}

if (toggleSchemaTopBtn) {
  toggleSchemaTopBtn.addEventListener('click', () => {
    setSchemaHidden(false);
  });
}

copyPastePathBtn.addEventListener('click', async () => {
  if (!pasteResult.value) return;
  const safePath = addSpaceBeforeExtension(pasteResult.value);
  try {
    if (navigator.clipboard && navigator.clipboard.write) {
      const blob = new Blob([safePath], { type: 'text/plain' });
      const item = new ClipboardItem({ 'text/plain': blob });
      await navigator.clipboard.write([item]);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(safePath);
    } else {
      throw new Error('Clipboard API not available');
    }
    copyPastePathBtn.textContent = 'Copied';
    pasteHint.textContent = 'Copied as safe text (space before extension).';
    pasteHint.classList.remove('error');
    setTimeout(() => (copyPastePathBtn.textContent = 'Copy'), 1200);
  } catch (err) {
    const ok = fallbackCopy(pasteResult);
    copyPastePathBtn.textContent = ok ? 'Copied' : 'Failed';
    pasteHint.textContent = ok
      ? 'Copied as safe text (space before extension).'
      : 'Copy blocked. Click the input, press Ctrl+C, then paste.';
    pasteHint.classList.toggle('error', !ok);
    setTimeout(() => (copyPastePathBtn.textContent = 'Copy'), 1200);
  }
});

document.getElementById('runBtn').addEventListener('click', runSql);

document.getElementById('clearBtn').addEventListener('click', () => {
  sqlInput.value = '';
});

document.getElementById('newConnBtn').addEventListener('click', resetForm);
document.getElementById('newTabBtn').addEventListener('click', createNewTab);
sqlInput.addEventListener('input', syncActiveTab);
sqlInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    openFindReplace(false);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    openFindReplace(true);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    openFindReplace(true);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runSql();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
    e.preventDefault();
    deleteWordLeft();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
    e.preventDefault();
    openAutocomplete();
  } else if (autocomplete.open) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveAutocomplete(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveAutocomplete(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      acceptAutocomplete();
    } else if (e.key === ' ') {
      e.preventDefault();
      acceptAutocomplete();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAutocomplete();
    }
  }
});

function openFindReplace(withReplace) {
  showReplaceControls = !!withReplace;
  findReplaceBar.classList.add('open');
  findReplaceBar.classList.toggle('replace-mode', showReplaceControls);
  if (showReplaceControls) {
    replaceInput.value = replaceInput.value || '';
  }
  findInput.focus();
  findInput.select();
}

function closeFindReplace() {
  findReplaceBar.classList.remove('open');
  findReplaceBar.classList.remove('replace-mode');
  sqlInput.focus();
}

function findMatch(query, start, backwards = false) {
  if (!query) return -1;
  const text = sqlInput.value;
  if (!text) return -1;
  if (backwards) {
    const before = text.lastIndexOf(query, Math.max(start, 0));
    if (before !== -1) return before;
    return text.lastIndexOf(query);
  }
  const after = text.indexOf(query, Math.max(start, 0));
  if (after !== -1) return after;
  return text.indexOf(query);
}

function selectMatchAt(index, length) {
  sqlInput.focus();
  sqlInput.setSelectionRange(index, index + length);
}

function applyTextEdit(start, end, replacement, selectMode = 'end') {
  sqlInput.focus();
  sqlInput.setSelectionRange(start, end);

  let usedNativeUndo = false;
  if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
    usedNativeUndo = document.execCommand('insertText', false, replacement);
  }

  if (!usedNativeUndo) {
    sqlInput.setRangeText(replacement, start, end, selectMode);
    sqlInput.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Normalize selection behavior across browsers when native insertText is used.
  const replacementEnd = start + replacement.length;
  if (selectMode === 'select') {
    sqlInput.setSelectionRange(start, replacementEnd);
  } else if (selectMode === 'start') {
    sqlInput.setSelectionRange(start, start);
  } else if (selectMode === 'preserve') {
    sqlInput.setSelectionRange(start, replacementEnd);
  } else {
    sqlInput.setSelectionRange(replacementEnd, replacementEnd);
  }
}

function findNext(backwards = false) {
  const query = findInput.value;
  if (!query) {
    setStatus('Enter text to find.', true);
    return false;
  }
  const selStart = sqlInput.selectionStart ?? 0;
  const selEnd = sqlInput.selectionEnd ?? 0;
  const isCurrentMatchSelected = selStart !== selEnd && sqlInput.value.slice(selStart, selEnd) === query;
  const start = backwards
    ? selStart - 1
    : (isCurrentMatchSelected ? selEnd : selStart);
  const idx = findMatch(query, start, backwards);
  if (idx === -1) {
    setStatus('No matches found.', true);
    return false;
  }
  selectMatchAt(idx, query.length);
  return true;
}

function selectionMatches(query) {
  const start = sqlInput.selectionStart ?? 0;
  const end = sqlInput.selectionEnd ?? 0;
  if (start === end) return false;
  return sqlInput.value.slice(start, end) === query;
}

function replaceCurrent() {
  const query = findInput.value;
  if (!query) {
    setStatus('Enter text to find.', true);
    return;
  }
  if (!selectionMatches(query) && !findNext(false)) return;
  const start = sqlInput.selectionStart ?? 0;
  const end = sqlInput.selectionEnd ?? 0;
  const replacement = replaceInput.value;
  applyTextEdit(start, end, replacement, 'select');
}

function replaceAllMatches() {
  const query = findInput.value;
  if (!query) {
    setStatus('Enter text to find.', true);
    return;
  }
  const text = sqlInput.value;
  if (!text.includes(query)) {
    setStatus('No matches found.', true);
    return;
  }
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(query, idx)) !== -1) {
    count += 1;
    idx += query.length;
  }
  const replaced = text.split(query).join(replaceInput.value);
  applyTextEdit(0, text.length, replaced, 'end');
  setStatus(`Replaced ${count} match${count === 1 ? '' : 'es'}.`);
}

findNextBtn.addEventListener('click', () => findNext(false));
findPrevBtn.addEventListener('click', () => findNext(true));
replaceBtn.addEventListener('click', replaceCurrent);
replaceAllBtn.addEventListener('click', replaceAllMatches);
findCloseBtn.addEventListener('click', closeFindReplace);

findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    findNext(e.shiftKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeFindReplace();
  }
});

replaceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    replaceCurrent();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeFindReplace();
  }
});

function deleteWordLeft() {
  const start = sqlInput.selectionStart ?? 0;
  const end = sqlInput.selectionEnd ?? 0;
  sqlInput.focus();
  if (start !== end) {
    sqlInput.setSelectionRange(start, end);
    if (document.queryCommandSupported && document.queryCommandSupported('delete')) {
      const ok = document.execCommand('delete');
      if (ok) {
        syncActiveTab();
        return;
      }
    }
    sqlInput.value = sqlInput.value.slice(0, start) + sqlInput.value.slice(end);
    sqlInput.setSelectionRange(start, start);
    sqlInput.dispatchEvent(new Event('input', { bubbles: true }));
    syncActiveTab();
    return;
  }
  let i = start;
  while (i > 0 && /\s/.test(sqlInput.value[i - 1])) i -= 1;
  while (i > 0 && /[^\s]/.test(sqlInput.value[i - 1])) i -= 1;
  sqlInput.setSelectionRange(i, start);
  if (document.queryCommandSupported && document.queryCommandSupported('delete')) {
    const ok = document.execCommand('delete');
    if (ok) {
      syncActiveTab();
      return;
    }
  }
  sqlInput.value = sqlInput.value.slice(0, i) + sqlInput.value.slice(start);
  sqlInput.setSelectionRange(i, i);
  sqlInput.dispatchEvent(new Event('input', { bubbles: true }));
  syncActiveTab();
}

sqlInput.addEventListener('input', () => {
  if (autocomplete.open) openAutocomplete();
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && commandPane.contains(document.activeElement)) {
    e.preventDefault();
    openFindReplace(false);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h' && commandPane.contains(document.activeElement)) {
    e.preventDefault();
    openFindReplace(true);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'h' && commandPane.contains(document.activeElement)) {
    e.preventDefault();
    openFindReplace(true);
    return;
  }
  if (e.key === 'F5') {
    e.preventDefault();
    runSql();
  }
});

document.addEventListener('click', (e) => {
  if (!autocomplete.open) return;
  if (!autocompleteBox.contains(e.target)) closeAutocomplete();
});

let isDraggingSplitter = false;
let startY = 0;
let startHeight = 0;
let lastCommandHeight = null;
const COMMAND_RESTORE_HEIGHT = 220;

function setCommandHeight(px) {
  const maxHeight = Math.max(200, workspace.clientHeight - 180);
  const clamped = Math.max(0, Math.min(px, maxHeight));
  document.documentElement.style.setProperty('--command-height', `${clamped}px`);
  checkCommandCollapse();
}

function shouldCollapseCommand() {
  const style = window.getComputedStyle(sqlInput);
  const lineHeight = parseFloat(style.lineHeight) || 18;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const minOneLine = lineHeight + paddingTop + paddingBottom + 4;
  return sqlInput.clientHeight < minOneLine;
}

function checkCommandCollapse() {
  if (document.body.classList.contains('command-collapsed')) return;
  if (!shouldCollapseCommand()) return;
  lastCommandHeight = commandPane.offsetHeight;
  document.body.classList.add('command-collapsed');
  if (restoreCommandBtn) restoreCommandBtn.style.display = 'inline-flex';
}

function restoreCommandPane() {
  document.body.classList.remove('command-collapsed');
  const target = Math.max(lastCommandHeight || COMMAND_RESTORE_HEIGHT, COMMAND_RESTORE_HEIGHT);
  setCommandHeight(target);
  if (restoreCommandBtn) restoreCommandBtn.style.display = 'none';
}

if (paneSplitter) {
  paneSplitter.addEventListener('mousedown', (e) => {
    isDraggingSplitter = true;
    startY = e.clientY;
    startHeight = commandPane.offsetHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });
}

window.addEventListener('mousemove', (e) => {
  if (!isDraggingSplitter) return;
  const delta = e.clientY - startY;
  setCommandHeight(startHeight + delta);
});

window.addEventListener('mouseup', () => {
  if (!isDraggingSplitter) return;
  isDraggingSplitter = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

if (restoreCommandBtn) {
  restoreCommandBtn.addEventListener('click', restoreCommandPane);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    id: connId.value || undefined,
    name: connName.value,
    type: connType.value,
    host: connHost.value,
    port: connPort.value,
    database: connDb.value,
    username: connUser.value,
    password: connPass.value,
    file: connFile.value,
    isProduction: !!connProd.checked
  };

  const res = await fetch('/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  await loadConnections();
  setActiveConnection(data.connection.id);
  fillForm(data.connection);
});

connectionSelect.addEventListener('change', () => {
  setActiveConnection(connectionSelect.value);
});

async function loadConnections() {
  setStatus('Loading connections...');
  const res = await fetch('/api/connections');
  const data = await res.json();
  connections = data.connections || [];

  renderConnectionsList();
  renderConnectionsSelect();

  if (!activeId && connections.length > 0) {
    const stored = localStorage.getItem(ACTIVE_CONNECTION_KEY);
    const found = stored && connections.find(c => c.id === stored);
    setActiveConnection(found ? found.id : connections[0].id);
  } else {
    loadSchema();
  }
  setStatus('Connections loaded.');
}

function renderConnectionsList() {
  connectionsList.innerHTML = '';
  if (connections.length === 0) {
    const item = document.createElement('li');
    item.className = 'list-group-item';
    item.textContent = 'No connections yet.';
    connectionsList.appendChild(item);
    return;
  }

  connections.forEach(conn => {
    const item = document.createElement('li');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    if (conn.id === activeId) item.classList.add('active');

    const label = document.createElement('div');
    label.innerHTML = `<strong>${conn.name}</strong><div class="text-muted small">${conn.type}</div>`;

    const actions = document.createElement('div');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-outline-light me-1';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => fillForm(conn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-outline-danger';
    delBtn.textContent = 'Del';
    delBtn.onclick = () => removeConnection(conn.id);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    item.appendChild(label);
    item.appendChild(actions);
    connectionsList.appendChild(item);
  });
}

function renderConnectionsSelect() {
  connectionSelect.innerHTML = '';
  if (connections.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No connections';
    connectionSelect.appendChild(option);
    return;
  }

  connections.forEach(conn => {
    const option = document.createElement('option');
    option.value = conn.id;
    option.textContent = `${conn.name} (${conn.type})`;
    if (conn.id === activeId) option.selected = true;
    connectionSelect.appendChild(option);
  });
}

function setActiveConnection(id) {
  activeId = id;
  if (activeId) {
    localStorage.setItem(ACTIVE_CONNECTION_KEY, activeId);
  }
  const activeConn = connections.find(c => c.id === activeId);
  document.body.classList.toggle('prod-connection', !!(activeConn && activeConn.isProduction));
  renderConnectionsSelect();
  loadSchema();
}

function fillForm(conn) {
  connId.value = conn.id || '';
  connName.value = conn.name || '';
  connType.value = conn.type || 'mysql';
  connHost.value = conn.host || '';
  connPort.value = conn.port || '';
  connDb.value = conn.database || '';
  connUser.value = conn.username || '';
  connPass.value = conn.password || '';
  connFile.value = conn.file || '';
  connProd.checked = !!conn.isProduction;
}

function resetForm() {
  connId.value = '';
  connName.value = '';
  connType.value = 'mysql';
  connHost.value = '';
  connPort.value = '';
  connDb.value = '';
  connUser.value = '';
  connPass.value = '';
  connFile.value = '';
  connProd.checked = false;
}

async function removeConnection(id) {
  setStatus('Removing connection...');
  await fetch(`/api/connections/${id}`, { method: 'DELETE' });
  if (id === activeId) {
    activeId = '';
    localStorage.removeItem(ACTIVE_CONNECTION_KEY);
  }
  await loadConnections();
  setStatus('Connection removed.');
}

async function loadSchema() {
  treeView.innerHTML = '<div class="tree-placeholder">Loading schema...</div>';
  if (!activeId) return;

  try {
    setStatus('Loading schema...');
    const res = await fetch(`/api/schema?connectionId=${encodeURIComponent(activeId)}`);
    const data = await res.json();
    if (data.error) {
      setStatus(`Schema error: ${data.error}`, true);
      treeView.innerHTML = `<div class="tree-placeholder error">Schema error: ${data.error}</div>`;
      return;
    }
    const schema = data.schema || [];
    if (schema.length === 0) {
      treeView.innerHTML = '<div class="tree-placeholder">No schema found.</div>';
      setStatus('Schema loaded (empty).');
      return;
    }

    schemaIndex = buildSchemaIndex(schema);
    const rootList = document.createElement('ul');
    schema.forEach(node => renderNode(node, rootList));
    treeView.innerHTML = '';
    treeView.appendChild(rootList);
    setStatus('Schema loaded.');
  } catch (err) {
    setStatus(`Schema error: ${err.message}`, true);
    treeView.innerHTML = `<div class="tree-placeholder error">Schema error: ${err.message}</div>`;
  }
}

function renderNode(node, parent, level = 0) {
  const li = document.createElement('li');
  const hasChildren = node.children && node.children.length;
  const isCollapsed = hasChildren && level <= 1;
  li.className = isCollapsed ? 'tree-collapsed' : '';
  const row = document.createElement('div');
  row.className = 'tree-item';
  if (node.type === 'table') {
    row.classList.add('is-table');
  }

  if (hasChildren) {
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = isCollapsed ? '+' : '−';
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'tree-toggle';
    spacer.textContent = '•';
    row.appendChild(spacer);
  }

  const badge = document.createElement('span');
  badge.className = 'tree-badge';
  badge.textContent = node.type === 'table' || node.type === 'schema' ? '' : node.type;
  row.appendChild(badge);

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.name;

  row.appendChild(label);
  li.appendChild(row);

  if (node.type === 'table') {
    row.dataset.table = node.name;
    row.dataset.fields = JSON.stringify((node.children || []).map(c => c.name));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTableMenu(e.clientX, e.clientY, row.dataset.table, row.dataset.fields);
    });
  }

  if (hasChildren) {
    const childList = document.createElement('ul');
    childList.className = 'tree-children';
    node.children.forEach(child => renderNode(child, childList, level + 1));
    li.appendChild(childList);

    row.addEventListener('click', () => {
      const collapsed = li.classList.toggle('tree-collapsed');
      const toggle = row.querySelector('.tree-toggle');
      if (toggle) toggle.textContent = collapsed ? '+' : '−';
    });
  }

  parent.appendChild(li);
}

function buildSchemaIndex(schema) {
  const tables = new Map();
  const simple = new Map();

  schema.forEach(schemaNode => {
    if (schemaNode.type === 'schema') {
      (schemaNode.children || []).forEach(tableNode => {
        if (tableNode.type !== 'table') return;
        const fullName = `${schemaNode.name}.${tableNode.name}`;
        const key = fullName.toLowerCase();
        tables.set(key, { name: fullName, columns: (tableNode.children || []).map(c => c.name) });
        const simpleKey = tableNode.name.toLowerCase();
        if (!simple.has(simpleKey)) {
          simple.set(simpleKey, key);
        } else {
          simple.set(simpleKey, null);
        }
      });
    } else if (schemaNode.type === 'table') {
      const key = schemaNode.name.toLowerCase();
      tables.set(key, { name: schemaNode.name, columns: (schemaNode.children || []).map(c => c.name) });
      const simpleKey = schemaNode.name.toLowerCase();
      if (!simple.has(simpleKey)) {
        simple.set(simpleKey, key);
      } else {
        simple.set(simpleKey, null);
      }
    }
  });

  return { tables, simple };
}

function normalizeIdent(raw) {
  return raw.replace(/[`"\[\]]/g, '');
}

function resolveTableKey(name) {
  if (!name) return null;
  const cleaned = normalizeIdent(name).toLowerCase();
  if (schemaIndex.tables.has(cleaned)) return cleaned;
  if (schemaIndex.simple.has(cleaned)) {
    return schemaIndex.simple.get(cleaned);
  }
  const match = Array.from(schemaIndex.tables.keys()).find(key => key.endsWith(`.${cleaned}`));
  return match || null;
}

function parseTables(sqlText) {
  const aliasMap = new Map();
  const tables = new Set();
  const keywords = new Set([
    'where', 'join', 'left', 'right', 'inner', 'outer', 'full', 'cross',
    'on', 'group', 'order', 'limit', 'having', 'union', 'except', 'intersect',
    'offset'
  ]);
  const regex = /\b(from|join)\s+([`"\[]?[\w.]+[`"\]]?)(?:\s+(?:as\s+)?([`"\[]?[\w]+[`"\]]?))?/gi;
  let match;
  while ((match = regex.exec(sqlText)) !== null) {
    const tableName = match[2];
    const aliasRaw = match[3];
    const key = resolveTableKey(tableName);
    if (key) {
      tables.add(key);
      if (aliasRaw) {
        const aliasKey = normalizeIdent(aliasRaw).toLowerCase();
        if (!keywords.has(aliasKey)) {
          aliasMap.set(aliasKey, key);
        }
      }
    }
  }
  return { tables: Array.from(tables), aliasMap };
}

function getTokenAtCursor(value, cursor) {
  let start = cursor - 1;
  while (start >= 0 && /[\w.$]/.test(value[start])) start -= 1;
  start += 1;
  const token = value.slice(start, cursor);
  return { start, end: cursor, token };
}

function inFromJoinContext(textBeforeCursor) {
  const m = textBeforeCursor.match(/\b(from|join)\s+([\w.]*)$/i);
  return m ? m[2] : null;
}

function buildSuggestions(context) {
  const { token, tables, aliasMap, fromPrefix } = context;
  const lowerToken = token.toLowerCase();

  if (fromPrefix !== null) {
    const prefix = fromPrefix.toLowerCase();
    return Array.from(schemaIndex.tables.values())
      .map(t => t.name)
      .filter(name => name.toLowerCase().includes(prefix));
  }

  const dotIdx = lowerToken.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ident = lowerToken.slice(0, dotIdx);
    const tableKey = aliasMap.get(ident) || resolveTableKey(ident);
    if (tableKey && schemaIndex.tables.has(tableKey)) {
      const table = schemaIndex.tables.get(tableKey);
      const prefix = lowerToken.slice(dotIdx + 1);
      return table.columns
        .filter(col => col.toLowerCase().includes(prefix))
        .map(col => `${ident}.${col}`);
    }
  }

  if (aliasMap.has(lowerToken)) {
    const tableKey = aliasMap.get(lowerToken);
    const table = schemaIndex.tables.get(tableKey);
    if (table) {
      return table.columns.map(col => `${lowerToken}.${col}`);
    }
  }

  const suggestions = new Set();
  const tableKeys = tables.length ? tables : Array.from(schemaIndex.tables.keys());
  tableKeys.forEach(key => {
    const table = schemaIndex.tables.get(key);
    if (!table) return;
    const alias = Array.from(aliasMap.entries()).find(([, val]) => val === key);
    const prefix = alias ? alias[0] : table.name;
    table.columns.forEach(col => {
      const entry = `${prefix}.${col}`;
      if (!lowerToken || entry.toLowerCase().includes(lowerToken)) {
        suggestions.add(entry);
      }
    });
  });
  return Array.from(suggestions);
}

function positionAutocomplete() {
  const rect = sqlInput.getBoundingClientRect();
  const paneRect = commandPane.getBoundingClientRect();
  const caret = getCaretCoords(sqlInput);
  const left = rect.left - paneRect.left + caret.left;
  const top = rect.top - paneRect.top + caret.top + caret.height + 6;
  autocompleteBox.style.left = `${left}px`;
  autocompleteBox.style.top = `${top}px`;
}

function closeAutocomplete() {
  autocomplete.open = false;
  autocomplete.items = [];
  autocompleteBox.innerHTML = '';
  autocompleteBox.style.display = 'none';
}

function openAutocomplete() {
  const cursor = sqlInput.selectionStart ?? 0;
  const value = sqlInput.value;
  const tokenInfo = getTokenAtCursor(value, cursor);
  const beforeCursor = value.slice(0, cursor);
  const statementStart = beforeCursor.lastIndexOf(';') + 1;
  const statementEnd = value.indexOf(';', cursor);
  const currentStatement = value.slice(statementStart, statementEnd === -1 ? value.length : statementEnd);
  const { tables, aliasMap } = parseTables(currentStatement);
  const fromPrefix = inFromJoinContext(beforeCursor);
  const context = {
    token: tokenInfo.token,
    tables,
    aliasMap,
    fromPrefix
  };
  const items = buildSuggestions(context);
  autocomplete.items = items;
  autocomplete.activeIndex = 0;
  autocomplete.start = tokenInfo.start;
  autocomplete.end = tokenInfo.end;

  if (!items.length) {
    closeAutocomplete();
    return;
  }

  autocompleteBox.innerHTML = '';
  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'sql-autocomplete-item';
    if (idx === 0) row.classList.add('active');
    row.textContent = item;
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertAutocomplete(item);
    });
    autocompleteBox.appendChild(row);
  });
  positionAutocomplete();
  autocompleteBox.style.display = 'block';
  autocomplete.open = true;
}

function insertAutocomplete(value) {
  const start = autocomplete.start;
  const end = autocomplete.end;
  sqlInput.focus();
  sqlInput.setSelectionRange(start, end);
  let inserted = false;
  if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
    inserted = document.execCommand('insertText', false, value);
  }
  if (!inserted) {
    if (typeof sqlInput.setRangeText === 'function') {
      sqlInput.setRangeText(value, start, end, 'end');
    } else {
      const text = sqlInput.value;
      sqlInput.value = text.slice(0, start) + value + text.slice(end);
      const next = start + value.length;
      sqlInput.setSelectionRange(next, next);
    }
    sqlInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  syncActiveTab();
  closeAutocomplete();
}

function moveAutocomplete(delta) {
  if (!autocomplete.open) return;
  const count = autocomplete.items.length;
  if (!count) return;
  autocomplete.activeIndex = (autocomplete.activeIndex + delta + count) % count;
  Array.from(autocompleteBox.children).forEach((child, idx) => {
    child.classList.toggle('active', idx === autocomplete.activeIndex);
  });
  const active = autocompleteBox.children[autocomplete.activeIndex];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function acceptAutocomplete() {
  if (!autocomplete.open) return;
  const value = autocomplete.items[autocomplete.activeIndex];
  if (value) insertAutocomplete(value);
}

function parseJsonCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const startsOk = trimmed.startsWith('{') || trimmed.startsWith('[');
  const endsOk = trimmed.endsWith('}') || trimmed.endsWith(']');
  if (!startsOk || !endsOk) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    return null;
  }
}

function hasNestedJson(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(hasNestedJson);
  if (typeof value === 'object') {
    return Object.values(value).some(hasNestedJson);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch (err) {
        return false;
      }
    }
  }
  return false;
}

function decodeNestedJson(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(decodeNestedJson);
  if (typeof value === 'object') {
    const next = {};
    Object.keys(value).forEach(key => {
      next[key] = decodeNestedJson(value[key]);
    });
    return next;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return { __decoded__: true, value: decodeNestedJson(parsed) };
      } catch (err) {
        return value;
      }
    }
  }
  return value;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderJsonHtml(value, indent = 0) {
  if (value && typeof value === 'object' && value.__decoded__ && value.value !== undefined) {
    return `<span class="json-nested">${renderJsonHtml(value.value, indent)}</span>`;
  }
  const indentStr = '  '.repeat(indent);
  const nextIndent = '  '.repeat(indent + 1);

  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(item => `${nextIndent}${renderJsonHtml(item, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${indentStr}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const lines = keys.map(key => {
      const keyText = escapeHtml(JSON.stringify(key));
      const valText = renderJsonHtml(value[key], indent + 1);
      return `${nextIndent}${keyText}: ${valText}`;
    });
    return `{\n${lines.join(',\n')}\n${indentStr}}`;
  }
  if (typeof value === 'string') {
    return escapeHtml(JSON.stringify(value));
  }
  return String(value);
}

if (jsonDecodeBtn) {
  jsonDecodeBtn.addEventListener('click', () => {
    if (!jsonModalBody || !jsonModalRaw) return;
    try {
      const parsed = JSON.parse(jsonModalRaw);
      const decoded = decodeNestedJson(parsed);
      jsonModalBody.innerHTML = renderJsonHtml(decoded);
    } catch (err) {
      jsonModalBody.textContent = jsonModalRaw;
      jsonModalBody.classList.remove('decoded');
    }
  });
}

function resetBuilder() {
  builderState.tables.clear();
  builderState.links = [];
  builderState.activeColumn = null;
  builderState.dragging = null;
  if (builderCanvas) {
    builderCanvas.querySelectorAll('.builder-table').forEach(el => el.remove());
  }
  if (builderLinks) builderLinks.innerHTML = '';
}

function buildBuilderTableOptions() {
  if (!builderTableSelect) return;
  builderTableSelect.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Select table...';
  builderTableSelect.appendChild(opt);
  Array.from(schemaIndex.tables.values()).forEach(table => {
    const option = document.createElement('option');
    option.value = table.name;
    option.textContent = table.name;
    builderTableSelect.appendChild(option);
  });
}

function addBuilderTable(name, position) {
  if (!builderCanvas) return;
  if (builderState.tables.has(name)) return;
  const tableInfo = Array.from(schemaIndex.tables.values()).find(t => t.name === name);
  if (!tableInfo) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'builder-table';
  wrapper.dataset.table = name;
  const header = document.createElement('div');
  header.className = 'builder-table-header';
  header.textContent = name;
  const close = document.createElement('span');
  close.textContent = '×';
  close.style.cursor = 'pointer';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    removeBuilderTable(name);
  });
  header.appendChild(close);
  wrapper.appendChild(header);

  const body = document.createElement('div');
  body.className = 'builder-table-body';
  tableInfo.columns.forEach(col => {
    const row = document.createElement('div');
    row.className = 'builder-col';
    row.textContent = col;
    row.dataset.table = name;
    row.dataset.column = col;
    row.addEventListener('click', () => {
      handleColumnClick(row);
    });
    body.appendChild(row);
  });
  wrapper.appendChild(body);

  const x = position ? position.x : 20 + builderState.tables.size * 40;
  const y = position ? position.y : 20 + builderState.tables.size * 40;
  wrapper.style.left = `${x}px`;
  wrapper.style.top = `${y}px`;
  builderCanvas.appendChild(wrapper);

  header.addEventListener('mousedown', (e) => {
    builderState.dragging = {
      name,
      startX: e.clientX,
      startY: e.clientY,
      origX: parseFloat(wrapper.style.left),
      origY: parseFloat(wrapper.style.top)
    };
    document.addEventListener('mousemove', onBuilderDrag);
    document.addEventListener('mouseup', stopBuilderDrag);
  });

  builderState.tables.set(name, { name, columns: tableInfo.columns, el: wrapper });
  drawBuilderLinks();
}

function removeBuilderTable(name) {
  const entry = builderState.tables.get(name);
  if (entry && entry.el) entry.el.remove();
  builderState.tables.delete(name);
  builderState.links = builderState.links.filter(link => link.from.table !== name && link.to.table !== name);
  drawBuilderLinks();
  updateBuilderSql();
}

function onBuilderDrag(e) {
  if (!builderState.dragging) return;
  const { name, startX, startY, origX, origY } = builderState.dragging;
  const entry = builderState.tables.get(name);
  if (!entry) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  entry.el.style.left = `${origX + dx}px`;
  entry.el.style.top = `${origY + dy}px`;
  drawBuilderLinks();
}

function stopBuilderDrag() {
  builderState.dragging = null;
  document.removeEventListener('mousemove', onBuilderDrag);
  document.removeEventListener('mouseup', stopBuilderDrag);
}

function handleColumnClick(row) {
  const table = row.dataset.table;
  const column = row.dataset.column;
  if (!builderState.activeColumn) {
    builderState.activeColumn = { table, column };
    row.classList.add('active');
    return;
  }
  const from = builderState.activeColumn;
  const to = { table, column };
  clearActiveColumns();
  builderState.activeColumn = null;
  if (from.table === to.table && from.column === to.column) return;
  builderState.links.push({ from, to, type: 'INNER' });
  drawBuilderLinks();
  updateBuilderSql();
}

function clearActiveColumns() {
  if (!builderCanvas) return;
  builderCanvas.querySelectorAll('.builder-col.active').forEach(el => el.classList.remove('active'));
}

function drawBuilderLinks() {
  if (!builderLinks) return;
  builderLinks.innerHTML = '';
  builderState.links.forEach(link => {
    const fromEl = findColumnEl(link.from.table, link.from.column);
    const toEl = findColumnEl(link.to.table, link.to.column);
    if (!fromEl || !toEl) return;
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const canvasRect = builderCanvas.getBoundingClientRect();
    const x1 = fromRect.left - canvasRect.left + fromRect.width;
    const y1 = fromRect.top - canvasRect.top + fromRect.height / 2;
    const x2 = toRect.left - canvasRect.left;
    const y2 = toRect.top - canvasRect.top + toRect.height / 2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'builder-link-line');
    builderLinks.appendChild(line);
  });
}

function findColumnEl(table, column) {
  if (!builderCanvas) return null;
  return builderCanvas.querySelector(`.builder-col[data-table="${CSS.escape(table)}"][data-column="${CSS.escape(column)}"]`);
}

function updateBuilderSql() {
  if (!builderSql) return;
  const sql = buildSqlFromBuilder();
  builderSql.value = sql;
}

function buildSqlFromBuilder() {
  const tables = Array.from(builderState.tables.keys());
  if (!tables.length) return '';
  const base = tables[0];
  const joins = [];
  const added = new Set([base]);
  builderState.links.forEach(link => {
    const left = link.from.table;
    const right = link.to.table;
    if (!added.has(right)) {
      joins.push(`${link.type} JOIN ${right} ON ${left}.${link.from.column} = ${right}.${link.to.column}`);
      added.add(right);
    } else if (!added.has(left)) {
      joins.push(`${link.type} JOIN ${left} ON ${left}.${link.from.column} = ${right}.${link.to.column}`);
      added.add(left);
    } else {
      joins.push(`AND ${left}.${link.from.column} = ${right}.${link.to.column}`);
    }
  });
  return `SELECT * FROM ${base}\n${joins.join('\n')}`.trim();
}

function openBuilderFromSql() {
  resetBuilder();
  buildBuilderTableOptions();
  const sql = sqlInput.value;
  if (builderSql) builderSql.value = sql;
  parseSqlToBuilder(sql);
}

function parseSqlToBuilder(sql) {
  resetBuilder();
  buildBuilderTableOptions();
  const cleaned = sql.replace(/\s+/g, ' ').trim();
  const fromMatch = cleaned.match(/\bfrom\s+([`"\[]?[\w.]+[`"\]]?)(?:\s+(?:as\s+)?([\w]+))?/i);
  if (!fromMatch) return;
  const baseTable = normalizeIdent(fromMatch[1]);
  const tables = new Set();
  tables.add(baseTable);
  addBuilderTable(baseTable, { x: 40, y: 40 });

  const joinRegex = /\b(left|right|full|inner|cross)?\s*join\s+([`"\[]?[\w.]+[`"\]]?)(?:\s+(?:as\s+)?([\w]+))?\s+on\s+([^;]+)/gi;
  let match;
  let offsetX = 320;
  let offsetY = 40;
  while ((match = joinRegex.exec(cleaned)) !== null) {
    const joinType = (match[1] || 'INNER').toUpperCase();
    const tableName = normalizeIdent(match[2]);
    if (!tables.has(tableName)) {
      addBuilderTable(tableName, { x: offsetX, y: offsetY });
      offsetY += 60;
      tables.add(tableName);
    }
    const onPart = match[4];
    const onMatch = onPart.match(/([`\w.]+)\s*=\s*([`\w.]+)/);
    if (onMatch) {
      const [leftRaw, rightRaw] = [onMatch[1], onMatch[2]];
      const leftParts = normalizeIdent(leftRaw).split('.');
      const rightParts = normalizeIdent(rightRaw).split('.');
      if (leftParts.length === 2 && rightParts.length === 2) {
        builderState.links.push({
          from: { table: leftParts[0], column: leftParts[1] },
          to: { table: rightParts[0], column: rightParts[1] },
          type: joinType
        });
      }
    }
  }
  drawBuilderLinks();
  updateBuilderSql();
}

function getCaretCoords(textarea) {
  const style = window.getComputedStyle(textarea);
  const properties = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
    'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'letterSpacing',
    'wordSpacing', 'tabSize', 'MozTabSize'
  ];
  properties.forEach(prop => {
    autocompleteMirror.style[prop] = style[prop];
  });
  const value = textarea.value;
  const pos = textarea.selectionStart ?? 0;
  const before = value.slice(0, pos);
  const after = value.slice(pos);
  autocompleteMirror.textContent = before;
  const span = document.createElement('span');
  span.textContent = after.length ? after[0] : ' ';
  autocompleteMirror.appendChild(span);

  const mirrorRect = autocompleteMirror.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const left = spanRect.left - mirrorRect.left - textarea.scrollLeft;
  const top = spanRect.top - mirrorRect.top - textarea.scrollTop;
  const height = spanRect.height || parseFloat(style.lineHeight) || 16;
  autocompleteMirror.removeChild(span);

  return { left, top, height };
}

async function runSql() {
  try {
    const hasSelection = (sqlInput.selectionStart ?? 0) !== (sqlInput.selectionEnd ?? 0);
    const sqlToRun = hasSelection
      ? sqlInput.value.slice(sqlInput.selectionStart, sqlInput.selectionEnd)
      : sqlInput.value;

    if (!sqlToRun.trim()) {
      setStatus('Nothing to run.', true);
      return;
    }

    setStatus('Running SQL...');
    const res = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: sqlToRun, connectionId: activeId })
    });

    const data = await res.json();
    lastResult = { columns: data.columns || [], rows: data.rows || [] };
    renderResult();
    if (!data.error) {
      pushHistory(sqlToRun);
      const rows = Array.isArray(data.rows) ? data.rows.length : 0;
      setStatus(`Done. Rows: ${rows}.`);
    } else {
      setStatus(`Error: ${data.error}`, true);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  }
}

function renderResult() {
  if (currentView === 'csv') return renderCsv(lastResult.columns, lastResult.rows);
  if (currentView === 'json') return renderJson(lastResult.columns, lastResult.rows);
  if (currentView === 'smart') return renderSmartTable(lastResult.columns, lastResult.rows);
  return renderTable(lastResult.columns, lastResult.rows);
}

function renderTable(columns, rows) {
  resultControls.innerHTML = '';
  if (columns.length === 0) {
    resultTable.innerHTML = '<div class="text-muted">No results</div>';
    return;
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-outline-light btn-sm nowrap-btn';
  saveBtn.textContent = 'Save to History';
  saveBtn.addEventListener('click', () => {
    saveResultSnapshot(columns, rows);
  });

  const compareSelect = document.createElement('select');
  compareSelect.className = 'form-select form-select-sm';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Compare with...';
  compareSelect.appendChild(defaultOption);
  resultHistory.forEach(entry => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = formatResultHistoryLabel(entry);
    compareSelect.appendChild(option);
  });
  compareSelect.addEventListener('change', () => {
    tableDiff.compareId = compareSelect.value;
    renderTable(columns, rows);
  });

  const clearDiffBtn = document.createElement('button');
  clearDiffBtn.className = 'btn btn-outline-secondary btn-sm nowrap-btn';
  clearDiffBtn.textContent = 'Clear His';
  clearDiffBtn.addEventListener('click', () => {
    if (!tableDiff.compareId) {
      if (!resultHistory.length) return;
      const okAll = confirm('Delete all history snapshots?');
      if (!okAll) return;
      resultHistory = [];
      localStorage.setItem(RESULT_HISTORY_KEY, JSON.stringify(resultHistory));
      renderTable(columns, rows);
      return;
    }
    const target = resultHistory.find(entry => entry.id === tableDiff.compareId);
    if (!target) return;
    const ok = confirm('Delete the selected history snapshot?');
    if (!ok) return;
    resultHistory = resultHistory.filter(entry => entry.id !== tableDiff.compareId);
    localStorage.setItem(RESULT_HISTORY_KEY, JSON.stringify(resultHistory));
    tableDiff.compareId = '';
    renderTable(columns, rows);
  });

  resultControls.appendChild(saveBtn);
  resultControls.appendChild(compareSelect);
  resultControls.appendChild(clearDiffBtn);

  const sortedRows = applySort(rows, tableState.sorts);
  let displayRows = sortedRows.map(row => ({ row, status: 'normal' }));
  const compareEntry = tableDiff.compareId
    ? resultHistory.find(entry => entry.id === tableDiff.compareId)
    : null;

  if (tableDiff.compareId) {
    if (!compareEntry) {
      tableDiff.compareId = '';
    } else if (!tableState.sorts.length) {
      alert('Sort the table columns first. The sort fields are used as the unique key for comparison.');
      tableDiff.compareId = '';
    } else if (!areColumnsCompatible(columns, compareEntry.columns)) {
      alert('The selected history snapshot has different columns. Please select a compatible snapshot.');
      tableDiff.compareId = '';
    } else {
      const keyCols = tableState.sorts.map(s => s.col);
      const diffRows = buildDiffRows(sortedRows, compareEntry.rows, keyCols);
      if (diffRows) {
        displayRows = diffRows;
      } else {
        tableDiff.compareId = '';
      }
    }
  }
  compareSelect.value = tableDiff.compareId || '';
  clearDiffBtn.disabled = resultHistory.length === 0;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col, idx) => {
    const th = document.createElement('th');
    th.className = 'sortable';
    th.textContent = col;
    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator';
    indicator.textContent = getSortIndicator(tableState, idx);
    th.appendChild(indicator);
    th.addEventListener('click', () => {
      toggleSortFor(tableState, idx);
      renderTable(columns, rows);
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  displayRows.forEach(({ row, status, changedCols }) => {
    const tr = document.createElement('tr');
    if (status !== 'normal') tr.classList.add(`result-row-${status}`);
    row.forEach((cell, idx) => {
      const td = document.createElement('td');
      td.textContent = cell;
      if (status === 'changed-new' && changedCols) {
        if (changedCols.has(idx)) td.classList.add('result-cell-changed');
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  resultTable.innerHTML = '';
  const tableWrap = document.createElement('div');
  tableWrap.className = 'result-table-scroll';
  tableWrap.appendChild(table);
  resultTable.appendChild(tableWrap);
}

function renderCsv(columns, rows) {
  resultControls.innerHTML = '';
  if (columns.length === 0) {
    resultTable.innerHTML = '<div class="text-muted">No results</div>';
    return;
  }
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [];
  lines.push(columns.map(escape).join(','));
  rows.forEach(row => {
    lines.push(row.map(escape).join(','));
  });
  resultTable.innerHTML = `<pre>${lines.join('\n')}</pre>`;
}

function renderJson(columns, rows) {
  resultControls.innerHTML = '';
  if (columns.length === 0) {
    resultTable.innerHTML = '<div class="text-muted">No results</div>';
    return;
  }
  const data = rows.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
  resultTable.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

function renderSmartTable(columns, rows) {
  if (columns.length === 0) {
    resultControls.innerHTML = '';
    resultTable.innerHTML = '<div class="text-muted">No results</div>';
    return;
  }

  resultControls.innerHTML = '';
  if (!smartSearchInput) {
    smartSearchInput = document.createElement('input');
    smartSearchInput.type = 'text';
    smartSearchInput.placeholder = 'Search all columns...';
    smartSearchInput.value = smartState.search;
    smartSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        smartState.search = smartSearchInput.value;
        smartState.page = 1;
        renderSmartTable(columns, rows);
      }
    });
    smartSearchBtn = document.createElement('button');
    smartSearchBtn.className = 'btn btn-outline-light btn-sm';
    smartSearchBtn.textContent = 'Search';
    smartSearchBtn.addEventListener('click', () => {
      smartState.search = smartSearchInput.value;
      smartState.page = 1;
      renderSmartTable(columns, rows);
    });
  } else {
    smartSearchInput.value = smartState.search;
  }
  resultControls.appendChild(smartSearchInput);
  resultControls.appendChild(smartSearchBtn);

  const filtered = applySearch(rows, smartState.search);
  const sorted = applySort(filtered, smartState.sorts);
  const totalPages = Math.max(1, Math.ceil(sorted.length / smartState.pageSize));
  smartState.page = Math.min(smartState.page, totalPages);
  const start = (smartState.page - 1) * smartState.pageSize;
  const pageRows = sorted.slice(start, start + smartState.pageSize);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col, idx) => {
    const th = document.createElement('th');
    th.className = 'sortable';
    th.textContent = col;
    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator';
    const sortIdx = smartState.sorts.findIndex(s => s.col === idx);
    if (sortIdx >= 0) {
      indicator.textContent = smartState.sorts[sortIdx].dir === 'asc' ? `▲${sortIdx + 1}` : `▼${sortIdx + 1}`;
    }
    th.appendChild(indicator);
    th.addEventListener('click', () => {
      toggleSort(idx);
      renderSmartTable(columns, rows);
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  pageRows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      const jsonInfo = parseJsonCell(cell);
      if (jsonInfo) {
        td.textContent = 'JSON';
        td.classList.add('json-cell');
        td.dataset.json = jsonInfo;
        td.addEventListener('click', () => {
          jsonModalRaw = jsonInfo;
          if (jsonModalBody) {
            jsonModalBody.textContent = jsonInfo;
            jsonModalBody.classList.remove('decoded');
          }
          if (jsonDecodeBtn) {
            try {
              const parsed = JSON.parse(jsonInfo);
              jsonDecodeBtn.style.display = hasNestedJson(parsed) ? 'inline-flex' : 'none';
            } catch (err) {
              jsonDecodeBtn.style.display = 'none';
            }
          }
          jsonModal.show();
        });
      } else {
        td.textContent = cell;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  const pager = document.createElement('div');
  pager.className = 'result-pager';
  const prev = document.createElement('button');
  prev.className = 'btn btn-outline-light btn-sm';
  prev.textContent = 'Prev';
  prev.disabled = smartState.page <= 1;
  prev.addEventListener('click', () => {
    smartState.page = Math.max(1, smartState.page - 1);
    renderSmartTable(columns, rows);
  });
  const next = document.createElement('button');
  next.className = 'btn btn-outline-light btn-sm';
  next.textContent = 'Next';
  next.disabled = smartState.page >= totalPages;
  next.addEventListener('click', () => {
    smartState.page = Math.min(totalPages, smartState.page + 1);
    renderSmartTable(columns, rows);
  });
  const pageInfo = document.createElement('span');
  pageInfo.textContent = `Page ${smartState.page} / ${totalPages} • ${sorted.length} rows`;
  pager.appendChild(prev);
  pager.appendChild(next);
  pager.appendChild(pageInfo);
  resultControls.appendChild(pager);

  resultTable.innerHTML = '';
  const tableWrap = document.createElement('div');
  tableWrap.className = 'result-table-scroll';
  tableWrap.appendChild(table);
  resultTable.appendChild(tableWrap);
}

function applySearch(rows, term) {
  const q = term
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  if (!q) return rows;
  return rows.filter(row =>
    row.some(cell => String(cell ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .includes(q))
  );
}

function applySort(rows, sorts) {
  if (!sorts.length) return rows.slice();
  const sorted = rows.slice();
  sorted.sort((a, b) => {
    for (const s of sorts) {
      const av = a[s.col];
      const bv = b[s.col];
      if (av === bv) continue;
      if (av === null || av === undefined) return s.dir === 'asc' ? -1 : 1;
      if (bv === null || bv === undefined) return s.dir === 'asc' ? 1 : -1;
      if (av < bv) return s.dir === 'asc' ? -1 : 1;
      if (av > bv) return s.dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
  return sorted;
}

function toggleSortFor(state, colIdx) {
  const idx = state.sorts.findIndex(s => s.col === colIdx);
  if (idx === -1) {
    state.sorts.push({ col: colIdx, dir: 'asc' });
    return;
  }
  const current = state.sorts[idx];
  if (current.dir === 'asc') {
    state.sorts[idx].dir = 'desc';
  } else {
    state.sorts.splice(idx, 1);
  }
}

function getSortIndicator(state, colIdx) {
  const sortIdx = state.sorts.findIndex(s => s.col === colIdx);
  if (sortIdx === -1) return '';
  return state.sorts[sortIdx].dir === 'asc' ? `▲${sortIdx + 1}` : `▼${sortIdx + 1}`;
}

function toggleSort(colIdx) {
  const idx = smartState.sorts.findIndex(s => s.col === colIdx);
  if (idx === -1) {
    smartState.sorts.push({ col: colIdx, dir: 'asc' });
    return;
  }
  const current = smartState.sorts[idx];
  if (current.dir === 'asc') {
    smartState.sorts[idx].dir = 'desc';
  } else {
    smartState.sorts.splice(idx, 1);
  }
}

function areColumnsCompatible(currentColumns, historyColumns) {
  if (currentColumns.length !== historyColumns.length) return false;
  return currentColumns.every((col, idx) => col === historyColumns[idx]);
}

function rowKey(row, keyCols) {
  return JSON.stringify(keyCols.map(idx => row[idx]));
}

function rowsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildDiffRows(currentRows, historyRows, keyCols) {
  const currentMap = new Map();
  const historyMap = new Map();
  const currentDupes = new Set();
  const historyDupes = new Set();

  currentRows.forEach(row => {
    const key = rowKey(row, keyCols);
    if (currentMap.has(key)) currentDupes.add(key);
    currentMap.set(key, row);
  });
  historyRows.forEach(row => {
    const key = rowKey(row, keyCols);
    if (historyMap.has(key)) historyDupes.add(key);
    historyMap.set(key, row);
  });

  if (currentDupes.size || historyDupes.size) {
    alert('The current sort fields do not create a unique key. Please adjust the sort to be unique.');
    return null;
  }

  const sortedHistory = applySort(historyRows, tableState.sorts);

  const processed = new Set();
  const diffRows = [];

  currentRows.forEach(row => {
    const key = rowKey(row, keyCols);
    const oldRow = historyMap.get(key);
    processed.add(key);
    if (!oldRow) {
      diffRows.push({ row, status: 'added' });
      return;
    }
    if (rowsEqual(row, oldRow)) {
      diffRows.push({ row, status: 'normal' });
      return;
    }
    const changedCols = new Set();
    for (let i = 0; i < row.length; i += 1) {
      if (row[i] !== oldRow[i]) changedCols.add(i);
    }
    diffRows.push({ row: oldRow, status: 'changed-old' });
    diffRows.push({ row, status: 'changed-new', changedCols });
  });

  sortedHistory.forEach(row => {
    const key = rowKey(row, keyCols);
    if (processed.has(key)) return;
    diffRows.push({ row, status: 'deleted' });
  });

  return diffRows;
}

if (resultViews) {
  resultViews.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    currentView = btn.dataset.view;
    Array.from(resultViews.querySelectorAll('button')).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (currentView !== 'smart') {
      smartSearchInput = null;
      smartSearchBtn = null;
    }
    renderResult();
  });
}
function loadTabs() {
  const raw = localStorage.getItem(TABS_KEY);
  tabs = raw ? JSON.parse(raw) : [];
  if (tabs.length === 0) {
    tabs = [{ id: makeId(), name: 'Query 1', sql: '' }];
  }
  activeTabId = tabs[0].id;
  renderTabs();
  applyActiveTab();
}

function renderTabs() {
  queryTabs.innerHTML = '';
  tabs.forEach(tab => {
    const button = document.createElement('button');
    button.className = 'query-tab';
    if (tab.id === activeTabId) button.classList.add('active');

    const label = document.createElement('span');
    label.className = 'query-tab-label';
    label.textContent = tab.name;

    const close = document.createElement('span');
    close.className = 'query-tab-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTab(tab.id);
    });

    button.appendChild(label);
    button.appendChild(close);
    button.onclick = () => {
      activeTabId = tab.id;
      renderTabs();
      applyActiveTab();
    };
    queryTabs.appendChild(button);
  });
}

function createNewTab() {
  const nextIndex = tabs.length + 1;
  const tab = { id: makeId(), name: `Query ${nextIndex}`, sql: '' };
  tabs.push(tab);
  activeTabId = tab.id;
  persistTabs();
  renderTabs();
  applyActiveTab();
}

function removeTab(id) {
  if (tabs.length <= 1) {
    tabs = [{ id: makeId(), name: 'Query 1', sql: '' }];
    activeTabId = tabs[0].id;
    persistTabs();
    renderTabs();
    applyActiveTab();
    return;
  }
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs.splice(idx, 1);
  if (activeTabId === id) {
    const next = tabs[idx] || tabs[idx - 1] || tabs[0];
    activeTabId = next.id;
  }
  persistTabs();
  renderTabs();
  applyActiveTab();
}

function applyActiveTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    sqlInput.value = tab.sql || '';
  }
}

function syncActiveTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.sql = sqlInput.value;
  persistTabs();
}

function persistTabs() {
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
}

function makeId() {
  return 't_' + Math.random().toString(36).slice(2, 10);
}

function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  history = raw ? JSON.parse(raw) : [];
  renderHistory();
}

function loadResultHistory() {
  const raw = localStorage.getItem(RESULT_HISTORY_KEY);
  resultHistory = raw ? JSON.parse(raw) : [];
}

function formatResultHistoryLabel(entry) {
  const sqlSnippet = entry.sql ? entry.sql.replace(/\s+/g, ' ').slice(0, 40) : 'result';
  const date = new Date(entry.at);
  return `${entry.connection} • ${date.toLocaleString()} • ${sqlSnippet}`;
}

function saveResultSnapshot(columns, rows) {
  if (!rows.length || !columns.length) return;
  const hasSelection = (sqlInput.selectionStart ?? 0) !== (sqlInput.selectionEnd ?? 0);
  const sqlForSnapshot = hasSelection
    ? sqlInput.value.slice(sqlInput.selectionStart, sqlInput.selectionEnd).trim()
    : sqlInput.value.trim();
  const conn = connections.find(c => c.id === activeId);
  resultHistory.unshift({
    id: makeId(),
    sql: sqlForSnapshot,
    connection: conn ? conn.name : 'unknown',
    at: new Date().toISOString(),
    columns: columns.slice(),
    rows: rows.slice(0)
  });
  resultHistory = resultHistory.slice(0, 20);
  localStorage.setItem(RESULT_HISTORY_KEY, JSON.stringify(resultHistory));
  renderResult();
}

function pushHistory(sql) {
  if (!sql.trim()) return;
  const normalized = sql.trim();
  history = history.filter(entry => entry.sql !== normalized);
  const conn = connections.find(c => c.id === activeId);
  history.unshift({
    id: makeId(),
    sql: normalized,
    connection: conn ? conn.name : 'unknown',
    at: new Date().toISOString()
  });
  history = history.slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';
  if (history.length === 0) {
    const item = document.createElement('li');
    item.className = 'history-item';
    item.textContent = 'No history yet.';
    historyList.appendChild(item);
    return;
  }

  history.forEach(entry => {
    const item = document.createElement('li');
    item.className = 'history-item';
    item.dataset.id = entry.id;
    const sqlText = document.createElement('span');
    sqlText.className = 'history-sql';
    sqlText.textContent = entry.sql;

    const meta = document.createElement('small');
    const date = new Date(entry.at);
    meta.textContent = `${entry.connection} • ${date.toLocaleString()}`;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-outline-light btn-sm history-delete-btn';
    delBtn.textContent = 'Delete';
    item.appendChild(delBtn);
    item.appendChild(sqlText);
    item.appendChild(meta);

    item.onclick = (e) => {
      if (e.target && e.target.closest('.history-delete-btn')) return;
      sqlInput.value = entry.sql;
      syncActiveTab();
      historyModal.hide();
    };

    historyList.appendChild(item);
  });
}

function setStatus(text, isError = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle('error', isError);
}

function showTableMenu(x, y, tableName, fieldsJson) {
  if (!tableContextMenu) return;
  tableContextMenu.style.display = 'block';
  tableContextMenu.style.left = `${x}px`;
  tableContextMenu.style.top = `${y}px`;
  tableContextMenu.dataset.table = tableName;
  tableContextMenu.dataset.fields = fieldsJson || '[]';
}

function hideTableMenu() {
  if (!tableContextMenu) return;
  tableContextMenu.style.display = 'none';
}

function insertAtCursor(text) {
  const start = sqlInput.selectionStart ?? sqlInput.value.length;
  const end = sqlInput.selectionEnd ?? sqlInput.value.length;
  const before = sqlInput.value.slice(0, start);
  const after = sqlInput.value.slice(end);
  sqlInput.value = before + text + after;
  const nextPos = start + text.length;
  sqlInput.focus();
  sqlInput.setSelectionRange(nextPos, nextPos);
  syncActiveTab();
}

function appendSql(text) {
  const prefix = sqlInput.value && !sqlInput.value.endsWith('\n') ? '\n' : '';
  sqlInput.value += `${prefix}${text}`;
  sqlInput.focus();
  sqlInput.setSelectionRange(sqlInput.value.length, sqlInput.value.length);
  syncActiveTab();
}

if (tableContextMenu) {
  tableContextMenu.addEventListener('click', (e) => {
    const target = e.target.closest('.context-item');
    if (!target) return;
    const action = target.dataset.action;
    const table = tableContextMenu.dataset.table || '';
    const fields = JSON.parse(tableContextMenu.dataset.fields || '[]');

    if (action === 'insert-name') {
      insertAtCursor(table);
    } else if (action === 'select-all') {
      appendSql(`select * from ${table};`);
    } else if (action === 'select-fields') {
      const list = fields.length ? fields.join(', ') : '*';
      appendSql(`select ${list} from ${table};`);
    }
    hideTableMenu();
  });
}

document.addEventListener('click', (e) => {
  if (!tableContextMenu) return;
  if (!tableContextMenu.contains(e.target)) hideTableMenu();
});

document.addEventListener('scroll', hideTableMenu, true);

historyList.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.history-delete-btn');
  if (!deleteBtn) return;
  const item = deleteBtn.closest('.history-item');
  if (!item) return;
  const id = item.dataset.id;
  history = history.filter(entry => entry.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
});

pasteArea.addEventListener('click', () => {
  pasteArea.focus();
});

pasteArea.addEventListener('paste', async (event) => {
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;

  let imageFile = null;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      imageFile = item.getAsFile();
      break;
    }
  }

  if (!imageFile) {
    pasteResult.value = 'No image found in clipboard.';
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    pastePreview.innerHTML = `<img src="${dataUrl}" alt="Pasted image" />`;
    pasteResult.value = 'Uploading...';
    try {
      const res = await fetch('/api/paste-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl })
      });
      const data = await res.json();
      if (data.error) {
        pasteResult.value = `Error: ${data.error}`;
        pasteHint.textContent = 'Upload failed.';
        pasteHint.classList.add('error');
        return;
      }
      pasteResult.value = data.path;
      pasteHint.textContent = 'Click Copy to put the path on the clipboard.';
      pasteHint.classList.remove('error');
      pasteResult.focus();
      pasteResult.select();
    } catch (err) {
      pasteResult.value = `Error: ${err.message}`;
      pasteHint.textContent = 'Upload failed.';
      pasteHint.classList.add('error');
    }
  };
  reader.readAsDataURL(imageFile);
});

pasteResult.addEventListener('click', () => {
  if (!pasteResult.value) return;
  pasteResult.select();
});

function fallbackCopy(inputEl) {
  try {
    inputEl.select();
    return document.execCommand('copy');
  } catch (err) {
    return false;
  }
}

function addSpaceBeforeExtension(path) {
  return path.replace(/\.(png|jpe?g|gif|webp)$/i, ' .$1');
}

loadTabs();
loadHistory();
loadResultHistory();
loadConnections();
runSplashIntro();

const hidden = localStorage.getItem(SCHEMA_HIDDEN_KEY) === '1';
setSchemaHidden(hidden);
