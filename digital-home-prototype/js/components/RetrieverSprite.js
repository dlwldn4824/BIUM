/**
 * Agent sprite — PetAtlas wrapper for BIUM service states.
 */
window.RetrieverSprite = class RetrieverSprite {
  /**
   * @param {HTMLElement} el
   * @param {HTMLElement} [root]
   * @param {{ base?: string, petKey?: string, cacheBust?: string }} [opts]
   */
  constructor(el, root, opts = {}) {
    this.el = el;
    this.root = root || el.closest(".agent") || el.parentElement;
    this.base = (opts.base || "assets/pets/neko").replace(/\/$/, "");
    this.petKey = opts.petKey || "neko";
    this.cacheBust = opts.cacheBust || "atlas1";
    this.state = "sleep";
    this.facing = "right";
    this.atlas = null;
    this.usesCarryProp = true;
    this._ready = this._boot();
  }

  async _boot() {
    try {
      const res = await fetch(`${this.base}/pet.json?v=${this.cacheBust}`);
      if (!res.ok) throw new Error(`pet.json ${res.status}`);
      const manifest = await res.json();
      const sheetName =
        manifest.spritesheetPath ||
        manifest.spritesheetPathFull ||
        "spritesheet.png";
      const sheet = `${this.base}/${sheetName}?v=${this.cacheBust}`;
      // Warm decode so first frames don't hitch
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = sheet;
        if (img.decode) await img.decode().catch(() => {});
      } catch {
        /* ignore */
      }
      this.usesCarryProp = manifest.usesCarryProp !== false;
      this.atlas = new window.PetAtlas(this.el, manifest, sheet);
      this.atlas.setFacing(this.facing);
      this.setState(this.state);
      if (this.root) this.root.dataset.pet = manifest.id || this.petKey;
      return this.atlas;
    } catch (err) {
      console.error(`[RetrieverSprite] ${this.petKey} atlas boot failed`, err);
      throw err;
    }
  }

  async ensure() {
    if (!this.atlas) await this._ready;
    return this.atlas;
  }

  animFor(state, facing) {
    if (state === "walk" || state === "run") {
      return facing === "left" ? "running-left" : "running-right";
    }
    if (state === "carry") {
      return facing === "left" ? "carry-left" : "carry-right";
    }
    return state;
  }

  _applyAnim() {
    const anim = this.animFor(this.state, this.facing);
    if (this.atlas) this.atlas.setAnimation(anim);
    else this._ready.then(() => this.atlas && this.atlas.setAnimation(anim));
  }

  setState(state) {
    this.state = state;
    if (this.root) this.root.dataset.state = state;
    this._applyAnim();
  }

  setFacing(facing) {
    const next = facing === "left" ? "left" : "right";
    if (next === this.facing) return;
    this.facing = next;
    if (this.root) this.root.dataset.facing = next;
    if (this.atlas) this.atlas.setFacing(next);
    // Directional states need a different row; others keep looping.
    if (
      this.state === "walk" ||
      this.state === "run" ||
      this.state === "carry"
    ) {
      this._applyAnim();
    }
  }
};

window.CatSprite = window.RetrieverSprite;
