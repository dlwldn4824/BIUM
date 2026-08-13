/**
 * GifPet — PawPal-style GIF state player (same API surface as RetrieverSprite).
 */
window.GifPet = class GifPet {
  /**
   * @param {HTMLElement} el host (div or img)
   * @param {HTMLElement} [root]
   * @param {object} manifest pet.json (type: gif)
   * @param {string} baseDir e.g. assets/pets/pawpal-puppy
   */
  constructor(el, root, manifest, baseDir) {
    this.root = root || el.closest(".agent") || el.parentElement;
    this.manifest = manifest;
    this.baseDir = baseDir.replace(/\/$/, "");
    this.state = "sleep";
    this.facing = "right";
    this.usesCarryProp = manifest.usesCarryProp !== false;
    this.flipLeft = manifest.flipLeft !== false;
    this.size = manifest.displaySize || 96;
    this.native = this.size;
    this.cacheBust = "paw2";
    this._preload();

    if (el.tagName === "IMG") {
      this.img = el;
      this.host = el;
    } else {
      this.host = el;
      el.innerHTML = "";
      el.classList.add("gif-pet-host", "pet-atlas", "agent-sprite");
      this.img = document.createElement("img");
      this.img.alt = manifest.displayName || "pet";
      this.img.draggable = false;
      el.appendChild(this.img);
    }

    this._applySize();
    this.img.style.objectFit = "contain";
    this.img.style.imageRendering = "auto";
    this._applyFlip();
    this.setState(this.state);
    if (this.root) this.root.dataset.pet = manifest.id || "gif-pet";
  }

  _preload() {
    const states = this.manifest.states || {};
    const seen = new Set();
    Object.values(states).forEach((entry) => {
      if (!entry?.src || seen.has(entry.src)) return;
      seen.add(entry.src);
      const img = new Image();
      img.src = `${this.baseDir}/${entry.src}?v=${this.cacheBust}`;
    });
  }

  _applySize() {
    const px = `${this.size}px`;
    this.img.style.width = px;
    this.img.style.height = px;
    this.host.style.width = px;
    this.host.style.height = px;
  }

  setDisplaySize(px) {
    this.size = Math.max(48, Number(px) || this.size);
    this._applySize();
  }

  srcFor(state) {
    const states = this.manifest.states || {};
    const entry =
      states[state] ||
      states.sleep ||
      states.idle ||
      Object.values(states)[0];
    if (!entry?.src) return null;
    return `${this.baseDir}/${entry.src}?v=${this.cacheBust}`;
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

  setState(state) {
    this.state = state;
    if (this.root) this.root.dataset.state = state;
    const key = this.animFor(state, this.facing);
    const src = this.srcFor(key) || this.srcFor("sleep");
    if (src && this.img.getAttribute("src") !== src) {
      this.img.src = src;
    }
    this.img.dataset.animation = key;
    this.host.dataset.animation = key;
  }

  setFacing(facing) {
    const next = facing === "left" ? "left" : "right";
    if (next === this.facing) return;
    this.facing = next;
    if (this.root) this.root.dataset.facing = next;
    this._applyFlip();
    // Same GIF for L/R — flip only, don't reload src (avoids animation hitch).
  }

  _applyFlip() {
    const flip = this.flipLeft && this.facing === "left";
    const t = flip ? "scaleX(-1)" : "none";
    this.img.style.transform = t;
    this.host.style.transform = "translateZ(0)";
  }

  async ensure() {
    return this;
  }
};
