// ── Service definitions (mirrors docker-compose.yml) ──────────────────────
const SERVICES = [
  {
    id: 'tribe',
    name: 'Tribe',
    desc: 'Main PHP application',
    icon: '◈',
    portEnv: 'TRIBE_PORT',
    portDefault: 12000,
    container: 'php_tribe',
  },
  {
    id: 'phpmyadmin',
    name: 'phpMyAdmin',
    desc: 'Database management',
    icon: '◉',
    portEnv: 'PHPMYADMIN_PORT',
    portDefault: 12001,
    container: 'phpmyadmin',
  },
  {
    id: 'junction',
    name: 'Junction',
    desc: 'Junction PHP app',
    icon: '◈',
    portEnv: 'JUNCTION_PORT',
    portDefault: 12002,
    container: 'php_junction',
  },
  {
    id: 'dist',
    name: 'Dist Site',
    desc: 'Static site server',
    icon: '◎',
    portEnv: 'DIST_PORT',
    portDefault: 12003,
    container: 'caddy_dist',
  },
  {
    id: 'dist-php',
    name: 'Dist PHP',
    desc: 'PHP dist site',
    icon: '◈',
    portEnv: 'DIST_PHP_PORT',
    portDefault: 12004,
    container: 'caddy_php_dist',
  },
  {
    id: 'filebrowser',
    name: 'File Browser',
    desc: 'File management UI',
    icon: '◫',
    portEnv: 'FILEBROWSER_PORT',
    portDefault: 12005,
    container: 'filebrowser',
  },
];

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  dockerInstalled: false,
  dockerRunning: false,
  composeExists: false,
  flameExists: false,
  isDockerRunning: false,
  envVars: {},
  serviceStatuses: {},
  currentView: null,
  currentService: null,
  healthInterval: null,
  projectDir: null,
};

// ── Persistent storage helpers ─────────────────────────────────────────────
const STORAGE_KEY = 'tribe_project_dir';

function saveProjectDir(dir) {
  try { localStorage.setItem(STORAGE_KEY, dir); } catch(e) {}
}

function loadSavedProjectDir() {
  try { return localStorage.getItem(STORAGE_KEY) || null; } catch(e) { return null; }
}

function clearSavedProjectDir() {
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getServiceUrl(svc) {
  const port = state.envVars[svc.portEnv] || svc.portDefault;
  return `http://localhost:${port}`;
}

function getContainerName(svc) {
  const proj = state.envVars['PROJECT_NAME'] || 'tribe';
  return `${proj}_${svc.container}`;
}

function isServiceUp(svc) {
  const name = getContainerName(svc);
  const status = state.serviceStatuses[name] || '';
  return status.toLowerCase().includes('up') || status.toLowerCase().includes('running');
}

// ── Views ──────────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${name}`);
  if (el) el.classList.add('active');
  state.currentView = name;

  // Highlight active nav button
  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById(`nav-${name}`);
  if (navBtn) navBtn.classList.add('active');
}

function openService(svc) {
  const url = getServiceUrl(svc);
  const webview = document.getElementById('embedded-view');
  webview.src = url;
  document.getElementById('url-display').textContent = url;
  state.currentService = svc;
  showView('webview');

  document.querySelectorAll('.service-btn').forEach(b => b.classList.remove('active'));
  const btn = [...document.querySelectorAll('.service-btn')].find(b => b.dataset.id === svc.id);
  if (btn) btn.classList.add('active');
}

function openTribeManual() {
  const webview = document.getElementById('embedded-view');
  webview.src = 'https://tribe-framework.org';
  document.getElementById('url-display').textContent = 'https://tribe-framework.org';
  state.currentService = null;
  // Clear any active service highlight
  document.querySelectorAll('.service-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-tribe-manual').classList.add('active');
  showView('webview');
}

function closeWebview() {
  document.querySelectorAll('.service-btn').forEach(b => b.classList.remove('active'));
  showView('setup');
}
function goBack()    { document.getElementById('embedded-view').goBack(); }
function goForward() { document.getElementById('embedded-view').goForward(); }
function reloadWebview() { document.getElementById('embedded-view').reload(); }
function openCurrentExternal() {
  const url = document.getElementById('embedded-view').src;
  if (url && url !== 'about:blank') window.tribe.openExternal(url);
}

// ── Sidebar service list ───────────────────────────────────────────────────
function renderSidebar() {
  const container = document.getElementById('service-list');
  container.innerHTML = SERVICES.map(svc => {
    const up = isServiceUp(svc);
    const statusClass = state.isDockerRunning ? (up ? 'up' : 'down') : '';
    return `
      <button class="service-btn" data-id="${svc.id}"
              title="${svc.name} — ${getServiceUrl(svc)}">
        <div class="svc-icon">${svc.icon}</div>
        <div class="svc-info">
          <span class="svc-name">${svc.name}</span>
          <span class="svc-port">:${state.envVars[svc.portEnv] || svc.portDefault}</span>
        </div>
        <div class="svc-status ${statusClass}"></div>
      </button>`;
  }).join('');

  document.querySelectorAll('.service-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => openService(SERVICES[i]));
  });

  // Update project dir label
  const label = document.getElementById('project-dir-label');
  if (label && state.projectDir) {
    const parts = state.projectDir.replace(/\\/g, '/').split('/');
    label.textContent = '…/' + parts.slice(-2).join('/');
  }
}

// ── Dashboard grid ─────────────────────────────────────────────────────────
function renderDashboard() {
  const grid = document.getElementById('dashboard-grid');
  grid.innerHTML = SERVICES.map(svc => {
    const up = isServiceUp(svc);
    const badgeClass = state.isDockerRunning ? (up ? 'up' : 'down') : 'down';
    const badgeText  = state.isDockerRunning ? (up ? 'RUNNING' : 'STOPPED') : 'OFFLINE';
    const url = getServiceUrl(svc);
    return `
      <div class="svc-card" data-svc="${svc.id}">
        <div class="card-icon">${svc.icon}</div>
        <div class="card-name">${svc.name}</div>
        <div class="card-desc">${svc.desc}</div>
        <div class="card-port">${url}</div>
        <div class="card-footer">
          <span class="card-status-badge ${badgeClass}">${badgeText}</span>
          <span class="open-arrow">→</span>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('.svc-card').forEach((card, i) => {
    card.addEventListener('click', () => openService(SERVICES[i]));
  });
}

// ── Status updates ─────────────────────────────────────────────────────────
function updateStatusPill() {
  const pill  = document.getElementById('docker-status-pill');
  const label = document.getElementById('status-label');

  if (!state.projectDir) {
    pill.className = 'status-pill';
    label.textContent = 'No project';
  } else if (!state.dockerInstalled) {
    pill.className = 'status-pill error';
    label.textContent = 'Docker missing';
  } else if (!state.dockerRunning) {
    pill.className = 'status-pill error';
    label.textContent = 'Docker stopped';
  } else if (state.isDockerRunning) {
    pill.className = 'status-pill running';
    label.textContent = 'Running';
  } else {
    pill.className = 'status-pill';
    label.textContent = 'Ready';
  }
}

function updateButtons() {
  const canStart = !state.isDockerRunning && state.dockerRunning && state.composeExists;
  document.getElementById('btn-start').disabled   = !canStart;
  document.getElementById('btn-stop').disabled    = !state.isDockerRunning;
  document.getElementById('btn-restart').disabled = !state.isDockerRunning;
}

function updateSetupChecks() {
  const set = (id, ok, okText, failText) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = ok ? okText : failText;
    el.className = `ci-status ${ok ? 'ok' : 'fail'}`;
  };
  set('check-docker',  state.dockerInstalled, '✓ Installed',  '✗ Not found');
  set('check-engine',  state.dockerRunning,   '✓ Running',    '✗ Not running');
  set('check-compose', state.composeExists,   '✓ Found',      '✗ Not found');
  set('check-flame',   state.flameExists,     '✓ Found',      '✗ Not found');

  // Update path display
  const pathEl = document.getElementById('setup-path-value');
  if (pathEl) pathEl.textContent = state.projectDir || '—';

  const canLaunch = state.dockerInstalled && state.dockerRunning && state.composeExists && state.flameExists;
  const btnLaunch = document.getElementById('btn-launch');
  if (btnLaunch) btnLaunch.disabled = !canLaunch;

  const btnInstall = document.getElementById('btn-install-docker');
  if (btnInstall) btnInstall.style.display = state.dockerInstalled ? 'none' : 'block';
}

async function refreshStatus() {
  if (!state.projectDir) return;

  const s = await window.tribe.getStatus();
  state.dockerInstalled = s.dockerInstalled;
  state.dockerRunning   = s.dockerRunning;
  state.composeExists   = s.composeExists;
  state.flameExists     = s.flameExists || false;
  state.envVars         = s.envVars || {};

  updateStatusPill();
  updateButtons();
  updateSetupChecks();
  renderSidebar();
}

async function refreshHealth() {
  if (!state.isDockerRunning) return;
  state.serviceStatuses = await window.tribe.checkServiceHealth();
  renderSidebar();
}

// ── Log helpers ────────────────────────────────────────────────────────────
function appendLog(msg) {
  const out = document.getElementById('log-output');
  const div = document.createElement('span');

  if (/✅|successfully|done|started/i.test(msg)) div.className = 'log-success';
  else if (/error|failed|✗|✘/i.test(msg))         div.className = 'log-error';
  else if (/warn|⚠/i.test(msg))                   div.className = 'log-warn';
  else if (/▶|⏹|🔄|ℹ/i.test(msg))                div.className = 'log-info';

  div.textContent = msg;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

function clearLog() {
  document.getElementById('log-output').innerHTML = '';
}

function scrollToBottom() {
  const out = document.getElementById('log-output');
  out.scrollTop = out.scrollHeight;
}

async function loadServiceLogs() {
  const svc = document.getElementById('log-service-select').value;
  if (!svc) return;
  const out = document.getElementById('log-output');
  out.innerHTML = `<span class="log-info">Loading logs for ${svc}…\n</span>`;
  const logs = await window.tribe.getServiceLogs(svc);
  out.innerHTML = '';
  appendLog(logs);
}

function populateLogServiceSelect() {
  const sel = document.getElementById('log-service-select');
  const proj = state.envVars['PROJECT_NAME'] || 'tribe';
  const names = [
    'mysql', 'typesense', 'php_tribe', 'php_junction', 'php_dist',
    'caddy_tribe', 'caddy_junction', 'caddy_dist', 'caddy_php_dist',
    'phpmyadmin', 'filebrowser', 'mysql_backup', 'setup',
  ];
  sel.innerHTML = '<option value="">— Live Output —</option>' +
    names.map(n => `<option value="${proj}_${n}">${proj}_${n}</option>`).join('');
}

// ── Folder picker ──────────────────────────────────────────────────────────
async function browseAndValidateDir() {
  const dir = await window.tribe.browseProjectDir();
  if (!dir) return;

  const valid = await window.tribe.validateProjectDir(dir);
  const errEl = document.getElementById('picker-error');

  if (!valid) {
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  await applyProjectDir(dir);
}

async function changeProjectDir() {
  const dir = await window.tribe.browseProjectDir();
  if (!dir) return;

  const valid = await window.tribe.validateProjectDir(dir);
  if (!valid) {
    // Show error in setup view context
    appendLog('✗ Invalid folder — missing docker-compose.yml or .flame file.\n');
    showView('logs');
    return;
  }

  await applyProjectDir(dir);
}

async function applyProjectDir(dir) {
  state.projectDir = dir;
  saveProjectDir(dir);
  await window.tribe.setProjectDir(dir);
  await refreshStatus();
  showView('setup');
}

// ── Docker actions ─────────────────────────────────────────────────────────
async function startServices() {
  showView('logs');
  appendLog('Starting Tribe services…\n');
  document.getElementById('btn-start').disabled = true;

  const result = await window.tribe.startServices();

  if (result.success) {
    state.isDockerRunning = true;
    populateLogServiceSelect();
    startHealthPolling();
    setTimeout(() => {
      refreshStatus();
      setTimeout(() => openService(SERVICES[0]), 2000);
    }, 1000);
  } else {
    state.isDockerRunning = false;
  }
  updateButtons();
  updateStatusPill();
}

async function stopServices() {
  showView('logs');
  const result = await window.tribe.stopServices();
  if (result.success) {
    state.isDockerRunning = false;
    stopHealthPolling();
    refreshStatus();
  }
  updateButtons();
  updateStatusPill();
}

async function restartServices() {
  showView('logs');
  await window.tribe.restartServices();
  await refreshHealth();
  updateButtons();
}

function startHealthPolling() {
  if (state.healthInterval) return;
  state.healthInterval = setInterval(refreshHealth, 5000);
}

function stopHealthPolling() {
  clearInterval(state.healthInterval);
  state.healthInterval = null;
}

function installDocker()  { window.tribe.installDocker(); }

function confirmQuit(shouldStop) {
  document.getElementById('modal-overlay').classList.remove('show');
  window.tribe.confirmQuitResponse(shouldStop);
}

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  window.tribe.onLog(msg => appendLog(msg));

  window.tribe.onConfirmQuit(() => {
    document.getElementById('modal-overlay').classList.add('show');
  });

  const wv = document.getElementById('embedded-view');
  wv.addEventListener('did-navigate', (e) => {
    document.getElementById('url-display').textContent = e.url;
  });
  wv.addEventListener('did-navigate-in-page', (e) => {
    document.getElementById('url-display').textContent = e.url;
  });

  // Check for saved project dir
  const savedDir = loadSavedProjectDir();

  if (savedDir) {
    // Validate it still exists and has required files
    const valid = await window.tribe.validateProjectDir(savedDir);
    if (valid) {
      state.projectDir = savedDir;
      await window.tribe.setProjectDir(savedDir);
      await refreshStatus();

      // Check if containers are already running
      if (state.dockerRunning && state.composeExists) {
        const health = await window.tribe.checkServiceHealth();
        state.serviceStatuses = health;
        const proj = state.envVars['PROJECT_NAME'] || 'tribe';
        const runningCount = Object.keys(health).filter(k => k.startsWith(proj)).length;
        if (runningCount > 0) {
          state.isDockerRunning = true;
          populateLogServiceSelect();
          startHealthPolling();
          updateStatusPill();
          updateButtons();
          renderSidebar();
          showView('setup');
        } else {
          showView('setup');
        }
      } else {
        showView('setup');
      }
    } else {
      // Saved dir no longer valid — clear and show picker
      clearSavedProjectDir();
      showView('folder-picker');
    }
  } else {
    showView('folder-picker');
  }
})();
