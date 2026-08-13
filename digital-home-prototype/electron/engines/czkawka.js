/**
 * Czkawka CLI adapter (MIT) — scan engine only, no GUI.
 *
 * Spawns vendored/system czkawka_cli, parses duplicate JSON → BIUM groups.
 * Spec: https://github.com/qarmin/czkawka
 */
const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { existsSync } = require("fs");

function vendoredBinary() {
  // Dev: digital-diet/vendor/bin
  // Packaged: app.asar.unpacked/vendor/bin (electron-builder asarUnpack)
  const candidates = [
    path.join(__dirname, "..", "..", "vendor", "bin", "czkawka_cli"),
  ];
  if (process.resourcesPath) {
    candidates.unshift(
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "vendor",
        "bin",
        "czkawka_cli"
      ),
      path.join(process.resourcesPath, "vendor", "bin", "czkawka_cli")
    );
  }
  return candidates.find((p) => existsSync(p)) || candidates[candidates.length - 1];
}

const VENDORED = vendoredBinary();

const CANDIDATE_BINS = [
  process.env.CZKAWKA_CLI,
  VENDORED,
  "czkawka_cli",
  "czkawka-cli",
  "czkawka",
  "/opt/homebrew/bin/czkawka_cli",
  "/usr/local/bin/czkawka_cli",
].filter(Boolean);

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

function roomForPath(filePath) {
  const home = os.homedir();
  const lower = String(filePath || "").toLowerCase();
  if (
    lower.includes("google drive") ||
    lower.includes("googledrive") ||
    lower.includes("onedrive") ||
    lower.includes("icloud") ||
    lower.includes("dropbox") ||
    lower.includes("cloudstorage")
  ) {
    return "cloud";
  }
  if (lower.includes("/mail/") || lower.includes("attachments")) return "mail";
  if (
    lower.includes("iphone") ||
    lower.includes("android") ||
    lower.includes("mobile") ||
    lower.includes("dcim")
  ) {
    return "phone";
  }
  if (
    filePath.startsWith(path.join(home, "Desktop")) ||
    /\/Desktop\//i.test(filePath) ||
    /\\Desktop\\/i.test(filePath)
  ) {
    return "desktop";
  }
  if (
    filePath.startsWith(path.join(home, "Downloads")) ||
    filePath.startsWith(path.join(home, "Documents")) ||
    /\/Downloads\//i.test(filePath) ||
    /\/Documents\//i.test(filePath)
  ) {
    return "laptop";
  }
  return "laptop";
}

function whichSync(bin) {
  if (path.isAbsolute(bin) && existsSync(bin)) return bin;
  const pathEnv = process.env.PATH || "";
  for (const dir of pathEnv.split(path.delimiter)) {
    const full = path.join(dir, bin);
    if (existsSync(full)) return full;
  }
  return null;
}

function resolveBinary(explicit) {
  const list = explicit ? [explicit, ...CANDIDATE_BINS] : CANDIDATE_BINS;
  for (const cand of list) {
    const hit = whichSync(cand);
    if (hit) return hit;
  }
  return null;
}

/**
 * Normalize Czkawka duplicate JSON into flat groups.
 * Shape (pretty/compact): { "<size>": [ [ {path,size,modified_date,hash}, ... ], ... ] }
 */
function parseDuplicatesJson(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const groups = [];

  if (Array.isArray(data)) {
    for (const g of data) {
      const files = Array.isArray(g) ? g : g.files || g.items || [];
      if (files.length >= 2) groups.push(files);
    }
    return groups;
  }

  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      if (!Array.isArray(value)) continue;
      if (value.length && value[0] && typeof value[0].path === "string") {
        if (value.length >= 2) groups.push(value);
      } else {
        for (const inner of value) {
          if (Array.isArray(inner) && inner.length >= 2) groups.push(inner);
        }
      }
    }
  }

  return groups;
}

function mapGroupsToDiet(rawGroups) {
  const duplicateGroups = [];
  let duplicateBytes = 0;

  for (const files of rawGroups) {
    const normalized = files.map((f) => {
      const filePath = f.path || f.file_path || f.name;
      const size = Number(f.size) || 0;
      const mtimeMs =
        f.mtimeMs ||
        (f.modified_date ? Number(f.modified_date) * 1000 : 0) ||
        0;
      return {
        path: filePath,
        name: path.basename(filePath),
        size,
        mtimeMs,
        hash: f.hash || "",
        room: roomForPath(filePath),
        source: "local",
        id: filePath,
      };
    });

    if (normalized.length < 2) continue;
    const sorted = [...normalized].sort((a, b) => b.mtimeMs - a.mtimeMs);
    const keep = sorted[0];
    const extras = sorted.slice(1);
    const reclaim = extras.reduce((s, f) => s + f.size, 0);
    duplicateBytes += reclaim;
    const hashKey = keep.hash || `${keep.size}-${keep.name}`;

    duplicateGroups.push({
      id: `czk-${String(hashKey).slice(0, 12)}`,
      kind: "duplicate",
      title: keep.name,
      reason: `${normalized.length}곳에 완전 동일(BLAKE3) 파일`,
      reclaimBytes: reclaim,
      keepPath: keep.path,
      engine: "czkawka",
      files: normalized.map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        sizeLabel: formatBytes(f.size),
        room: f.room,
        source: f.source,
        hash: f.hash,
      })),
    });
  }

  duplicateGroups.sort((a, b) => b.reclaimBytes - a.reclaimBytes);
  return { duplicateGroups, duplicateBytes };
}

function runCli(bin, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`czkawka timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function loadFixture(fixturePath) {
  const raw = await fs.readFile(fixturePath, "utf8");
  return parseDuplicatesJson(raw);
}

/**
 * Scan directories with Czkawka CLI (v12: -p pretty JSON).
 */
async function scanDuplicatesWithCzkawka(options = {}) {
  const home = os.homedir();
  const directories = options.directories || options.roots || [
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
  ];
  const referenceDirectories = options.referenceDirectories || [];
  const minSize = options.minFileSize ?? 256 * 1024;

  if (options.fixturePath) {
    const rawGroups = await loadFixture(options.fixturePath);
    const mapped = mapGroupsToDiet(rawGroups);
    return {
      ...mapped,
      engine: "czkawka-fixture",
      binary: null,
    };
  }

  const binary = resolveBinary(options.binary);
  if (!binary) {
    const err = new Error(
      "czkawka_cli not found. Run scripts/fetch-czkawka.sh or set CZKAWKA_CLI."
    );
    err.code = "CZKAWKA_NOT_FOUND";
    throw err;
  }

  const existingDirs = [];
  for (const dir of directories) {
    try {
      await fs.access(dir);
      existingDirs.push(dir);
    } catch {
      /* skip */
    }
  }
  if (!existingDirs.length) {
    throw new Error("No readable scan directories");
  }

  const outFile = path.join(os.tmpdir(), `bium-czkawka-${Date.now()}.json`);

  // Glob exclusions (czkawka -E). Full paths go in excludedDirectories (-e).
  const excludedDirectories = options.excludedDirectories || [];
  const excludedItems = options.excludedItems || [
    "*/node_modules/*",
    "*/.git/*",
    "*/.venv/*",
    "*/venv/*",
    "*/dist/*",
    "*/build/*",
    "*.app/Contents/*",
    "*/Electron.app/*",
    "*/site-packages/*",
    "*/.pnpm/*",
  ];

  // czkawka 12.x: each directory needs its own -d / -r / -e flag
  const args = ["dup"];
  for (const dir of existingDirs) {
    args.push("-d", dir);
  }
  for (const dir of referenceDirectories) {
    args.push("-r", dir);
  }
  for (const dir of excludedDirectories) {
    args.push("-e", dir);
  }
  for (const item of excludedItems) {
    args.push("-E", item);
  }
  args.push(
    "-m",
    String(minSize),
    "-s",
    "HASH",
    "-t",
    "BLAKE3",
    "-p",
    outFile,
    "-N",
    "-M",
    "-W"
  );

  const result = await runCli(binary, args, {
    timeoutMs: options.timeoutMs || 300000,
  });

  let rawText = "";
  let hasOutFile = false;
  try {
    rawText = await fs.readFile(outFile, "utf8");
    hasOutFile = true;
  } catch {
    rawText = result.stdout;
  }

  try {
    await fs.unlink(outFile);
  } catch {
    /* ignore */
  }

  if (
    !hasOutFile &&
    result.code !== 0 &&
    /error:|unexpected argument|USAGE:/i.test(result.stderr)
  ) {
    throw new Error(`czkawka CLI failed: ${result.stderr.trim().slice(0, 400)}`);
  }

  // Empty file = no duplicates found (still success)
  if (!rawText || !rawText.trim()) {
    return {
      duplicateGroups: [],
      duplicateBytes: 0,
      engine: "czkawka",
      binary,
      stderr: result.stderr,
      code: result.code,
    };
  }

  let rawGroups;
  try {
    rawGroups = parseDuplicatesJson(rawText);
  } catch (err) {
    throw new Error(
      `czkawka JSON parse failed (code=${result.code}): ${err.message}; stderr=${result.stderr.slice(0, 300)}`
    );
  }

  const mapped = mapGroupsToDiet(rawGroups);
  return {
    ...mapped,
    engine: "czkawka",
    binary,
    stderr: result.stderr,
    code: result.code,
  };
}

/**
 * Parse czkawka `image` pretty/compact JSON.
 * Shape: [ [ {path,size,width,height,modified_date,difference}, ... ], ... ]
 */
function parseSimilarImagesJson(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(data)) return [];
  return data.filter((g) => Array.isArray(g) && g.length >= 2);
}

/**
 * Similar-image scan via czkawka perceptual hashes (Gradient / hash_size 16).
 */
async function scanSimilarImagesWithCzkawka(options = {}) {
  const directories = options.directories || [];
  const binary = resolveBinary(options.binary);
  if (!binary) {
    const err = new Error(
      "czkawka_cli not found. Run scripts/fetch-czkawka.sh or set CZKAWKA_CLI."
    );
    err.code = "CZKAWKA_NOT_FOUND";
    throw err;
  }

  const existingDirs = [];
  for (const dir of directories) {
    try {
      await fs.access(dir);
      existingDirs.push(dir);
    } catch {
      /* skip */
    }
  }
  if (!existingDirs.length) {
    return {
      groups: [],
      engine: "czkawka-image",
      binary,
      empty: true,
    };
  }

  const outFile = path.join(
    os.tmpdir(),
    `bium-czkawka-image-${Date.now()}.json`
  );
  const excludedDirectories = options.excludedDirectories || [];
  const excludedItems = options.excludedItems || [
    "*/node_modules/*",
    "*/.git/*",
    "*/.Trash/*",
    "*/Trash/*",
    "*.photoslibrary/*",
    "*/Photo Library.photoslibrary/*",
    "*/Photos Library.photoslibrary/*",
  ];
  const minSize = options.minSize ?? 20_000;
  const maxDifference = options.maxDifference ?? 10;
  const hashSize = options.hashSize ?? 16;
  const hashAlg = options.hashAlg || "Gradient";

  const args = ["image"];
  for (const dir of existingDirs) args.push("-d", dir);
  for (const dir of excludedDirectories) args.push("-e", dir);
  for (const item of excludedItems) args.push("-E", item);
  args.push(
    "-m",
    String(minSize),
    "-s",
    String(maxDifference),
    "-c",
    String(hashSize),
    "-g",
    hashAlg,
    "-x",
    "IMAGE",
    "-p",
    outFile,
    "-N",
    "-M",
    "-W"
  );

  const result = await runCli(binary, args, {
    timeoutMs: options.timeoutMs || 120000,
  });

  let rawText = "";
  let hasOutFile = false;
  try {
    rawText = await fs.readFile(outFile, "utf8");
    hasOutFile = true;
  } catch {
    rawText = result.stdout;
  }
  try {
    await fs.unlink(outFile);
  } catch {
    /* ignore */
  }

  if (
    !hasOutFile &&
    result.code !== 0 &&
    /error:|unexpected argument|USAGE:/i.test(result.stderr)
  ) {
    throw new Error(
      `czkawka image failed: ${result.stderr.trim().slice(0, 400)}`
    );
  }

  if (!rawText || !rawText.trim()) {
    return {
      groups: [],
      engine: "czkawka-image",
      binary,
      code: result.code,
    };
  }

  let rawGroups;
  try {
    rawGroups = parseSimilarImagesJson(rawText);
  } catch (err) {
    throw new Error(
      `czkawka image JSON parse failed: ${err.message}; stderr=${result.stderr.slice(0, 200)}`
    );
  }

  return {
    groups: rawGroups,
    engine: "czkawka-image",
    binary,
    code: result.code,
    stderr: result.stderr,
  };
}

module.exports = {
  resolveBinary,
  parseDuplicatesJson,
  parseSimilarImagesJson,
  mapGroupsToDiet,
  scanDuplicatesWithCzkawka,
  scanSimilarImagesWithCzkawka,
  roomForPath,
  formatBytes,
  VENDORED,
};
