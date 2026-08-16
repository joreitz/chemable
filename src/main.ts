import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as https from 'https';

const REPO = 'joreitz/chemable';

function appVersion(): string {
    if (app.isPackaged) return app.getVersion();
    try {
        const fs = require('fs');
        return JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;
    } catch { return app.getVersion(); }
}

function ghLatest(): Promise<any> {
  return new Promise((res, rej) => {
    https.get({
      host: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: { 'User-Agent': 'chemable-updater', 'Accept': 'application/vnd.github+json' }
    }, r => {
      if ((r.statusCode || 0) >= 400) { r.resume(); rej(new Error('HTTP ' + r.statusCode)); return; }
      let buf = '';
      r.on('data', c => buf += c);
      r.on('end', () => { try { res(JSON.parse(buf)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

function cmpSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000, height: 800,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  mainWindow.loadFile(path.join(__dirname, '../index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

  ipcMain.handle('check-update', async () => {
    const rel = await ghLatest();
    const latest = String(rel.tag_name || rel.name || '').replace(/^v/, '');
    const current = appVersion();
    return { current, latest, hasUpdate: cmpSemver(latest, current) > 0,
             url: rel.html_url as string, notes: String(rel.body || '').slice(0, 1500) };
  });

  ipcMain.handle('open-external', (_e, url: string) => shell.openExternal(url));

  // In-App-Update; fällt auf Download-Link zurück, wenn nicht verfügbar
  ipcMain.handle('run-autoupdate', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev-mode' };
    try {
      const { autoUpdater } = require('electron-updater');
      const win = BrowserWindow.getAllWindows()[0];
      autoUpdater.autoDownload = true;
      autoUpdater.on('download-progress', (p: any) => win?.webContents.send('update-progress', p.percent));
      autoUpdater.on('update-downloaded', () => win?.webContents.send('update-ready'));
      autoUpdater.on('error', (err: any) => win?.webContents.send('update-error', String(err)));
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (e: any) { return { ok: false, reason: e.message }; }
  });

  ipcMain.handle('install-update', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });