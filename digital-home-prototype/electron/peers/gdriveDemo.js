/**
 * Demo Google Drive index when OAuth client id is missing.
 * Same contentKey as Mac fixture → proves cross-space match without downloading files.
 */
const DEMO_HASH = "blake3-demo-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function buildDemoDriveIndex(seedFromMac = []) {
  const seed =
    seedFromMac.find((e) => e.hash && e.size >= 256 * 1024) || null;
  const hash = seed?.hash || DEMO_HASH;
  const hashAlg = seed?.hashAlg || "blake3";
  const size = seed?.size || 897843200;
  const name = seed?.name
    ? `CHIC_${seed.name}`
    : "CHIC_발표최종(1).pdf";

  return [
    {
      source: "gdrive",
      path: `gdrive://demo/${name}`,
      name,
      size,
      hash,
      hashAlg,
      // Bridge key: demo uses same blake3 string as local fixture
      contentKey: `${hashAlg}:${hash}`,
      modified: "2026-07-13T00:00:00.000Z",
      room: "cloud",
      md5: null,
    },
  ];
}

const QUOTA = {
  usedBytes: 78 * 1024 ** 3,
  totalBytes: 100 * 1024 ** 3,
};

module.exports = { buildDemoDriveIndex, QUOTA };
