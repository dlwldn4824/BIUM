/**
 * CatSprite — sprite-sheet only (no CSS-drawn cat).
 * Sheet: assets/cat/cat-sprite-sheet.png
 * Grid: 4 cols × 7 rows × 64px → idle walk search found carry clean happy
 * Display uses nearest-neighbor via CSS `image-rendering: pixelated`.
 */
window.CatSprite = class CatSprite {
  /** @param {HTMLElement} el agent root that owns data-state / data-facing */
  constructor(el) {
    this.el = el;
    this.state = "idle";
    this.facing = "right";
  }

  setState(state) {
    this.state = state;
    this.el.dataset.state = state;
  }

  setFacing(facing) {
    this.facing = facing;
    this.el.dataset.facing = facing;
  }
};
