# Tribe Launcher

A cross-platform desktop application (Linux · macOS · Windows) that manages your entire Tribe Framework Docker stack from a single window.

## What it does

- **Checks for Docker** on startup — links to the installer if missing
- **Starts / stops / restarts** all docker-compose services with one click
- **Embedded browser** — opens Tribe (port 12000) and lets you navigate to any service without leaving the app
- **Live log streaming** — watch `docker compose up` output in real time
- **Per-service logs** — tail logs for any individual container
- **Health polling** — status indicators update every 5 seconds
- **System tray** — keeps running in the background
- **Reads your `.env`** — respects custom port variables automatically

---

## Prerequisites

| Requirement | Notes |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS / Windows) | Or Docker Engine + Compose plugin on Linux |
| Your `docker-compose.yml` project folder | The Tribe Framework project |

---

## Running from source (development)

```bash
# 1. Clone / download this launcher into your Tribe project root
#    (same directory as docker-compose.yml)

# 2. Install dependencies
npm install

# 3. Start
npm start
```

The app expects `docker-compose.yml` to live in the **same directory as the executable** (or the project root when running from source).

---

## Building distributable installers

```bash
# macOS (DMG + ZIP for x64 and Apple Silicon)
npm run build:mac

# Windows (NSIS installer + portable EXE)
npm run build:win

# Linux (AppImage + .deb + .rpm)
npm run build:linux

# All platforms at once (requires macOS host for full build)
npm run build:all
```

Outputs land in the `dist/` folder.

> **Cross-platform note**: Building the Windows installer on Linux/macOS requires Wine. Building the macOS DMG on Linux is not supported by electron-builder. The recommended approach is to build on the target OS, or use a CI system like GitHub Actions.

---

## Project layout

```
launcher/
├── src/
│   ├── main.js        ← Electron main process (Docker orchestration)
│   ├── preload.js     ← Secure IPC bridge
│   └── renderer/
│       ├── index.html ← App UI
│       └── renderer.js← UI logic
├── assets/
│   ├── icon.png       ← 512×512 app icon
│   ├── icon.icns      ← macOS icon (generated from icon.png)
│   └── icon.ico       ← Windows icon (generated from icon.png)
├── package.json
└── README.md
```

Place this entire folder **inside** your Tribe project root (next to `docker-compose.yml`), or set the `TRIBE_PROJECT_DIR` environment variable to point to your project.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TRIBE_PROJECT_DIR` | Executable directory | Override the docker-compose project path |

All port variables (`TRIBE_PORT`, `PHPMYADMIN_PORT`, etc.) are read from your project's `.env` file automatically.

---

## Generating icons

```bash
# macOS: use iconutil or a tool like icon-gen
npx icon-gen -i assets/icon.png -o assets/ --icns --ico

# Or use https://www.icoconverter.com for a quick .ico
```

A placeholder `icon.png` is included. Replace it with your own 512×512 PNG.

---

## License

MIT
