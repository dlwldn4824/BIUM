/**
 * Similar-document "review candidates" — filename heuristics (+ optional fixture).
 * Not deletion-safe: confidence is always "review".
 * Future: Apache Tika extract → Sentence Transformers cosine similarity.
 */
const fs = require("fs");
const path = require("path");
const { explainGroups } = require("./explainCandidate");

const VERSION_RE =
  /(최종|진짜최종|수정본|복사본|copy|final|v\d+|_\d+)$/i;

function fixturePath() {
  return path.join(__dirname, "..", "..", "fixtures", "similar-docs.sample.json");
}

function loadFixture() {
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath(), "utf8"));
    return Array.isArray(raw.groups) ? raw.groups : [];
  } catch {
    return [];
  }
}

function normalizeStem(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[\s_\-()]+/g, "")
    .replace(VERSION_RE, "")
    .replace(/(최종|진짜|수정|복사|copy|final)+$/gi, "");
}

/**
 * Lightweight filename clustering for local paths (optional boost).
 * @param {Array<{ name?: string, path?: string, size?: number }>} entries
 */
function clusterByFilename(entries) {
  const byStem = new Map();
  for (const e of entries || []) {
    const name = e.name || path.basename(String(e.path || ""));
    if (!/\.(pptx?|docx?|pdf|key)$/i.test(name)) continue;
    const stem = normalizeStem(name);
    if (stem.length < 4) continue;
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push({
      name,
      place: e.place || e.deviceLabel || "Local",
      size: e.sizeLabel || (e.size ? `${Math.round(e.size / 1024 ** 2)}MB` : ""),
      modified: e.modified || null,
      path: e.path,
    });
  }
  const groups = [];
  for (const [, files] of byStem) {
    if (files.length < 2) continue;
    groups.push({
      id: `doc-fn-${normalizeStem(files[0].name).slice(0, 12)}`,
      kind: "similar-doc",
      confidence: "review",
      title: `비슷한 문서 ${files.length}개`,
      reason: "완전히 같은 파일은 아니에요. 버전 파일일 가능성이 높아요.",
      similarity: 0.86,
      count: files.length,
      reclaimBytes: 0,
      actions: ["compare", "gather", "keep"],
      files,
      source: "filename-heuristic",
    });
  }
  return groups;
}

/**
 * @param {{
 *   entries?: object[],
 *   useFixture?: boolean,
 *   preferHeuristic?: boolean,
 * }} [opts]
 */
async function build(opts = {}) {
  const heuristic = clusterByFilename(opts.entries || []);
  let groups = [];
  let source = "skipped";

  if (opts.preferHeuristic) {
    // Cheap path: filename stems first; fixture only if nothing found & allowed
    groups = heuristic.map((g) => ({
      ...g,
      kind: "similar-doc",
      confidence: "review",
      actions: g.actions || ["compare", "gather", "keep"],
    }));
    source = heuristic.length ? "filename-heuristic" : "empty";
    if (!groups.length && opts.useFixture) {
      groups = loadFixture().map((g) => ({
        ...g,
        kind: "similar-doc",
        confidence: "review",
        actions: g.actions || ["compare", "gather", "keep"],
      }));
      source = groups.length ? "fixture" : "empty";
    }
  } else {
    groups = loadFixture().map((g) => ({
      ...g,
      kind: "similar-doc",
      confidence: "review",
      actions: g.actions || ["compare", "gather", "keep"],
    }));
    const titles = new Set(groups.map((g) => g.title));
    for (const h of heuristic) {
      if (!titles.has(h.title)) groups.push(h);
    }
    source = heuristic.length ? "fixture+heuristic" : "fixture";
  }

  const explained = await explainGroups(groups);
  return {
    ok: true,
    source,
    groups: explained,
    pile: {
      id: "similar-docs",
      kind: "similar-doc",
      label: "비슷한 문서",
      count: explained.reduce((s, g) => s + (g.count || g.files?.length || 0), 0),
      reclaimBytes: 0,
      groups: explained,
    },
  };
}

module.exports = { build, loadFixture, clusterByFilename, normalizeStem };
