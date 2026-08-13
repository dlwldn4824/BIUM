/**
 * PetAtlas — spritesheet renderer
 * Supports:
 *  - row + frames (OpenPets / WindowPet sequential rows)
 *  - cells: [[col,row], ...] (oneko / Neko layout)
 */
window.PetAtlas = class PetAtlas {
  /**
   * @param {HTMLElement} el
   * @param {object} manifest pet.json
   * @param {string} sheetUrl
   */
  constructor(el, manifest, sheetUrl) {
    this.el = el;
    this.manifest = manifest;
    this.sheetUrl = sheetUrl;
    this.cell = manifest.cellSize || 64;
    this.cols = manifest.columns || 8;
    this.rows = manifest.rows || 9;
    this.scale = Math.max(1, Number(manifest.scale) || 2);
    this.flipLeft = !!manifest.flipLeft;
    this.animation = "idle";
    this.frame = 0;
    this.facing = "right";
    this.timer = null;
    this.byName = Object.fromEntries(
      (manifest.animations || []).map((a) => [a.name, a])
    );
    this.aliases = manifest.aliases || {};

    this.el.classList.add("pet-atlas", "agent-sprite");
    this.el.classList.remove("retriever");
    this.el.style.width = `${this.cell * this.scale}px`;
    this.el.style.height = `${this.cell * this.scale}px`;
    this.el.style.imageRendering = "pixelated";
    this.el.style.backgroundRepeat = "no-repeat";
    this.el.style.backgroundImage = `url("${sheetUrl}")`;
    this._applySize();
    this._applyFlip();
    this.setAnimation("idle");
  }

  _applySize() {
    const sheetW = this.cols * this.cell * this.scale;
    const sheetH = this.rows * this.cell * this.scale;
    this.el.style.backgroundSize = `${sheetW}px ${sheetH}px`;
    this.display = this.cell * this.scale;
  }

  _applyFlip() {
    const flip = this.flipLeft && this.facing === "left";
    this.el.style.transform = flip
      ? "scaleX(-1) translateZ(0)"
      : "translateZ(0)";
    this.el.dataset.facing = this.facing;
  }

  setFacing(facing) {
    this.facing = facing === "left" ? "left" : "right";
    this._applyFlip();
  }

  resolve(name) {
    const key = this.aliases[name] || name;
    return this.byName[key] || this.byName.idle || this.byName.stand;
  }

  /** Normalize animation to list of [col, row] */
  cellsOf(anim) {
    if (!anim) return [[0, 0]];
    if (Array.isArray(anim.cells) && anim.cells.length) {
      return anim.cells;
    }
    const frames = Math.max(1, anim.frames || 1);
    const row = Number(anim.row) || 0;
    const out = [];
    for (let i = 0; i < frames; i += 1) out.push([i, row]);
    return out;
  }

  paint() {
    const anim = this.resolve(this.animation);
    const cells = this.cellsOf(anim);
    const f = ((this.frame % cells.length) + cells.length) % cells.length;
    const [col, row] = cells[f];
    const x = -(col * this.cell * this.scale);
    const y = -(row * this.cell * this.scale);
    this.el.style.backgroundPosition = `${x}px ${y}px`;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  play() {
    this.stop();
    const anim = this.resolve(this.animation);
    const ms = (anim && anim.ms) || 140;
    this.paint();
    this.timer = setInterval(() => {
      const a = this.resolve(this.animation);
      const n = this.cellsOf(a).length;
      this.frame = (this.frame + 1) % n;
      this.paint();
    }, ms);
  }

  setAnimation(name) {
    const next = this.aliases[name] || name;
    if (next === this.animation && this.timer) return;
    this.animation = next;
    this.frame = 0;
    this.el.dataset.animation = next;
    this.play();
  }
};
