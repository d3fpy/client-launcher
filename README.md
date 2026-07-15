<div align="center">

<img src="assets/logo.png" />

---
  
![Electron](https://img.shields.io/badge/Electron-31.0.0-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Status](https://img.shields.io/badge/status-private-orange)

**🇷🇺 [Русский](#-русский) &nbsp;•&nbsp; 🇬🇧 [English](#-english)**
</div>

## 🇷🇺 Русский

Лаунчер, разработанный для собственного чит-клиента Minecraft. Построен на Electron и отвечает за авторизацию, загрузку файлов клиента и его запуск поверх `minecraft-launcher-core`.

### ✨ Возможности

| Функция | Описание |
|---|---|
| 🖥 Интерфейс | Кастомный UI на Electron (`index.html`, `main.js`) |
| 📥 Загрузка | Автоматическая загрузка файлов клиента (`downloader.js`) |
| 🚀 Запуск | Запуск Minecraft через `minecraft-launcher-core` |
| 📦 Сборка | Портативный `.exe` под Windows (`electron-builder`) |

### 🛠 Стек технологий

- **Electron** `^31.0.0`
- **minecraft-launcher-core** `^3.2.2`
- **electron-builder** `^26.15.3`

### 🚀 Быстрый старт

```bash
git clone https://github.com/d3fpy/client-launcher.git
cd client-launcher
npm install
npm start
```

### 📦 Сборка дистрибутива

```bash
npm run dist
```

Собранный `.exe` появится в `dist/`.

### 📁 Структура проекта

```
client-launcher/
├── assets/        # иконки, логотип и прочие ресурсы
├── downloader.js  # логика загрузки файлов клиента
├── index.html     # интерфейс лаунчера
├── main.js        # главный процесс Electron
├── icon.ico       # иконка приложения
├── sfpro.otf      # шрифт интерфейса
└── package.json
```

### 👤 Автор

Разработано **d3fpy**.

<div align="right">

[⬆ Наверх](#-radikware-launcher)

</div>

---

## 🇬🇧 English

A launcher built for a custom Minecraft cheat client. Built with Electron, it handles authentication, downloading client files, and launching the game on top of `minecraft-launcher-core`.

### ✨ Features

| Feature | Description |
|---|---|
| 🖥 UI | Custom Electron-based interface (`index.html`, `main.js`) |
| 📥 Downloads | Automatically downloads client files (`downloader.js`) |
| 🚀 Launch | Launches Minecraft via `minecraft-launcher-core` |
| 📦 Build | Portable Windows `.exe` (`electron-builder`) |

### 🛠 Tech Stack

- **Electron** `^31.0.0`
- **minecraft-launcher-core** `^3.2.2`
- **electron-builder** `^26.15.3`

### 🚀 Quick Start

```bash
git clone https://github.com/d3fpy/client-launcher.git
cd client-launcher
npm install
npm start
```

### 📦 Build

```bash
npm run dist
```

The built `.exe` will appear in `dist/`.

### 📁 Project Structure

```
client-launcher/
├── assets/        # icons, logo, and other assets
├── downloader.js  # client file download logic
├── index.html     # launcher UI
├── main.js        # Electron main process
├── icon.ico       # app icon
├── sfpro.otf      # UI font
└── package.json
```

### 👤 Author

Developed by **d3fpy**.

<div align="right">

[⬆ Back to top](#-radikware-launcher)

</div>
