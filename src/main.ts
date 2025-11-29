import { app, BrowserWindow } from 'electron';
import * as path from 'path';

function createWindow() {
  // Erstelle das Browser-Fenster
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Lade die index.html Datei
  mainWindow.loadFile(path.join(__dirname, '../index.html'));
}

// Wenn Electron bereit ist, Fenster öffnen
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Beenden, wenn alle Fenster geschlossen sind (außer auf Mac)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});