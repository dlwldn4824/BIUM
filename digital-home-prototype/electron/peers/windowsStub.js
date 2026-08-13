/**
 * Windows Local Agent peer — hackathon stub.
 * Real product: separate Windows app pushes the same index JSON over the network.
 * Demo: injects D: paths that share contentKey with Mac/Drive entries.
 */
const DEMO_HASH = "blake3-demo-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEMO_SIZE = 897843200; // ~856MB — matches fixture

function buildWindowsIndex(seedFromMac = []) {
  // Prefer mirroring a real Mac hash so cross-device hard-match works
  const seed =
    seedFromMac.find((e) => e.hash && e.size >= 256 * 1024) || null;
  const hash = seed?.hash || DEMO_HASH;
  const hashAlg = seed?.hashAlg || "blake3";
  const size = seed?.size || DEMO_SIZE;
  const baseName = (seed?.name || "CHIC_final.mp4").replace(/\.[^.]+$/, "");

  return [
    {
      source: "windows-peer",
      path: `D:/Backup/${baseName} (1).pdf`,
      name: `${baseName} (1).pdf`,
      size,
      hash,
      hashAlg,
      contentKey: `${hashAlg}:${hash}`,
      modified: "2026-06-01T00:00:00.000Z",
      room: "desktop",
    },
    {
      source: "windows-peer",
      path: "D:/Projects/archive/vacation copy.mov",
      name: "vacation copy.mov",
      size: 52428800,
      hash: "blake3-demo-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      hashAlg: "blake3",
      contentKey: "blake3:blake3-demo-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      modified: "2025-11-01T00:00:00.000Z",
      room: "desktop",
    },
  ];
}

const QUOTA = {
  usedBytes: 421 * 1024 ** 3,
  totalBytes: 1024 * 1024 ** 3,
};

module.exports = { buildWindowsIndex, QUOTA, DEMO_HASH, DEMO_SIZE };
