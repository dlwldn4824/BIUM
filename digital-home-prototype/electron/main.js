const {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  Menu,
  screen,
  ipcMain,
  globalShortcut,
  Notification,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveBinary } = require("./localAgent");
const {
  runFederatedScan,
  runTitleSimilarityScan,
  spacesFromIndex,
  ensureDevices,
  refreshLiveQuotas,
} = require("./orchestrator");
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

/** Compact TrayPopover — height grows with connected devices */
const MINI_W = 300;
const MINI_H_MIN = 460;
const MINI_H_MAX = 820;
const MINI_H_DEFAULT = 540;
/** Match Mini CSS theme surfaces — avoids cream strip under Midnight UI */
const WINDOW_BG = {
  cozy: "#f7f0e6",
  noir: "#0c1118",
};
/** @type {number} */
let miniH = MINI_H_DEFAULT;

function themeBackground(theme) {
  return theme === "noir" ? WINDOW_BG.noir : WINDOW_BG.cozy;
}

function applyWindowBackground(theme) {
  if (!win) return;
  try {
    win.setBackgroundColor(themeBackground(theme));
  } catch {
    /* ignore */
  }
}
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
  y = Math.min(Math.max(work.y + 8, y), work.y + work.height - miniH - 8);
  win.setBounds({ x, y, width: MINI_W, height: miniH }, false);
}

function setMiniHeight(height) {
  const next = Math.round(Number(height) || MINI_H_DEFAULT);
  miniH = Math.min(MINI_H_MAX, Math.max(MINI_H_MIN, next));
  if (win && displayMode === "mini") {
    const b = win.getBounds();
    const display = screen.getDisplayMatching(b).workArea;
    const y = Math.min(
      Math.max(display.y + 8, b.y),
      display.y + display.height - miniH - 8
    );
    win.setBounds(
      { x: b.x, y, width: MINI_W, height: miniH },
      false
    );
  }
  return miniH;
}

function applyHomeBounds() {
  if (!win) return;
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.min(HOME_W, display.width - 40);
  const height = Math.min(HOME_H, display.height - 40);
  const x = Math.round(display.x + (display.width - width) / 2);
  const y = Math.round(display.y + (display.height - height) / 2);
  win.setMinimumSize(1100, 720);
  win.setMaximumSize(0, 0); // clear mini max constraints
  win.setBounds({ x, y, width, height }, true);
  win.setResizable(true);
}

function applyMiniBounds() {
  if (!win) return;
  win.setMinimumSize(MINI_W, MINI_H_MIN);
  win.setMaximumSize(MINI_W, MINI_H_MAX);
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
  const initialTheme = store.getConfig()?.theme === "noir" ? "noir" : "cozy";
  win = new BrowserWindow({
    width: MINI_W,
    height: MINI_H_DEFAULT,
    minWidth: MINI_W,
    minHeight: MINI_H_MIN,
    maxWidth: MINI_W,
    maxHeight: MINI_H_MAX,
    show: false,
    // Empty title — avoids native label under traffic lights
    title: "",
    backgroundColor: themeBackground(initialTheme),
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

  // Launch directly into the menu-bar experience.
  win.once("ready-to-show", () => {
    applyWindowBackground(store.getConfig()?.theme);
    applyDisplayMode("mini");
    positionMiniNearTray();
    win?.show();
    win?.focus();
    hideDockIcon();
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
    summary:
      out?.scan?.summary ||
      out?.scan?.result?.summary ||
      indexStore.getSummary(),
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
    tipParts.push("클릭해서 열기 · ⌘⇧B");
  }
  try {
    tray.setToolTip(tipParts.join(" · "));
  } catch {
    /* ignore */
  }
  // Never change title after first paint — width changes hide the item on macOS.
  if (process.platform === "darwin") {
    try {
      tray.setTitle("BIUM");
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
let trayCreatedOnce = false;

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

/** macOS can persist "hidden" status items (no » — they go into Control Center). */
function forceStatusItemVisiblePrefs() {
  if (process.platform !== "darwin") return;
  try {
    // Near clock (small number). Large values slide under the notch.
    execFileSync(
      "defaults",
      [
        "write",
        "com.chic.bium.home",
        "NSStatusItem Preferred Position Item-0",
        "-float",
        "25",
      ],
      { stdio: "ignore" }
    );
    // Un-hide if macOS previously tucked the item away.
    for (const key of [
      "NSStatusItem Visible Item-0",
      "NSStatusItem Visible Item-1",
      "NSStatusItem Visible Item-2",
    ]) {
      execFileSync(
        "defaults",
        ["write", "com.chic.bium.home", key, "-bool", "true"],
        { stdio: "ignore" }
      );
    }
  } catch {
    /* ignore */
  }
}

function toggleMiniFromTray() {
  if (win?.isVisible() && displayMode === "mini") win.hide();
  else {
    applyDisplayMode("mini");
    win?.webContents.send("bium:display-mode", "mini");
    showWindow();
  }
}

function openGoogleClientSettingsUi() {
  applyDisplayMode("mini");
  win?.webContents.send("bium:display-mode", "mini");
  showWindow();
  const send = () => {
    try {
      win?.webContents.send("bium:open-google-settings");
    } catch {
      /* ignore */
    }
  };
  if (win?.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => setTimeout(send, 200));
  } else {
    setTimeout(send, 250);
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "열기",
      accelerator: "CommandOrControl+Shift+B",
      click: () => {
        applyDisplayMode("mini");
        win?.webContents.send("bium:display-mode", "mini");
        showWindow();
      },
    },
    {
      label: "Google Client ID…",
      click: () => openGoogleClientSettingsUi(),
    },
    {
      label: "메뉴바에 다시 고정",
      click: () => {
        forceStatusItemVisiblePrefs();
        createTray({ force: true });
        logTrayBounds("pin-again");
        notifyTrayHint(true);
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
}

function createTray(opts = {}) {
  const force = !!opts.force;
  // Stable by default: never tear down an existing tray (causes flicker/hide).
  if (tray && !force) {
    applyTrayPresentation();
    return tray;
  }
  if (tray) destroyTray();
  if (force || !trayCreatedOnce) forceStatusItemVisiblePrefs();

  const icon = createTrayIcon();
  if (icon.isEmpty()) {
    console.error("[BIUM tray] icon empty — status item may not appear");
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  trayCreatedOnce = true;

  try {
    tray.setTitle("BIUM");
    tray.setToolTip("BIUM · 클릭해서 열기 · ⌘⇧B");
  } catch {
    /* ignore */
  }

  if (!force) trayState.setIdle();
  applyTrayPresentation();

  if (!trayListenersBound) {
    trayListenersBound = true;
    trayState.onChange(() => applyTrayPresentation());
    petLocation.onChange(() => applyTrayPresentation());
  }

  tray.on("click", () => toggleMiniFromTray());
  const menu = buildTrayMenu();
  if (process.platform === "darwin") {
    tray.on("right-click", () => {
      tray.popUpContextMenu(menu);
    });
  } else {
    tray.setContextMenu(menu);
  }

  logTrayBounds(force ? "force-create" : "create");
  return tray;
}

function notifyTrayHint(forcePin = false) {
  // Only when user asks to re-pin — launch spam makes the tray feel flaky.
  if (!forcePin) return;
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: "BIUM을 메뉴바에 다시 고정했어요",
      body: "시계 옆 BIUM을 클릭하세요. 없으면 컨트롤센터를 열거나 ⌘⇧B.",
      silent: true,
    });
    n.on("click", () => {
      applyDisplayMode("mini");
      showWindow();
    });
    n.show();
  } catch {
    /* ignore */
  }
}

function registerTrayFallbackShortcut() {
  try {
    globalShortcut.unregisterAll();
    const ok = globalShortcut.register("CommandOrControl+Shift+B", () => {
      applyDisplayMode("mini");
      win?.webContents.send("bium:display-mode", "mini");
      showWindow();
    });
    console.log("[BIUM tray] shortcut ⌘⇧B", ok ? "ok" : "failed");
  } catch (err) {
    console.warn("[BIUM tray] shortcut failed", err.message);
  }
}

function ensureTrayVisible() {
  hideDockIcon();
  if (!tray) {
    createTray();
    return;
  }
  // Tooltip/title refresh only — never destroy here.
  applyTrayPresentation();
  logTrayBounds("ensure");
}

app.whenReady().then(() => {
  hideDockIcon();
  forceStatusItemVisiblePrefs();
  registerTrayFallbackShortcut();

  // Create once. No later auto-recreate (that made the icon flicker/hide).
  createTray();
  createPanelWindow();
  ensureDevices();

  setTimeout(() => {
    ensurePet();
    if (isDesktopPetEnabled()) {
      pet.setVisible(true);
      pet.sleepInCorner();
    } else {
      pet.setVisible(false);
    }
    hideDockIcon();
    logTrayBounds("settled");
  }, 600);

  setTimeout(hideDockIcon, 400);
  setTimeout(() => logTrayBounds("settled-2"), 2000);

  const wantGoogleSettings =
    process.argv.includes("--open-google-settings") ||
    process.env.BIUM_OPEN_GOOGLE_SETTINGS === "1";
  if (wantGoogleSettings) {
    setTimeout(() => openGoogleClientSettingsUi(), 900);
  }

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
    globalShortcut.unregisterAll();
  } catch {
    /* ignore */
  }
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

ipcMain.handle("bium:fitMiniHeight", (_e, height) => {
  if (displayMode !== "mini") return miniH;
  return setMiniHeight(height);
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

ipcMain.handle("bium:scanTitles", async (_event, options = {}) => {
  return runTitleSimilarityScan(options);
});

ipcMain.handle("bium:getConnections", async () => {
  try {
    await refreshLiveQuotas();
  } catch {
    ensureDevices();
    try {
      require("./orchestrator").refreshMacDiskQuota();
    } catch {
      /* ignore */
    }
  }
  const groups = indexStore.findCrossDeviceDuplicates();
  return {
    ok: true,
    status: store.connectionStatus(),
    spaces: spacesFromIndex(),
    summary: indexStore.getSummary(),
    groups,
    candidates: {
      exact: { groups },
    },
    mailCleanup: indexStore.getMailCleanup(),
    index: indexStore.snapshot(),
  };
});

function publishConnections() {
  try {
    require("./orchestrator").refreshMacDiskQuota();
  } catch {
    /* ignore */
  }
  const payload = {
    status: store.connectionStatus(),
    spaces: spacesFromIndex(),
    summary: indexStore.getSummary(),
    mailCleanup: indexStore.getMailCleanup(),
  };
  broadcast("bium:connections", payload);
  return payload;
}

async function connectGoogleSpace() {
  const cfg = store.getConfig();
  ensureDevices();
  if (!cfg.googleClientId) {
    indexStore.setDeviceConnected("gdrive", true);
    indexStore.setDeviceQuota("gdrive", null, null, { demo: true });
    indexStore.setDeviceDemo("gdrive", true);
    publishConnections();
    return {
      ok: true,
      demo: true,
      spaceId: "gdrive",
      message:
        "데모 Drive예요. 설정에서 Google Client ID를 넣으면 실제 용량·파일을 불러와요",
    };
  }
  const google = require("./providers/google");
  // Scope widened to drive (trash) — force re-consent when reconnecting.
  const res = await google.connect();
  indexStore.setDeviceConnected("gdrive", true);
  try {
    const about = await google.aboutStorage();
    if (about) {
      indexStore.setDeviceQuota("gdrive", about.usage, about.limit || 0, {
        demo: false,
      });
      indexStore.setDeviceDemo("gdrive", false);
    }
  } catch {
    /* ignore */
  }
  publishConnections();
  return {
    ok: true,
    demo: false,
    spaceId: "gdrive",
    message: "Google Drive를 연결했어요 · MD5로 로컬과 맞춰 볼 수 있어요",
    ...res,
  };
}

async function connectGmailSpace() {
  const cfg = store.getConfig();
  ensureDevices();
  const { QUOTA } = require("./peers/gmailDemo");

  if (!cfg.googleClientId) {
    return {
      ok: false,
      needClientId: true,
      spaceId: "gmail",
      error:
        "Gmail 실연결에는 Google Client ID가 필요해요. 설정에서 입력한 뒤 다시 연결해 주세요",
    };
  }

  const google = require("./providers/google");
  try {
    const access = await google.ensureGmailAccess();
    const mailCleanup = await google.listMailCleanupRecommendations();
    const spam = mailCleanup.spamCount || 0;
    const unread = mailCleanup.unreadCount || 0;
    const email = mailCleanup.email || access.email || null;

    // Shared Google storage when available (Gmail + Drive)
    let used = QUOTA.usedBytes;
    let total = QUOTA.totalBytes;
    let quotaDemo = true;
    try {
      const about = await google.aboutStorage();
      if (about?.limit) {
        used = about.usage;
        total = about.limit;
        quotaDemo = false;
      }
    } catch {
      /* keep placeholder */
    }

    indexStore.setDeviceConnected("gmail", true);
    indexStore.setDeviceQuota("gmail", used, total, { demo: quotaDemo });
    indexStore.setDeviceDemo("gmail", false);
    indexStore.setMailCleanup(mailCleanup);
    // Drive can share the same Google session
    if (store.connectionStatus().google) {
      indexStore.setDeviceConnected("gdrive", true);
    }
    publishConnections();

    const n = (mailCleanup.groups || []).length;
    const message = n
      ? `Gmail 연결 · 스팸 ${spam.toLocaleString()} · 90일+ 안읽음 ${unread.toLocaleString()}`
      : email
        ? `Gmail(${email}) 연결 · 스팸·오래된 안읽음이 거의 없어요`
        : "Gmail을 연결했어요 · 지금 메일함은 깨끗한 편이에요";

    return {
      ok: true,
      demo: false,
      spaceId: "gmail",
      email,
      message,
      mailCleanup,
    };
  } catch (err) {
    return {
      ok: false,
      spaceId: "gmail",
      error: google.friendlyGmailError(err),
      needGmailApi: /Gmail API|사용 설정/i.test(
        google.friendlyGmailError(err)
      ),
    };
  }
}

async function connectNaverSpace() {
  ensureDevices();
  const naver = require("./providers/naverImap");
  const {
    QUOTA,
    buildDemoNaverIndex,
    buildNaverMailCleanup,
  } = require("./peers/naverDemo");

  if (naver.isConnected()) {
    try {
      await naver.testConnection();
      indexStore.setDeviceConnected("naver-mail", true);
      indexStore.setDeviceQuota("naver-mail", QUOTA.usedBytes, QUOTA.totalBytes);
      publishConnections();
      return {
        ok: true,
        demo: false,
        spaceId: "naver-mail",
        message:
          "네이버 메일을 연결했어요 · 탐색 시 첨부 MD5로 로컬·Drive와 맞춰 봐요",
      };
    } catch (err) {
      return {
        ok: false,
        error:
          err.message ||
          "IMAP 연결 실패 · 앱 비밀번호·IMAP 사용함을 확인해 주세요",
        needCredentials: true,
      };
    }
  }

  // Demo path — same contentKey bridge as Drive demo
  const seed = indexStore.listEntries().filter(
    (e) => e.deviceId === "mac-local" || e.deviceId === "gdrive"
  );
  const demo = buildDemoNaverIndex(seed);
  indexStore.upsertDeviceEntries("naver-mail", demo);
  indexStore.setDeviceConnected("naver-mail", true);
  indexStore.setDeviceQuota("naver-mail", QUOTA.usedBytes, QUOTA.totalBytes);
  const cleanup = buildNaverMailCleanup();
  const existing = indexStore.getMailCleanup();
  if (!existing?.groups?.length) indexStore.setMailCleanup(cleanup);
  publishConnections();
  return {
    ok: true,
    demo: true,
    spaceId: "naver-mail",
    message:
      "데모 네이버 메일이에요. 설정에서 앱 비밀번호를 넣으면 IMAP 실연결돼요",
  };
}

async function connectSpace(spaceId) {
  ensureDevices();
  const id = String(spaceId || "");

  if (id === "gdrive") return connectGoogleSpace();
  if (id === "gmail" || id === "mail") return connectGmailSpace();
  if (id === "naver-mail" || id === "naver") return connectNaverSpace();

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
    store.setWindowsPeerLinked(true);
    indexStore.setDeviceConnected("windows-peer", true);
    indexStore.setDeviceQuota(
      "windows-peer",
      QUOTA.usedBytes,
      QUOTA.totalBytes,
      { demo: true }
    );
    indexStore.setDeviceDemo("windows-peer", true);
    publishConnections();
    return {
      ok: true,
      demo: true,
      spaceId: "windows-peer",
      message: "Windows Desktop을 연결했어요 (데모 용량 · LAN이면 실측으로 바뀌어요)",
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
  if (id === "naver-mail" || id === "naver") {
    try {
      require("./providers/naverImap").disconnect();
    } catch {
      /* ignore */
    }
    indexStore.upsertDeviceEntries("naver-mail", []);
  }
  if (id === "windows-peer") {
    store.setWindowsPeerLinked(false);
  }
  if (id && id !== "mac-local") {
    indexStore.setDeviceConnected(id, false);
  }
  publishConnections();
  return { ok: true, spaceId: id };
});

ipcMain.handle("bium:getConfig", () => store.getPublicConfig());
ipcMain.handle("bium:setConfig", (_e, partial) => {
  const next = store.setConfig(partial || {});
  const pub = store.getPublicConfig();
  if (partial && Object.prototype.hasOwnProperty.call(partial, "theme")) {
    applyWindowBackground(pub.theme || next.theme);
    broadcast("bium:config", pub);
  }
  return pub;
});

ipcMain.handle("bium:saveNaverCredentials", async (_e, payload) => {
  try {
    const naver = require("./providers/naverImap");
    const saved = naver.saveCredentials(payload || {});
    try {
      await naver.testConnection();
      indexStore.setDeviceConnected("naver-mail", true);
      publishConnections();
      return {
        ok: true,
        email: saved.email,
        tested: true,
        message: "네이버 IMAP 연결에 성공했어요",
      };
    } catch (err) {
      return {
        ok: true,
        email: saved.email,
        tested: false,
        warning:
          err.message ||
          "저장은 했어요. IMAP 사용함·앱 비밀번호를 다시 확인해 주세요",
      };
    }
  } catch (err) {
    return { ok: false, error: err.message || "저장 실패" };
  }
});

ipcMain.handle("bium:keepOne", async (_e, payload) => {
  try {
    const { executeKeepOne } = require("./actions/keepOne");
    return await executeKeepOne(payload || {});
  } catch (err) {
    return {
      ok: false,
      error: err.message || "정리에 실패했어요",
      trashed: [],
      skipped: [],
      errors: [{ error: err.message }],
    };
  }
});
