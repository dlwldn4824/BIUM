const GB = 1024 ** 3;

const ROOM_META = {
  desktop: { name: "데스크톱룸", pileHint: "duplicates" },
  laptop: { name: "노트북룸", pileHint: "stale" },
  phone: { name: "핸드폰룸", pileHint: "bulky" },
  cloud: { name: "클라우드룸", pileHint: "duplicates" },
  mail: { name: "메일함", pileHint: "mail" },
};

const state = {
  data: null,
  activePileId: null,
  activeRoomId: null,
  selectedPaths: new Set(),
  cleanedBytes: 0,
  baselineCleanliness: 48,
  connections: { google: false, microsoft: false, config: {} },
  deleting: false,
};

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

function demoData() {
  const file = (name, room, size, path, source = "local") => ({
    path: path || `/${room}/${name}`,
    name,
    size,
    sizeLabel: formatBytes(size),
    room,
    source,
    id: path || `/${room}/${name}`,
  });

  const duplicateGroups = [
    {
      id: "dup-video",
      kind: "duplicate",
      title: "공모전.mp4",
      reason: "데스크톱 · 노트북 · Google Drive에 동일 해시",
      reclaimBytes: 9.4 * GB,
      rooms: ["desktop", "laptop", "cloud"],
      files: [
        file("공모전.mp4", "laptop", 4.7 * GB, "/MacBook/Downloads/공모전.mp4"),
        file("최종영상.mp4", "desktop", 4.7 * GB, "/Desktop/Backup/최종영상.mp4"),
        file("video.mp4", "cloud", 4.7 * GB, "/Google Drive/공모전/video.mp4", "gdrive"),
      ],
    },
    {
      id: "dup-deck",
      kind: "duplicate",
      title: "발표자료.pptx",
      reason: "노트북 · OneDrive 중복",
      reclaimBytes: 0.72 * GB,
      rooms: ["laptop", "cloud"],
      files: [
        file("발표.pptx", "laptop", 0.36 * GB),
        file("발표최종.pptx", "cloud", 0.36 * GB, "/OneDrive/발표최종.pptx", "onedrive"),
        file("발표최종진짜.pptx", "laptop", 0.36 * GB),
      ],
    },
    {
      id: "dup-photo",
      kind: "duplicate",
      title: "IMG_2048.HEIC",
      reason: "핸드폰 · iCloud 중복",
      reclaimBytes: 0.8 * GB,
      rooms: ["phone", "cloud"],
      files: [
        file("IMG_2048.HEIC", "phone", 0.4 * GB),
        file("IMG_2048.HEIC", "cloud", 0.4 * GB, "/iCloud/IMG_2048.HEIC", "gdrive"),
      ],
    },
  ];

  const staleFiles = [
    ...Array.from({ length: 12 }, (_, i) =>
      file(`old-backup-${i + 1}.zip`, i % 2 ? "desktop" : "laptop", 0.55 * GB)
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      file(`screen-${i + 1}.png`, "phone", 0.12 * GB)
    ),
  ];

  const bulkyFiles = [
    file("Xcode_15.dmg", "laptop", 7.2 * GB, "/Downloads/Xcode_15.dmg"),
    file("raw-footage.mov", "desktop", 3 * GB, "/Movies/raw-footage.mov"),
    file("game-cache.bin", "phone", 1.8 * GB, "/Phone/game-cache.bin"),
    file("dataset.zip", "cloud", 2.4 * GB, "/Google Drive/dataset.zip"),
  ];

  const mailFiles = [
    file("invoice-2019.pdf", "mail", 0.2 * GB, "/mail/invoice-2019.pdf", "gmail"),
    file("family-photos.zip", "mail", 1.4 * GB, "/mail/family-photos.zip", "gmail"),
    file("old-receipts.zip", "mail", 0.9 * GB, "/mail/old-receipts.zip", "gmail"),
  ];

  const duplicateBytes = duplicateGroups.reduce((s, g) => s + g.reclaimBytes, 0);
  const staleBytes = staleFiles.reduce((s, f) => s + f.size, 0);
  const bulkyBytes = bulkyFiles.reduce((s, f) => s + f.size, 0);
  const mailBytes = mailFiles.reduce((s, f) => s + f.size, 0);
  const total = duplicateBytes + staleBytes + bulkyBytes + mailBytes;
  const cloud = Math.round(duplicateBytes * 0.45 + bulkyBytes * 0.2 + mailBytes);
  const local = total - cloud;
  const after = 22.4 * GB - Math.min(cloud, 22.4 * GB);

  const roomWaste = {
    desktop: { trashBags: 3, dustyBoxes: 1, cleanliness: 52, used: 256, total: 512 },
    laptop: { trashBags: 4, dustyBoxes: 2, cleanliness: 41, used: 128, total: 250 },
    phone: { trashBags: 2, dustyBoxes: 1, cleanliness: 58, used: 64, total: 128 },
    cloud: { trashBags: 5, dustyBoxes: 1, cleanliness: 36, used: 120, total: 200 },
    mail: { trashBags: 2, dustyBoxes: 0, cleanliness: 63, used: 12, total: 15 },
  };

  return {
    ok: true,
    demo: true,
    scannedAt: new Date().toISOString(),
    scannedFiles: 1842,
    rooms: Object.entries(ROOM_META).map(([id, meta]) => ({
      id,
      name: meta.name,
      ...roomWaste[id],
      bytesLabel: `${roomWaste[id].used}GB / ${roomWaste[id].total}GB`,
      usageRatio: roomWaste[id].used / roomWaste[id].total,
    })),
    spaces: [
      { id: "desktop", name: "데스크톱", used: 256, total: 512 },
      { id: "laptop", name: "노트북", used: 128, total: 250 },
      { id: "phone", name: "핸드폰", used: 64, total: 128 },
      { id: "gdrive", name: "Google Drive", used: 78, total: 100 },
      { id: "onedrive", name: "OneDrive", used: 42, total: 100 },
      { id: "mail", name: "메일", used: 12, total: 15 },
    ],
    piles: [
      {
        id: "duplicates",
        kind: "duplicate",
        label: "중복 파일",
        count: 342,
        reclaimBytes: duplicateBytes,
        rooms: ["desktop", "laptop", "phone", "cloud"],
        groups: duplicateGroups,
      },
      {
        id: "stale",
        kind: "stale",
        label: "오래된 파일",
        count: 851,
        reclaimBytes: staleBytes,
        rooms: ["desktop", "laptop", "phone"],
        groups: [
          {
            id: "stale-all",
            kind: "stale",
            title: "장기 미사용 파일",
            reason: "2년 이상 열지 않은 파일 · 방마다 먼지가 쌓인 상자",
            reclaimBytes: staleBytes,
            files: staleFiles,
          },
        ],
      },
      {
        id: "bulky",
        kind: "bulky",
        label: "대용량 파일",
        count: 56,
        reclaimBytes: bulkyBytes,
        rooms: ["desktop", "laptop", "phone", "cloud"],
        groups: [
          {
            id: "bulky-all",
            kind: "bulky",
            title: "대용량 방치 파일",
            reason: "큰 파일이 방 한구석을 차지하고 있습니다",
            reclaimBytes: bulkyBytes,
            files: bulkyFiles,
          },
        ],
      },
      {
        id: "mail",
        kind: "mail",
        label: "오래된 메일 첨부",
        count: 412,
        reclaimBytes: mailBytes,
        rooms: ["mail"],
        groups: [
          {
            id: "mail-all",
            kind: "mail",
            title: "메일함 주변 쓰레기",
            reason: "오래된 첨부파일이 우편함 앞에 쌓여 있습니다",
            reclaimBytes: mailBytes,
            files: mailFiles,
          },
        ],
      },
    ],
    summary: {
      totalReclaimBytes: total,
      localReclaimBytes: local,
      cloudReclaimBytes: cloud,
      duplicateBytes,
      staleBytes,
      bulkyBytes,
      plan: {
        currentUsageBytes: 22.4 * GB,
        afterUsageBytes: after,
        freeTierBytes: 15 * GB,
        canDowngrade: after <= 15 * GB,
        directSavingKrw: after <= 15 * GB ? 36000 : 0,
        note:
          after <= 15 * GB
            ? "용량 때문에만 유료였다면 연간 약 36,000원 절감 가능"
            : "요금제 경계 미달로 직접 비용 절감 0원",
      },
    },
  };
}

function $(id) {
  return document.getElementById(id);
}

function showView(name) {
  ["Home", "Pile", "Review", "Done", "Settings"].forEach((key) => {
    $(`view${key}`).classList.toggle("hidden", key !== name);
  });
}

async function refreshConnections() {
  try {
    state.connections = await window.digitalDiet.getConnections();
  } catch {
    state.connections = { google: false, microsoft: false, config: {} };
  }
  const g = $("googleStatus");
  const m = $("microsoftStatus");
  const bg = $("btnGoogle");
  const bm = $("btnMicrosoft");
  if (!g || !m) return;
  g.textContent = state.connections.google ? "연결됨 · 클릭하여 해제" : "Drive + Gmail 연결";
  m.textContent = state.connections.microsoft ? "연결됨 · 클릭하여 해제" : "OneDrive 연결";
  bg.classList.toggle("on", !!state.connections.google);
  bm.classList.toggle("on", !!state.connections.microsoft);
}

function averageCleanliness(rooms) {
  if (!rooms?.length) return state.baselineCleanliness;
  return Math.round(
    rooms.reduce((s, r) => s + (r.cleanliness || 0), 0) / rooms.length
  );
}

function roomById(id) {
  return state.data?.rooms?.find((r) => r.id === id);
}

function pilesForRoom(roomId) {
  return (state.data?.piles || []).filter(
    (pile) =>
      pile.reclaimBytes > 0 &&
      (pile.rooms?.includes(roomId) ||
        pile.groups.some((g) => g.files.some((f) => f.room === roomId)))
  );
}

function buildRoomPile(roomId) {
  const piles = pilesForRoom(roomId);
  if (!piles.length) return null;

  const groups = [];
  let reclaimBytes = 0;
  let count = 0;

  piles.forEach((pile) => {
    pile.groups.forEach((group) => {
      const files = group.files.filter((f) => f.room === roomId);
      if (!files.length && !(group.rooms || []).includes(roomId)) {
        // keep duplicate groups that mention the room even if keep-file is elsewhere
        if ((group.rooms || []).includes(roomId) || pile.rooms?.includes(roomId)) {
          const related = group.files;
          if (!related.length) return;
          const bytes = related.slice(1).reduce((s, f) => s + f.size, 0) || group.reclaimBytes;
          groups.push({
            ...group,
            id: `${group.id}-${roomId}`,
            title: `${group.title}`,
            reason: `${ROOM_META[roomId].name}에 쌓인 ${pile.label}`,
            reclaimBytes: bytes / Math.max(1, (group.rooms || pile.rooms || [roomId]).length),
            files: related,
          });
          reclaimBytes += groups[groups.length - 1].reclaimBytes;
          count += related.length;
        }
        return;
      }
      if (!files.length) return;
      const bytes = files.reduce((s, f) => s + f.size, 0);
      groups.push({
        ...group,
        id: `${group.id}-${roomId}`,
        reason: `${ROOM_META[roomId].name} · ${pile.label}`,
        reclaimBytes: bytes,
        files,
      });
      reclaimBytes += bytes;
      count += files.length;
    });
  });

  if (!groups.length) return null;

  return {
    id: `room-${roomId}`,
    kind: "room",
    label: `${ROOM_META[roomId].name} 쓰레기`,
    count,
    reclaimBytes,
    groups,
    roomId,
  };
}

function renderTrashBags() {
  document.querySelectorAll(".trash-spot").forEach((spot) => {
    spot.innerHTML = "";
    const roomId = spot.dataset.room;
    const room = roomById(roomId);
    const hasTrash = (room?.trashBags || 0) > 0 && pilesForRoom(roomId).length > 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `trash-bag${hasTrash ? "" : " empty"}`;
    btn.title = hasTrash
      ? `${ROOM_META[roomId].name} 쓰레기 보기`
      : `${ROOM_META[roomId].name} · 깨끗함`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRoom(roomId);
    });
    spot.appendChild(btn);
  });
}

function renderHome() {
  const data = state.data;
  if (!data) return;

  const clean = averageCleanliness(data.rooms);
  $("cleanValue").textContent = `${clean}%`;
  $("statusLine").textContent = data.demo
    ? "각 클라우드·기기가 하나의 방입니다"
    : `로컬 ${data.scannedFiles.toLocaleString()}개 스캔 · 방으로 배치됨`;

  $("totalReclaim").textContent = formatBytes(data.summary.totalReclaimBytes);
  $("savingValue").textContent = `${data.summary.plan.directSavingKrw.toLocaleString()}원`;
  $("dupValue").textContent = formatBytes(data.summary.duplicateBytes);

  data.rooms.forEach((room) => {
    const cap = $(`cap-${room.id}`);
    if (cap) {
      if (room.id === "cloud") cap.textContent = "Drive · OneDrive";
      else cap.textContent = room.bytesLabel || formatBytes(room.bytes || 0);
    }
  });

  const list = $("wasteList");
  list.innerHTML = "";
  data.piles.forEach((pile) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>🗑 ${pile.label} <em class="meta">· ${pile.count}개</em></span>
      <strong>${formatBytes(pile.reclaimBytes)}</strong>
    `;
    li.addEventListener("click", () => openPile(pile.id));
    list.appendChild(li);
  });

  const spaces = $("spaceList");
  spaces.innerHTML = "";
  (data.spaces || data.rooms).forEach((space) => {
    const used = space.used ?? 0;
    const total = space.total ?? 100;
    const ratio = Math.min(100, Math.round((used / total) * 100));
    const row = document.createElement("div");
    row.className = "space-row";
    row.innerHTML = `
      <span>${space.name}</span>
      <div class="bar"><i style="width:${ratio}%"></i></div>
      <span>${used}/${total}GB</span>
    `;
    spaces.appendChild(row);
  });

  renderTrashBags();
}

function openRoom(roomId) {
  const roomPile = buildRoomPile(roomId);
  if (!roomPile) {
    $("statusLine").textContent = `${ROOM_META[roomId].name}은 이미 깨끗해요`;
    return;
  }

  // temporarily attach as active synthetic pile
  state.activeRoomId = roomId;
  state.activePileId = roomPile.id;
  state._roomPile = roomPile;

  $("pileTitle").textContent = roomPile.label;
  $("pileReason").textContent = `쓰레기봉투 ${roomById(roomId)?.trashBags || 0}개 · 방 안 중복·방치 데이터`;
  $("pileGain").textContent = `+${formatBytes(roomPile.reclaimBytes)}`;

  const list = $("groupList");
  list.innerHTML = "";
  roomPile.groups.forEach((group) => {
    const div = document.createElement("div");
    div.className = "group";
    div.innerHTML = `
      <h3>${group.title}</h3>
      <p>${group.reason}</p>
      <p>확보 ${formatBytes(group.reclaimBytes)} · 파일 ${group.files.length}개</p>
    `;
    list.appendChild(div);
  });

  showView("Pile");
}

function getActivePile() {
  if (state.activePileId?.startsWith("room-")) return state._roomPile;
  return state.data.piles.find((p) => p.id === state.activePileId);
}

function openPile(pileId) {
  state.activePileId = pileId;
  state.activeRoomId = null;
  state._roomPile = null;
  const pile = state.data.piles.find((p) => p.id === pileId);
  if (!pile) return;

  $("pileTitle").textContent = pile.label;
  $("pileReason").textContent = `${pile.count}개 · 집 안 여러 방에 흩어진 쓰레기`;
  $("pileGain").textContent = `+${formatBytes(pile.reclaimBytes)}`;

  const list = $("groupList");
  list.innerHTML = "";
  pile.groups.forEach((group) => {
    const div = document.createElement("div");
    div.className = "group";
    div.innerHTML = `
      <h3>${group.title}</h3>
      <p>${group.reason}</p>
      <p>확보 ${formatBytes(group.reclaimBytes)} · 파일 ${group.files.length}개</p>
    `;
    list.appendChild(div);
  });

  showView("Pile");
}

function openReview() {
  const pile = getActivePile();
  if (!pile) return;

  state.selectedPaths = new Set();
  const allFiles = pile.groups.flatMap((g) => g.files);

  pile.groups.forEach((group) => {
    group.files.forEach((file, idx) => {
      if (group.kind === "duplicate") {
        if (idx > 0) state.selectedPaths.add(file.path);
      } else {
        state.selectedPaths.add(file.path);
      }
    });
  });

  const list = $("fileList");
  list.innerHTML = "";
  allFiles.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file";
    const checked = state.selectedPaths.has(file.path);
    const roomName = ROOM_META[file.room]?.name || file.room;
    row.innerHTML = `
      <label>
        <input type="checkbox" ${checked ? "checked" : ""} />
        <span>
          <strong>${file.name}</strong>
          <p>${file.sizeLabel || formatBytes(file.size)} · ${roomName}<br>${file.path}</p>
        </span>
      </label>
    `;
    const input = row.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) state.selectedPaths.add(file.path);
      else state.selectedPaths.delete(file.path);
      updateReviewTotals(allFiles);
    });
    list.appendChild(row);
  });

  updateReviewTotals(allFiles);
  showView("Review");
}

function updateReviewTotals(allFiles) {
  const selectedBytes = allFiles
    .filter((f) => state.selectedPaths.has(f.path))
    .reduce((s, f) => s + f.size, 0);
  $("reviewGain").textContent = `+${formatBytes(selectedBytes)}`;

  const plan = state.data.summary.plan;
  const after =
    plan.currentUsageBytes - Math.min(selectedBytes * 0.4, plan.currentUsageBytes);
  const can =
    after <= plan.freeTierBytes && plan.currentUsageBytes > plan.freeTierBytes;
  $("reviewPlan").textContent = can ? "연 36,000원 가능" : "절감 0원";
}

function applyCleanupToUi(allFiles, cleaned, deleteResult) {
  const pile = getActivePile();
  state.cleanedBytes += cleaned;

  if (pile && !pile.id.startsWith("room-")) {
    pile.reclaimBytes = Math.max(0, pile.reclaimBytes - cleaned);
    pile.count = Math.max(0, pile.count - state.selectedPaths.size);
  } else if (state.data?.piles?.length) {
    state.data.piles.forEach((p) => {
      p.reclaimBytes = Math.max(0, p.reclaimBytes - cleaned / state.data.piles.length);
    });
  }

  state.data.summary.totalReclaimBytes = Math.max(
    0,
    state.data.summary.totalReclaimBytes - cleaned
  );
  state.data.summary.duplicateBytes = Math.max(
    0,
    (state.data.summary.duplicateBytes || 0) - cleaned * 0.4
  );

  const targetRooms = state.activeRoomId
    ? [state.activeRoomId]
    : [...new Set(allFiles.map((f) => f.room))];

  state.data.rooms = state.data.rooms.map((room) => {
    if (!targetRooms.includes(room.id)) return room;
    return {
      ...room,
      cleanliness: Math.min(96, room.cleanliness + (cleaned > 0 ? 12 : 0)),
      trashBags: Math.max(0, room.trashBags - 2),
      dustyBoxes: Math.max(0, (room.dustyBoxes || 0) - 1),
    };
  });

  const clean = averageCleanliness(state.data.rooms);
  const failed = deleteResult?.failed || 0;
  $("doneClean").textContent = `청결도 → ${clean}% · 실제 정리 ${deleteResult?.deleted || 0}개`;
  $("resultList").innerHTML = `
    <li><span>치운 용량</span><strong>+${formatBytes(deleteResult?.bytes || cleaned)}</strong></li>
    <li><span>성공 / 실패</span><strong>${deleteResult?.deleted || 0} / ${failed}</strong></li>
    <li><span>로컬</span><strong>휴지통 이동</strong></li>
    <li><span>클라우드·메일</span><strong>API 삭제/휴지통</strong></li>
    <li><span>요금제 절감 가능</span><strong>${(state.data.summary.plan.directSavingKrw || 0).toLocaleString()}원</strong></li>
  `;

  renderHome();
  showView("Done");
}

async function completeCleanup() {
  const pile = getActivePile();
  if (!pile || state.deleting) return;

  const allFiles = pile.groups.flatMap((g) => g.files);
  const selected = allFiles.filter((f) => state.selectedPaths.has(f.path));
  if (!selected.length) {
    $("reviewHint").textContent = "정리할 파일을 선택하세요.";
    return;
  }

  // Demo paths like /laptop/... or placeholder cloud ids should simulate
  const isDemoSelection =
    state.data?.demo ||
    selected.every((f) => {
      if (f.source === "local") return !f.path.startsWith("/Users/") && !f.path.startsWith("/Volumes/");
      if (f.source === "gdrive" || f.source === "onedrive" || f.source === "gmail") {
        return !f.id || String(f.id).includes("/") || String(f.path).startsWith("/");
      }
      return true;
    });

  const cleaned = selected.reduce((s, f) => s + f.size, 0);
  const btn = $("btnDelete");
  state.deleting = true;
  btn.disabled = true;
  btn.textContent = "치우는 중…";

  try {
    if (isDemoSelection && state.data?.demo) {
      applyCleanupToUi(selected, cleaned, {
        deleted: selected.length,
        failed: 0,
        bytes: cleaned,
      });
      $("doneClean").textContent =
        ($("doneClean").textContent || "") + " · 데모 시뮬레이션";
      return;
    }

    const deleteResult = await window.digitalDiet.deleteFiles(
      selected.map((f) => ({
        source: f.source || "local",
        id: f.id,
        path: f.path,
        name: f.name,
        size: f.size,
      }))
    );

    if (!deleteResult?.ok && deleteResult?.deleted === 0) {
      $("reviewHint").textContent =
        deleteResult?.error ||
        deleteResult?.results?.[0]?.error ||
        "삭제에 실패했습니다. 연결/권한을 확인하세요.";
      return;
    }

    applyCleanupToUi(selected, deleteResult.bytes || cleaned, deleteResult);
  } catch (error) {
    $("reviewHint").textContent = String(error);
  } finally {
    state.deleting = false;
    btn.disabled = false;
    btn.textContent = "실제로 치우기";
  }
}

function setLoading(isLoading) {
  $("btnScan").disabled = isLoading;
  $("btnScan").textContent = isLoading ? "스캔 중…" : "내 공간 스캔";
  $("statusLine").textContent = isLoading
    ? "파일을 방으로 배치하는 중…"
    : $("statusLine").textContent;
}

function normalizeScanToHouse(result) {
  // Ensure phone room exists even if local scan didn't find phone paths
  const byId = new Map(result.rooms.map((r) => [r.id, r]));
  const rooms = ["desktop", "laptop", "phone", "cloud", "mail"].map((id) => {
    const existing = byId.get(id);
    if (existing) {
      return {
        ...existing,
        name: ROOM_META[id].name,
        trashBags: existing.trashBags ?? 1,
        usageRatio: 0.5,
      };
    }
    return {
      id,
      name: ROOM_META[id].name,
      cleanliness: 80,
      trashBags: 0,
      dustyBoxes: 0,
      bytesLabel: "연결 대기",
      usageRatio: 0.1,
    };
  });

  const spaces = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    used: Math.round((r.usageRatio || 0.4) * 100),
    total: 100,
  }));

  return {
    ...result,
    rooms,
    spaces,
    summary: {
      ...result.summary,
      plan: {
        ...result.summary.plan,
        directSavingKrw: result.summary.plan.canDowngrade ? 36000 : 0,
      },
    },
  };
}

async function scanLocal() {
  setLoading(true);
  $("statusLine").textContent = "로컬 스캔 중… (Czkawka BLAKE3)";
  try {
    const result = await window.digitalDiet.scanLocal({ limit: 1200 });
    if (!result?.ok) {
      $("statusLine").textContent = result?.error || "스캔 실패 · 데모를 사용하세요";
      return;
    }
    state.data = normalizeScanToHouse(result);
    state.data.piles = state.data.piles.map((pile) => ({
      ...pile,
      rooms: [
        ...new Set(pile.groups.flatMap((g) => g.files.map((f) => f.room))),
      ],
    }));
    const eng = result.engine?.duplicates || "node";
    const dup = result.piles?.find((p) => p.id === "duplicates");
    const gb = ((dup?.reclaimBytes || 0) / 1024 ** 3).toFixed(1);
    $("statusLine").textContent = `로컬 스캔 완료 · ${eng} · 중복 확보 가능 ≈ ${gb}GB`;
    renderHome();
    showView("Home");
  } catch (error) {
    $("statusLine").textContent = String(error);
  } finally {
    setLoading(false);
  }
}

async function scanCloud() {
  $("btnScanCloud").disabled = true;
  $("btnScanCloud").textContent = "클라우드 스캔 중…";
  $("statusLine").textContent = "Drive · OneDrive · Gmail 스캔 중";
  try {
    const result = await window.digitalDiet.scanCloud();
    if (!result?.ok) {
      $("statusLine").textContent = result?.error || "클라우드 스캔 실패";
      return;
    }
    if (result.errors?.length) {
      $("statusLine").textContent = result.errors.join(" · ");
    } else {
      $("statusLine").textContent = `클라우드 ${result.scannedFiles}개 후보 발견`;
    }
    state.data = {
      ...result,
      demo: false,
      piles: result.piles.length
        ? result.piles
        : [
            {
              id: "duplicates",
              kind: "duplicate",
              label: "중복 파일",
              count: 0,
              reclaimBytes: 0,
              rooms: ["cloud"],
              groups: [],
            },
          ],
    };
    renderHome();
    showView("Home");
  } catch (error) {
    $("statusLine").textContent = String(error);
  } finally {
    $("btnScanCloud").disabled = false;
    $("btnScanCloud").textContent = "클라우드 스캔";
  }
}

async function toggleGoogle() {
  if (state.connections.google) {
    await window.digitalDiet.disconnectGoogle();
  } else {
    if (!state.connections.config?.googleClientId) {
      openSettings();
      $("statusLine").textContent = "먼저 Google Client ID를 저장하세요";
      return;
    }
    $("statusLine").textContent = "브라우저에서 Google 로그인…";
    const res = await window.digitalDiet.connectGoogle();
    if (!res?.ok) {
      $("statusLine").textContent = res?.error || "Google 연결 실패";
    } else {
      $("statusLine").textContent = "Google Drive · Gmail 연결됨";
    }
  }
  await refreshConnections();
}

async function toggleMicrosoft() {
  if (state.connections.microsoft) {
    await window.digitalDiet.disconnectMicrosoft();
  } else {
    if (!state.connections.config?.microsoftClientId) {
      openSettings();
      $("statusLine").textContent = "먼저 Microsoft Client ID를 저장하세요";
      return;
    }
    $("statusLine").textContent = "브라우저에서 Microsoft 로그인…";
    const res = await window.digitalDiet.connectMicrosoft();
    if (!res?.ok) {
      $("statusLine").textContent = res?.error || "Microsoft 연결 실패";
    } else {
      $("statusLine").textContent = "OneDrive 연결됨";
    }
  }
  await refreshConnections();
}

function openSettings() {
  const cfg = state.connections.config || {};
  $("inputGoogleClient").value = cfg.googleClientId || "";
  $("inputMsClient").value = cfg.microsoftClientId || "";
  $("inputRealDelete").checked = cfg.realDeleteEnabled !== false;
  showView("Settings");
}

async function saveSettings() {
  await window.digitalDiet.saveConfig({
    googleClientId: $("inputGoogleClient").value.trim(),
    microsoftClientId: $("inputMsClient").value.trim(),
    realDeleteEnabled: $("inputRealDelete").checked,
  });
  await refreshConnections();
  $("statusLine").textContent = "설정 저장됨";
  showView("Home");
}

function bind() {
  $("btnClose").addEventListener("click", () => window.digitalDiet.hidePanel());
  $("btnDemo").addEventListener("click", () => {
    state.data = demoData();
    renderHome();
    showView("Home");
  });
  $("btnScan").addEventListener("click", scanLocal);
  $("btnScanCloud").addEventListener("click", scanCloud);
  $("btnCleanAll").addEventListener("click", () => {
    const first = state.data?.piles?.find((p) => p.reclaimBytes > 0);
    if (first) openPile(first.id);
    else $("statusLine").textContent = "정리할 쓰레기가 없습니다";
  });
  $("btnBackHome").addEventListener("click", () => showView("Home"));
  $("btnBackPile").addEventListener("click", () => showView("Pile"));
  $("btnReview").addEventListener("click", openReview);
  $("btnDelete").addEventListener("click", completeCleanup);
  $("btnKeep").addEventListener("click", () => showView("Home"));
  $("btnHome").addEventListener("click", () => showView("Home"));
  $("btnSettings").addEventListener("click", openSettings);
  $("btnBackFromSettings").addEventListener("click", () => showView("Home"));
  $("btnSaveSettings").addEventListener("click", saveSettings);
  $("btnGoogle").addEventListener("click", toggleGoogle);
  $("btnMicrosoft").addEventListener("click", toggleMicrosoft);
  $("linkGoogleConsole").addEventListener("click", () =>
    window.digitalDiet.openExternal("https://console.cloud.google.com/apis/credentials")
  );
  $("linkAzurePortal").addEventListener("click", () =>
    window.digitalDiet.openExternal(
      "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
    )
  );

  document.querySelectorAll(".room, .porch").forEach((el) => {
    el.addEventListener("click", () => openRoom(el.dataset.room));
  });
}

bind();
state.data = demoData();
refreshConnections().finally(() => {
  renderHome();
});
