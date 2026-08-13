const store = require("./store");
const google = require("./providers/google");
const onedrive = require("./providers/onedrive");
const { formatBytes } = require("./scanner");

function toLabel(file) {
  return {
    ...file,
    sizeLabel: formatBytes(file.size || 0),
  };
}

function buildPilesFromCloud({ driveFiles, oneFiles, mailFiles }) {
  const byHash = new Map();
  for (const f of [...driveFiles, ...oneFiles]) {
    if (!f.md5) continue;
    if (!byHash.has(f.md5)) byHash.set(f.md5, []);
    byHash.get(f.md5).push(f);
  }

  const dupGroups = [];
  let duplicateBytes = 0;
  for (const [md5, group] of byHash.entries()) {
    if (group.length < 2) continue;
    const reclaim = group.slice(1).reduce((s, f) => s + f.size, 0);
    duplicateBytes += reclaim;
    dupGroups.push({
      id: `cloud-dup-${md5.slice(0, 10)}`,
      kind: "duplicate",
      title: group[0].name,
      reason: "클라우드 간 동일 해시(또는 Drive 중복)",
      reclaimBytes: reclaim,
      rooms: ["cloud"],
      files: group.map(toLabel),
    });
  }

  const bulky = [...driveFiles, ...oneFiles]
    .filter((f) => f.size >= 100 * 1024 * 1024)
    .sort((a, b) => b.size - a.size)
    .slice(0, 40)
    .map(toLabel);
  const bulkyBytes = bulky.reduce((s, f) => s + f.size, 0);

  const mail = mailFiles.map(toLabel);
  const mailBytes = mail.reduce((s, f) => s + f.size, 0);

  const piles = [];
  if (dupGroups.length) {
    piles.push({
      id: "duplicates",
      kind: "duplicate",
      label: "중복 파일",
      count: dupGroups.reduce((s, g) => s + g.files.length, 0),
      reclaimBytes: duplicateBytes,
      rooms: ["cloud"],
      groups: dupGroups,
    });
  } else if (driveFiles.length || oneFiles.length) {
    // still expose large cloud files under bulky/duplicates-ish
  }

  if (bulky.length) {
    piles.push({
      id: "bulky",
      kind: "bulky",
      label: "대용량 파일",
      count: bulky.length,
      reclaimBytes: bulkyBytes,
      rooms: ["cloud"],
      groups: [
        {
          id: "cloud-bulky",
          kind: "bulky",
          title: "클라우드 대용량 방치",
          reason: "100MB 이상 Drive/OneDrive 파일",
          reclaimBytes: bulkyBytes,
          files: bulky,
        },
      ],
    });
  }

  if (mail.length) {
    piles.push({
      id: "mail",
      kind: "mail",
      label: "오래된 메일 첨부",
      count: mail.length,
      reclaimBytes: mailBytes,
      rooms: ["mail"],
      groups: [
        {
          id: "gmail-old",
          kind: "mail",
          title: "1년+ 첨부 메일",
          reason: "Gmail에서 오래된 대용량 첨부 메일 (휴지통으로 이동)",
          reclaimBytes: mailBytes,
          files: mail,
        },
      ],
    });
  }

  const total = duplicateBytes + bulkyBytes + mailBytes;
  return {
    piles,
    summary: {
      totalReclaimBytes: total,
      localReclaimBytes: 0,
      cloudReclaimBytes: duplicateBytes + bulkyBytes + mailBytes,
      duplicateBytes,
      staleBytes: 0,
      bulkyBytes,
      plan: {
        currentUsageBytes: 0,
        afterUsageBytes: 0,
        freeTierBytes: 15 * 1024 ** 3,
        canDowngrade: false,
        directSavingKrw: 0,
        note: "클라우드 스캔 결과 기준 · 요금제 계산은 사용량 연결 후 표시",
      },
    },
  };
}

async function scanCloud() {
  const status = store.connectionStatus();
  const driveFiles = [];
  const oneFiles = [];
  const mailFiles = [];
  const errors = [];
  const quotas = {};

  if (status.google) {
    try {
      driveFiles.push(...(await google.listDriveCandidates({ max: 60 })));
      mailFiles.push(...(await google.listGmailAttachmentCandidates({ max: 25 })));
      quotas.google = await google.aboutStorage();
    } catch (e) {
      errors.push(`Google: ${e.message}`);
    }
  }

  if (status.microsoft) {
    try {
      oneFiles.push(...(await onedrive.listCandidates({ max: 60 })));
      quotas.microsoft = await onedrive.aboutStorage();
    } catch (e) {
      errors.push(`Microsoft: ${e.message}`);
    }
  }

  if (!status.google && !status.microsoft) {
    return {
      ok: false,
      error: "연결된 클라우드가 없습니다. Google 또는 Microsoft를 연결하세요.",
      piles: [],
      rooms: [],
      spaces: [],
      summary: null,
    };
  }

  const built = buildPilesFromCloud({ driveFiles, oneFiles, mailFiles });

  const gUsage = quotas.google?.usage || 0;
  const gLimit = quotas.google?.limit || 15 * 1024 ** 3;
  const oUsage = quotas.microsoft?.usage || 0;
  const oLimit = quotas.microsoft?.limit || 5 * 1024 ** 3;

  if (quotas.google?.usage != null) {
    const after = Math.max(0, gUsage - built.summary.cloudReclaimBytes * 0.5);
    built.summary.plan = {
      currentUsageBytes: gUsage,
      afterUsageBytes: after,
      freeTierBytes: 15 * 1024 ** 3,
      canDowngrade: gUsage > 15 * 1024 ** 3 && after <= 15 * 1024 ** 3,
      directSavingKrw:
        gUsage > 15 * 1024 ** 3 && after <= 15 * 1024 ** 3 ? 36000 : 0,
      note:
        gUsage > 15 * 1024 ** 3 && after <= 15 * 1024 ** 3
          ? "정리 후 Google 무료 구간 진입 가능(용량 목적 구독 가정)"
          : "요금제 경계 미달 또는 무료 구간 유지",
    };
  }

  const rooms = [
    {
      id: "desktop",
      name: "데스크톱룸",
      cleanliness: 80,
      trashBags: 0,
      dustyBoxes: 0,
      bytesLabel: "로컬 스캔 필요",
    },
    {
      id: "laptop",
      name: "노트북룸",
      cleanliness: 80,
      trashBags: 0,
      dustyBoxes: 0,
      bytesLabel: "로컬 스캔 필요",
    },
    {
      id: "phone",
      name: "핸드폰룸",
      cleanliness: 85,
      trashBags: 0,
      dustyBoxes: 0,
      bytesLabel: "연결 대기",
    },
    {
      id: "cloud",
      name: "클라우드룸",
      cleanliness: Math.max(
        20,
        90 - Math.min(60, Math.round(built.summary.cloudReclaimBytes / (1024 ** 3)))
      ),
      trashBags: Math.min(
        8,
        (built.piles.find((p) => p.id === "duplicates")?.groups.length || 0) +
          (built.piles.find((p) => p.id === "bulky") ? 2 : 0)
      ),
      dustyBoxes: 1,
      bytesLabel: `${formatBytes(gUsage + oUsage)}`,
    },
    {
      id: "mail",
      name: "메일함",
      cleanliness: mailFiles.length ? 45 : 88,
      trashBags: mailFiles.length ? Math.min(5, Math.ceil(mailFiles.length / 5)) : 0,
      dustyBoxes: mailFiles.length ? 1 : 0,
      bytesLabel: formatBytes(mailFiles.reduce((s, f) => s + f.size, 0)),
    },
  ];

  const spaces = [
    {
      id: "gdrive",
      name: "Google Drive",
      used: Math.round(gUsage / 1024 ** 3),
      total: Math.max(1, Math.round(gLimit / 1024 ** 3)),
    },
    {
      id: "onedrive",
      name: "OneDrive",
      used: Math.round(oUsage / 1024 ** 3),
      total: Math.max(1, Math.round(oLimit / 1024 ** 3)),
    },
    {
      id: "mail",
      name: "Gmail",
      used: Math.round(mailFiles.reduce((s, f) => s + f.size, 0) / 1024 ** 3),
      total: 15,
    },
  ];

  return {
    ok: true,
    cloud: true,
    scannedAt: new Date().toISOString(),
    scannedFiles: driveFiles.length + oneFiles.length + mailFiles.length,
    rooms,
    spaces,
    piles: built.piles,
    summary: built.summary,
    quotas,
    errors,
  };
}

module.exports = { scanCloud };
