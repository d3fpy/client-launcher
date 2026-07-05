const { app, BrowserWindow, ipcMain } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');

let activeWorker = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 850,
        height: 520,
        frame: false,
        resizable: false,
        icon: path.join(__dirname, 'logo.png'), // Указываем иконку для панели задач (замените logo.png на ваше имя файла, если оно другое)
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
    win.webContents.openDevTools();

    // ── IPC: запуск скачивания/распаковки/игры в worker_threads из main-процесса ──
    // (worker_threads не работают из renderer-процесса Electron — только из main)
    ipcMain.on('start-launch', (event, payload) => {
        // Если уже что-то запущено — игнорируем повторный клик
        if (activeWorker) return;

        activeWorker = new Worker(path.join(__dirname, 'downloader.js'), {
            workerData: payload
        });

        activeWorker.on('message', (msg) => {
            if (!win.isDestroyed()) win.webContents.send('launch-status', msg);
        });

        activeWorker.on('error', (err) => {
            if (!win.isDestroyed()) {
                win.webContents.send('launch-status', { type: 'status', text: `[Ошибка]: ${err.message}` });
                win.webContents.send('launch-status', { type: 'close', code: 1 });
            }
            activeWorker = null;
        });

        activeWorker.on('exit', () => {
            activeWorker = null;
        });
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});