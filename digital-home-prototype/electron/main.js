const {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  Menu,
  screen,
  ipcMain,
} = require("electron");
const fs = require("fs");
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

// Menu-bar utility (Cursor-style): must be accessory BEFORE ready.
// "regular" / late dock.hide() leaves BIUM in the Dock and can hide the tray.
if (process.platform === "darwin") {
  try {
    app.setActivationPolicy("accessory");
  } catch {
    /* older Electron */
  }
}

function hideDockIcon() {
  if (process.platform !== "darwin" || !app.dock) return;
  try {
    app.dock.hide();
  } catch {
    /* ignore */
  }
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

/** Compact TrayPopover — tall enough for devices + stacked CTAs */
const MINI_W = 300;
const MINI_H = 680;
/** @type {number} */
let trayBadge = 0;
const HOME_W = 1280;
const HOME_H = 860;

function root(...parts) {
  return path.join(__dirname, "..", ...parts);
}

/** Prefer asar.unpacked icons so Retina @2x templates load reliably. */
function assetFile(...parts) {
  if (app.isPackaged) {
    const unpacked = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      ...parts
    );
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return root(...parts);
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
  // Prefer black+alpha *Template.png (macOS tints it for light/dark menu bars).
  const candidates = [
    assetFile("assets", "icons", "trayTemplate.png"),
    assetFile("assets", "icons", "tray.png"),
    root("build", "trayTemplate.png"),
    root("build", "tray.png"),
    assetFile("assets", "icons", "house.png"),
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      // Path load picks up trayTemplate@2x.png on Retina; buffer is asar fallback.
      let image = nativeImage.createFromPath(file);
      if (image.isEmpty()) {
        image = nativeImage.createFromBuffer(fs.readFileSync(file));
      }
      if (image.isEmpty()) continue;

      const isTemplate = /Template/i.test(path.basename(file));
      if (isTemplate) image.setTemplateImage(true);

      const size = image.getSize();
      if (size.width > 22 || size.height > 22) {
        image = image.resize({ width: 18, height: 18, quality: "best" });
        if (isTemplate) image.setTemplateImage(true);
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
    minHeight: 420,
    show: false,
    // Empty title — avoids native label under traffic lights
    title: "",
    backgroundColor: "#f8f2e7",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 14 },
    roundedCorners: true,
    hasShadow: true,
    movable: true,
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
  hideDockIcon();
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

function isDesktopPetEnabled() {
  return store.getConfig().desktopPet !== false;
}

function applyDesktopPetVisibility(on) {
  const p = ensurePet();
  const enabled = !!on;
  store.setConfig({ desktopPet: enabled });
  p.setVisible(enabled);
  if (enabled) p.sleepInCorner();
  return { visible: p.visible, desktopPet: enabled };
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
    // Preference off: scan without walking the desktop pet
    if (!isDesktopPetEnabled()) {
      controller.setVisible(false);
      const scan = await runScan(() => {});
      const primary = scan?.primary || null;
      if (primary) {
        lastPrimary = primary;
        const n = primary?.files?.length || 0;
        trayBadge = n;
        trayState.setFound(n, "새 발견");
        applyTrayPresentation();
        broadcast("bium:pet-found", { primary });
      }
      out = {
        ok: true,
        scan,
        found: !!(primary?.files?.length >= 2),
        summoned: false,
      };
    } else {
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
    }
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
    groups: out?.scan?.groups,
    spaces: out?.scan?.spaces,
    mailCleanup: out?.scan?.mailCleanup || indexStore.getMailCleanup(),
    candidates: out?.scan?.candidates || out?.scan?.result?.candidates,
    similarPhotos: out?.scan?.similarPhotos,
    similarDocs: out?.scan?.similarDocs,
    coldStale: out?.scan?.coldStale,
    result: out?.scan?.result,
    desktopPet: isDesktopPetEnabled(),
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

let trayListenersBound = false;

function destroyTray() {
  if (!tray) return;
  try {
    tray.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
}

function logTrayBounds(tag) {
  if (!tray) return;
  try {
    const bounds = tray.getBounds();
    const line = JSON.stringify({
      tag,
      at: new Date().toISOString(),
      bounds,
      title: trayState.snapshot().title,
    });
    console.log("[BIUM tray]", line);
    fs.writeFileSync("/tmp/bium-tray.json", line);
  } catch (err) {
    console.warn("[BIUM tray] bounds failed", err.message);
  }
}

function createTray() {
  destroyTray();
  const icon = createTrayIcon();
  if (icon.isEmpty()) {
    console.error("[BIUM tray] icon empty — status item may not appear");
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  // ASCII title is the most reliable menu-bar label on macOS.
  try {
    tray.setTitle("BIUM");
    tray.setToolTip("BIUM · 클릭해서 열기");
  } catch {
    /* ignore */
  }

  // Prefer a position near the clock (higher = further left of system items).
  try {
    app.setAppUserModelId?.("com.chic.bium.home");
  } catch {
    /* ignore */
  }

  trayState.setIdle();
  applyTrayPresentation();
  // Force title again after state apply (idle → 비움)
  try {
    tray.setTitle(trayState.snapshot().title || "BIUM");
  } catch {
    /* ignore */
  }

  if (!trayListenersBound) {
    trayListenersBound = true;
    trayState.onChange(() => applyTrayPresentation());
    petLocation.onChange(() => applyTrayPresentation());
  }

  // Left-click → toggle compact popover under menu bar
  tray.on("click", () => {
    if (win?.isVisible() && displayMode === "mini") win.hide();
    else {
      applyDisplayMode("mini");
      win?.webContents.send("bium:display-mode", "mini");
      showWindow();
    }
  });

  // Right-click menu only — left click stays for toggle (macOS)
  const menu = Menu.buildFromTemplate([
    {
      label: "열기",
      click: () => {
        applyDisplayMode("mini");
        win?.webContents.send("bium:display-mode", "mini");
        showWindow();
      },
    },
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
  // On macOS, setContextMenu steals left-click. Keep menu for right-click via
  // platform behavior: use tray.setContextMenu only on non-darwin, or bind open.
  if (process.platform === "darwin") {
    tray.on("right-click", () => {
      tray.popUpContextMenu(menu);
    });
  } else {
    tray.setContextMenu(menu);
  }

  logTrayBounds("create");
}

function ensureTrayVisible() {
  hideDockIcon();
  if (!tray) {
    createTray();
    return;
  }
  applyTrayPresentation();
  logTrayBounds("ensure");
  const bounds = tray.getBounds();
  // Menu bar items report y≈0 once laid out. Zero width → recreate.
  if (!bounds?.width) {
    console.warn("[BIUM tray] recreating — zero width", bounds);
    createTray();
    logTrayBounds("recreate");
  }
}

app.whenReady().then(() => {
  hideDockIcon();
  // Keep status item on the RIGHT (near clock). Large preferred-position
  // values push it left under the MacBook notch where it disappears.
  try {
    const { execFileSync } = require("child_process");
    execFileSync(
      "defaults",
      [
        "write",
        "com.chic.bium.home",
        "NSStatusItem Preferred Position Item-0",
        "-float",
        "40",
      ],
      { stdio: "ignore" }
    );
  } catch {
    /* ignore */
  }

  createTray();
  createPanelWindow();
  ensureDevices();
  // Defer pet — panel windows were logging styleMask errors and can race tray.
  setTimeout(() => {
    ensurePet();
    if (isDesktopPetEnabled()) {
      pet.setVisible(true);
      pet.sleepInCorner();
    } else {
      pet.setVisible(false);
    }
    ensureTrayVisible();
  }, 600);

  hideDockIcon();
  setTimeout(hideDockIcon, 400);
  setTimeout(ensureTrayVisible, 1500);
  setTimeout(ensureTrayVisible, 3000);

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
  desktopPet: isDesktopPetEnabled(),
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
  if (typeof on === "boolean") {
    return applyDesktopPetVisibility(on);
  }
  return {
    visible: !!pet?.visible,
    desktopPet: isDesktopPetEnabled(),
  };
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
    mailCleanup: indexStore.getMailCleanup(),
    index: indexStore.snapshot(),
  };
});

function publishConnections() {
  const payload = {
    status: store.connectionStatus(),
    spaces: spacesFromIndex(),
    mailCleanup: indexStore.getMailCleanup(),
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

async function connectGmailSpace() {
  const cfg = store.getConfig();
  ensureDevices();
  const { buildMailCleanup, QUOTA } = require("./peers/gmailDemo");

  let mailCleanup = buildMailCleanup();
  let demo = true;

  if (cfg.googleClientId) {
    try {
      const google = require("./providers/google");
      // Reuse Google session when possible; otherwise run OAuth with Gmail scopes
      if (!store.connectionStatus().google) {
        await google.connect();
      }
      mailCleanup = await google.listMailCleanupRecommendations();
      if (!mailCleanup?.groups?.length) mailCleanup = buildMailCleanup();
      else demo = false;
    } catch {
      mailCleanup = buildMailCleanup();
      demo = true;
    }
  }

  indexStore.setDeviceConnected("gmail", true);
  indexStore.setDeviceQuota("gmail", QUOTA.usedBytes, QUOTA.totalBytes);
  indexStore.setMailCleanup(mailCleanup);
  publishConnections();
  return {
    ok: true,
    demo,
    spaceId: "gmail",
    message: "Gmail을 연결했어요 · 스팸·오래된 안읽음 정리를 추천해요",
    mailCleanup,
  };
}

async function connectSpace(spaceId) {
  ensureDevices();
  const id = String(spaceId || "");

  if (id === "gdrive") return connectGoogleSpace();
  if (id === "gmail" || id === "mail") return connectGmailSpace();

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
  if (id === "gmail" || id === "mail") {
    indexStore.setMailCleanup(null);
  }
  if (id && id !== "mac-local") {
    indexStore.setDeviceConnected(id, false);
  }
  publishConnections();
  return { ok: true, spaceId: id };
});

ipcMain.handle("bium:getConfig", () => store.getConfig());
ipcMain.handle("bium:setConfig", (_e, partial) => {
  const next = store.setConfig(partial || {});
  if (partial && Object.prototype.hasOwnProperty.call(partial, "theme")) {
    broadcast("bium:config", next);
  }
  return next;
});
