/**
 * Near-duplicate photo stacking — Czkawka `image` (perceptual hash) on local folders.
 * Fixture only when explicitly requested or CLI missing + useFixture fallback.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { explainGroups } = require("./explainCandidate");
const {
  resolveBinary,
  scanSimilarImagesWithCzkawka,
  roomForPath,
  formatBytes,
} = require("./czkawka");

function fixturePath() {
  return path.join(
    __dirname,
    "..",
    "..",
    "fixtures",
    "similar-photos.sample.json"
  );
}

function loadFixture() {
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath(), "utf8"));
    return Array.isArray(raw.groups) ? raw.groups : [];
  } catch {
    return [];
  }
}

function defaultPhotoDirectories() {
  const home = os.homedir();
  // Pictures first; Desktop for screenshots. Downloads is often huge/noisy — opt-in.
  return [path.join(home, "Pictures"), path.join(home, "Desktop")];
}

function defaultExcludedDirectories() {
  const home = os.homedir();
  const pics = path.join(home, "Pictures");
  return [
    path.join(pics, "Photos Library.photoslibrary"),
    path.join(pics, "Photo Library.photoslibrary"),
    path.join(home, "Library"),
  ];
}

function placeLabel(filePath) {
  const home = os.homedir();
  const rel = filePath.startsWith(home)
    ? filePath.slice(home.length).replace(/^\//, "")
    : filePath;
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length <= 1) return `MacBook / ${parts[0] || "로컬"}`;
  return `MacBook / ${parts.slice(0, 2).join("/")}`;
}

function similarityFromDifference(diff, maxDifference) {
  const d = Number(diff);
  if (!Number.isFinite(d)) return 0.85;
  const max = Math.max(1, Number(maxDifference) || 10);
  return Math.max(0.55, Math.min(0.99, 1 - d / (max * 1.5)));
}

function mapRawGroups(
  rawGroups,
  { maxGroups = 24, maxDifference = 8, minSimilarity = 0.72, maxFilesPerGroup = 40 } = {}
) {
  const mapped = [];

  for (let i = 0; i < rawGroups.length; i += 1) {
    const rawFiles = rawGroups[i];
    if (!Array.isArray(rawFiles) || rawFiles.length < 2) continue;

    let files = rawFiles.map((f) => {
      const filePath = f.path || f.file_path;
      const size = Number(f.size) || 0;
      const width = Number(f.width) || 0;
      const height = Number(f.height) || 0;
      const pixels = width * height;
      const mtimeMs = f.modified_date
        ? Number(f.modified_date) * 1000
        : Number(f.mtimeMs) || 0;
      return {
        path: filePath,
        name: path.basename(filePath),
        place: placeLabel(filePath),
        size: formatBytes(size),
        sizeBytes: size,
        width,
        height,
        pixels,
        difference: Number(f.difference) || 0,
        modified: mtimeMs ? new Date(mtimeMs).toISOString() : null,
        room: roomForPath(filePath),
        source: "local",
      };
    });

    // Prefer tighter matches inside oversized stacks
    files.sort((a, b) => a.difference - b.difference);
    if (files.length > maxFilesPerGroup) {
      files = files.slice(0, maxFilesPerGroup);
    }
    if (files.length < 2) continue;

    const byPixels = [...files].sort(
      (a, b) => b.pixels - a.pixels || b.sizeBytes - a.sizeBytes
    );
    const bySize = [...files].sort((a, b) => b.sizeBytes - a.sizeBytes);
    const keep = byPixels[0] || bySize[0];
    const reclaimBytes = files
      .filter((f) => f.path !== keep.path)
      .reduce((s, f) => s + f.sizeBytes, 0);
    const maxDiffInGroup = Math.max(...files.map((f) => f.difference || 0));
    const similarity = similarityFromDifference(maxDiffInGroup, maxDifference);
    if (similarity < minSimilarity) continue;
    if (reclaimBytes < 40_000) continue;

    mapped.push({
      id: `photo-sim-${i}-${String(keep.name || "img")
        .replace(/\W+/g, "")
        .slice(0, 12)}`,
      kind: "similar-photo",
      confidence:
        similarity >= 0.9 ? "high" : similarity >= 0.78 ? "medium" : "review",
      title: `비슷한 사진 ${files.length}장`,
      reason: `지각 해시 유사도 약 ${Math.round(similarity * 100)}% · 해상도·용량이 큰 장을 남기면 나머지를 정리할 수 있어요.`,
      count: files.length,
      reclaimBytes,
      similarity,
      keepOptions: [1, 3, "all"],
      keepPath: keep.path,
      engine: "czkawka-image",
      pickHint: {
        sharpest: keep.name,
        highestRes: byPixels[0]?.name || keep.name,
        eyesOpen: null,
        maxDifference: maxDiffInGroup,
      },
      files,
    });
  }

  mapped.sort((a, b) => b.reclaimBytes - a.reclaimBytes);
  return mapped.slice(0, maxGroups);
}

async function buildFromFixture() {
  const groups = loadFixture().map((g) => ({
    ...g,
    kind: "similar-photo",
    confidence: g.confidence || "high",
    keepOptions: g.keepOptions || [1, 3, "all"],
  }));
  const explained = await explainGroups(groups);
  const reclaimBytes = explained.reduce((s, g) => s + (g.reclaimBytes || 0), 0);
  return {
    ok: true,
    source: "fixture",
    groups: explained,
    reclaimBytes,
    pile: {
      id: "similar-photos",
      kind: "similar-photo",
      label: "비슷한 사진",
      count: explained.reduce(
        (s, g) => s + (g.count || g.files?.length || 0),
        0
      ),
      reclaimBytes,
      groups: explained,
    },
  };
}

/**
 * @param {{
 *   useFixture?: boolean,
 *   directories?: string[],
 *   excludedDirectories?: string[],
 *   maxDifference?: number,
 *   minSize?: number,
 *   timeoutMs?: number,
 *   maxGroups?: number,
 * }} [opts]
 */
async function build(opts = {}) {
  if (opts.useFixture === true) {
    return buildFromFixture();
  }

  const binary = resolveBinary(opts.binary);
  if (!binary) {
    if (opts.fallbackFixture) return buildFromFixture();
    return {
      ok: false,
      source: "unavailable",
      groups: [],
      reclaimBytes: 0,
      pile: null,
      error: "czkawka_cli not found",
    };
  }

  const maxDifference = opts.maxDifference ?? 8;
  const directories = opts.directories || defaultPhotoDirectories();
  const excludedDirectories =
    opts.excludedDirectories || defaultExcludedDirectories();

  const scanned = await scanSimilarImagesWithCzkawka({
    directories,
    excludedDirectories,
    minSize: opts.minSize ?? 20_000,
    maxDifference,
    hashSize: opts.hashSize ?? 16,
    hashAlg: opts.hashAlg || "Gradient",
    timeoutMs: opts.timeoutMs ?? 150000,
    binary,
  });

  const groups = mapRawGroups(scanned.groups || [], {
    maxGroups: opts.maxGroups ?? 24,
    maxDifference,
    minSimilarity: opts.minSimilarity ?? 0.72,
  });
  const explained = await explainGroups(groups);
  const reclaimBytes = explained.reduce((s, g) => s + (g.reclaimBytes || 0), 0);

  return {
    ok: true,
    source: "czkawka-image",
    groups: explained,
    reclaimBytes,
    binary: scanned.binary || binary,
    pile: explained.length
      ? {
          id: "similar-photos",
          kind: "similar-photo",
          label: "비슷한 사진",
          count: explained.reduce(
            (s, g) => s + (g.count || g.files?.length || 0),
            0
          ),
          reclaimBytes,
          groups: explained,
        }
      : null,
  };
}

module.exports = {
  build,
  loadFixture,
  mapRawGroups,
  defaultPhotoDirectories,
};
