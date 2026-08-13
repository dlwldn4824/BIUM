/**
 * Display Mode: Mini (default) | Home
 * Persists preference; resizes Electron window when available.
 */
window.BiumMode = (() => {
  const KEY = "bium.displayMode";
  const DEFAULT = "mini";

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      return v === "home" || v === "mini" ? v : DEFAULT;
    } catch {
      return DEFAULT;
    }
  }

  function write(mode) {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
  }

  async function applyWindow(mode) {
    const api = window.biumDesktop;
    if (api?.setDisplayMode) {
      try {
        await api.setDisplayMode(mode);
      } catch (err) {
        console.warn("[BiumMode] setDisplayMode", err);
      }
    }
  }

  /**
   * @param {"mini"|"home"} mode
   * @param {{ persist?: boolean }} [opts]
   */
  async function setMode(mode, opts = {}) {
    const next = mode === "home" ? "home" : "mini";
    document.body.dataset.mode = next;
    const home = document.getElementById("homeFrame");
    const mini = document.getElementById("miniRoot");
    if (home) home.hidden = next !== "home";
    if (mini) mini.hidden = next !== "mini";
    if (opts.persist !== false) write(next);
    await applyWindow(next);
    document.dispatchEvent(
      new CustomEvent("bium:mode", { detail: { mode: next } })
    );
    return next;
  }

  function getMode() {
    return document.body.dataset.mode === "home" ? "home" : "mini";
  }

  async function boot() {
    const preferred = read();
    await setMode(preferred, { persist: false });
    if (window.biumDesktop?.onDisplayMode) {
      window.biumDesktop.onDisplayMode((mode) => {
        setMode(mode === "home" ? "home" : "mini", { persist: true });
      });
    }
    return preferred;
  }

  return { KEY, DEFAULT, read, write, setMode, getMode, boot };
})();
