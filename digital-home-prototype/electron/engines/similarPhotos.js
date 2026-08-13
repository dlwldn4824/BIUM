/**
 * Near-duplicate photo stacking — hackathon: fixture (+ future imagededup / Czkawka hook).
 */
const fs = require("fs");
const path = require("path");
const { explainGroups } = require("./explainCandidate");

function fixturePath() {
  return path.join(__dirname, "..", "..", "fixtures", "similar-photos.sample.json");
}

function loadFixture() {
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath(), "utf8"));
    return Array.isArray(raw.groups) ? raw.groups : [];
  } catch {
    return [];
  }
}

/**
 * @param {{ useFixture?: boolean }} [opts]
 */
async function build(opts = {}) {
  // Hook point: spawn imagededup / czkawka similar-image when available.
  // For now always seed demo stacks so Mini can show the 3-tier story.
  void opts;
  const groups = loadFixture().map((g) => ({
    ...g,
    kind: "similar-photo",
    confidence: g.confidence || "high",
    keepOptions: g.keepOptions || [1, 3, "all"],
  }));
  const explained = await explainGroups(groups);
  const reclaimBytes = explained.reduce((s, g) => s + (g.reclaimBytes || 0), 0);
  return {
    ok: true,
    source: "fixture",
    groups: explained,
    reclaimBytes,
    pile: {
      id: "similar-photos",
      kind: "similar-photo",
      label: "비슷한 사진",
      count: explained.reduce((s, g) => s + (g.count || g.files?.length || 0), 0),
      reclaimBytes,
      groups: explained,
    },
  };
}

module.exports = { build, loadFixture };
