const { parentPort, workerData } = require('worker_threads');
const { Client, Authenticator } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const { nick, gameRoot, clientZip } = workerData;

// ─── Имя корневой папки внутри архива сборки на Dropbox ─────────────────────
// Архив запакован как "radikware/versions/...", "radikware/mods/..." и т.д.
// После распаковки это нужно "расплющить" в gameRoot напрямую.
const ARCHIVE_ROOT_FOLDER = 'radikware';

const versionsDir = path.join(gameRoot, 'versions');
const modsDir = path.join(gameRoot, 'mods');

function send(text) {
    parentPort.postMessage({ type: 'status', text });
}

// ─── Рекурсивно переносит содержимое srcDir в destDir ───────────────────────
// overwrite = false: слияние без перезаписи (используется при миграции старых
//             "вложенных" установок — там трогать чужие файлы не нужно)
// overwrite = true:  файлы сборки ВСЕГДА затирают то, что лежит в gameRoot —
//             именно так должны накатываться обновления клиента
function mergeDirInto(srcDir, destDir, overwrite = false) {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            mergeDirInto(srcPath, destPath, overwrite);
        } else if (overwrite) {
            // Полная замена: убираем то, что лежит на месте (файл или папка), и кладём новое
            if (fs.existsSync(destPath)) {
                const stat = fs.lstatSync(destPath);
                if (stat.isDirectory()) {
                    fs.rmSync(destPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(destPath);
                }
            }
            fs.renameSync(srcPath, destPath);
        } else {
            // Не перезаписываем уже существующие файлы (настройки и т.п.)
            if (!fs.existsSync(destPath)) {
                fs.renameSync(srcPath, destPath);
            }
        }
    }
}

function removeDirRecursive(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Находит реальную папку с версией Minecraft (по jar внутри versions/*) ────
function findVanillaJar(root) {
    const vDir = path.join(root, 'versions');
    if (!fs.existsSync(vDir)) return null;
    for (const entry of fs.readdirSync(vDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const jarPath = path.join(vDir, entry.name, `${entry.name}.jar`);
        if (fs.existsSync(jarPath)) return { id: entry.name, jarPath };
    }
    return null;
}

function findFabricVersion(root) {
    const vDir = path.join(root, 'versions');
    if (!fs.existsSync(vDir)) return null;
    for (const entry of fs.readdirSync(vDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('fabric-loader-')) {
            return entry.name;
        }
    }
    return null;
}

// ─── Проверка: установлена ли уже рабочая сборка ────────────────────────────
function isInstalled(root) {
    const hasVersion = !!findVanillaJar(root) || !!findFabricVersion(root);
    const hasMods = fs.existsSync(modsDir) && fs.readdirSync(modsDir).length > 0;
    return hasVersion && hasMods;
}

// ─── Миграция: если раньше архив был распакован "в себя" (gameRoot/radikware/...)
// из-за старого бага — расплющиваем эту вложенность один раз при старте ───────
function migrateNestedInstall() {
    const nestedByName = path.join(gameRoot, ARCHIVE_ROOT_FOLDER);
    if (fs.existsSync(nestedByName) && fs.statSync(nestedByName).isDirectory()) {
        send('[Radikware]: Обнаружена старая вложенная установка, исправляем структуру...');
        mergeDirInto(nestedByName, gameRoot);
        removeDirRecursive(nestedByName);
        return;
    }

    // Запасной вариант: versions/ нет в корне, но есть ровно одна папка-кандидат,
    // внутри которой есть versions/ или mods/.
    if (!fs.existsSync(versionsDir)) {
        const entries = fs.readdirSync(gameRoot, { withFileTypes: true })
            .filter(e => e.isDirectory());
        const candidate = entries.find(e => {
            const inner = path.join(gameRoot, e.name);
            return fs.existsSync(path.join(inner, 'versions')) || fs.existsSync(path.join(inner, 'mods'));
        });
        if (candidate) {
            send('[Radikware]: Обнаружена нестандартная структура установки, исправляем...');
            const innerPath = path.join(gameRoot, candidate.name);
            mergeDirInto(innerPath, gameRoot);
            removeDirRecursive(innerPath);
        }
    }
}

// ─── Нормализация только что распакованного архива (та же проблема, но для tmp) ──
function normalizeExtractedTmp(tmpDir) {
    const directRootMarkers = ['versions', 'mods'];
    const hasDirectStructure = directRootMarkers.some(name => fs.existsSync(path.join(tmpDir, name)));

    if (hasDirectStructure) {
        // Архив распаковался без обёртки — переносим как есть
        mergeDirInto(tmpDir, gameRoot);
        return;
    }

    // Ищем обёрточную папку внутри tmp (по фиксированному имени, иначе — единственную)
    const entries = fs.readdirSync(tmpDir, { withFileTypes: true }).filter(e => e.isDirectory());
    let wrapper = entries.find(e => e.name === ARCHIVE_ROOT_FOLDER);
    if (!wrapper && entries.length === 1) {
        wrapper = entries[0];
    }

    if (wrapper) {
        mergeDirInto(path.join(tmpDir, wrapper.name), gameRoot);
    } else {
        // Структура неожиданная — переносим всё содержимое tmp как есть
        mergeDirInto(tmpDir, gameRoot);
    }
}

// ─── Скачать и распаковать сборку с Dropbox ─────────────────────────────────
async function downloadAndExtract() {
    const zipPath = path.join(gameRoot, 'radikware_temp.zip');
    const tmpExtractDir = path.join(gameRoot, '_radikware_extract_tmp');

    send('[Radikware]: Подключение к Dropbox... Начинается скачивание сборки.');

    const response = await fetch(clientZip, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    // Прогресс по Content-Length
    const total = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    let lastPct = -1;

    const fileStream = fs.createWriteStream(zipPath);

    // Читаем поток вручную, чтобы показывать прогресс
    const reader = response.body.getReader();
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
                send(`[Radikware]: Скачивание... ${pct}% (${(received / 1048576).toFixed(1)} МБ)`);
                lastPct = pct;
            }
        }
    }
    fileStream.write(Buffer.concat(chunks));
    fileStream.end();
    await new Promise((res, rej) => {
        fileStream.on('finish', res);
        fileStream.on('error', rej);
    });

    send('[Radikware]: Архив скачан! Распаковка...');

    // Распаковываем во временную папку, чтобы корректно нормализовать структуру
    removeDirRecursive(tmpExtractDir);
    fs.mkdirSync(tmpExtractDir, { recursive: true });

    const escapedZip = zipPath.replace(/'/g, "''");
    const escapedTmp = tmpExtractDir.replace(/'/g, "''");
    execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedTmp}' -Force"`, { stdio: 'pipe' });

    send('[Radikware]: Нормализация структуры сборки...');
    normalizeExtractedTmp(tmpExtractDir);

    // Удаляем временные файлы
    removeDirRecursive(tmpExtractDir);
    try { fs.unlinkSync(zipPath); } catch (_) { }

    send('[Radikware]: Сборка распакована успешно!');
}

// ─── Запуск Minecraft через minecraft-launcher-core ──────────────────────────
async function launchMinecraft() {
    const launcher = new Client();

    // Пробрасываем логи Майнкрафта в UI
    launcher.on('data', (e) => {
        parentPort.postMessage({ type: 'minecraft-log', text: String(e).trim() });
    });
    launcher.on('close', (code) => {
        parentPort.postMessage({ type: 'close', code });
    });
    launcher.on('progress', (e) => {
        send(`[Mojang]: Загрузка... ${e.task}/${e.total}`);
    });

    // Определяем версию для запуска: Fabric из сборки, иначе — ванильный jar, который реально есть на диске
    const fabricVersionId = findFabricVersion(gameRoot);
    const vanilla = findVanillaJar(gameRoot);

    let versionId;
    if (fabricVersionId) {
        versionId = fabricVersionId;
        send('[Radikware]: Обнаружен Fabric — запуск через Fabric Loader.');
    } else if (vanilla) {
        versionId = vanilla.id;
        send(`[Radikware]: Fabric не найден — запуск версии ${versionId}.`);
    } else {
        throw new Error('Не найдена ни одна версия Minecraft в папке versions/. Переустановите сборку.');
    }

    const opts = {
        authorization: Authenticator.getAuth(nick),
        root: gameRoot,
        version: {
            number: versionId,
            type: 'release',
        },
        memory: {
            max: '4G',
            min: '2G',
        },
    };

    await launcher.launch(opts);
}

// ─── Главная логика ──────────────────────────────────────────────────────────
async function start() {
    try {
        // Создаём gameRoot если нет
        if (!fs.existsSync(gameRoot)) {
            fs.mkdirSync(gameRoot, { recursive: true });
        }

        // Чинит установки, испорченные старым багом (сборка внутри сборки)
        migrateNestedInstall();

        if (!isInstalled(gameRoot)) {
            send('[Radikware]: Файлы игры не найдены или сборка неполная. Начинаем установку...');
            await downloadAndExtract();

            if (!isInstalled(gameRoot)) {
                throw new Error('После распаковки сборка всё равно не найдена. Проверьте структуру архива на Dropbox.');
            }
        } else {
            send('[Radikware]: Все файлы на месте. Быстрый запуск...');
        }

        await launchMinecraft();

    } catch (err) {
        send(`[Критическая ошибка]: ${err.message}`);
        console.error(err);
        parentPort.postMessage({ type: 'close', code: 1 });
    }
}

start();