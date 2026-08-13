/**
 * Federated scan orchestrator
 *
 * Mac Local Agent → (index push)
 * Windows Peer Agent → (index push / stub)
 * Google Drive API → (metadata + md5 only)
 * → unified index → cross-device duplicate groups
 *
 * Original file bytes never leave the device / cloud provider.
 */
const os = require("os");
const path = require("path");
const indexStore = require("./indexStore");
const { scanLocalLibrary } = require("./scanner");
const { resolveBinary, roomForPath } = require("./engines/czkawka");
const store = require("./store");
const agentEvents = require("./agentEvents");
const lanPeer = require("./peers/lanPeer");
const { buildWindowsIndex, QUOTA: WIN_QUOTA } = require("./peers/windowsStub");
const {
  buildDemoDriveIndex,
  QUOTA: DRIVE_DEMO_QUOTA,
} = require("./peers/gdriveDemo");
const {
  buildMailCleanup,
  QUOTA: MAIL_QUOTA,
} = require("./peers/gmailDemo");
const similarPhotos = require("./engines/similarPhotos");
const similarDocs = require("./engines/similarDocs");
const coldStale = require("./engines/coldStale");

function emit(send, payload) {
  if (typeof send === "function") send(payload);
  try {
    agentEvents.fromProgress(payload);
  } catch {
    /* ignore */
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDevices() {
  // Seed labels/kinds only — connection state preserved across calls
  indexStore.registerDevice({
    id: "mac-local",
    label: "MacBook",
    kind: "local",
    platform: "darwin",
    connected: true,
    usedBytes: 275 * 1024 ** 3,
    totalBytes: 494 * 1024 ** 3,
  });
  indexStore.registerDevice({
    id: "windows-peer",
    label: "Windows Desktop",
    kind: "peer",
    platform: "win32",
    usedBytes: WIN_QUOTA.usedBytes,
    totalBytes: WIN_QUOTA.totalBytes,
  });
  indexStore.registerDevice({
    id: "gdrive",
    label: "Google Drive",
    kind: "cloud",
    platform: "cloud",
  });
  indexStore.registerDevice({
    id: "onedrive",
    label: "OneDrive",
    kind: "cloud",
    platform: "cloud",
  });
  indexStore.registerDevice({
    id: "gmail",
    label: "Gmail",
    kind: "mail",
    platform: "cloud",
  });
}

function entriesFromLocalScan(result) {
  const out = [];
  const groups = result?.piles?.find((p) => p.id === "duplicates")?.groups || [];
  for (const g of groups) {
    for (const f of g.files || []) {
      out.push({
        source: "local",
        path: f.path,
        name: f.name,
        size: f.size,
        hash: f.hash || g.id,
        hashAlg: result?.engine?.duplicates === "node" ? "sha256-partial" : "blake3",
        contentKey: f.hash
          ? `blake3:${f.hash}`
          : g.id
            ? `group:${g.id}`
            : null,
        modified: null,
        room: f.room || roomForPath(f.path),
      });
    }
  }
  // Also index non-dup scanned paths lightly from rooms? Skip — keep hash-bearing entries.
  return out;
}

function spacesFromIndex() {
  const devices = indexStore.listDevices();
  return devices.map((d) => {
    const usedGb =
      d.usedBytes != null ? Math.round(d.usedBytes / 1024 ** 3) : null;
    const totalGb =
      d.totalBytes != null ? Math.round(d.totalBytes / 1024 ** 3) : null;
    return {
      id: d.id,
      name: d.label,
      used: usedGb,
      total: totalGb,
      connected: d.connected,
      kind: d.kind,
      lastScanAt: d.lastScanAt,
    };
  });
}

/**
 * Full federated explore — drives Desktop Pet narration via `send`.
 */
async function runFederatedScan(options = {}) {
  const send = options.send;
  ensureDevices();
  const status = store.connectionStatus();

  emit(send, {
    phase: "start",
    agent: "mac-local",
    text: "MacBook Local Agent 연결",
  });

  // ---- 1) Mac Local Agent ----
  emit(send, {
    phase: "walk",
    room: "laptop",
    agent: "mac-local",
    label: "MacBook",
    text: "MacBook 탐색 중...",
  });
  await wait(400);

  const enginePref = options.engine || process.env.BIUM_SCAN_ENGINE || "auto";
  const hasCli = !!resolveBinary(options.binary);
  const useFixture =
    enginePref === "fixture" ||
    (enginePref === "auto" && !hasCli && options.allowFixture !== false);

  const home = os.homedir();
  const localResult = await scanLocalLibrary({
    engine: useFixture ? "fixture" : enginePref,
    fixturePath: useFixture
      ? path.join(__dirname, "..", "fixtures", "czkawka-duplicates.sample.json")
      : undefined,
    roots: [
      path.join(home, "Downloads"),
      path.join(home, "Desktop"),
      path.join(home, "Documents"),
    ],
    timeoutMs: options.timeoutMs || 180000,
    binary: options.binary,
    limit: options.limit || 1500,
  });

  const macEntries = entriesFromLocalScan(localResult);
  // If fixture/local groups lack explicit hash, stamp demo keys from paths
  for (const e of macEntries) {
    if (!e.contentKey && e.hash) e.contentKey = `${e.hashAlg}:${e.hash}`;
  }
  indexStore.upsertDeviceEntries("mac-local", macEntries);
  try {
    const { execSync } = require("child_process");
    // rough free disk — best effort
    const df = execSync("df -k /", { encoding: "utf8" }).trim().split("\n")[1];
    const parts = df.split(/\s+/);
    const totalK = Number(parts[1]);
    const usedK = Number(parts[2]);
    if (totalK > 0) {
      indexStore.setDeviceQuota("mac-local", usedK * 1024, totalK * 1024);
    }
  } catch {
    indexStore.setDeviceQuota(
      "mac-local",
      275 * 1024 ** 3,
      494 * 1024 ** 3
    );
  }
  indexStore.setDeviceConnected("mac-local", true);
  // Publish fingerprints for LAN peers (LocalSend-style; no file bodies)
  try {
    lanPeer.setLocalFingerprints(macEntries);
    lanPeer.broadcastAnnounce();
  } catch {
    /* ignore */
  }

  emit(send, {
    phase: "search",
    room: "laptop",
    agent: "mac-local",
    text: `MacBook 인덱싱 ${macEntries.length}개 완료`,
  });
  await wait(500);

  // ---- 2) LAN peer (LocalSend-inspired) or Windows stub ----
  emit(send, {
    phase: "transfer",
    agent: "windows-peer",
    text: "LAN에서 Desktop Agent 찾는 중...",
    from: "mac-local",
    to: "windows-peer",
  });
  await wait(200);

  let peerMode = "stub";
  let winEntries = [];
  try {
    const found = await lanPeer.discover(1600);
    const peer = found[0];
    if (peer?.ip) {
      emit(send, {
        phase: "walk",
        room: "desktop",
        agent: "windows-peer",
        label: peer.alias || "Desktop",
        text: `${peer.alias || "Peer"} fingerprint 수신 중...`,
      });
      try {
        await lanPeer.sendPetSync(peer, {
          event: "CAT_ENTER_LEFT",
          from: "mac-local",
        });
      } catch {
        /* peer may ignore */
      }
      const remote = await lanPeer.fetchFingerprints(peer);
      winEntries = (remote.entries || []).map((e) => ({
        ...e,
        source: "lan-peer",
        room: e.room || "desktop",
      }));
      indexStore.registerDevice({
        id: "windows-peer",
        label: peer.alias || remote.device || "Desktop",
        kind: "peer",
        platform: "lan",
        connected: true,
      });
      peerMode = "lan";
    }
  } catch (err) {
    console.warn("[orchestrator] LAN peer:", err.message);
  }

  if (!winEntries.length) {
    emit(send, {
      phase: "walk",
      room: "desktop",
      agent: "windows-peer",
      label: "Windows Desktop",
      text: "Desktop 탐색 중... (데모 피어)",
    });
    await wait(500);
    winEntries = buildWindowsIndex(macEntries);
    peerMode = "stub";
  }

  indexStore.upsertDeviceEntries("windows-peer", winEntries);
  indexStore.setDeviceQuota(
    "windows-peer",
    WIN_QUOTA.usedBytes,
    WIN_QUOTA.totalBytes
  );
  indexStore.setDeviceConnected("windows-peer", true);

  emit(send, {
    phase: "search",
    room: "desktop",
    agent: "windows-peer",
    text:
      peerMode === "lan"
        ? `LAN 피어 fingerprint ${winEntries.length}개`
        : `Windows 데모 인덱싱 ${winEntries.length}개`,
  });
  await wait(400);

  // ---- 3) Google Drive (OAuth or demo metadata) ----
  emit(send, {
    phase: "walk",
    room: "cloud",
    agent: "gdrive",
    label: "Google Drive",
    text: "Google Drive 확인 중...",
  });

  let driveMode = "offline";
  try {
    if (status.google) {
      const google = require("./providers/google");
      const files = await google.listDriveCandidates({ max: 80 });
      const entries = files.map((f) => ({
        source: "gdrive",
        path: f.path,
        name: f.name,
        size: f.size,
        hash: f.md5,
        hashAlg: f.md5 ? "md5" : null,
        contentKey: f.md5 ? `md5:${f.md5}` : null,
        modified: f.modifiedTime,
        room: "cloud",
      }));
      // Soft-bridge: if a drive file matches Mac size+name stem, share contentKey
      for (const e of entries) {
        const match = macEntries.find(
          (m) =>
            m.size === e.size &&
            stem(m.name) &&
            stem(e.name).includes(stem(m.name).slice(0, 6))
        );
        if (match?.contentKey) e.contentKey = match.contentKey;
      }
      indexStore.upsertDeviceEntries("gdrive", entries);
      const about = await google.aboutStorage();
      if (about) {
        indexStore.setDeviceQuota("gdrive", about.usage, about.limit || 0);
      }
      indexStore.setDeviceConnected("gdrive", true);
      driveMode = "oauth";
    } else if (store.getConfig().demoCloud !== false) {
      const demo = buildDemoDriveIndex(macEntries);
      indexStore.upsertDeviceEntries("gdrive", demo);
      indexStore.setDeviceQuota(
        "gdrive",
        DRIVE_DEMO_QUOTA.usedBytes,
        DRIVE_DEMO_QUOTA.totalBytes
      );
      indexStore.setDeviceConnected("gdrive", true);
      driveMode = "demo";
    } else {
      indexStore.setDeviceConnected("gdrive", false);
    }
  } catch (err) {
    emit(send, {
      phase: "error",
      agent: "gdrive",
      text: err.message || "Drive 스캔 실패",
    });
    // fallback demo so hackathon story still works
    const demo = buildDemoDriveIndex(macEntries);
    indexStore.upsertDeviceEntries("gdrive", demo);
    indexStore.setDeviceQuota(
      "gdrive",
      DRIVE_DEMO_QUOTA.usedBytes,
      DRIVE_DEMO_QUOTA.totalBytes
    );
    indexStore.setDeviceConnected("gdrive", true);
    driveMode = "demo-fallback";
  }

  emit(send, {
    phase: "search",
    room: "cloud",
    agent: "gdrive",
    text:
      driveMode === "oauth"
        ? "Google Drive 메타데이터 수집 완료"
        : "Google Drive 데모 인덱스 연결",
  });
  await wait(400);

  // ---- 4) Gmail cleanup recommendations (spam + stale unread) ----
  let mailCleanup = null;
  const gmailDevice = indexStore.listDevices().find((d) => d.id === "gmail");
  if (gmailDevice?.connected) {
    emit(send, {
      phase: "walk",
      room: "mail",
      agent: "mail",
      label: "Gmail",
      text: "메일함에서 비울 수 있는 항목 확인 중...",
    });
    try {
      if (status.google) {
        const google = require("./providers/google");
        mailCleanup = await google.listMailCleanupRecommendations();
        if (!mailCleanup?.groups?.length) {
          mailCleanup = buildMailCleanup();
        }
      } else {
        mailCleanup = buildMailCleanup();
      }
    } catch {
      mailCleanup = buildMailCleanup();
    }
    indexStore.setDeviceQuota(
      "gmail",
      MAIL_QUOTA.usedBytes,
      MAIL_QUOTA.totalBytes
    );
    indexStore.setMailCleanup(mailCleanup);
    emit(send, {
      phase: "search",
      room: "mail",
      agent: "mail",
      text: mailCleanup.groups?.length
        ? "스팸·오래된 안 읽은 메일 정리 추천을 찾았어요"
        : "메일함은 깨끗한 편이에요",
    });
    await wait(350);
  } else {
    indexStore.setMailCleanup(null);
  }

  // ---- 5) Merge ----
  const groups = indexStore.findCrossDeviceDuplicates();
  const primary = groups[0] || null;
  const spaces = spacesFromIndex();
  const snap = indexStore.snapshot();
  mailCleanup = indexStore.getMailCleanup();

  emit(send, {
    phase: "indexed",
    text: `통합 인덱스 ${snap.entryCount}개 · 기기 ${snap.deviceCount}`,
    scannedFiles: snap.entryCount,
    engine: { duplicates: "index", drive: driveMode },
    rooms: primary
      ? [...new Set(primary.files.map((f) => f.room).filter(Boolean))]
      : ["laptop", "desktop", "cloud"],
    groupCount: groups.length,
    progress: 100,
  });

  if (primary && primary.files.length >= 2) {
    emit(send, {
      phase: "found",
      room: primary.files[primary.files.length - 1].room || "cloud",
      text: `같은 파일을 ${primary.files.length}곳에서 봤어요`,
      group: primary,
    });
  } else {
    emit(send, { phase: "idle", text: "지금은 깨끗해요" });
  }

  const piles = [
    {
      id: "duplicates",
      kind: "duplicate",
      label: "중복 파일",
      count: groups.reduce((s, g) => s + g.files.length, 0),
      reclaimBytes: groups.reduce((s, g) => s + g.reclaimBytes, 0),
      groups,
    },
  ];
  if (mailCleanup?.groups?.length) {
    piles.push({
      id: "mail-cleanup",
      kind: "mail",
      label: "메일 정리",
      count: mailCleanup.groups.reduce((s, g) => s + (g.count || 0), 0),
      reclaimBytes: mailCleanup.reclaimBytes || 0,
      groups: mailCleanup.groups,
    });
  }

  // ---- 6) Similarity + cold lifecycle (deferrable / carbon-aware work) ----
  emit(send, {
    phase: "search",
    room: "cloud",
    agent: "gdrive",
    text: "급하지 않은 분석이라 저탄소 시간에 맞춰 분류할게요...",
  });
  await wait(420);
  emit(send, {
    phase: "search",
    room: "laptop",
    agent: "mac-local",
    text: "비슷한 사진·문서·오래 안 쓴 데이터 살펴보는 중...",
  });
  let photoOut = { groups: [], pile: null, reclaimBytes: 0 };
  let docOut = { groups: [], pile: null };
  let coldOut = { groups: [], pile: null, reclaimBytes: 0 };
  try {
    photoOut = await similarPhotos.build({ useFixture: true });
  } catch (err) {
    emit(send, {
      phase: "error",
      text: err.message || "비슷한 사진 분석 실패",
    });
  }
  try {
    const entries = indexStore.listEntries().slice(0, 400);
    docOut = await similarDocs.build({ useFixture: true, entries });
  } catch (err) {
    emit(send, {
      phase: "error",
      text: err.message || "비슷한 문서 분석 실패",
    });
  }
  try {
    const stalePile =
      localResult?.piles?.find((p) => p.id === "stale" || p.kind === "stale") ||
      null;
    coldOut = await coldStale.build({ useFixture: true, stalePile });
  } catch (err) {
    emit(send, {
      phase: "error",
      text: err.message || "오래 안 쓴 데이터 분류 실패",
    });
  }
  if (photoOut.pile?.groups?.length) piles.push(photoOut.pile);
  if (docOut.pile?.groups?.length) piles.push(docOut.pile);
  if (coldOut.pile?.groups?.length) piles.push(coldOut.pile);
  await wait(280);

  const candidates = {
    exact: { groups },
    similarPhotos: { groups: photoOut.groups || [] },
    similarDocs: { groups: docOut.groups || [] },
    coldStale: { groups: coldOut.groups || [] },
  };

  const dupBytes = groups.reduce((s, g) => s + g.reclaimBytes, 0);
  const mailBytes = mailCleanup?.reclaimBytes || 0;
  const photoBytes = photoOut.reclaimBytes || 0;
  const coldBytes = coldOut.reclaimBytes || 0;

  if (photoOut.groups?.length || docOut.groups?.length || coldOut.groups?.length) {
    emit(send, {
      phase: "found",
      text: coldOut.groups?.length
        ? "잠재울 수 있는 오래된 데이터도 찾았어요"
        : "비슷한 사진·재확인 문서 묶음도 찾았어요",
    });
  }

  return {
    ok: true,
    usedFixture: useFixture,
    federated: true,
    driveMode,
    peerMode,
    roomsVisited: primary
      ? [...new Set(primary.files.map((f) => f.room).filter(Boolean))]
      : ["laptop", "desktop", "cloud"],
    primary,
    groups,
    spaces,
    mailCleanup,
    candidates,
    similarPhotos: photoOut.groups,
    similarDocs: docOut.groups,
    coldStale: coldOut.groups,
    result: {
      ok: true,
      scannedAt: new Date().toISOString(),
      scannedFiles: snap.entryCount,
      engine: {
        duplicates: localResult?.engine?.duplicates || "index",
        federated: "index",
        drive: driveMode,
        peer: peerMode,
        photos: photoOut.source || "fixture",
        docs: docOut.source || "fixture",
        cold: coldOut.source || "fixture",
      },
      piles,
      spaces,
      mailCleanup,
      candidates,
      summary: {
        totalReclaimBytes: dupBytes + mailBytes + photoBytes + coldBytes,
        duplicateBytes: dupBytes,
        mailBytes,
        photoBytes,
        coldBytes,
      },
    },
  };
}

function stem(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[\s_\-()0-9]/g, "");
}

module.exports = {
  runFederatedScan,
  spacesFromIndex,
  ensureDevices,
};
