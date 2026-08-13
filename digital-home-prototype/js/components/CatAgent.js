/**
 * CatAgent (Retriever agent) — room-to-room moves via CSS coords;
 * leg cycles via RetrieverSprite frame swaps.
 */
window.CatAgent = class CatAgent {
  /**
   * @param {{ root: HTMLElement, sprite: import('./RetrieverSprite.js'), speechEl: HTMLElement, statusEl: HTMLElement, carryEl?: HTMLElement, rooms: Record<string, {x:string,y:string,label:string}> }} opts
   */
  constructor(opts) {
    this.root = opts.root;
    this.sprite = opts.sprite;
    this.speechEl = opts.speechEl;
    this.statusEl = opts.statusEl;
    this.carryEl = opts.carryEl;
    this.rooms = opts.rooms;
    this.current = "desktop";
    this.busy = false;
  }

  wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  setSpeech(text) {
    if (this.speechEl) this.speechEl.textContent = text;
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  showCarry(show) {
    // WindowPet cat sheet has no in-mouth file — use prop overlay when carrying
    if (!this.carryEl) return;
    const useProp = this.sprite?.usesCarryProp !== false;
    this.carryEl.hidden = !(show && useProp);
  }

  facingToward(from, to) {
    const order = ["desktop", "laptop", "phone", "cloud", "mail"];
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0) return "right";
    const ax = this.rooms[from]?.x || "0%";
    const bx = this.rooms[to]?.x || "0%";
    return parseFloat(bx) >= parseFloat(ax) ? "right" : "left";
  }

  highlight(roomId) {
    document.querySelectorAll(".room-pane, .mailbox-row").forEach((el) => {
      el.classList.toggle("active", el.dataset.room === roomId);
    });
  }

  showBang(roomId, show) {
    const host = document.querySelector(`[data-clutter="${roomId}"] .bang`);
    if (!host) return;
    host.hidden = !show;
    host.style.display = show ? "grid" : "none";
  }

  async go(roomId, { state = "walk", speech, status } = {}) {
    const room = this.rooms[roomId];
    if (!room) return;
    const face = this.facingToward(this.current, roomId);
    this.sprite.setFacing(face);
    this.sprite.setState(state === "run" ? "run" : "walk");
    if (speech) this.setSpeech(speech);
    if (status) this.setStatus(status);
    this.highlight(roomId);
    this.root.style.setProperty("--x", room.x);
    this.root.style.setProperty("--y", room.y);
    this.current = roomId;
    await this.wait(1050);
  }

  async search(roomId) {
    // still "scanning" feel — keep running paws + scratch sniff
    this.sprite.setState("search");
    this.setSpeech(window.DigitalHomeData.speeches.search);
    this.setStatus(`${this.rooms[roomId].label} 스캔 중...`);
    await this.wait(1400);
  }

  async found() {
    this.sprite.setState("found");
    this.showBang(this.current, true);
    this.setSpeech(window.DigitalHomeData.speeches.found);
    this.setStatus("중복 발견!");
    await this.wait(900);
  }

  async carryToCenter() {
    this.sprite.setFacing("left");
    this.sprite.setState("carry");
    this.showCarry(true);
    this.setSpeech(window.DigitalHomeData.speeches.carry);
    this.setStatus("파일 가져오는 중...");
    this.root.style.setProperty("--x", "50%");
    this.root.style.setProperty("--y", "52%");
    this.highlight("");
    await this.wait(1100);
  }

  async clean(roomId) {
    await this.go(roomId, {
      state: "walk",
      speech: window.DigitalHomeData.speeches.clean,
      status: "정리 중...",
    });
    this.sprite.setState("clean");
    await this.wait(900);
    this.showCarry(false);
    this.sprite.setState("happy");
    this.setSpeech(window.DigitalHomeData.speeches.happy);
    this.setStatus("정리 완료!");
    await this.wait(1000);
  }

  idle(text) {
    // 평소: 잠듦
    this.sprite.setState("sleep");
    this.showCarry(false);
    this.setSpeech(text || window.DigitalHomeData.speeches.sleep);
    this.setStatus("잠자는 중...");
  }

  async exploreAndFetch(path = ["desktop", "laptop", "cloud"]) {
    if (this.busy) return false;
    this.busy = true;
    try {
      for (const roomId of path) {
        await this.go(roomId, {
          speech: window.DigitalHomeData.speeches[roomId],
          status: `${this.rooms[roomId].label} 스캔 중...`,
        });
        await this.search(roomId);
      }
      this.showBang(path[path.length - 1], true);
      await this.found();
      await this.carryToCenter();
      // stay on carry pose until user decides in modal
      this.sprite.setState("carry");
      this.showCarry(true);
      return true;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Run Local Agent scan, then replay room hops from the real result.
   * Progress events update status text; room moves happen after index is ready
   * so hash groups (not timers) decide which digital spaces were visited.
   * @param {Promise<object>} scanPromise
   * @param {{ defaultPath?: string[] }} [opts]
   */
  async exploreWithScan(scanPromise, opts = {}) {
    if (this.busy) return false;
    this.busy = true;
    const onProg = (e) => {
      const p = e.detail || {};
      if (p.text) this.setStatus(p.text);
      if (p.phase === "start") {
        this.sprite.setState("run");
        this.setSpeech("탐색 출발!");
      } else if (p.phase === "search" || p.phase === "walk") {
        this.sprite.setState(p.phase === "search" ? "search" : "run");
        if (p.room && this.rooms[p.room]) this.highlight(p.room);
      }
    };

    document.addEventListener("bium:scan-progress", onProg);
    try {
      this.sprite.setState("run");
      this.setSpeech("탐색 출발!");
      this.setStatus("Local Agent 연결 중...");
      const res = await scanPromise;

      const fromFiles = (window.DigitalHomeData?.duplicate?.files || [])
        .map((f) => f.room)
        .filter((id) => id && this.rooms[id]);
      const path = uniqueRooms(
        res?.roomsVisited?.length ? res.roomsVisited : fromFiles,
        opts.defaultPath || ["laptop", "desktop", "cloud"]
      ).filter((id) => this.rooms[id]);

      for (const roomId of path) {
        await this.go(roomId, {
          state: "run",
          speech: window.DigitalHomeData.speeches[roomId],
          status: `${this.rooms[roomId].label} 스캔 중...`,
        });
        await this.search(roomId);
      }

      const files = window.DigitalHomeData?.duplicate?.files || [];
      if (files.length >= 2) {
        const last = path[path.length - 1] || this.current;
        this.showBang(last, true);
        this.setSpeech("어? 이거 아까 봤는데?");
        await this.found();
        await this.carryToCenter();
        this.sprite.setState("carry");
        this.showCarry(true);
        return { ok: true, res, found: true };
      }

      this.idle("지금은 깨끗해요");
      return { ok: true, res, found: false };
    } finally {
      document.removeEventListener("bium:scan-progress", onProg);
      this.busy = false;
    }
  }
};

function uniqueRooms(preferred, fallback) {
  const out = [];
  for (const id of preferred || []) {
    if (id && !out.includes(id)) out.push(id);
  }
  if (!out.length) {
    for (const id of fallback || []) {
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}
