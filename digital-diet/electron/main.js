const {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  ipcMain,
  screen,
  Menu,
  shell,
} = require("electron");
const path = require("path");
const { scanLocalLibrary } = require("./scanner");
const store = require("./store");
const google = require("./providers/google");
const onedrive = require("./providers/onedrive");
const { scanCloud } = require("./cloudScan");
const { deleteFiles } = require("./cleanup");

app.setName("디지털 다이어트");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let tray = null;
let panel = null;
let isQuitting = false;
let suppressBlurHide = false;
let launchAtLogin = app.getLoginItemSettings().openAtLogin;

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 740;

function asset(...parts) {
  return path.join(__dirname, "..", "assets", ...parts);
}

function createTrayIcon() {
  const candidates = [
    asset("tray.png"),
    asset("house-128.png"),
    asset("MenuBarIconTemplate.png"),
  ];

  for (const file of candidates) {
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) {
      const sized = image.resize({ width: 18, height: 18, quality: "best" });
      if (file.includes("Template")) sized.setTemplateImage(true);
      return sized;
    }
  }

  return nativeImage.createEmpty();
}

function createPanel() {
  panel = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    hasShadow: true,
    backgroundColor: "#fff4f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === "darwin") {
    panel.setWindowButtonVisibility(false);
  }
  panel.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  panel.on("blur", () => {
    if (!isQuitting && !suppressBlurHide) hidePanel();
  });

  panel.on("closed", () => {
    panel = null;
  });
}

function positionPanel() {
  if (!panel || !tray) return;

  const trayBounds = tray.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(
    trayBounds.width ? { x: trayBounds.x, y: trayBounds.y } : cursor
  );
  const work = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - PANEL_WIDTH / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + 6);

  if (!Number.isFinite(x) || !trayBounds.width) {
    x = Math.round(cursor.x - PANEL_WIDTH / 2);
    y = Math.round(work.y + 8);
  }

  x = Math.min(Math.max(work.x + 8, x), work.x + work.width - PANEL_WIDTH - 8);
  y = Math.min(y, work.y + work.height - PANEL_HEIGHT - 8);

  panel.setPosition(x, y, false);
}

function showPanel() {
  if (!panel) createPanel();
  positionPanel();
  panel.show();
  panel.focus();
}

function hidePanel() {
  if (panel && panel.isVisible()) panel.hide();
}

function togglePanel() {
  if (panel && panel.isVisible()) hidePanel();
  else showPanel();
}

function setLaunchAtLogin(enabled) {
  launchAtLogin = enabled;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath,
    args: app.isPackaged ? [] : [path.resolve(process.argv[1] || ".")],
  });
}

function rebuildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "디지털 집 열기", click: showPanel },
    { type: "separator" },
    {
      label: "로그인 시 자동 실행",
      type: "checkbox",
      checked: launchAtLogin,
      click: (item) => setLaunchAtLogin(item.checked),
    },
    {
      label: "프로젝트 폴더 열기",
      click: () => shell.openPath(path.join(__dirname, "..")),
    },
    { type: "separator" },
    {
      label: "디지털 다이어트 종료",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("디지털 다이어트 — 메뉴바에서 바로 정리");
  tray.on("click", togglePanel);
  tray.on("right-click", () => {
    tray.popUpContextMenu(rebuildTrayMenu());
  });
}

async function withOAuthUi(fn) {
  suppressBlurHide = true;
  showPanel();
  try {
    return await fn();
  } finally {
    suppressBlurHide = false;
    showPanel();
  }
}

ipcMain.handle("scan-local", async (_event, options = {}) => {
  try {
    const result = await scanLocalLibrary(options);
    if (result?.piles) {
      result.piles = result.piles.map((pile) => ({
        ...pile,
        groups: pile.groups.map((g) => ({
          ...g,
          files: g.files.map((f) => ({ ...f, source: f.source || "local" })),
        })),
      }));
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
      rooms: [],
      summary: null,
    };
  }
});

ipcMain.handle("scan-cloud", async () => {
  try {
    return await scanCloud();
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("get-connections", () => store.connectionStatus());

ipcMain.handle("save-config", (_e, partial) => store.setConfig(partial || {}));

ipcMain.handle("connect-google", async () => {
  try {
    return await withOAuthUi(() => google.connect());
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("disconnect-google", () => google.disconnect());

ipcMain.handle("connect-microsoft", async () => {
  try {
    return await withOAuthUi(() => onedrive.connect());
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("disconnect-microsoft", () => onedrive.disconnect());

ipcMain.handle("delete-files", async (_e, files) => {
  try {
    return await deleteFiles(files || []);
  } catch (error) {
    return { ok: false, error: error.message || String(error), results: [] };
  }
});

ipcMain.handle("open-external", async (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    await shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle("hide-panel", () => hidePanel());
ipcMain.handle("quit-app", () => {
  isQuitting = true;
  app.quit();
});
ipcMain.handle("get-app-info", () => ({
  packaged: app.isPackaged,
  version: app.getVersion(),
  launchAtLogin,
  connections: store.connectionStatus(),
}));

app.on("second-instance", () => {
  showPanel();
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  createTray();
  createPanel();

  // Open the house panel immediately so users can find the app.
  setTimeout(showPanel, 400);
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("activate", () => {
  showPanel();
});

app.on("before-quit", () => {
  isQuitting = true;
});
