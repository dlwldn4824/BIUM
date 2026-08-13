/**
 * Cold / long-idle data → hibernate ("잠재우기") candidates.
 * Demo: fixture Drive folder. Optional: merge scanner `stale` pile metadata.
 */
const fs = require("fs");
const path = require("path");
const { explainGroups, formatBytes } = require("./explainCandidate");

function fixturePath() {
  return path.join(__dirname, "..", "..", "fixtures", "cold-stale.sample.json");
}

function loadFixture() {
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath(), "utf8"));
    return Array.isArray(raw.groups) ? raw.groups : [];
  } catch {
    return [];
  }
}

/**
 * Normalize a scanner stale pile group into hibernate candidate shape.
 * @param {object | null} stalePile
 */
function fromScannerPile(stalePile) {
  const g = stalePile?.groups?.[0];
  if (!g?.files?.length) return null;
  const bytes = Number(g.reclaimBytes || stalePile.reclaimBytes) || 0;
  const n = g.files.length;
  return {
    id: g.id || "stale-local",
    kind: "stale",
    confidence: "cold",
    title: `오래 안 쓴 파일 ${n}개`,
    reason:
      "2년 이상 열지 않은 로컬 파일이 있어요. 지우기 불안하면 잠재우기로 저빈도 보관할까요?",
    idleLabel: "2년+",
    count: n,
    reclaimBytes: bytes,
    place: "MacBook · 로컬",
    actions: ["leave", "hibernate", "clean"],
    carbonDefer: true,
    source: "scanner",
    files: g.files.slice(0, 12).map((f) => ({
      name: f.name,
      place: f.place || f.room || "Local",
      size: f.sizeLabel || (f.size != null ? formatBytes(f.size) : ""),
      lastOpened: f.lastOpened || null,
    })),
  };
}

/**
 * @param {{ useFixture?: boolean, stalePile?: object | null }} [opts]
 */
async function build(opts = {}) {
  const useFixture = opts.useFixture !== false;
  let groups = [];

  if (useFixture) {
    groups = loadFixture().map((g) => ({
      ...g,
      kind: "stale",
      confidence: "cold",
      actions: g.actions || ["leave", "hibernate", "clean"],
      carbonDefer: g.carbonDefer !== false,
      source: "fixture",
    }));
  }

  const fromScan = fromScannerPile(opts.stalePile || null);
  if (fromScan) {
    // Keep demo narrative first; append real local cold set if present.
    if (!groups.some((g) => g.id === fromScan.id)) groups.push(fromScan);
  }

  const explained = await explainGroups(groups);
  const reclaimBytes = explained.reduce(
    (s, g) => s + (Number(g.reclaimBytes) || 0),
    0
  );
  const count = explained.reduce(
    (s, g) => s + (g.count || g.files?.length || 0),
    0
  );

  return {
    ok: true,
    source: fromScan ? "fixture+scanner" : "fixture",
    groups: explained,
    reclaimBytes,
    pile: explained.length
      ? {
          id: "cold-stale",
          kind: "stale",
          label: "오래 안 씀 · 잠재우기",
          count,
          reclaimBytes,
          groups: explained,
        }
      : null,
  };
}

module.exports = { build, loadFixture, fromScannerPile };
