/**
 * LocalSend-inspired LAN discovery — fingerprint index only (no file bodies).
 *
 * Ref concepts: https://github.com/localsend/protocol
 * - UDP multicast announce
 * - HTTP register / info
 * BIUM uses port 53821 (avoid LocalSend 53317).
 */
const dgram = require("dgram");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.BIUM_LAN_PORT || 53821);
const MULTICAST = "224.0.0.167";
const PROTOCOL = "bium/1";

let fingerprint = crypto.randomBytes(16).toString("hex");
let alias = os.hostname().split(".")[0] || "BIUM";
/** @type {http.Server | null} */
let httpServer = null;
/** @type {dgram.Socket | null} */
let udp = null;
/** @type {Map<string, object>} */
const peers = new Map();
/** latest local fingerprint entries for /fingerprints */
let localFingerprints = [];
let petSyncHandler = null;

function deviceModel() {
  return process.platform === "darwin"
    ? "MacBook"
    : process.platform === "win32"
      ? "Windows"
      : process.platform;
}

function announcePayload(announce = true) {
  return JSON.stringify({
    alias,
    version: "1.0",
    protocol: PROTOCOL,
    deviceModel: deviceModel(),
    deviceType: "desktop",
    fingerprint,
    port: PORT,
    transport: "http",
    announce,
    kind: "bium-agent",
  });
}

function localIPv4s() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return out;
}

function startHttp() {
  if (httpServer) return Promise.resolve(PORT);
  return new Promise((resolve, reject) => {
    httpServer = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
        const path = url.pathname;
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json; charset=utf-8");

        if (req.method === "GET" && path === "/api/bium/v1/info") {
          res.end(
            JSON.stringify({
              alias,
              fingerprint,
              deviceModel: deviceModel(),
              deviceType: "desktop",
              protocol: PROTOCOL,
              port: PORT,
              entryCount: localFingerprints.length,
            })
          );
          return;
        }

        if (req.method === "GET" && path === "/api/bium/v1/fingerprints") {
          // Metadata + hash only — never file bytes
          res.end(
            JSON.stringify({
              device: alias,
              deviceModel: deviceModel(),
              fingerprint,
              entries: localFingerprints,
            })
          );
          return;
        }

        if (req.method === "POST" && path === "/api/bium/v1/register") {
          const body = await readBody(req);
          const peer = JSON.parse(body || "{}");
          if (peer.fingerprint && peer.fingerprint !== fingerprint) {
            rememberPeer(peer, req.socket.remoteAddress);
          }
          res.end(announcePayload(false));
          return;
        }

        if (req.method === "POST" && path === "/api/bium/v1/pet-sync") {
          const body = await readBody(req);
          const msg = JSON.parse(body || "{}");
          if (typeof petSyncHandler === "function") petSyncHandler(msg);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    httpServer.once("error", reject);
    httpServer.listen(PORT, "0.0.0.0", () => resolve(PORT));
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function rememberPeer(peer, remoteAddress) {
  const ip = String(remoteAddress || peer.ip || "")
    .replace(/^::ffff:/, "");
  if (!peer.fingerprint || peer.fingerprint === fingerprint) return;
  const port = peer.port || PORT;
  const key = peer.fingerprint;
  peers.set(key, {
    alias: peer.alias || "Peer",
    fingerprint: peer.fingerprint,
    deviceModel: peer.deviceModel || "desktop",
    ip: ip || peer.ip,
    port,
    seenAt: Date.now(),
  });
}

function startUdp() {
  if (udp) return;
  udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
  udp.on("message", (msg, rinfo) => {
    try {
      const peer = JSON.parse(msg.toString("utf8"));
      if (peer.kind && peer.kind !== "bium-agent") return;
      if (peer.fingerprint === fingerprint) return;
      rememberPeer({ ...peer, ip: rinfo.address }, rinfo.address);
      if (peer.announce) {
        // Respond with our announce=false (LocalSend-style)
        const buf = Buffer.from(announcePayload(false));
        udp.send(buf, 0, buf.length, PORT, rinfo.address);
      }
    } catch {
      /* ignore */
    }
  });
  udp.on("error", (err) => {
    console.warn("[lanPeer] udp", err.message);
  });
  udp.bind(PORT, () => {
    try {
      udp.setBroadcast(true);
      udp.setMulticastTTL(1);
      udp.addMembership(MULTICAST);
    } catch (err) {
      console.warn("[lanPeer] multicast", err.message);
    }
  });
}

function broadcastAnnounce() {
  if (!udp) return;
  const buf = Buffer.from(announcePayload(true));
  try {
    udp.send(buf, 0, buf.length, PORT, MULTICAST);
  } catch {
    /* ignore */
  }
  // Subnet broadcast fallback (LocalSend also has HTTP fallback)
  for (const ip of localIPv4s()) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) continue;
    const bcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
    try {
      udp.send(buf, 0, buf.length, PORT, bcast);
    } catch {
      /* ignore */
    }
  }
}

async function start(opts = {}) {
  if (opts.alias) alias = opts.alias;
  if (opts.fingerprint) fingerprint = opts.fingerprint;
  await startHttp();
  startUdp();
  broadcastAnnounce();
  return { port: PORT, fingerprint, alias };
}

function stop() {
  try {
    udp?.close();
  } catch {
    /* ignore */
  }
  udp = null;
  try {
    httpServer?.close();
  } catch {
    /* ignore */
  }
  httpServer = null;
}

function setLocalFingerprints(entries) {
  localFingerprints = (entries || []).map((e) => ({
    name: e.name,
    path: e.path,
    size: e.size,
    hash: e.hash,
    hashAlg: e.hashAlg,
    contentKey: e.contentKey,
    modified: e.modified || null,
    room: e.room || null,
  }));
}

function listPeers() {
  const now = Date.now();
  return [...peers.values()].filter((p) => now - p.seenAt < 120_000);
}

async function discover(timeoutMs = 1800) {
  broadcastAnnounce();
  // Also probe common LAN hosts via HTTP info (LocalSend HTTP fallback idea)
  const probes = [];
  for (const ip of localIPv4s()) {
    const parts = ip.split(".").map(Number);
    // light scan: .1 .2 gateway-ish + ourselves neighbors — keep tiny for hackathon
    for (const last of [1, 2, 10, 20, 50, 100, 101, 102, 200, 254]) {
      if (last === parts[3]) continue;
      const host = `${parts[0]}.${parts[1]}.${parts[2]}.${last}`;
      probes.push(probeInfo(host, PORT));
    }
  }
  await Promise.race([
    Promise.allSettled(probes),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
  await new Promise((r) => setTimeout(r, Math.min(800, timeoutMs)));
  return listPeers();
}

async function probeInfo(host, port) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 350);
    const res = await fetch(`http://${host}:${port}/api/bium/v1/info`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return;
    const info = await res.json();
    if (info.fingerprint && info.fingerprint !== fingerprint) {
      rememberPeer({ ...info, ip: host, port }, host);
    }
  } catch {
    /* offline */
  }
}

async function fetchFingerprints(peer) {
  const host = peer.ip;
  const port = peer.port || PORT;
  const res = await fetch(`http://${host}:${port}/api/bium/v1/fingerprints`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`peer fingerprints HTTP ${res.status}`);
  return res.json();
}

async function sendPetSync(peer, message) {
  const host = peer.ip;
  const port = peer.port || PORT;
  await fetch(`http://${host}:${port}/api/bium/v1/pet-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(3000),
  });
}

function onPetSync(handler) {
  petSyncHandler = handler;
}

function getIdentity() {
  return { alias, fingerprint, port: PORT };
}

module.exports = {
  PORT,
  start,
  stop,
  discover,
  listPeers,
  setLocalFingerprints,
  fetchFingerprints,
  sendPetSync,
  onPetSync,
  getIdentity,
  broadcastAnnounce,
};
