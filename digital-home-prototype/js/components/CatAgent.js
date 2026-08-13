/**
 * CatAgent — moves between rooms and syncs sprite + status text
 */
window.CatAgent = class CatAgent {
  /**
   * @param {{ root: HTMLElement, sprite: import('./CatSprite.js'), speechEl: HTMLElement, statusEl: HTMLElement, carryEl?: HTMLElement, rooms: Record<string, {x:string,y:string,label:string}> }} opts
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
    if (!this.carryEl) return;
    this.carryEl.hidden = !show;
  }

  facingToward(from, to) {
    const order = ["desktop", "laptop", "phone", "cloud", "mail"];
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0) return "right";
    return b >= a ? "right" : "left";
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
    this.sprite.setState("search");
    this.setSpeech(window.DigitalHomeData.speeches.search);
    this.setStatus(`${this.rooms[roomId].label} 탐색 중...`);
    await this.wait(1200);
  }

  async found() {
    this.sprite.setState("found");
    this.showBang(this.current, true);
    this.setSpeech(window.DigitalHomeData.speeches.found);
    this.setStatus("발견!");
    await this.wait(800);
  }

  async carryToCenter() {
    this.sprite.setState("carry");
    this.showCarry(true);
    this.setSpeech(window.DigitalHomeData.speeches.carry);
    this.setStatus("파일을 들고 이동 중...");
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
    await this.wait(1100);
    this.sprite.setState("happy");
    this.setSpeech(window.DigitalHomeData.speeches.happy);
    this.setStatus("정리 완료!");
    this.showCarry(false);
    await this.wait(700);
  }

  idle(text) {
    this.sprite.setState("idle");
    this.showCarry(false);
    this.setSpeech(text || window.DigitalHomeData.speeches.idle);
    this.setStatus("대기 중");
  }

  /**
   * Full explore choreography before opening a find modal
   */
  async exploreAndFetch(path = ["desktop", "laptop", "cloud"]) {
    if (this.busy) return false;
    this.busy = true;
    try {
      for (const roomId of path) {
        await this.go(roomId, {
          speech: window.DigitalHomeData.speeches[roomId],
          status: `${this.rooms[roomId].label}으로 이동`,
        });
        await this.search(roomId);
      }
      this.showBang(path[path.length - 1], true);
      await this.found();
      await this.carryToCenter();
      this.sprite.setState("idle");
      return true;
    } finally {
      this.busy = false;
    }
  }
};
