/**
 * Local Agent — Czkawka/Node scan + synthetic room progress for Retriever UI.
 * Pet choreography listens to progress events; hash matching stays in the engine.
 */
const path = require("path");
const os = require("os");
const { scanLocalLibrary } = require("./scanner");
const { resolveBinary, roomForPath } = require("./engines/czkawka");

const ROOM_LABELS = {
  laptop: "MacBook / Downloads",
  desktop: "Desktop",
  phone: "Phone",
  cloud: "Google Drive",
  mail: "Mail",
};

const DEFAULT_ROOTS = () => {
  const home = os.homedir();
  return [
    { room: "laptop", dir: path.join(home, "Downloads"), label: ROOM_LABELS.laptop },
    { room: "desktop", dir: path.join(home, "Desktop"), label: ROOM_LABELS.desktop },
    { room: "laptop", dir: path.join(home, "Documents"), label: "MacBook / Documents" },
  ];
};

function fixturePath() {
  return path.join(__dirname, "..", "fixtures", "czkawka-duplicates.sample.json");
}

function emit(send, payload) {
  if (typeof send === "function") send(payload);
}

/**
 * Run a local duplicate scan and stream pet-facing progress.
 * @param {{ engine?: string, send?: (e: object) => void, timeoutMs?: number }} options
 */
async function runLocalScan(options = {}) {
  const send = options.send;
  const roots = DEFAULT_ROOTS();
  const enginePref = options.engine || process.env.BIUM_SCAN_ENGINE || "auto";
  const hasCli = !!resolveBinary(options.binary);
  const useFixture = enginePref === "fixture" || (enginePref === "auto" && !hasCli && options.allowFixture !== false);

  emit(send, {
    phase: "start",
    text: useFixture
      ? "데모 인덱스로 탐색을 시작해요"
      : "Local Agent가 파일 목록을 모으는 중...",
    engine: useFixture ? "fixture" : hasCli ? "czkawka" : "node",
  });

  // Room hop narration while the engine works (CLI has no streaming progress).
  const hopRooms = [
    { room: "laptop", label: ROOM_LABELS.laptop },
    { room: "desktop", label: ROOM_LABELS.desktop },
    { room: "cloud", label: ROOM_LABELS.cloud },
  ];
  let hopIdx = 0;
  const hopTimer = setInterval(() => {
    const hop = hopRooms[hopIdx % hopRooms.length];
    hopIdx += 1;
    emit(send, {
      phase: hopIdx % 2 === 1 ? "walk" : "search",
      room: hop.room,
      label: hop.label,
      text:
        hopIdx % 2 === 1
          ? `${hop.label}(으)로 이동 중`
          : `${hop.label} 탐색 중...`,
      progress: Math.min(92, 18 + hopIdx * 12),
    });
  }, 1600);

  let result;
  try {
    result = await scanLocalLibrary({
      engine: useFixture ? "fixture" : enginePref,
      fixturePath: useFixture ? fixturePath() : undefined,
      roots: roots.map((r) => r.dir),
      timeoutMs: options.timeoutMs || 180000,
      binary: options.binary,
      limit: options.limit || 1500,
    });
  } finally {
    clearInterval(hopTimer);
  }

  const dupPile = result.piles?.find((p) => p.id === "duplicates");
  const groups = dupPile?.groups || [];
  const primary = groups[0] || null;
  const roomsVisited = primary
    ? [...new Set(primary.files.map((f) => f.room || roomForPath(f.path)))]
    : hopRooms.map((h) => h.room);

  emit(send, {
    phase: "indexed",
    text: `${result.scannedFiles || 0}개 파일 인덱싱 완료`,
    scannedFiles: result.scannedFiles,
    engine: result.engine,
    rooms: roomsVisited,
    groupCount: groups.length,
    progress: 100,
  });

  if (primary && primary.files?.length >= 2) {
    emit(send, {
      phase: "found",
      room: primary.files[primary.files.length - 1].room || roomsVisited[roomsVisited.length - 1],
      text: `어? 똑같은 파일을 ${primary.files.length}곳에서 봤어요`,
      group: primary,
    });
  } else {
    emit(send, {
      phase: "idle",
      text: "지금은 깨끗한 편이에요",
    });
  }

  return {
    ok: true,
    usedFixture: useFixture,
    result,
    primary,
    roomsVisited,
  };
}

module.exports = {
  runLocalScan,
  fixturePath,
  ROOM_LABELS,
  resolveBinary,
};
