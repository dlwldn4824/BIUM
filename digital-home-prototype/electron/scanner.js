const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const {
  scanDuplicatesWithCzkawka,
  resolveBinary,
} = require("./engines/czkawka");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "Library",
  ".Trash",
  "Caches",
  ".cache",
]);

const TWO_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 2;
const LARGE_FILE_BYTES = 100 * 1024 * 1024; // 100MB

function formatBytes(bytes) {
  if (!bytes) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

async function hashFile(filePath, maxBytes = 8 * 1024 * 1024) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const hash = crypto.createHash("sha256");
    hash.update(String(stat.size));

    const length = Math.min(stat.size, maxBytes);
    if (length > 0) {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);
      hash.update(buffer);
    }

    if (stat.size > maxBytes) {
      const tail = Math.min(64 * 1024, stat.size);
      const buffer = Buffer.alloc(tail);
      await handle.read(buffer, 0, tail, stat.size - tail);
      hash.update(buffer);
    }

    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

/** Full-file MD5 — matches Google Drive `md5Checksum` for cross-device dups. */
async function md5File(filePath) {
  const hash = crypto.createHash("md5");
  const stream = require("fs").createReadStream(filePath);
  await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

/**
 * Compute MD5 for a list of local paths (concurrency-limited).
 * @param {string[]} paths
 * @param {{ limit?: number, concurrency?: number }} [opts]
 */
async function md5Many(paths, opts = {}) {
  const limit = Math.max(1, opts.limit || 80);
  const concurrency = Math.max(1, opts.concurrency || 4);
  const list = [...new Set((paths || []).filter(Boolean))].slice(0, limit);
  const out = new Map();
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const p = list[idx];
      try {
        out.set(p, await md5File(p));
      } catch {
        /* unreadable */
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, () => worker())
  );
  return out;
}

async function walk(dir, files, limit, depth = 0) {
  if (files.length >= limit || depth > 6) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (files.length >= limit) return;
    if (entry.name.startsWith(".")) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, files, limit, depth + 1);
      continue;
    }

    if (!entry.isFile()) continue;

    try {
      const stat = await fs.stat(full);
      if (!stat.isFile() || stat.size === 0) continue;
      files.push({
        path: full,
        name: entry.name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        atimeMs: stat.atimeMs,
        ext: path.extname(entry.name).toLowerCase(),
        source: "local",
        id: full,
        room: roomForPath(full),
      });
    } catch {
      // ignore unreadable files
    }
  }
}

function roomForPath(filePath) {
  const home = os.homedir();
  const lower = filePath.toLowerCase();
  if (
    lower.includes("google drive") ||
    lower.includes("googledrive") ||
    lower.includes("onedrive") ||
    lower.includes("icloud") ||
    lower.includes("dropbox")
  ) {
    return "cloud";
  }
  if (lower.includes("/mail/") || lower.includes("attachments")) {
    return "mail";
  }
  if (
    lower.includes("iphone") ||
    lower.includes("android") ||
    lower.includes("mobile") ||
    lower.includes("dcim")
  ) {
    return "phone";
  }
  if (filePath.startsWith(path.join(home, "Desktop"))) return "desktop";
  if (filePath.startsWith(path.join(home, "Downloads"))) return "laptop";
  if (filePath.startsWith(path.join(home, "Documents"))) return "laptop";
  return "laptop";
}

function buildPlanInsight(cloudBytes) {
  // Demo Google One style tiers for hackathon visualization
  const currentUsage = 22.4 * 1024 ** 3;
  const after = Math.max(0, currentUsage - cloudBytes);
  const freeTier = 15 * 1024 ** 3;
  const canDowngrade = currentUsage > freeTier && after <= freeTier;

  return {
    currentUsageBytes: currentUsage,
    afterUsageBytes: after,
    freeTierBytes: freeTier,
    canDowngrade,
    directSavingKrw: canDowngrade ? 2900 : 0,
    note: canDowngrade
      ? "용량 때문에만 유료였다면 무료 구간으로 이동 가능"
      : "요금제 경계 아래로 내려가지 않아 직접 비용 절감 0원",
  };
}

async function findDuplicatesNode(files) {
  const hashTargets = files
    .filter((f) => f.size >= 256 * 1024)
    .sort((a, b) => b.size - a.size)
    .slice(0, 400);

  const byHash = new Map();
  for (const file of hashTargets) {
    try {
      const hash = await hashFile(file.path);
      file.hash = hash;
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push(file);
    } catch {
      // ignore
    }
  }

  const duplicateGroups = [];
  let duplicateBytes = 0;

  for (const [hash, group] of byHash.entries()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => b.mtimeMs - a.mtimeMs);
    const keep = sorted[0];
    const extras = sorted.slice(1);
    const reclaim = extras.reduce((sum, f) => sum + f.size, 0);
    duplicateBytes += reclaim;
    duplicateGroups.push({
      id: `dup-${hash.slice(0, 10)}`,
      kind: "duplicate",
      title: keep.name,
      reason: `${group.length}곳에 완전 동일(해시) 파일`,
      reclaimBytes: reclaim,
      keepPath: keep.path,
      engine: "node",
      files: group.map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        sizeLabel: formatBytes(f.size),
        room: roomForPath(f.path),
        source: "local",
        hash: f.hash,
        hashAlg: "sha256-partial",
      })),
    });
  }

  // Attach full-file MD5 so Drive md5Checksum can join the same contentKey.
  for (const g of duplicateGroups) {
    for (const f of g.files) {
      try {
        f.md5 = await md5File(f.path);
        f.hash = f.md5;
        f.hashAlg = "md5";
      } catch {
        /* keep sha256-partial */
      }
    }
  }

  return { duplicateGroups, duplicateBytes, engine: "node" };
}

async function findDuplicates(options, files) {
  const engine =
    options.engine || process.env.BIUM_SCAN_ENGINE || "auto";
  const fixtureDefault = path.join(
    __dirname,
    "..",
    "fixtures",
    "czkawka-duplicates.sample.json"
  );

  if (engine === "fixture") {
    return scanDuplicatesWithCzkawka({
      fixturePath: options.fixturePath || fixtureDefault,
    });
  }

  if (engine === "czkawka" || engine === "auto") {
    try {
      if (engine === "auto" && !resolveBinary(options.binary)) {
        // fall through to node
      } else {
        return await scanDuplicatesWithCzkawka({
          directories: options.roots,
          referenceDirectories: options.referenceDirectories,
          minFileSize: options.minFileSize,
          binary: options.binary,
          timeoutMs: options.timeoutMs,
          fixturePath: options.fixturePath,
        });
      }
    } catch (err) {
      if (engine === "czkawka") throw err;
      console.warn("[scanner] Czkawka unavailable, Node fallback:", err.message);
    }
  }

  return findDuplicatesNode(files);
}

async function scanLocalLibrary(options = {}) {
  const home = os.homedir();
  const roots = options.roots || [
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
  ];
  const limit = options.limit || 1200;

  const files = [];
  for (const root of roots) {
    try {
      await fs.access(root);
      await walk(root, files, limit);
    } catch {
      // skip missing roots
    }
  }

  const now = Date.now();
  const {
    duplicateGroups,
    duplicateBytes,
    engine: dupEngine,
  } = await findDuplicates(options, files);

  const stale = files
    .filter((f) => now - Math.max(f.atimeMs, f.mtimeMs) > TWO_YEARS_MS)
    .sort((a, b) => b.size - a.size)
    .slice(0, 80);

  const staleBytes = stale.reduce((s, f) => s + f.size, 0);

  const bulky = files
    .filter((f) => f.size >= LARGE_FILE_BYTES)
    .filter((f) => now - Math.max(f.atimeMs, f.mtimeMs) > 1000 * 60 * 60 * 24 * 180)
    .sort((a, b) => b.size - a.size)
    .slice(0, 40);

  const bulkyBytes = bulky.reduce((s, f) => s + f.size, 0);

  const piles = [
    {
      id: "duplicates",
      kind: "duplicate",
      label: "중복 파일",
      count: duplicateGroups.reduce((s, g) => s + g.files.length, 0),
      reclaimBytes: duplicateBytes,
      groups: duplicateGroups.slice(0, 40),
    },
    {
      id: "stale",
      kind: "stale",
      label: "2년 이상 미사용",
      count: stale.length,
      reclaimBytes: staleBytes,
      groups: [
        {
          id: "stale-all",
          kind: "stale",
          title: "장기 미사용 파일",
          reason: "마지막 접근·수정이 2년 이상 지남",
          reclaimBytes: staleBytes,
          files: stale.map((f) => ({
            path: f.path,
            name: f.name,
            size: f.size,
            sizeLabel: formatBytes(f.size),
            room: roomForPath(f.path),
          })),
        },
      ],
    },
    {
      id: "bulky",
      kind: "bulky",
      label: "대용량 방치",
      count: bulky.length,
      reclaimBytes: bulkyBytes,
      groups: [
        {
          id: "bulky-all",
          kind: "bulky",
          title: "대용량 방치 파일",
          reason: "100MB 이상 + 180일 이상 미사용",
          reclaimBytes: bulkyBytes,
          files: bulky.map((f) => ({
            path: f.path,
            name: f.name,
            size: f.size,
            sizeLabel: formatBytes(f.size),
            room: roomForPath(f.path),
          })),
        },
      ],
    },
  ];

  const roomDefs = [
    { id: "desktop", name: "데스크톱룸" },
    { id: "laptop", name: "노트북룸" },
    { id: "phone", name: "핸드폰룸" },
    { id: "cloud", name: "클라우드룸" },
    { id: "mail", name: "메일함" },
  ];

  const rooms = roomDefs.map((room) => {
    const roomFiles = files.filter((f) => roomForPath(f.path) === room.id);
    const roomBytes = roomFiles.reduce((s, f) => s + f.size, 0);
    const roomDup = duplicateGroups.filter((g) =>
      g.files.some((f) => f.room === room.id)
    );
    const roomStale = stale.filter((f) => roomForPath(f.path) === room.id);
    const roomBulky = bulky.filter((f) => roomForPath(f.path) === room.id);
    const wasteScore =
      roomDup.length * 2 + roomStale.length * 0.5 + roomBulky.length * 1.5;
    const cleanliness = Math.max(12, Math.min(96, 92 - wasteScore * 3));

    return {
      ...room,
      fileCount: roomFiles.length,
      bytes: roomBytes,
      bytesLabel: formatBytes(roomBytes),
      cleanliness,
      trashBags: Math.min(8, roomDup.length + Math.ceil(roomBulky.length / 2)),
      dustyBoxes: Math.min(6, Math.ceil(roomStale.length / 8)),
    };
  });

  const totalReclaim = duplicateBytes + staleBytes + bulkyBytes;
  // Heuristic split for demo: duplicates often span local+cloud; treat 35% as cloud-ish
  const cloudReclaim = Math.round(duplicateBytes * 0.35);
  const localReclaim = totalReclaim - cloudReclaim;

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    scannedFiles: files.length,
    scannedBytes: files.reduce((s, f) => s + f.size, 0),
    engine: {
      duplicates: dupEngine || "node",
      stale: "metadata",
      bulky: "metadata",
    },
    rooms,
    piles,
    summary: {
      totalReclaimBytes: totalReclaim,
      localReclaimBytes: localReclaim,
      cloudReclaimBytes: cloudReclaim,
      duplicateBytes,
      staleBytes,
      bulkyBytes,
      plan: buildPlanInsight(cloudReclaim),
    },
  };
}

module.exports = {
  scanLocalLibrary,
  formatBytes,
  findDuplicates,
  hashFile,
  md5File,
  md5Many,
};
