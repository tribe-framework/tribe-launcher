const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray;
let dockerProcess = null;
let isDockerRunning = false;
const isDev = process.argv.includes('--dev');

// ── Runtime project dir (set by renderer after folder selection) ─────────────
let runtimeProjectDir = null;

// ── Electron Store for persistence ───────────────────────────────────────────
let store;
async function getStore() {
  if (!store) {
    const { default: Store } = await import('electron-store');
    store = new Store();
  }
  return store;
}

// ── Project dir resolution ────────────────────────────────────────────────────
function getProjectDir() {
  if (runtimeProjectDir) return runtimeProjectDir;
  if (process.env.TRIBE_PROJECT_DIR) return process.env.TRIBE_PROJECT_DIR;
  return null;
}

function getDockerComposePath() {
  const dir = getProjectDir();
  if (!dir) return null;
  return path.join(dir, 'docker-compose.yml');
}

// ── Tribe project validation ──────────────────────────────────────────────────
function isTribeProject(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  const hasCompose = fs.existsSync(path.join(dir, 'docker-compose.yml'));
  const hasFlame   = fs.existsSync(path.join(dir, '.flame'));
  return hasCompose && hasFlame;
}

// ── Create window ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    show: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    if (isDockerRunning) {
      e.preventDefault();
      mainWindow.webContents.send('confirm-quit');
    }
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: 'Open Tribe Launcher', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: forceQuit },
  ]);
  tray.setToolTip('Tribe Launcher');
  tray.setContextMenu(menu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ── Docker helpers ────────────────────────────────────────────────────────────
function getDockerCmd() {
  return { cmd: 'docker', args: ['compose'] };
}

async function checkDocker() {
  return new Promise((resolve) => {
    exec('docker info', (err) => resolve(!err));
  });
}

async function checkDockerInstalled() {
  return new Promise((resolve) => {
    exec('docker --version', (err) => resolve(!err));
  });
}

async function checkComposeFile() {
  const p = getDockerComposePath();
  return p ? fs.existsSync(p) : false;
}

function checkFlameFile() {
  const dir = getProjectDir();
  if (!dir) return false;
  return fs.existsSync(path.join(dir, '.flame'));
}

function parseEnvFile(projectDir) {
  const envPath = path.join(projectDir, '.env');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

// ── IPC: Project dir management ───────────────────────────────────────────────
ipcMain.handle('set-project-dir', async (_, dir) => {
  runtimeProjectDir = dir;
  const s = await getStore();
  s.set('projectDir', dir);
  return true;
});

ipcMain.handle('get-saved-project-dir', async () => {
  const s = await getStore();
  return s.get('projectDir', null);
});

ipcMain.handle('validate-project-dir', async (_, dir) => {
  return isTribeProject(dir);
});

// ── IPC: Status ───────────────────────────────────────────────────────────────
ipcMain.handle('get-status', async () => {
  const dockerInstalled = await checkDockerInstalled();
  const dockerRunning   = await checkDocker();
  const composeExists   = await checkComposeFile();
  const flameExists     = checkFlameFile();
  const projectDir      = getProjectDir();
  const envVars         = projectDir ? parseEnvFile(projectDir) : {};

  return {
    dockerInstalled,
    dockerRunning,
    composeExists,
    flameExists,
    projectDir,
    isDockerRunning,
    envVars,
    platform: process.platform,
  };
});

// ── IPC: Docker lifecycle ─────────────────────────────────────────────────────
ipcMain.handle('start-services', async () => {
  const projectDir = getProjectDir();
  if (!projectDir) return { success: false, code: -1 };
  isDockerRunning = false;

  return new Promise((resolve) => {
    const { cmd, args } = getDockerCmd();
    const composePath = getDockerComposePath();
    const fullArgs = [...args, '-f', composePath, 'up', '-d', '--remove-orphans'];

    mainWindow.webContents.send('log', `▶ Starting: ${cmd} ${fullArgs.join(' ')}\n`);
    dockerProcess = spawn(cmd, fullArgs, { cwd: projectDir });

    dockerProcess.stdout.on('data', (d) => mainWindow.webContents.send('log', d.toString()));
    dockerProcess.stderr.on('data', (d) => mainWindow.webContents.send('log', d.toString()));

    dockerProcess.on('close', (code) => {
      if (code === 0) {
        isDockerRunning = true;
        mainWindow.webContents.send('log', '\n✅ All services started successfully!\n');
        resolve({ success: true });
      } else {
        mainWindow.webContents.send('log', `\n❌ docker compose exited with code ${code}\n`);
        resolve({ success: false, code });
      }
    });
  });
});

ipcMain.handle('stop-services', async () => {
  const projectDir = getProjectDir();
  if (!projectDir) return { success: false };
  return new Promise((resolve) => {
    const { cmd, args } = getDockerCmd();
    const fullArgs = [...args, '-f', getDockerComposePath(), 'down'];

    mainWindow.webContents.send('log', '⏹ Stopping services…\n');
    const proc = spawn(cmd, fullArgs, { cwd: projectDir });

    proc.stdout.on('data', (d) => mainWindow.webContents.send('log', d.toString()));
    proc.stderr.on('data', (d) => mainWindow.webContents.send('log', d.toString()));

    proc.on('close', (code) => {
      isDockerRunning = false;
      mainWindow.webContents.send('log', code === 0 ? '\n✅ Services stopped.\n' : `\n⚠ Stop exited with code ${code}\n`);
      resolve({ success: code === 0 });
    });
  });
});

ipcMain.handle('restart-services', async () => {
  const projectDir = getProjectDir();
  if (!projectDir) return { success: false };
  return new Promise((resolve) => {
    const { cmd, args } = getDockerCmd();
    const fullArgs = [...args, '-f', getDockerComposePath(), 'restart'];

    mainWindow.webContents.send('log', '🔄 Restarting services…\n');
    const proc = spawn(cmd, fullArgs, { cwd: projectDir });

    proc.stdout.on('data', (d) => mainWindow.webContents.send('log', d.toString()));
    proc.stderr.on('data', (d) => mainWindow.webContents.send('log', d.toString()));

    proc.on('close', (code) => {
      mainWindow.webContents.send('log', code === 0 ? '\n✅ Services restarted.\n' : `\n⚠ Restart exited with code ${code}\n`);
      resolve({ success: code === 0 });
    });
  });
});

ipcMain.handle('get-service-logs', async (_, service) => {
  const projectDir = getProjectDir();
  if (!projectDir) return '';
  return new Promise((resolve) => {
    const { cmd, args } = getDockerCmd();
    const fullArgs = [...args, '-f', getDockerComposePath(), 'logs', '--tail=200', service];

    let output = '';
    const proc = spawn(cmd, fullArgs, { cwd: projectDir });
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); });
    proc.on('close', () => resolve(output));
  });
});

ipcMain.handle('check-service-health', async () => {
  return new Promise((resolve) => {
    exec('docker ps --format "{{.Names}}\\t{{.Status}}"', (err, stdout) => {
      if (err) return resolve({});
      const statuses = {};
      stdout.trim().split('\n').forEach((line) => {
        const [name, ...rest] = line.split('\t');
        if (name) statuses[name] = rest.join('\t');
      });
      resolve(statuses);
    });
  });
});

// ── IPC: System ───────────────────────────────────────────────────────────────
ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('open-project-dir', async () => {
  const dir = getProjectDir();
  if (dir) await shell.openPath(dir);
});

ipcMain.handle('browse-project-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select your Tribe project folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('install-docker', async () => {
  const urls = {
    darwin: 'https://docs.docker.com/desktop/install/mac-install/',
    win32:  'https://docs.docker.com/desktop/install/windows-install/',
    linux:  'https://docs.docker.com/engine/install/',
  };
  await shell.openExternal(urls[process.platform] || 'https://docs.docker.com/get-docker/');
  return true;
});

ipcMain.handle('force-quit', () => forceQuit());

ipcMain.handle('confirm-quit-response', async (_, shouldQuit) => {
  if (shouldQuit) {
    const projectDir = getProjectDir();
    if (projectDir) {
      const { cmd, args } = getDockerCmd();
      const proc = spawn(cmd, [...args, '-f', getDockerComposePath(), 'down'], { cwd: projectDir });
      proc.on('close', () => { isDockerRunning = false; app.quit(); });
    } else {
      app.quit();
    }
  }
});

function forceQuit() {
  isDockerRunning = false;
  app.quit();
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
