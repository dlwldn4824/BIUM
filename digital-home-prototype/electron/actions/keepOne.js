/**
 * Keep-selected executor — leave chosen copies, trash the rest.
 * Local → ~/.Trash · Drive → API trashed:true (requires write OAuth scope).
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const store = require("../store");

function parseDriveFileId(pathOrId) {
  const s = String(pathOrId || "");
  const m = s.match(/^gdrive:\/\/([^/]+)/i);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && !s.includes("/") && !s.includes(":")) {
    return s;
  }
  return null;
}

async function trashLocal(filePath) {
  const trashDir = path.join(os.homedir(), ".Trash");
  await fsp.mkdir(trashDir, { recursive: true });
  const base = path.basename(filePath);
  let dest = path.join(trashDir, base);
  if (fs.existsSync(dest)) {
    const stamp = Date.now();
    dest = path.join(trashDir, `${stamp}-${base}`);
  }
  await fsp.rename(filePath, dest);
  return { ok: true, dest };
}

function normalizeKeepPaths(payload = {}) {
  const fromList = Array.isArray(payload.keepPaths)
    ? payload.keepPaths.map((p) => String(p || "")).filter(Boolean)
    : [];
  if (fromList.length) return [...new Set(fromList)];
  const one = String(payload.keepPath || "");
  return one ? [one] : [];
}

/**
 * @param {{
 *   keepPath?: string,
 *   keepPaths?: string[],
 *   files: Array<{ path?: string, deviceId?: string, source?: string, name?: string }>
 * }} payload
 */
async function executeKeepOne(payload = {}) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const keepPaths = normalizeKeepPaths(payload);
  const keepSet = new Set(keepPaths);

  if (!keepPaths.length || files.length < 2) {
    return {
      ok: false,
      error: "남길 위치와 사본 목록이 필요해요",
      trashed: [],
      skipped: [],
      errors: [],
    };
  }

  const kept = files.filter((f) => f?.path && keepSet.has(f.path));
  if (!kept.length) {
    return {
      ok: false,
      error: "선택한 남길 위치를 찾지 못했어요",
      trashed: [],
      skipped: [],
      errors: [],
    };
  }

  // Nothing to delete — user kept every copy
  const trashTargets = files.filter((f) => f?.path && !keepSet.has(f.path));
  if (!trashTargets.length) {
    return {
      ok: true,
      kept: kept.map((f) => ({
        path: f.path,
        deviceId: f.deviceId,
        name: f.name,
      })),
      trashed: [],
      skipped: [],
      errors: [],
      message: "선택한 위치를 모두 남겨 두었어요",
    };
  }

  const trashed = [];
  const skipped = [];
  const errors = [];
  const hasGoogle = !!store.getToken("google");
  let google = null;
  if (hasGoogle) {
    try {
      google = require("../providers/google");
    } catch {
      google = null;
    }
  }

  for (const f of trashTargets) {
    const p = f.path;
    const driveId =
      parseDriveFileId(p) ||
      (f.deviceId === "gdrive" || f.source === "gdrive"
        ? parseDriveFileId(p)
        : null);

    try {
      if (f.deviceId === "gdrive" || f.source === "gdrive" || driveId) {
        const id = driveId || parseDriveFileId(p);
        if (!id) {
          skipped.push({ path: p, reason: "drive-id-missing" });
          continue;
        }
        if (!google) {
          skipped.push({
            path: p,
            reason: "oauth-required",
            message: "Drive 사본을 지우려면 Google 계정을 연결해 주세요",
          });
          continue;
        }
        await google.trashDriveFile(id);
        trashed.push({ path: p, deviceId: "gdrive", ok: true });
        continue;
      }

      if (
        f.deviceId === "windows-peer" ||
        f.source === "lan-peer" ||
        f.source === "windows-stub"
      ) {
        skipped.push({ path: p, reason: "remote-peer" });
        continue;
      }

      if (
        f.deviceId === "naver-mail" ||
        f.source === "naver-imap" ||
        String(p).startsWith("naver:")
      ) {
        skipped.push({
          path: p,
          reason: "naver-mail-readonly",
          message:
            "네이버 첨부는 후보만 보여요. 메일함에서 직접 정리해 주세요",
        });
        continue;
      }

      if (!fs.existsSync(p)) {
        skipped.push({ path: p, reason: "missing" });
        continue;
      }

      await trashLocal(p);
      trashed.push({
        path: p,
        deviceId: f.deviceId || "mac-local",
        ok: true,
      });
    } catch (err) {
      errors.push({ path: p, error: err.message || String(err) });
    }
  }

  const keepN = kept.length;
  return {
    ok: errors.length === 0,
    kept: kept.map((f) => ({
      path: f.path,
      deviceId: f.deviceId,
      name: f.name,
    })),
    keepPaths,
    trashed,
    skipped,
    errors,
    message:
      errors.length === 0
        ? `${keepN}곳에 남기고 ${trashed.length}개 사본을 정리했어요`
        : `일부 사본을 정리하지 못했어요 (${errors.length})`,
  };
}

module.exports = {
  executeKeepOne,
  parseDriveFileId,
  trashLocal,
  normalizeKeepPaths,
};
