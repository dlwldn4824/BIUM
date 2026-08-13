/**
 * FramePet — 64×64 PNG frame cycling via img.src (integer scale only).
 */
window.FramePet = class FramePet {
  /**
   * @param {HTMLElement} el
   * @param {HTMLElement} [root]
   * @param {object} manifest
   * @param {string} baseDir
   */
  constructor(el, root, manifest, baseDir) {
    this.root = root || el.closest(".agent") || el.parentElement;
    this.manifest = manifest;
    this.baseDir = baseDir.replace(/\/$/, "");
    this.native = manifest.cellSize || 64;
    this.scale = Math.max(1, Math.round(Number(manifest.scale) || 2));
    this.size = this.native * this.scale;
    this.state = "sleep";
    this.facing = "right";
    this.usesCarryProp = manifest.usesCarryProp === true;
    this.flipLeft = !!manifest.flipLeft;
    this.frame = 0;
    this.timer = null;
    this.cacheBust = "frm1";
    this.states = manifest.states || {};

    if (el.tagName === "IMG") {
      this.img = el;
      this.host = el;
    } else {
      this.host = el;
      el.innerHTML = "";
      el.classList.add("frame-pet-host", "pet-atlas", "agent-sprite");
      this.img = document.createElement("img");
      this.img.alt = manifest.displayName || "pet";
      this.img.draggable = false;
      el.appendChild(this.img);
    }

    this._applySize();
    this.img.style.objectFit = "contain";
    this.img.style.imageRendering = "pixelated";
    this.img.style.imageRendering = "crisp-edges";
    this.host.style.imageRendering = "pixelated";
    this.host.style.imageRendering = "crisp-edges";
    if (this.root) this.root.dataset.pet = manifest.id || "frame-pet";
    this.setState(this.state);
  }

  _applySize() {
    const px = `${this.size}px`;
    this.img.style.width = px;
    this.img.style.height = px;
    this.host.style.width = px;
    this.host.style.height = px;
  }

  setDisplaySize(px) {
    const n = Math.max(this.native, Number(px) || this.size);
    this.scale = Math.max(1, Math.round(n / this.native));
    this.size = this.native * this.scale;
    this._applySize();
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

  entryFor(key) {
    return (
      this.states[key] ||
      this.states.sleep ||
      this.states.idle ||
      Object.values(this.states)[0]
    );
  }

  paint() {
    const key = this.animFor(this.state, this.facing);
    const entry = this.entryFor(key);
    const frames = entry?.frames || [];
    if (!frames.length) return;
    const i = ((this.frame % frames.length) + frames.length) % frames.length;
    const src = `${this.baseDir}/${frames[i]}?v=${this.cacheBust}`;
    if (this.img.getAttribute("src") !== src) this.img.src = src;
    this.img.dataset.animation = key;
    this.host.dataset.animation = key;
  }

  play() {
    this.stop();
    const key = this.animFor(this.state, this.facing);
    const entry = this.entryFor(key);
    const ms = entry?.ms || 160;
    this.paint();
    const n = entry?.frames?.length || 1;
    if (n <= 1) return;
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % n;
      this.paint();
    }, ms);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setState(state) {
    this.state = state;
    if (this.root) this.root.dataset.state = state;
    this.frame = 0;
    this.play();
  }

  setFacing(facing) {
    const next = facing === "left" ? "left" : "right";
    if (next === this.facing) return;
    this.facing = next;
    if (this.root) this.root.dataset.facing = next;
    if (this.flipLeft) {
      this.img.style.transform =
        next === "left" ? "scaleX(-1)" : "none";
    }
    this.setState(this.state);
  }

  async ensure() {
    return this;
  }
};
