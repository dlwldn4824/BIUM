#!/usr/bin/env node
/** Quick CLI: run local duplicate scan (Czkawka if present). */
const path = require("path");
const { scanLocalLibrary } = require("../electron/scanner");
const { resolveBinary } = require("../electron/engines/czkawka");

async function main() {
  const bin = resolveBinary();
  console.log("czkawka_cli:", bin || "(missing — Node fallback)");
  console.log("scanning…");
  const t0 = Date.now();
  const result = await scanLocalLibrary({
    engine: process.env.BIUM_SCAN_ENGINE || "auto",
    minFileSize: Number(process.env.BIUM_MIN_SIZE || 256 * 1024),
    timeoutMs: 300000,
  });
  const ms = Date.now() - t0;
  if (!result.ok) {
    console.error("FAIL", result.error);
    process.exit(1);
  }
  const dup = result.piles.find((p) => p.id === "duplicates");
  console.log(
    JSON.stringify(
      {
        ms,
        engine: result.engine,
        scannedFiles: result.scannedFiles,
        duplicateGroups: dup?.groups?.length || 0,
        duplicateFiles: dup?.count || 0,
        reclaimBytes: dup?.reclaimBytes || 0,
        top: (dup?.groups || []).slice(0, 5).map((g) => ({
          title: g.title,
          files: g.files.length,
          reclaim: g.reclaimBytes,
          paths: g.files.map((f) => f.path),
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
