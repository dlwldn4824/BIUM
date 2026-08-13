/**
 * Desktop Pet — small transparent always-on-top window.
 * The OS window itself moves (not CSS inside a full-screen pane).
 */
const { BrowserWindow, screen } = require("electron");
const path = require("path");
const petLocation = require("./petLocation");

const PET_W = 112;
const PET_H = 120;
const BUBBLE_W = 300;
const BUBBLE_H = 168;

class DesktopPetController {
  /**
   * @param {{ root: (...p: string[]) => string, onAlertClick?: () => void, onLocation?: (s: object) => void }} opts
   */
  constructor(opts) {
    this.root = opts.root;
    this.onAlertClick = opts.onAlertClick;
    this.onLocation = opts.onLocation;
    /** @type {BrowserWindow | null} */
    this.win = null;
    this.visible = true;
    this.busy = false;
    this.summonRequested = false;
    this.abortExplore = false;
    this.x = 0;
    this.y = 0;
    this.facing = "left";
    this.state = "sleep";
    this.speech = "";
    this.carry = false;
    this.clickable = false;
    this.draggable = true;
    this._tick = null;
    this._device = "mac";
    this._dragging = false;
    this._dragOff = { x: 0, y: 0 };
    this._summoning = false;
  }

  _publishLocation(location, exploring = false) {
    const snap = exploring
      ? petLocation.goExplore(location)
      : location === "home"
        ? petLocation.goHome()
        : petLocation.setState({ location, exploring: false });
    this.onLocation?.(snap);
    return snap;
  }

  create() {
    if (this.win) return this.win;

    const display = screen.getPrimaryDisplay().workArea;
    this.x = display.x + display.width - PET_W - 28;
    this.y = display.y + display.height - PET_H - 24;

    this.win = new BrowserWindow({
      width: PET_W,
      height: PET_H,
      x: this.x,
      y: this.y,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      focusable: false,
      acceptFirstMouse: true,
      roundedCorners: false,
      thickFrame: false,
      // panel floats above normal apps on macOS
      type: process.platform === "darwin" ? "panel" : "toolbar",
      backgroundColor: "#00000000",
      title: "BIUM Pet",
      webPreferences: {
        preload: path.join(__dirname, "preload-pet.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.win.setAlwaysOnTop(true, "screen-saver", 1);
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (process.platform === "darwin") {
      try {
        this.win.setWindowButtonVisibility(false);
      } catch {
        /* ignore */
      }
    }
    // Sleeping: click-through. Alerts flip this off.
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.loadFile(this.root("pet.html"));

    this.win.once("ready-to-show", () => {
      if (this.visible) {
        this.win?.show();
        this.win?.showInactive();
        this.sleepInCorner();
        this.setPose({
          state: "sleep",
          facing: "left",
          speech: "zzz...",
          clickThrough: false,
        });
        this.enableHomeInteraction();
        this._publishLocation("home", false);
        // Clear intro bubble so it doesn't block the desk
        setTimeout(() => {
          if (this.state === "sleep" && this.speech === "zzz...") {
            this.speech = "";
            this.pushView();
          }
        }, 2200);
      }
    });

    this.win.on("closed", () => {
      this.win = null;
      this._stopMove();
    });

    return this.win;
  }

  setVisible(on) {
    this.visible = !!on;
    if (!this.win) this.create();
    if (this.visible) this.win?.showInactive();
    else this.win?.hide();
  }

  destroy() {
    this._stopMove();
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }

  workArea() {
    const point = {
      x: Math.round(this.x + PET_W / 2),
      y: Math.round(this.y + PET_H / 2),
    };
    return screen.getDisplayNearestPoint(point).workArea;
  }

  applyBounds({ bubble = false } = {}) {
    if (!this.win || this.win.isDestroyed()) return;
    const w = bubble ? BUBBLE_W : PET_W;
    const h = bubble ? BUBBLE_H : PET_H;
    const area = this.workArea();
    // Keep feet near previous bottom-right of pet box
    let x = Math.round(this.x - (bubble ? BUBBLE_W - PET_W : 0));
    let y = Math.round(this.y - (bubble ? BUBBLE_H - PET_H : 0));
    x = Math.min(Math.max(area.x, x), area.x + area.width - w);
    y = Math.min(Math.max(area.y, y), area.y + area.height - h);
    this.x = bubble ? x + (BUBBLE_W - PET_W) : x;
    this.y = bubble ? y + (BUBBLE_H - PET_H) : y;
    this.win.setBounds({ x, y, width: w, height: h }, false);
  }

  setClickThrough(on) {
    this.clickable = !on;
    if (!this.win || this.win.isDestroyed()) return;
    if (on) {
      this.win.setIgnoreMouseEvents(true, { forward: true });
      try {
        this.win.setFocusable(false);
      } catch {
        /* ignore */
      }
    } else {
      try {
        this.win.setFocusable(true);
      } catch {
        /* ignore */
      }
      this.win.setIgnoreMouseEvents(false);
    }
  }

  pushView() {
    if (!this.win || this.win.isDestroyed()) return;
    const bubble = !!(this.speech && this.speech.length);
    this.applyBounds({ bubble });
    this.win.webContents.send("pet:view", {
      state: this.state,
      facing: this.facing,
      speech: this.speech,
      carry: this.carry,
      device: this._device,
      clickable: this.clickable,
      draggable: this._dragging || (this.draggable && !this.busy),
    });
  }

  enableHomeInteraction() {
    this.draggable = true;
    // Home: grab-able (not click-through)
    this.setClickThrough(false);
    this.pushView();
  }

  beginDrag(screenX, screenY) {
    if (this.busy && !this._dragging) return;
    if (!this.draggable && !this._dragging) return;
    this._dragging = true;
    this._stopMove();
    this._dragOff = {
      x: screenX - this.x,
      y: screenY - this.y,
    };
    this.setPose({ state: "run", speech: "", clickThrough: false });
  }

  dragTo(screenX, screenY) {
    if (!this._dragging) return;
    const area = screen.getPrimaryDisplay().workArea;
    let nx = Math.round(screenX - this._dragOff.x);
    let ny = Math.round(screenY - this._dragOff.y);
    nx = Math.min(Math.max(area.x, nx), area.x + area.width - PET_W);
    ny = Math.min(Math.max(area.y, ny), area.y + area.height - PET_H);
    this.place(nx, ny);
  }

  async endDrag() {
    if (!this._dragging) return;
    this._dragging = false;
    this.setPose({ state: "sleep", speech: "", clickThrough: false });
    await this.wait(400);
    this.setPose({ state: "run", facing: "right", clickThrough: false });
    const area = this.workArea();
    const hop = Math.min(56, area.x + area.width - PET_W - 20 - this.x);
    if (hop > 16) {
      await this.moveBy({ dx: hop, facing: "right", state: "run", step: 6, ms: 30 });
    }
    this.setPose({ state: "sleep", speech: "", clickThrough: false });
    this._publishLocation("home", false);
    this.enableHomeInteraction();
  }

  /** Interrupt explore loop — Mini "여기로 와!" sets this. */
  requestSummon() {
    this.summonRequested = true;
    this.abortExplore = true;
    this._stopMove();
  }

  /** Call the dog back from a remote space onto this Mac desktop. */
  async summonHere() {
    if (this._summoning) return petLocation.snapshot();
    this._summoning = true;
    this.summonRequested = true;
    this.abortExplore = true;
    this._stopMove();
    try {
      const snap = petLocation.snapshot();
      if (!snap.away && this.visible && !this.busy) {
        this.setPose({
          state: "found",
          speech: "여기 있어!",
          clickThrough: false,
        });
        await this.wait(800);
        this.speech = "";
        this.setPose({ state: "sleep", clickThrough: false });
        this.enableHomeInteraction();
        return petLocation.snapshot();
      }

      const area = screen.getPrimaryDisplay().workArea;
      const floorY = area.y + area.height - PET_H - 20;
      this._publishLocation("home", false);
      this._device = "mac";
      this.place(area.x - PET_W - 8, floorY);
      this.setVisible(true);
      this.win?.showInactive();
      this.setPose({
        state: "run",
        facing: "right",
        speech: "불렀어? 지금 갈게!",
        carry: false,
        clickThrough: false,
      });
      await this.moveBy({
        dx: area.x + Math.round(area.width * 0.55) - this.x,
        facing: "right",
        state: "run",
        step: 11,
        ms: 26,
      });
      this.setPose({
        state: "found",
        speech: "여기야!",
        clickThrough: false,
      });
      await this.wait(900);
      this.speech = "";
      this.setPose({ state: "sleep", clickThrough: false });
      this.enableHomeInteraction();
      return petLocation.snapshot();
    } finally {
      this._summoning = false;
      this.summonRequested = false;
      this.busy = false;
      this.draggable = true;
    }
  }

  async _finishIfSummoned(scan) {
    if (!this.abortExplore && !this.summonRequested && !this._summoning) {
      return null;
    }
    while (this._summoning) await this.wait(40);
    const snap = petLocation.snapshot();
    if (snap.away || !this.visible) {
      await this.summonHere();
    }
    return { ok: true, scan, found: false, summoned: true };
  }

  setPose({ state, facing, speech, carry, clickThrough } = {}) {
    if (state) this.state = state;
    if (facing) this.facing = facing;
    if (speech !== undefined) this.speech = speech;
    if (carry !== undefined) this.carry = !!carry;
    if (clickThrough !== undefined) this.setClickThrough(clickThrough);
    this.pushView();
  }

  place(x, y) {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.applyBounds({ bubble: !!this.speech });
  }

  wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  _stopMove() {
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = null;
    }
  }

  /**
   * Animate OS window position along X (and optional Y).
   */
  moveBy({ dx = 0, dy = 0, step = 8, ms = 32, facing, state = "run" } = {}) {
    return new Promise((resolve) => {
      this._stopMove();
      if (facing) this.facing = facing;
      this.state = state;
      this.pushView();

      const targetX = this.x + dx;
      const targetY = this.y + dy;
      const sx = Math.sign(dx) || 0;
      const sy = Math.sign(dy) || 0;

      this._tick = setInterval(() => {
        let doneX = true;
        let doneY = true;
        if (sx !== 0) {
          const next = this.x + sx * step;
          if ((sx > 0 && next >= targetX) || (sx < 0 && next <= targetX)) {
            this.x = targetX;
          } else {
            this.x = next;
            doneX = false;
          }
        }
        if (sy !== 0) {
          const next = this.y + sy * step;
          if ((sy > 0 && next >= targetY) || (sy < 0 && next <= targetY)) {
            this.y = targetY;
          } else {
            this.y = next;
            doneY = false;
          }
        }
        this.applyBounds({ bubble: !!this.speech });
        if (doneX && doneY) {
          this._stopMove();
          resolve();
        }
      }, ms);
    });
  }

  sleepInCorner() {
    const area = screen.getPrimaryDisplay().workArea;
    this._device = "mac";
    this._publishLocation("home", false);
    this.place(area.x + area.width - PET_W - 28, area.y + area.height - PET_H - 24);
    this.setPose({
      state: "sleep",
      facing: "left",
      speech: "",
      carry: false,
      clickThrough: false,
    });
    this.enableHomeInteraction();
  }

  async _departOffscreen(locationId) {
    const area = screen.getPrimaryDisplay().workArea;
    this.setPose({
      state: "run",
      facing: "right",
      speech: `${petLocation.LABELS[locationId] || "다른 곳"}으로!`,
      clickThrough: true,
    });
    await this.moveBy({
      dx: area.x + area.width + 48 - this.x,
      facing: "right",
      state: "run",
      step: 14,
      ms: 22,
    });
    this.win?.hide();
    this.visible = false;
    this._publishLocation(locationId, true);
  }

  async _arriveFromLeft(label) {
    const area = screen.getPrimaryDisplay().workArea;
    const floorY = area.y + area.height - PET_H - 20;
    this.place(area.x - PET_W - 8, floorY);
    this.visible = true;
    this.win?.showInactive();
    this.setPose({
      state: "run",
      facing: "right",
      speech: label || "다녀왔어!",
      carry: false,
      clickThrough: true,
    });
    await this.moveBy({
      dx: area.x + 56 - this.x,
      facing: "right",
      state: "run",
      step: 12,
      ms: 26,
    });
  }

  /**
   * Full Local-Agent story on the real desktop.
   * Includes staged Mac → Windows transfer (same machine demo sync).
   * @param {{ runScan: (send: Function) => Promise<object>, onFound?: (primary: object) => void }} opts
   */
  async playAgentStory(opts) {
    if (this.busy) return { ok: false, error: "busy" };
    this.busy = true;
    this.summonRequested = false;
    this.abortExplore = false;
    this.draggable = false;
    this.setVisible(true);
    try {
      const area = screen.getPrimaryDisplay().workArea;
      const floorY = area.y + area.height - PET_H - 20;
      this._device = "mac";
      this._publishLocation("mac-local", true);
      this.place(area.x + 40, floorY);
      this.setPose({
        state: "run",
        facing: "right",
        speech: "일어나서 살펴볼게요",
        carry: false,
        clickThrough: true,
      });
      await this.wait(600);
      this.speech = "";
      this.pushView();

      const send = (p) => {
        if (this.summonRequested) return;
        if (p.phase === "walk" || p.phase === "search" || p.phase === "start") {
          const loc = petLocation.fromAgent(p.agent || "mac-local");
          this._publishLocation(loc, true);
          if (p.agent === "windows-peer") this._device = "windows";
          else if (p.agent === "gdrive") this._device = "mac";
          else this._device = "mac";

          // Remote spaces: leave the Mac desktop (dog is "elsewhere")
          if (p.agent === "windows-peer" || p.agent === "gdrive" || p.agent === "mail") {
            if (this.visible) {
              // fire-and-forget depart — scan continues
              this._departOffscreen(loc).catch(() => {});
            }
          } else if (p.agent === "mac-local" && !this.visible) {
            this._arriveFromLeft("MacBook").catch(() => {});
            this._publishLocation("mac-local", true);
          } else if (this.visible) {
            this.setPose({
              state: p.phase === "search" ? "search" : "run",
              speech: p.text || "",
              clickThrough: true,
            });
          }
        } else if (p.phase === "transfer") {
          this._publishLocation(
            petLocation.fromAgent(p.to || "windows-peer"),
            true
          );
        }
      };

      let scanDone = false;
      const scanPromise = opts.runScan(send).finally(() => {
        scanDone = true;
      });

      // Walk Mac desktop while still local
      const left = area.x + 36;
      const right = area.x + area.width - PET_W - 36;
      let towardRight = true;
      while (!scanDone && this.busy && !this.abortExplore) {
        if (!this.visible) {
          await this.wait(400);
          continue;
        }
        const target = towardRight ? right : left;
        await this.moveBy({
          dx: target - this.x,
          facing: towardRight ? "right" : "left",
          state: "run",
          step: 8,
          ms: 28,
        });
        if (scanDone || this.abortExplore) break;
        this.setPose({
          state: "search",
          speech: this.speech || "MacBook 살펴보는 중...",
        });
        await this.wait(500);
        towardRight = !towardRight;
      }

      const scan = await scanPromise;
      {
        const early = await this._finishIfSummoned(scan);
        if (early) return early;
      }

      // Staged remote hop if still on-screen
      if (this.visible) {
        await this._departOffscreen("windows-peer");
        await this.wait(800);
      } else {
        this._publishLocation("windows-peer", true);
        await this.wait(600);
      }

      {
        const early = await this._finishIfSummoned(scan);
        if (early) return early;
      }

      // Brief "on Desktop" presence for demo
      this._device = "windows";
      await this._arriveFromLeft("Desktop 살펴볼게요");
      this._publishLocation("windows-peer", true);
      this.setPose({ state: "search", speech: "Desktop 살펴보는 중..." });
      await this.wait(1200);

      {
        const early = await this._finishIfSummoned(scan);
        if (early) return early;
      }

      // Drive → Mail legs (away; Mini shows footprints + status)
      await this._departOffscreen("gdrive");
      await this.wait(700);
      {
        const early = await this._finishIfSummoned(scan);
        if (early) return early;
      }
      this._publishLocation("mail", true);
      await this.wait(900);
      {
        const early = await this._finishIfSummoned(scan);
        if (early) return early;
      }

      const primary = scan?.primary;
      const files = primary?.files || [];
      if (files.length >= 2) {
        // Come home carrying the find
        this._device = "mac";
        await this._arriveFromLeft("가져왔어!");
        this._publishLocation("home", false);
        this.setPose({
          state: "found",
          carry: true,
          speech: "어? 똑같은 걸 찾았어!",
          clickThrough: false,
        });
        await this.wait(900);
        await this.moveBy({
          dx: area.x + area.width - PET_W - 40 - this.x,
          facing: "right",
          state: "carry",
          step: 10,
          ms: 26,
        });
        const n = files.length;
        this.setPose({
          state: "carry",
          carry: true,
          speech: `이름은 다르지만 내용이 같은 파일 ${n}개를 찾았어!`,
          clickThrough: false,
        });
        opts.onFound?.(primary);
        this.enableHomeInteraction();
        return { ok: true, scan, found: true };
      }

      {
        const early = await this._finishIfSummoned(scan);
        if (early) return early;
      }

      await this._arriveFromLeft("끝났어");
      this.sleepInCorner();
      this.setPose({
        state: "sleep",
        speech: "지금은 깨끗해요",
        clickThrough: false,
      });
      await this.wait(1400);
      this.speech = "";
      this.pushView();
      this.enableHomeInteraction();
      return { ok: true, scan, found: false };
    } finally {
      if (!this._summoning) {
        this.busy = false;
        this.draggable = true;
      }
    }
  }
}

module.exports = { DesktopPetController, PET_W, PET_H };
