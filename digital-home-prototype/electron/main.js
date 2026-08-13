const {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  Menu,
  screen,
  ipcMain,
} = require("electron");
const path = require("path");
const { resolveBinary } = require("./localAgent");
const { runFederatedScan, spacesFromIndex, ensureDevices } = require("./orchestrator");
const { DesktopPetController } = require("./desktopPet");
const petLocation = require("./petLocation");
const trayState = require("./trayState");
const store = require("./store");
const indexStore = require("./indexStore");
const lanPeer = require("./peers/lanPeer");
const agentEvents = require("./agentEvents");

app.setName("BIUM");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let win = null;
/** @type {Tray | null} */
let tray = null;
/** @type {DesktopPetController | null} */
let pet = null;
let isQuitting = false;
/** @type {"mini"|"home"} */
let displayMode = "mini";
/** last found duplicate group for panel */
let lastPrimary = null;

/** Compact TrayPopover (+ habitat + devices) */
const MINI_W = 300;
const MINI_H = 560;
/** @type {number} */
let trayBadge = 0;
const HOME_W = 1280;
const HOME_H = 860;

function root(...parts) {
  return path.join(__dirname, "..", ...parts);
}

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send(channel, payload);
    } catch {
      /* ignore */
    }
  }
}

function createTrayIcon() {
  // Prefer template house icon (macOS menu bar monochrome)
  const candidates = [
    root("assets", "icons", "trayTemplate.png"),
    root("assets", "icons", "tray.png"),
    root("assets", "icons", "house.png"),
    root("build", "trayTemplate.png"),
    root("build", "tray.png"),
  ];

  for (const file of candidates) {
    try {
      let image = nativeImage.createFromPath(file);
      if (image.isEmpty()) continue;
      if (/Template\.png$/i.test(file)) {
        image.setTemplateImage(true);
      }
      const size = image.getSize();
      if (size.width > 22 || size.height > 22) {
        image = image.resize({ width: 18, height: 18, quality: "best" });
        if (/Template/i.test(file)) image.setTemplateImage(true);
      }
      return image;
    } catch {
      /* skip */
    }
  }
  return nativeImage.createEmpty();
}

function positionMiniNearTray() {
  if (!win || !tray) return;
  const trayBounds = tray.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(
    trayBounds.width ? { x: trayBounds.x, y: trayBounds.y } : cursor
  );
  const work = display.workArea;
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - MINI_W / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + 6);
  if (!Number.isFinite(x) || !trayBounds.width) {
    x = Math.round(cursor.x - MINI_W / 2);
    y = Math.round(cursor.y + 12);
  }
  x = Math.min(Math.max(work.x + 8, x), work.x + work.width - MINI_W - 8);
  y = Math.min(Math.max(work.y + 8, y), work.y + work.height - MINI_H - 8);
  win.setBounds({ x, y, width: MINI_W, height: MINI_H }, false);
}

function applyHomeBounds() {
  if (!win) return;
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.min(HOME_W, display.width - 40);
  const height = Math.min(HOME_H, display.height - 40);
  const x = Math.round(display.x + (display.width - width) / 2);
  const y = Math.round(display.y + (display.height - height) / 2);
  win.setMinimumSize(1100, 720);
  win.setBounds({ x, y, width, height }, true);
  win.setResizable(true);
}

function applyMiniBounds() {
  if (!win) return;
  win.setMinimumSize(280, 300);
  win.setResizable(false);
  positionMiniNearTray();
}

function applyDisplayMode(mode) {
  displayMode = mode === "home" ? "home" : "mini";
  if (displayMode === "home") applyHomeBounds();
  else applyMiniBounds();
  return displayMode;
}

function createPanelWindow() {
  win = new BrowserWindow({
    width: MINI_W,
    height: MINI_H,
    minWidth: 280,
    minHeight: 300,
    show: false,
    // Empty title — avoids native label under traffic lights
    title: "",
    backgroundColor: "#f8f2e7",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 14 },
    roundedCorners: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(root("index.html"));
  try {
    win.setTitle("");
  } catch {
    /* ignore */
  }

  // Menu-bar utility: do NOT auto-open dashboard — tray click opens popover
  win.once("ready-to-show", () => {
    applyDisplayMode("mini");
  });

  win.on("close", (e) => {
    if (!isQuitting && process.platform === "darwin") {
      e.preventDefault();
      win?.hide();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

function showWindow() {
  if (!win) createPanelWindow();
  if (displayMode === "mini") positionMiniNearTray();
  else if (displayMode === "home") applyHomeBounds();
  win?.show();
  win?.focus();
}

function ensurePet() {
  if (!pet) {
    pet = new DesktopPetController({
      root,
      onAlertClick: () => openFindings(),
      onLocation: (snap) => broadcast("bium:pet-location", snap),
    });
  }
  pet.create();
  return pet;
}

async function runDesktopPetScan(options = {}) {
  const controller = ensurePet();
  const runScan = async (send) => {
    const forward = (payload) => {
      send(payload);
      broadcast("bium:scan-progress", payload);
    };
    try {
      return await runFederatedScan({ ...options, send: forward });
    } catch (err) {
      forward({ phase: "error", text: err.message || "스캔 실패" });
      return runFederatedScan({ engine: "fixture", send: forward });
    }
  };

  trayState.setScanning("탐색 중...");
  applyTrayPresentation();

  let out;
  try {
    out = await controller.playAgentStory({
      runScan,
      onFound: (primary) => {
        lastPrimary = primary;
        const n = primary?.files?.length || 0;
        trayBadge = n;
        trayState.setFound(n, "새 발견");
        applyTrayPresentation();
        broadcast("bium:pet-found", { primary });
      },
    });
  } catch (err) {
    trayState.setError(err.message || "오류");
    applyTrayPresentation();
    throw err;
  }

  if (out?.scan?.primary) lastPrimary = out.scan.primary;
  if (out?.found) {
    trayBadge = out.scan?.primary?.files?.length || trayBadge || 1;
    trayState.setFound(trayBadge, "새 발견");
  } else if (out?.summoned) {
    trayState.setIdle("호출됨");
  } else {
    trayState.setIdle("탐색 완료");
  }
  applyTrayPresentation();
  return {
    ok: !!out?.ok,
    found: !!out?.found,
    summoned: !!out?.summoned,
    usedFixture: out?.scan?.usedFixture,
    roomsVisited: out?.scan?.roomsVisited,
    primary: out?.scan?.primary || lastPrimary,
    result: out?.scan?.result,
    desktopPet: true,
  };
}

function openFindings() {
  applyDisplayMode("mini");
  win?.webContents.send("bium:display-mode", "mini");
  showWindow();
  if (lastPrimary) {
    win?.webContents.send("bium:pet-found", { primary: lastPrimary });
  }
}

function applyTrayPresentation() {
  if (!tray) return;
  const snap = trayState.snapshot();
  const loc = petLocation.snapshot();
  const tipParts = ["BIUM"];
  if (snap.status === "scanning" || loc.away) {
    tipParts.push(loc.statusLine || snap.label || "탐색 중");
  } else if (snap.status === "found") {
    tipParts.push(`발견 ${snap.foundCount}`);
  } else if (snap.status === "error") {
    tipParts.push(snap.label || "오류");
  } else {
    tipParts.push("메뉴바에서 열기");
  }
  tray.setToolTip(tipParts.join(" · "));
  if (process.platform === "darwin") {
    try {
      tray.setTitle(snap.title || "");
    } catch {
      /* ignore */
    }
  }
}

function updateTrayTooltip() {
  applyTrayPresentation();
}

async function summonPetHome(source = "ui") {
  const p = ensurePet();
  p.requestSummon();
  agentEvents.emit(agentEvents.Events.PET_RETURN_HOME, { source });
  const snap = await p.summonHere();
  broadcast("bium:pet-location", snap);
  trayState.setIdle("집에 있어요");
  applyTrayPresentation();
  return snap;
}

function createTray() {
  tray = new Tray(createTrayIcon());
  trayState.setIdle();
  applyTrayPresentation();
  trayState.onChange(() => applyTrayPresentation());
  petLocation.onChange(() => applyTrayPresentation());

  // Left-click → toggle compact popover under menu bar
  tray.on("click", () => {
    if (win?.isVisible() && displayMode === "mini") win.hide();
    else {
      applyDisplayMode("mini");
      win?.webContents.send("bium:display-mode", "mini");
      showWindow();
    }
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "탐색 시작",
      click: () => {
        runDesktopPetScan().catch((err) => {
          console.error(err);
          trayState.setError(err.message || "오류");
          applyTrayPresentation();
        });
      },
    },
    {
      label: "여기로 와!",
      click: () => {
        summonPetHome("tray-menu").catch((err) => console.error(err));
      },
    },
    {
      label: "발견한 항목 보기",
      click: () => openFindings(),
    },
    { type: "separator" },
    {
      label: "BIUM 종료",
      click: () => {
        isQuitting = true;
        pet?.destroy();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  // Menu-bar utility: hide Dock icon when possible (also LSUIElement in Info.plist)
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.hide();
    } catch {
      /* ignore */
    }
  }

  createPanelWindow();
  createTray();
  ensureDevices();
  ensurePet();
  // Pet overlay sleeps quietly; popover opens only from tray click
  pet.setVisible(true);
  pet.sleepInCorner();

  lanPeer
    .start({ alias: osHostname() })
    .then((id) => console.log("[BIUM LAN]", id))
    .catch((err) => console.warn("[BIUM LAN] start failed", err.message));

  lanPeer.onPetSync((msg) => {
    if (msg?.event === "CAT_ENTER_LEFT") {
      agentEvents.emit(agentEvents.Events.CAT_ENTER_LEFT, msg);
      pet?.setVisible(true);
      pet?.setPose({
        state: "run",
        facing: "right",
        speech: "이번엔 이 Desktop을 볼게요",
        clickThrough: true,
      });
    }
    if (msg?.event === "CAT_EXIT_RIGHT") {
      agentEvents.emit(agentEvents.Events.CAT_EXIT_RIGHT, msg);
    }
  });

  agentEvents.onAgent((ev) => {
    broadcast("bium:agent-event", ev);
    if (ev.type === agentEvents.Events.PET_RETURN_HOME) return;
    if (!pet || pet.busy) return;
    const pose = agentEvents.poseForEvent(ev.type);
    if (!pose) return;
    if (ev.type === agentEvents.Events.CAT_EXIT_RIGHT) {
      pet.setPose({
        state: "run",
        facing: "right",
        speech: pose.speech || ev.text || "",
        clickThrough: true,
      });
    }
  });

  // Dock activate still opens popover (dev without LSUIElement)
  app.on("activate", () => {
    applyDisplayMode("mini");
    showWindow();
  });
});

function osHostname() {
  try {
    return require("os").hostname().split(".")[0] || "BIUM";
  } catch {
    return "BIUM";
  }
}

app.on("second-instance", () => showWindow());
app.on("before-quit", () => {
  isQuitting = true;
  try {
    lanPeer.stop();
  } catch {
    /* ignore */
  }
  pet?.destroy();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("pet:ready", () => {
  pet?.pushView();
});

ipcMain.on("pet:clicked", () => {
  openFindings();
});

ipcMain.on("pet:drag-begin", (_e, pos) => {
  ensurePet().beginDrag(Number(pos?.x) || 0, Number(pos?.y) || 0);
});

ipcMain.on("pet:drag-move", (_e, pos) => {
  pet?.dragTo(Number(pos?.x) || 0, Number(pos?.y) || 0);
});

ipcMain.on("pet:drag-end", () => {
  pet?.endDrag()?.catch?.((err) => console.error(err));
});

ipcMain.handle("bium:ping", () => ({ ok: true, name: "BIUM", desktopPet: true }));
ipcMain.handle("bium:getDisplayMode", () => displayMode);
ipcMain.handle("bium:setDisplayMode", (_e, mode) => applyDisplayMode(mode));

ipcMain.handle("bium:scanStatus", () => ({
  ok: true,
  hasCzkawka: !!resolveBinary(),
  engine: process.env.BIUM_SCAN_ENGINE || "auto",
  desktopPet: true,
  petVisible: !!pet?.visible,
  location: petLocation.snapshot(),
}));

ipcMain.handle("bium:getPetLocation", () => petLocation.snapshot());

ipcMain.handle("bium:summonPet", async () => {
  const snap = await summonPetHome("popover");
  return { ok: true, location: snap };
});

ipcMain.handle("bium:petScan", async (_e, options = {}) => {
  return runDesktopPetScan(options);
});

ipcMain.handle("bium:petVisible", (_e, on) => {
  const p = ensurePet();
  if (typeof on === "boolean") {
    p.setVisible(on);
    if (on) p.sleepInCorner();
  }
  return { visible: p.visible };
});

ipcMain.handle("bium:setTrayBadge", (_e, n) => {
  trayBadge = Math.max(0, Number(n) || 0);
  if (trayBadge > 0) trayState.setFound(trayBadge);
  else trayState.setIdle();
  applyTrayPresentation();
  return { badge: trayBadge, tray: trayState.snapshot() };
});

/** Panel-triggered Local Agent (also drives desktop pet when possible) */
ipcMain.handle("bium:scanLocal", async (event, options = {}) => {
  if (pet && !pet.busy) {
    return runDesktopPetScan(options);
  }

  const wc = event.sender;
  const send = (payload) => {
    try {
      wc.send("bium:scan-progress", payload);
    } catch {
      /* window gone */
    }
  };
  try {
    const out = await runFederatedScan({ ...options, send });
    return out;
  } catch (err) {
    send({ phase: "error", text: err.message || "스캔 실패" });
    const out = await runFederatedScan({ engine: "fixture", send });
    return { ...out, fallbackError: err.message };
  }
});

ipcMain.handle("bium:getConnections", () => {
  ensureDevices();
  return {
    ok: true,
    status: store.connectionStatus(),
    spaces: spacesFromIndex(),
    index: indexStore.snapshot(),
  };
});

function publishConnections() {
  const payload = {
    status: store.connectionStatus(),
    spaces: spacesFromIndex(),
  };
  broadcast("bium:connections", payload);
  return payload;
}

async function connectGoogleSpace() {
  const cfg = store.getConfig();
  ensureDevices();
  if (!cfg.googleClientId) {
    const { QUOTA } = require("./peers/gdriveDemo");
    indexStore.setDeviceConnected("gdrive", true);
    indexStore.setDeviceQuota("gdrive", QUOTA.usedBytes, QUOTA.totalBytes);
    publishConnections();
    return {
      ok: true,
      demo: true,
      spaceId: "gdrive",
      message: "Google Drive를 연결했어요",
    };
  }
  const google = require("./providers/google");
  const res = await google.connect();
  indexStore.setDeviceConnected("gdrive", true);
  try {
    const about = await google.aboutStorage();
    if (about) indexStore.setDeviceQuota("gdrive", about.usage, about.limit || 0);
  } catch {
    /* ignore */
  }
  publishConnections();
  return { ok: true, spaceId: "gdrive", ...res };
}

async function connectSpace(spaceId) {
  ensureDevices();
  const id = String(spaceId || "");

  if (id === "gdrive") return connectGoogleSpace();

  if (id === "onedrive") {
    // Hackathon demo — no Microsoft OAuth client required
    indexStore.setDeviceConnected("onedrive", true);
    indexStore.setDeviceQuota(
      "onedrive",
      42 * 1024 ** 3,
      100 * 1024 ** 3
    );
    publishConnections();
    return {
      ok: true,
      demo: true,
      spaceId: "onedrive",
      message: "OneDrive를 연결했어요",
    };
  }

  if (id === "windows-peer") {
    const { QUOTA } = require("./peers/windowsStub");
    indexStore.setDeviceConnected("windows-peer", true);
    indexStore.setDeviceQuota("windows-peer", QUOTA.usedBytes, QUOTA.totalBytes);
    publishConnections();
    return {
      ok: true,
      demo: true,
      spaceId: "windows-peer",
      message: "Windows Desktop을 연결했어요",
    };
  }

  if (id === "mac-local") {
    indexStore.setDeviceConnected("mac-local", true);
    publishConnections();
    return { ok: true, spaceId: "mac-local", message: "MacBook은 이미 연결돼 있어요" };
  }

  return { ok: false, error: "unknown-space" };
}

ipcMain.handle("bium:connectGoogle", async () => connectGoogleSpace());

ipcMain.handle("bium:connectSpace", async (_e, spaceId) => {
  try {
    return await connectSpace(spaceId);
  } catch (err) {
    return { ok: false, error: err.message || "connect-failed" };
  }
});

ipcMain.handle("bium:disconnectGoogle", () => {
  const google = require("./providers/google");
  google.disconnect();
  indexStore.setDeviceConnected("gdrive", false);
  publishConnections();
  return { ok: true };
});

ipcMain.handle("bium:disconnectSpace", (_e, spaceId) => {
  const id = String(spaceId || "");
  if (id === "gdrive") {
    try {
      require("./providers/google").disconnect();
    } catch {
      /* ignore */
    }
  }
  if (id && id !== "mac-local") {
    indexStore.setDeviceConnected(id, false);
  }
  publishConnections();
  return { ok: true, spaceId: id };
});

ipcMain.handle("bium:setConfig", (_e, partial) => store.setConfig(partial || {}));
