/**
 * Unified file INDEX — metadata + hashes only. Never stores file bodies.
 */
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const FILE = () => path.join(app.getPath("userData"), "bium-index.json");

/** @type {{ devices: Record<string, object>, entries: object[], updatedAt: string|null }} */
let mem = { devices: {}, entries: [], updatedAt: null };

function load() {
  try {
    mem = JSON.parse(fs.readFileSync(FILE(), "utf8"));
  } catch {
    mem = { devices: {}, entries: [], updatedAt: null };
  }
  return mem;
}

function save() {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  mem.updatedAt = new Date().toISOString();
  fs.writeFileSync(FILE(), JSON.stringify(mem, null, 2), "utf8");
}

function contentKeyOf(entry) {
  if (entry.contentKey) return entry.contentKey;
  if (entry.hash) return `${entry.hashAlg || "hash"}:${entry.hash}`;
  return null;
}

function registerDevice(device) {
  load();
  const prev = mem.devices[device.id];
  const isNew = !prev;
  const kind = device.kind ?? prev?.kind ?? "device";
  // Merge — don't wipe connection/quota every ensureDevices() call
  mem.devices[device.id] = {
    id: device.id,
    label: device.label ?? prev?.label ?? device.id,
    kind,
    platform: device.platform ?? prev?.platform ?? null,
    connected:
      device.connected !== undefined
        ? !!device.connected
        : isNew
          ? kind === "local"
          : !!prev.connected,
    usedBytes:
      device.usedBytes !== undefined
        ? device.usedBytes
        : (prev?.usedBytes ?? null),
    totalBytes:
      device.totalBytes !== undefined
        ? device.totalBytes
        : (prev?.totalBytes ?? null),
    lastScanAt: device.lastScanAt ?? prev?.lastScanAt ?? null,
  };
  save();
  return mem.devices[device.id];
}

function setDeviceQuota(deviceId, usedBytes, totalBytes) {
  load();
  if (!mem.devices[deviceId]) return;
  mem.devices[deviceId].usedBytes = usedBytes;
  mem.devices[deviceId].totalBytes = totalBytes;
  save();
}

function setDeviceConnected(deviceId, connected) {
  load();
  if (!mem.devices[deviceId]) return;
  mem.devices[deviceId].connected = !!connected;
  save();
}

/** Replace all entries for a device (Local Agent index push). */
function upsertDeviceEntries(deviceId, entries) {
  load();
  mem.entries = mem.entries.filter((e) => e.deviceId !== deviceId);
  const device = mem.devices[deviceId];
  const label = device?.label || deviceId;
  for (const raw of entries) {
    const entry = {
      deviceId,
      deviceLabel: label,
      source: raw.source || device?.kind || "local",
      path: raw.path,
      name: raw.name || path.basename(String(raw.path || "")),
      size: Number(raw.size) || 0,
      hash: raw.hash || raw.md5 || null,
      hashAlg: raw.hashAlg || (raw.md5 ? "md5" : raw.hash ? "blake3" : null),
      contentKey: raw.contentKey || null,
      modified: raw.modified || raw.modifiedTime || null,
      room: raw.room || null,
    };
    entry.contentKey = contentKeyOf(entry);
    if (entry.size > 0 && entry.path) mem.entries.push(entry);
  }
  if (device) device.lastScanAt = new Date().toISOString();
  save();
  return mem.entries.filter((e) => e.deviceId === deviceId).length;
}

function findCrossDeviceDuplicates() {
  load();
  const byKey = new Map();
  for (const e of mem.entries) {
    const key =
      e.contentKey || (e.size && e.hash ? `${e.hashAlg}:${e.hash}` : null);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }

  const groups = [];
  for (const [key, files] of byKey.entries()) {
    if (files.length < 2) continue;
    const devices = new Set(files.map((f) => f.deviceId));
    const size = files[0].size;
    const reclaim = size * (files.length - 1);
    groups.push({
      id: `idx-${String(key).slice(0, 16)}`,
      kind: "duplicate",
      title: files[0].name,
      reason:
        devices.size > 1
          ? `${devices.size}개 공간에서 내용 동일`
          : `${files.length}곳에 완전 동일 파일`,
      reclaimBytes: reclaim,
      contentKey: key,
      engine: "index",
      crossDevice: devices.size > 1,
      files: files.map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        sizeLabel: formatBytes(f.size),
        room: f.room || roomGuess(f),
        source: f.source,
        hash: f.hash,
        deviceId: f.deviceId,
        deviceLabel: f.deviceLabel,
        place: f.deviceLabel,
      })),
    });
  }

  groups.sort((a, b) => {
    if (a.crossDevice !== b.crossDevice) return a.crossDevice ? -1 : 1;
    return b.reclaimBytes - a.reclaimBytes;
  });
  return groups;
}

function roomGuess(f) {
  if (f.deviceId === "gdrive") return "cloud";
  if (f.deviceId === "windows-peer") return "desktop";
  if (f.room) return f.room;
  return "laptop";
}

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

function listDevices() {
  load();
  return Object.values(mem.devices);
}

function listEntries() {
  load();
  return mem.entries.slice();
}

function clear() {
  mem = { devices: {}, entries: [], updatedAt: null };
  save();
}

function snapshot() {
  load();
  return {
    updatedAt: mem.updatedAt,
    deviceCount: Object.keys(mem.devices).length,
    entryCount: mem.entries.length,
    devices: listDevices(),
  };
}

module.exports = {
  registerDevice,
  setDeviceQuota,
  setDeviceConnected,
  upsertDeviceEntries,
  findCrossDeviceDuplicates,
  listDevices,
  listEntries,
  clear,
  snapshot,
  formatBytes,
  load,
};
