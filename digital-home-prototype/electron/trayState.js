/**
 * Menu bar tray status — idle / scanning / found / error
 * Badge text shown next to the house icon on macOS.
 */
const { EventEmitter } = require("events");

/** @typedef {"idle"|"scanning"|"found"|"error"} TrayStatus */

const bus = new EventEmitter();

/** @type {{ status: TrayStatus, foundCount: number, label: string, title: string }} */
let state = {
  status: "idle",
  foundCount: 0,
  label: "집에서 쉬는 중",
  title: "",
};

function snapshot() {
  return { ...state };
}

function titleFor(status, foundCount) {
  if (status === "scanning") return "•";
  if (status === "found") return String(Math.min(Math.max(foundCount, 1), 9));
  if (status === "error") return "!";
  return "";
}

/**
 * @param {Partial<{ status: TrayStatus, foundCount: number, label: string }>} partial
 */
function setState(partial = {}) {
  state = { ...state, ...partial };
  if (partial.foundCount != null) {
    state.foundCount = Math.max(0, Number(partial.foundCount) || 0);
  }
  state.title = titleFor(state.status, state.foundCount);
  bus.emit("change", snapshot());
  return snapshot();
}

function setIdle(label = "집에서 쉬는 중") {
  return setState({ status: "idle", label });
}

function setScanning(label = "탐색 중...") {
  return setState({ status: "scanning", label });
}

function setFound(count, label = "새 발견") {
  return setState({
    status: "found",
    foundCount: count,
    label,
  });
}

function setError(label = "오류") {
  return setState({ status: "error", label });
}

function onChange(handler) {
  bus.on("change", handler);
  return () => bus.off("change", handler);
}

module.exports = {
  snapshot,
  setState,
  setIdle,
  setScanning,
  setFound,
  setError,
  onChange,
};
