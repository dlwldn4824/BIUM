/**
 * Agent sprite — classic Neko tied to BIUM service states.
 *
 * sleep → run → found(alert) → carry+file → happy(wag)
 */
window.RetrieverSprite = class RetrieverSprite {
  /**
   * @param {HTMLElement} el
   * @param {HTMLElement} [root]
   */
  constructor(el, root) {
    this.el = el;
    this.root = root || el.closest(".agent") || el.parentElement;
    this.state = "sleep";
    this.facing = "right";
    this.atlas = null;
    this.usesCarryProp = true;
    this._ready = this._boot();
  }

  async _boot() {
    try {
      const base = "assets/pets/neko";
      const res = await fetch(`${base}/pet.json?v=neko2`);
      if (!res.ok) throw new Error(`pet.json ${res.status}`);
      const manifest = await res.json();
      const sheet = `${base}/${manifest.spritesheetPath}?v=neko2`;
      this.atlas = new window.PetAtlas(this.el, manifest, sheet);
      this.atlas.setFacing(this.facing);
      this.setState(this.state);
      if (this.root) this.root.dataset.pet = "neko";
      return this.atlas;
    } catch (err) {
      console.error("[RetrieverSprite] neko atlas boot failed", err);
      throw err;
    }
  }

  async ensure() {
    if (!this.atlas) await this._ready;
    return this.atlas;
  }

  /** Map BIUM agent state → Neko animation */
  animFor(state, facing) {
    if (state === "walk" || state === "run") {
      return facing === "left" ? "running-left" : "running-right";
    }
    if (state === "carry") {
      return facing === "left" ? "carry-left" : "carry-right";
    }
    const map = {
      idle: "sleep",
      sleep: "sleep",
      search: "search",
      found: "found",
      clean: "clean",
      happy: "wag",
      wag: "wag",
      waiting: "sleep",
      waving: "wag",
      jumping: "found",
    };
    return map[state] || "sleep";
  }

  setState(state) {
    this.state = state;
    if (this.root) this.root.dataset.state = state;
    const anim = this.animFor(state, this.facing);
    if (this.atlas) this.atlas.setAnimation(anim);
    else this._ready.then(() => this.atlas && this.atlas.setAnimation(anim));
  }

  setFacing(facing) {
    const next = facing === "left" ? "left" : "right";
    if (next === this.facing) return;
    this.facing = next;
    if (this.root) this.root.dataset.facing = next;
    if (this.atlas) this.atlas.setFacing(next);
    this.setState(this.state);
  }
};

window.CatSprite = window.RetrieverSprite;
