const path = require("path");
const { shell } = require("electron");
const store = require("./store");
const google = require("./providers/google");
const onedrive = require("./providers/onedrive");

function isLocalPath(filePath) {
  if (!filePath) return false;
  return (
    filePath.startsWith("/") ||
    /^[A-Za-z]:\\/.test(filePath) ||
    filePath.startsWith("file:")
  );
}

async function deleteOne(file) {
  const source = file.source || (isLocalPath(file.path) ? "local" : "unknown");

  if (source === "local" || (source === "unknown" && isLocalPath(file.path))) {
    const target = file.path.startsWith("file:")
      ? file.path.replace("file://", "")
      : file.path;
    // macOS: move to Trash (recoverable)
    await shell.trashItem(path.normalize(target));
    return { ok: true, source: "local", id: target };
  }

  if (source === "gdrive") {
    await google.deleteDriveFile(file.id);
    return { ok: true, source: "gdrive", id: file.id };
  }

  if (source === "onedrive") {
    await onedrive.deleteFile(file.id);
    return { ok: true, source: "onedrive", id: file.id };
  }

  if (source === "gmail") {
    await google.trashGmailMessage(file.id);
    return { ok: true, source: "gmail", id: file.id };
  }

  throw new Error(`지원하지 않는 삭제 대상: ${source}`);
}

async function deleteFiles(files = []) {
  if (!store.getConfig().realDeleteEnabled) {
    return {
      ok: false,
      error: "실제 삭제가 비활성화되어 있습니다.",
      results: [],
    };
  }

  const results = [];
  let bytes = 0;

  for (const file of files) {
    try {
      const r = await deleteOne(file);
      results.push({ ...r, name: file.name, size: file.size || 0 });
      bytes += file.size || 0;
    } catch (error) {
      results.push({
        ok: false,
        name: file.name,
        path: file.path,
        error: error.message || String(error),
      });
    }
  }

  return {
    ok: results.some((r) => r.ok),
    deleted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    bytes,
    results,
  };
}

module.exports = { deleteFiles, deleteOne };
