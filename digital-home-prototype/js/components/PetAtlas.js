/**
 * PetAtlas — spritesheet renderer
 * Supports:
 *  - row + frames (OpenPets / WindowPet sequential rows)
 *  - cells: [[col,row], ...] (oneko / Neko layout)
 *  - rectangular cells (Codex pets: 192×208 / 96×104)
 *
 * Scale must stay an integer so background-position never drifts between frames.
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
    this.cellW = Number(manifest.cellWidth || manifest.cellSize || 64);
    this.cellH = Number(manifest.cellHeight || manifest.cellSize || this.cellW);
    this.cell = this.cellW;
    this.cols = manifest.columns || 8;
    this.rows = manifest.rows || 9;
    this.scale = Math.max(1, Math.round(Number(manifest.scale) || 1));
    this.flipLeft = !!manifest.flipLeft;
    this.softSprite = !!manifest.softSprite;
    this.animation = "idle";
    this.frame = 0;
    this.facing = "right";
    this.timer = null;
    this.raf = 0;
    this.nextTick = 0;
    this.byName = Object.fromEntries(
      (manifest.animations || []).map((a) => [a.name, a])
    );
    this.aliases = manifest.aliases || {};

    this.el.classList.add("pet-atlas", "agent-sprite");
    this.el.classList.remove("retriever", "frame-pet-host", "gif-pet-host");
    this.el.innerHTML = "";
    this.el.style.backgroundImage = `url("${sheetUrl}")`;
    this.el.style.backgroundRepeat = "no-repeat";
    this.el.style.backgroundColor = "transparent";
    this.el.style.imageRendering = this.softSprite ? "auto" : "pixelated";
    if (!this.softSprite) this.el.style.imageRendering = "crisp-edges";
    this._applySize();
    this._applyFlip();
    this.setAnimation("idle");
  }

  _applySize() {
    const scale = Math.max(1, Math.round(this.scale));
    this.scale = scale;
    const w = this.cellW * scale;
    const h = this.cellH * scale;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    this.el.style.backgroundSize = `${this.cols * this.cellW * scale}px ${this.rows * this.cellH * scale}px`;
    this.display = w;
    this.displayH = h;
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

  resolveName(name) {
    const key = this.aliases[name] || name;
    if (this.byName[key]) return key;
    if (this.byName.idle) return "idle";
    if (this.byName.stand) return "stand";
    return key;
  }

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
    const x = -(col * this.cellW * this.scale);
    const y = -(row * this.cellH * this.scale);
    this.el.style.backgroundPosition = `${x}px ${y}px`;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.nextTick = 0;
  }

  play() {
    this.stop();
    const anim = this.resolve(this.animation);
    const ms = Math.max(40, (anim && anim.ms) || 140);
    this.paint();
    const n = this.cellsOf(anim).length;
    if (n <= 1) return;

    const tick = (now) => {
      if (!this.nextTick) this.nextTick = now + ms;
      if (now >= this.nextTick) {
        const steps = Math.max(1, Math.floor((now - this.nextTick) / ms) + 1);
        this.frame = (this.frame + steps) % n;
        this.nextTick += steps * ms;
        // Avoid spiral-of-death after tab throttle
        if (this.nextTick < now - ms) this.nextTick = now + ms;
        this.paint();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  setAnimation(name) {
    const next = this.resolveName(name);
    if (next === this.animation && (this.raf || this.timer)) return;
    this.animation = next;
    this.frame = 0;
    this.el.dataset.animation = next;
    this.play();
  }
};
