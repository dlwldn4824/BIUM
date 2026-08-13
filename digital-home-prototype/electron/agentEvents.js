/**
 * OpenPet-inspired agent event bus.
 * Backend emits SCAN_* / DEVICE_* / DUPLICATE_* ; Desktop Pet + Mini subscribe.
 *
 * Ref: https://github.com/X-T-E-R/OpenPet
 */
const { EventEmitter } = require("events");

/** @type {import('events').EventEmitter} */
const bus = new EventEmitter();
bus.setMaxListeners(40);

/** Canonical event names */
const Events = {
  SCAN_STARTED: "SCAN_STARTED",
  SCANNING: "SCANNING",
  DEVICE_CHANGED: "DEVICE_CHANGED",
  DUPLICATE_FOUND: "DUPLICATE_FOUND",
  OLD_FILE_FOUND: "OLD_FILE_FOUND",
  SCAN_COMPLETED: "SCAN_COMPLETED",
  ATTENTION: "ATTENTION",
  CAT_EXIT_RIGHT: "CAT_EXIT_RIGHT",
  CAT_ENTER_LEFT: "CAT_ENTER_LEFT",
  /** Summon pet back to this Mac overlay */
  PET_RETURN_HOME: "PET_RETURN_HOME",
  IDLE: "IDLE",
};

/**
 * Map progress payload from orchestrator → OpenPet-style events.
 */
function fromProgress(p) {
  if (!p?.phase) return;
  switch (p.phase) {
    case "start":
      emit(Events.SCAN_STARTED, { agent: p.agent, text: p.text });
      break;
    case "walk":
    case "search":
      emit(Events.SCANNING, {
        agent: p.agent,
        room: p.room,
        text: p.text,
        label: p.label,
      });
      break;
    case "transfer":
      emit(Events.DEVICE_CHANGED, {
        from: p.from,
        to: p.to,
        text: p.text,
      });
      if (p.to === "windows-peer") emit(Events.CAT_EXIT_RIGHT, p);
      if (p.from === "windows-peer" || p.to === "mac-local") {
        /* enter handled on destination */
      }
      if (p.to === "windows-peer") {
        // Destination will CAT_ENTER_LEFT after exit animation window
        setTimeout(() => emit(Events.CAT_ENTER_LEFT, p), 400);
      }
      break;
    case "found":
      emit(Events.DUPLICATE_FOUND, { group: p.group, text: p.text, room: p.room });
      emit(Events.ATTENTION, { text: p.text });
      break;
    case "indexed":
      emit(Events.SCAN_COMPLETED, {
        scannedFiles: p.scannedFiles,
        groupCount: p.groupCount,
        text: p.text,
      });
      break;
    case "idle":
      emit(Events.IDLE, { text: p.text });
      break;
    default:
      break;
  }
}

function emit(type, detail = {}) {
  const envelope = { type, at: Date.now(), ...detail };
  bus.emit("agent", envelope);
  bus.emit(type, envelope);
  return envelope;
}

function onAgent(handler) {
  bus.on("agent", handler);
  return () => bus.off("agent", handler);
}

function on(type, handler) {
  bus.on(type, handler);
  return () => bus.off(type, handler);
}

/** Pet pose hints derived from event type (OpenPet runtime mapping). */
function poseForEvent(type) {
  switch (type) {
    case Events.SCAN_STARTED:
    case Events.SCANNING:
      return { state: "run", speechKey: "scanning" };
    case Events.CAT_EXIT_RIGHT:
      return { state: "run", facing: "right", speech: "다른 기기로!" };
    case Events.CAT_ENTER_LEFT:
      return { state: "run", facing: "right", speech: "이번엔 Desktop을 볼게요" };
    case Events.DEVICE_CHANGED:
      return { state: "run" };
    case Events.DUPLICATE_FOUND:
    case Events.ATTENTION:
      return { state: "found", carry: true };
    case Events.SCAN_COMPLETED:
      return { state: "search" };
    case Events.IDLE:
      return { state: "sleep", speech: "지금은 깨끗해요" };
    case Events.PET_RETURN_HOME:
      return { state: "run", facing: "right", speech: "불렀어? 지금 갈게!" };
    default:
      return null;
  }
}

module.exports = {
  Events,
  emit,
  on,
  onAgent,
  fromProgress,
  poseForEvent,
  bus,
};
