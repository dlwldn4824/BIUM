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
const { QUOTA: MAIL_QUOTA } = require("./peers/gmailDemo");
const {
  buildDemoNaverIndex,
  buildNaverMailCleanup,
  QUOTA: NAVER_QUOTA,
} = require("./peers/naverDemo");
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
  // Seed labels/kinds only — no fake quotas (live refresh fills Mac/Drive)
  indexStore.registerDevice({
    id: "mac-local",
    label: "MacBook",
    kind: "local",
    platform: "darwin",
    connected: true,
    demo: false,
  });
  indexStore.registerDevice({
    id: "windows-peer",
    label: "Windows Desktop",
    kind: "peer",
    platform: "win32",
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
  indexStore.registerDevice({
    id: "naver-mail",
    label: "네이버 메일",
    kind: "mail",
    platform: "cloud",
  });
}

/**
 * Real Mac disk usage.
 * On APFS, `df /` only shows the sealed system volume (~20GB) — wrong for UI.
 * Prefer Data volume CapacityInUse + APFS container size (matches 이 Mac에 관하여).
 */
function refreshMacDiskQuota() {
  const { execSync } = require("child_process");

  if (process.platform === "darwin") {
    try {
      const plist = execSync(
        "diskutil info -plist /System/Volumes/Data",
        { encoding: "utf8", timeout: 8000 }
      );
      const json = execSync("plutil -convert json -o - -", {
        input: plist,
        encoding: "utf8",
        timeout: 5000,
      });
      const info = JSON.parse(json);
      const total = Number(
        info.APFSContainerSize || info.TotalSize || info.IOKitSize || 0
      );
      const free = Number(info.APFSContainerFree || 0);
      let used = Number(info.CapacityInUse || 0);
      if (!used && total > 0 && free >= 0) used = Math.max(0, total - free);
      if (total > 0 && used >= 0) {
        indexStore.setDeviceQuota("mac-local", used, total, { demo: false });
        indexStore.setDeviceConnected("mac-local", true);
        return true;
      }
    } catch {
      /* fall through */
    }

    // Fallback: Data volume df (not "/")
    try {
      const df = execSync("df -k /System/Volumes/Data", {
        encoding: "utf8",
        timeout: 5000,
      })
        .trim()
        .split("\n")[1];
      const parts = df.split(/\s+/);
      const totalK = Number(parts[1]);
      const usedK = Number(parts[2]);
      if (totalK > 0) {
        indexStore.setDeviceQuota(
          "mac-local",
          usedK * 1024,
          totalK * 1024,
          { demo: false }
        );
        indexStore.setDeviceConnected("mac-local", true);
        return true;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const fs = require("fs");
    const root =
      process.platform === "darwin" && fs.existsSync("/System/Volumes/Data")
        ? "/System/Volumes/Data"
        : "/";
    const s = fs.statfsSync(root);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    const used = Math.max(0, total - free);
    if (total > 0) {
      indexStore.setDeviceQuota("mac-local", used, total, { demo: false });
      indexStore.setDeviceConnected("mac-local", true);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Refresh Mac disk + Drive about (when OAuth). Call on getConnections / boot.
 */
async function refreshLiveQuotas() {
  ensureDevices();
  refreshMacDiskQuota();
  const status = store.connectionStatus();

  // Windows / OneDrive: only show when actually linked
  if (!status.windowsPeer) {
    indexStore.setDeviceConnected("windows-peer", false);
  }
  if (!status.microsoft) {
    indexStore.setDeviceConnected("onedrive", false);
  }

  if (status.google) {
    try {
      const google = require("./providers/google");
      const about = await google.aboutStorage();
      if (about && (about.usage > 0 || about.limit > 0)) {
        indexStore.setDeviceQuota("gdrive", about.usage, about.limit || 0, {
          demo: false,
        });
        indexStore.setDeviceConnected("gdrive", true);
        indexStore.setDeviceDemo("gdrive", false);
      }
    } catch {
      /* keep prior */
    }
  } else {
    const g = indexStore.listDevices().find((d) => d.id === "gdrive");
    if (g?.connected) {
      // Demo link — don't show canned 78/100 as if real
      indexStore.setDeviceQuota("gdrive", null, null, { demo: true });
      indexStore.setDeviceDemo("gdrive", true);
    }
  }
  return spacesFromIndex();
}

function entriesFromLocalScan(result) {
  const out = [];
  const groups = result?.piles?.find((p) => p.id === "duplicates")?.groups || [];
  for (const g of groups) {
    for (const f of g.files || []) {
      const md5 = f.md5 || (f.hashAlg === "md5" ? f.hash : null);
      const blake = !md5 && f.hash ? f.hash : null;
      out.push({
        source: "local",
        path: f.path,
        name: f.name,
        size: f.size,
        hash: md5 || blake || g.id,
        hashAlg: md5
          ? "md5"
          : result?.engine?.duplicates === "node"
            ? "sha256-partial"
            : "blake3",
        contentKey: md5
          ? `md5:${md5}`
          : blake
            ? `blake3:${blake}`
            : g.id
              ? `group:${g.id}`
              : null,
        md5: md5 || null,
        modified: null,
        room: f.room || roomForPath(f.path),
      });
    }
  }
  return out;
}

/** Prefer Drive-compatible MD5 contentKey on local dup paths (and size-overlap). */
async function enrichLocalMd5(macEntries, driveEntries = []) {
  const { md5Many } = require("./scanner");
  const driveSizes = new Set(
    (driveEntries || []).map((e) => e.size).filter((n) => n > 0)
  );
  // No Drive size hints → skip (full-file MD5 is expensive)
  if (!driveSizes.size) return macEntries;
  const need = macEntries
    .filter(
      (e) =>
        e.path &&
        !String(e.path).startsWith("gdrive:") &&
        (!e.md5 || !String(e.contentKey || "").startsWith("md5:"))
    )
    .filter((e) => driveSizes.has(e.size))
    .map((e) => e.path);
  if (!need.length) return macEntries;

  const map = await md5Many(need, { limit: 36, concurrency: 6 });
  for (const e of macEntries) {
    const md5 = map.get(e.path);
    if (!md5) continue;
    e.md5 = md5;
    e.hash = md5;
    e.hashAlg = "md5";
    e.contentKey = `md5:${md5}`;
  }
  return macEntries;
}

function spacesFromIndex() {
  const devices = indexStore.listDevices();
  // Decimal GB (1000^3) — matches macOS “이 Mac에 관하여” / diskutil labels
  const GB = 1000 ** 3;
  return devices.map((d) => {
    const usedGb =
      d.usedBytes != null ? Math.round((d.usedBytes / GB) * 10) / 10 : null;
    const totalGb =
      d.totalBytes != null ? Math.round((d.totalBytes / GB) * 10) / 10 : null;
    return {
      id: d.id,
      name: d.label,
      used: usedGb,
      total: totalGb,
      usedBytes: d.usedBytes ?? null,
      totalBytes: d.totalBytes ?? null,
      connected: d.connected,
      demo: !!d.demo,
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
    text: "탐색을 시작했어요",
    progress: 4,
  });

  // ---- 1) Mac Local Agent ----
  emit(send, {
    phase: "walk",
    room: "laptop",
    agent: "mac-local",
    label: "MacBook",
    text: "MacBook 폴더를 살펴보는 중...",
    progress: 8,
  });

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
    timeoutMs: options.timeoutMs || 45000,
    binary: options.binary,
    // Keep first pass snappy — deep MD5 only for Drive size overlaps later
    limit: options.limit || 450,
  });

  let macEntries = entriesFromLocalScan(localResult);
  for (const e of macEntries) {
    if (!e.contentKey && e.hash) e.contentKey = `${e.hashAlg}:${e.hash}`;
  }
  indexStore.upsertDeviceEntries("mac-local", macEntries);
  refreshMacDiskQuota();
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
    text: `MacBook에서 ${macEntries.length}개 확인`,
    progress: 35,
  });

  // ---- 2) LAN peer (LocalSend-inspired) or Windows stub ----
  emit(send, {
    phase: "transfer",
    agent: "windows-peer",
    text: "같은 네트워크 Desktop 찾는 중...",
    from: "mac-local",
    to: "windows-peer",
    progress: 40,
  });

  let peerMode = "stub";
  let winEntries = [];
  try {
    const found = await lanPeer.discover(500);
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

  const wantWindows =
    peerMode === "lan" ||
    !!indexStore.listDevices().find((d) => d.id === "windows-peer")?.connected ||
    !!store.connectionStatus().windowsPeer;

  if (!winEntries.length && wantWindows) {
    emit(send, {
      phase: "walk",
      room: "desktop",
      agent: "windows-peer",
      label: "Windows Desktop",
      text: "Desktop 탐색 중... (데모 피어)",
    });
    winEntries = buildWindowsIndex(macEntries);
    peerMode = "stub";
  }

  if (winEntries.length) {
    indexStore.upsertDeviceEntries("windows-peer", winEntries);
    if (peerMode === "lan") {
      indexStore.setDeviceQuota("windows-peer", null, null, { demo: false });
      indexStore.setDeviceConnected("windows-peer", true);
      indexStore.setDeviceDemo("windows-peer", false);
    } else {
      indexStore.setDeviceQuota(
        "windows-peer",
        WIN_QUOTA.usedBytes,
        WIN_QUOTA.totalBytes,
        { demo: true }
      );
      indexStore.setDeviceConnected("windows-peer", true);
      indexStore.setDeviceDemo("windows-peer", true);
    }
    emit(send, {
      phase: "search",
      room: "desktop",
      agent: "windows-peer",
      text:
        peerMode === "lan"
          ? `Desktop 피어 ${winEntries.length}개`
          : `Desktop 데모 ${winEntries.length}개`,
      progress: 48,
    });
  } else {
    indexStore.upsertDeviceEntries("windows-peer", []);
    indexStore.setDeviceConnected("windows-peer", false);
    peerMode = "offline";
  }

  // ---- 3) Google Drive (OAuth or demo metadata) ----
  emit(send, {
    phase: "walk",
    room: "cloud",
    agent: "gdrive",
    label: "Google Drive",
    text: "Google Drive 확인 중...",
    progress: 52,
  });

  let driveMode = "offline";
  try {
    if (status.google) {
      const google = require("./providers/google");
      emit(send, {
        phase: "search",
        agent: "gdrive",
        text: "Drive 파일 목록 받는 중...",
        progress: 55,
      });
      const files = await google.listDriveCandidates({ max: 40 });
      // MD5 only for size-overlapping locals (fast path skips when no Drive)
      try {
        emit(send, {
          phase: "search",
          agent: "mac-local",
          text: "Drive와 겹치는 파일 맞춰 보는 중...",
          progress: 62,
        });
        macEntries = await enrichLocalMd5(macEntries, files);
        indexStore.upsertDeviceEntries("mac-local", macEntries);
      } catch {
        /* ignore */
      }
      const entries = files.map((f) => ({
        source: "gdrive",
        path: f.path,
        name: f.name,
        size: f.size,
        hash: f.md5,
        hashAlg: f.md5 ? "md5" : null,
        contentKey: f.md5 ? `md5:${f.md5}` : null,
        md5: f.md5 || null,
        modified: f.modifiedTime,
        room: "cloud",
      }));
      // Fallback soft-bridge only when Drive has no md5 (Google Docs etc.)
      for (const e of entries) {
        if (e.contentKey) continue;
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
        indexStore.setDeviceQuota("gdrive", about.usage, about.limit || 0, {
          demo: false,
        });
      }
      indexStore.setDeviceConnected("gdrive", true);
      indexStore.setDeviceDemo("gdrive", false);
      driveMode = "oauth";
    } else if (
      indexStore.listDevices().find((d) => d.id === "gdrive")?.connected
    ) {
      // Already linked (데모 or prior) — refresh demo index, no fake GB
      const demo = buildDemoDriveIndex(macEntries);
      indexStore.upsertDeviceEntries("gdrive", demo);
      indexStore.setDeviceQuota("gdrive", null, null, { demo: true });
      indexStore.setDeviceDemo("gdrive", true);
      driveMode = "demo";
    } else {
      indexStore.setDeviceConnected("gdrive", false);
      driveMode = "offline";
    }
  } catch (err) {
    emit(send, {
      phase: "error",
      agent: "gdrive",
      text: err.message || "Drive 스캔 실패",
    });
    if (status.google || indexStore.listDevices().find((d) => d.id === "gdrive")?.connected) {
      const demo = buildDemoDriveIndex(macEntries);
      indexStore.upsertDeviceEntries("gdrive", demo);
      indexStore.setDeviceQuota("gdrive", null, null, { demo: true });
      indexStore.setDeviceConnected("gdrive", true);
      indexStore.setDeviceDemo("gdrive", true);
      driveMode = "demo-fallback";
    }
  }

    emit(send, {
      phase: "search",
      room: "cloud",
      agent: "gdrive",
      text:
        driveMode === "oauth"
          ? "Google Drive 확인 완료"
          : driveMode === "demo" || driveMode === "demo-fallback"
            ? "Drive 데모 연결"
            : "Drive는 아직 연결 안 됨",
      progress: 68,
    });

  // ---- 4) Gmail cleanup recommendations (spam + stale unread) ----
  let mailCleanup = null;
  const gmailDevice = indexStore.listDevices().find((d) => d.id === "gmail");
  if (gmailDevice?.connected) {
    emit(send, {
      phase: "walk",
      room: "mail",
      agent: "mail",
      label: "Gmail",
      text: "메일함 확인 중...",
      progress: 72,
    });
    try {
      if (status.google) {
        const google = require("./providers/google");
        mailCleanup = await google.listMailCleanupRecommendations();
        try {
          const about = await google.aboutStorage();
          if (about?.limit) {
            indexStore.setDeviceQuota("gmail", about.usage, about.limit, {
              demo: false,
            });
          } else {
            indexStore.setDeviceQuota(
              "gmail",
              MAIL_QUOTA.usedBytes,
              MAIL_QUOTA.totalBytes,
              { demo: true }
            );
          }
        } catch {
          indexStore.setDeviceQuota(
            "gmail",
            MAIL_QUOTA.usedBytes,
            MAIL_QUOTA.totalBytes,
            { demo: true }
          );
        }
      } else {
        // Marked connected but no OAuth — keep prior real results; never invent demo mid-scan
        mailCleanup = indexStore.getMailCleanup();
        if (mailCleanup?.demo) mailCleanup = null;
      }
    } catch (err) {
      emit(send, {
        phase: "search",
        room: "mail",
        agent: "mail",
        text: `메일 확인 실패 · ${String(err.message || "").slice(0, 48)}`,
        progress: 76,
      });
      mailCleanup = indexStore.getMailCleanup();
      if (mailCleanup?.demo) mailCleanup = null;
    }
    if (mailCleanup) indexStore.setMailCleanup(mailCleanup);
    else indexStore.setMailCleanup(null);
    emit(send, {
      phase: "search",
      room: "mail",
      agent: "mail",
      text: mailCleanup?.groups?.length
        ? `메일 정리 후보 ${mailCleanup.groups.length}건`
        : mailCleanup?.source === "gmail"
          ? "메일함은 깨끗한 편이에요"
          : "메일 추천을 가져오지 못했어요",
      progress: 78,
    });
  } else {
    // Stale Gmail recommendations — Naver block below may refill
    indexStore.setMailCleanup(null);
  }

  // ---- 4b) Naver Mail IMAP (attachments → contentKey join) ----
  let naverMode = "offline";
  const naverDevice = indexStore.listDevices().find((d) => d.id === "naver-mail");
  if (naverDevice?.connected || status.naver) {
    emit(send, {
      phase: "walk",
      room: "mail",
      agent: "mail",
      label: "네이버 메일",
      text: "네이버 메일 확인 중...",
      progress: 80,
    });
    const sizeHints = [
      ...macEntries.map((e) => e.size),
      ...indexStore
        .listEntries()
        .filter((e) => e.deviceId === "gdrive")
        .map((e) => e.size),
    ].filter(Boolean);

    try {
      if (status.naver) {
        const naver = require("./providers/naverImap");
        const res = await naver.listAttachmentCandidates({
          maxMails: 60,
          olderThanDays: 365,
          sizeHints,
        });
        const entries = (res.attachments || []).map((a) => ({
          source: "naver-imap",
          path: a.path,
          name: a.name,
          size: a.size,
          hash: a.md5 || a.hash,
          hashAlg: a.md5 ? "md5" : a.hashAlg,
          contentKey: a.contentKey || (a.md5 ? `md5:${a.md5}` : null),
          md5: a.md5 || null,
          modified: a.modified,
          room: "mail",
        }));
        // Soft-bridge: same size + stem when no md5 yet
        for (const e of entries) {
          if (e.contentKey) continue;
          const match = macEntries.find(
            (m) =>
              m.size === e.size &&
              m.contentKey &&
              stem(m.name) &&
              stem(e.name).includes(stem(m.name).slice(0, 4))
          );
          if (match?.contentKey) e.contentKey = match.contentKey;
        }
        indexStore.upsertDeviceEntries("naver-mail", entries);
        indexStore.setDeviceQuota(
          "naver-mail",
          res.reclaimBytes || NAVER_QUOTA.usedBytes,
          NAVER_QUOTA.totalBytes
        );
        indexStore.setDeviceConnected("naver-mail", true);
        const naverCleanup = buildNaverMailCleanup(
          entries.length || 1,
          res.reclaimBytes || entries.reduce((s, e) => s + e.size, 0)
        );
        naverCleanup.demo = false;
        naverCleanup.source = "naver-imap";
        if (!mailCleanup?.groups?.length) {
          indexStore.setMailCleanup(naverCleanup);
          mailCleanup = naverCleanup;
        } else {
          mailCleanup.groups = [
            ...(mailCleanup.groups || []),
            ...naverCleanup.groups,
          ];
          mailCleanup.reclaimBytes =
            (mailCleanup.reclaimBytes || 0) + (naverCleanup.reclaimBytes || 0);
          indexStore.setMailCleanup(mailCleanup);
        }
        naverMode = "imap";
      } else if (store.getConfig().demoNaver !== false) {
        const seed = [
          ...macEntries,
          ...indexStore.listEntries().filter((e) => e.deviceId === "gdrive"),
        ];
        const demo = buildDemoNaverIndex(seed);
        indexStore.upsertDeviceEntries("naver-mail", demo);
        indexStore.setDeviceQuota(
          "naver-mail",
          NAVER_QUOTA.usedBytes,
          NAVER_QUOTA.totalBytes
        );
        indexStore.setDeviceConnected("naver-mail", true);
        const naverCleanup = buildNaverMailCleanup();
        if (!mailCleanup?.groups?.length) {
          indexStore.setMailCleanup(naverCleanup);
          mailCleanup = naverCleanup;
        } else {
          mailCleanup.groups = [
            ...(mailCleanup.groups || []),
            ...naverCleanup.groups,
          ];
          mailCleanup.reclaimBytes =
            (mailCleanup.reclaimBytes || 0) + (naverCleanup.reclaimBytes || 0);
          indexStore.setMailCleanup(mailCleanup);
        }
        naverMode = "demo";
      }
    } catch (err) {
      emit(send, {
        phase: "error",
        agent: "mail",
        text: err.message || "네이버 메일 스캔 실패",
      });
      const seed = [
        ...macEntries,
        ...indexStore.listEntries().filter((e) => e.deviceId === "gdrive"),
      ];
      const demo = buildDemoNaverIndex(seed);
      indexStore.upsertDeviceEntries("naver-mail", demo);
      indexStore.setDeviceConnected("naver-mail", true);
      naverMode = "demo-fallback";
    }

    emit(send, {
      phase: "search",
      room: "mail",
      agent: "mail",
      text:
        naverMode === "imap"
          ? "네이버 메일 확인 완료"
          : "네이버 메일 데모 연결",
      progress: 86,
    });
  }

  // ---- 5) Merge ----
  const groups = indexStore.findCrossDeviceDuplicates();
  const primary = groups[0] || null;
  const spaces = spacesFromIndex();
  const snap = indexStore.snapshot();
  mailCleanup = indexStore.getMailCleanup();

  emit(send, {
    phase: "indexed",
    text: `정리 중… 파일 ${snap.entryCount}개`,
    scannedFiles: snap.entryCount,
    engine: { duplicates: "index", drive: driveMode, naver: naverMode },
    rooms: primary
      ? [...new Set(primary.files.map((f) => f.room).filter(Boolean))]
      : ["laptop", "desktop", "cloud", "mail"],
    groupCount: groups.length,
    progress: 92,
  });

  if (primary && primary.files.length >= 2) {
    emit(send, {
      phase: "found",
      room: primary.files[primary.files.length - 1].room || "cloud",
      text: `같은 파일을 ${primary.files.length}곳에서 봤어요`,
      group: primary,
      progress: 96,
    });
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

  // ---- 6) Similar photos (real Czkawka image) · docs/cold still optional demo
  const wantPhotos = options.includeSimilarPhotos !== false;
  const wantSimilarDemo = options.includeSimilar === true;
  let photoOut = { groups: [], pile: null, reclaimBytes: 0, source: "skipped" };
  let docOut = { groups: [], pile: null, source: "skipped" };
  let coldOut = { groups: [], pile: null, reclaimBytes: 0, source: "skipped" };

  if (wantPhotos) {
    emit(send, {
      phase: "search",
      agent: "mac-local",
      room: "laptop",
      text: "비슷한 사진 보는 중… (Pictures·Desktop)",
      progress: 93,
    });
    try {
      photoOut = await similarPhotos.build({
        useFixture: false,
        timeoutMs: options.photoTimeoutMs || 150000,
        maxDifference: options.photoMaxDifference ?? 8,
        maxGroups: options.photoMaxGroups ?? 24,
      });
      if (photoOut.pile?.groups?.length) piles.push(photoOut.pile);
      emit(send, {
        phase: "search",
        agent: "mac-local",
        text: photoOut.groups?.length
          ? `비슷한 사진 묶음 ${photoOut.groups.length}개`
          : "비슷한 사진은 거의 없어요",
        progress: 95,
      });
    } catch (err) {
      emit(send, {
        phase: "search",
        agent: "mac-local",
        text: `사진 유사도 스캔 건너뜀 · ${String(err.message || "").slice(0, 40)}`,
        progress: 95,
      });
      photoOut = {
        groups: [],
        pile: null,
        reclaimBytes: 0,
        source: "error",
        error: err.message,
      };
    }
  }

  if (wantSimilarDemo) {
    emit(send, {
      phase: "search",
      agent: "mac-local",
      text: "비슷한 문서·오래된 폴더(데모) 보는 중...",
      progress: 96,
    });
    try {
      docOut = await similarDocs.build({
        useFixture: true,
        entries: indexStore.listEntries().slice(0, 200),
      });
    } catch {
      /* ignore */
    }
    try {
      const stalePile =
        localResult?.piles?.find((p) => p.id === "stale" || p.kind === "stale") ||
        null;
      coldOut = await coldStale.build({ useFixture: true, stalePile });
    } catch {
      /* ignore */
    }
    if (docOut.pile?.groups?.length) piles.push(docOut.pile);
    if (coldOut.pile?.groups?.length) piles.push(coldOut.pile);
  }

  const candidates = {
    exact: { groups },
    similarPhotos: { groups: photoOut.groups || [] },
    similarDocs: { groups: docOut.groups || [] },
    coldStale: { groups: coldOut.groups || [] },
  };

  const dupBytes = groups.reduce((s, g) => s + (g.reclaimBytes || 0), 0);
  const mailBytes = mailCleanup?.reclaimBytes || 0;
  const photoBytes = photoOut.reclaimBytes || 0;
  const coldBytes = coldOut.reclaimBytes || 0;
  const photoReal = photoOut.source === "czkawka-image";
  const docReal = docOut.source && docOut.source !== "fixture" && docOut.source !== "skipped";
  const coldReal =
    coldOut.source &&
    coldOut.source !== "fixture" &&
    coldOut.source !== "skipped";
  // Headline metrics: real reclaim only (fixtures stay in candidates for UX demos)
  const totalReclaimBytes =
    dupBytes +
    mailBytes +
    (photoReal ? photoBytes : 0) +
    (coldReal ? coldBytes : 0);
  const findCount =
    groups.length +
    (mailCleanup?.groups?.length ? 1 : 0) +
    (photoReal ? photoOut.groups.length : 0) +
    (docReal ? docOut.groups.length : 0) +
    (coldReal ? coldOut.groups.length : 0);
  const cleanableGb = Math.round((totalReclaimBytes / 1024 ** 3) * 10) / 10;

  const summary = {
    cleanableGb,
    findCount,
    totalReclaimBytes,
    duplicateBytes: dupBytes,
    mailBytes,
    photoBytes: photoReal ? photoBytes : 0,
    coldBytes: coldReal ? coldBytes : 0,
    scannedFiles: snap.entryCount,
    driveMode,
    peerMode,
  };
  indexStore.setSummary(summary);

  const spacesLive = spacesFromIndex();
  emit(send, {
    phase: "idle",
    text:
      primary && primary.files.length >= 2
        ? `같은 파일을 ${primary.files.length}곳에서 찾았어요`
        : "탐색 끝 · 지금은 깨끗한 편이에요",
    progress: 100,
  });

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
    spaces: spacesLive,
    summary,
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
      spaces: spacesLive,
      mailCleanup,
      candidates,
      summary,
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
  refreshMacDiskQuota,
  refreshLiveQuotas,
};
