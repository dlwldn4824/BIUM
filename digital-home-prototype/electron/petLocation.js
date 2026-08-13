/**
 * Where the Retriever currently "is" — home screen vs remote digital spaces.
 * Summon = call the dog back to this Mac's desktop + Mini habitat.
 */
const { EventEmitter } = require("events");

const LABELS = {
  home: "집",
  "mac-local": "MacBook",
  "windows-peer": "Desktop",
  gdrive: "Google Drive",
  mail: "Mail",
  exploring: "어딘가",
};

const bus = new EventEmitter();

/** @type {{ location: string, label: string, away: boolean, exploring: boolean, statusLine: string }} */
let state = {
  location: "home",
  label: LABELS.home,
  away: false,
  exploring: false,
  statusLine: "집에서 쉬고 있어요",
};

function snapshot() {
  return { ...state };
}

function setState(partial) {
  state = { ...state, ...partial };
  if (partial.location != null) {
    state.label = LABELS[state.location] || state.location;
    state.away = state.location !== "home";
  }
  const obj = /[가-힣]$/.test(state.label) ? "를" : "을";
  if (state.exploring && state.away) {
    state.statusLine = `🐾 지금 ${state.label}${obj} 살펴보는 중...`;
  } else if (state.away) {
    state.statusLine = `🐾 ${state.label}에 있어요`;
  } else if (state.exploring) {
    state.statusLine = `🐾 ${state.label}${obj} 살펴보는 중...`;
  } else {
    state.statusLine = "집에서 쉬고 있어요";
  }
  bus.emit("change", snapshot());
  return snapshot();
}

function goHome() {
  return setState({ location: "home", exploring: false });
}

function goExplore(location) {
  return setState({ location, exploring: true });
}

/** Map orchestrator agent id → location */
function fromAgent(agentId) {
  if (agentId === "windows-peer") return "windows-peer";
  if (agentId === "gdrive") return "gdrive";
  if (agentId === "mail") return "mail";
  if (agentId === "mac-local") return "mac-local";
  return "exploring";
}

function onChange(handler) {
  bus.on("change", handler);
  return () => bus.off("change", handler);
}

module.exports = {
  LABELS,
  snapshot,
  setState,
  goHome,
  goExplore,
  fromAgent,
  onChange,
};
