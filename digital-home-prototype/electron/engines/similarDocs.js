/**
 * Similar-document review candidates:
 * Tika + SBERT content similarity, with fuzzy filename fallback.
 * Similarity is not deletion-safe, so every result remains user-reviewed.
 */
const fs = require("fs");
const path = require("path");
const { explainGroups } = require("./explainCandidate");
const { buildContentGroups } = require("./documentEmbeddings");

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

function bigrams(value) {
  const chars = Array.from(String(value || ""));
  if (chars.length < 2) return chars;
  const out = [];
  for (let i = 0; i < chars.length - 1; i += 1) {
    out.push(`${chars[i]}${chars[i + 1]}`);
  }
  return out;
}

/** Sørensen–Dice similarity for Latin and Korean filenames. */
function filenameSimilarity(a, b) {
  const left = normalizeStem(a);
  const right = normalizeStem(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftPairs = bigrams(left);
  const rightCounts = new Map();
  for (const pair of bigrams(right)) {
    rightCounts.set(pair, (rightCounts.get(pair) || 0) + 1);
  }
  let matches = 0;
  for (const pair of leftPairs) {
    const count = rightCounts.get(pair) || 0;
    if (!count) continue;
    matches += 1;
    rightCounts.set(pair, count - 1);
  }
  return (2 * matches) / (leftPairs.length + bigrams(right).length);
}

/**
 * Lightweight filename clustering for local paths (optional boost).
 * @param {Array<{ name?: string, path?: string, size?: number }>} entries
 */
function clusterByFilename(
  entries,
  { minSimilarity = 0.8, allFileTypes = false } = {}
) {
  const candidates = [];
  for (const e of entries || []) {
    const name = e.name || path.basename(String(e.path || ""));
    if (!allFileTypes && !/\.(pptx?|docx?|pdf|key)$/i.test(name)) continue;
    const stem = normalizeStem(name);
    if (stem.length < 4) continue;
    candidates.push({
      name,
      stem,
      place: e.place || e.deviceLabel || "Local",
      size: e.sizeLabel || (e.size ? `${Math.round(e.size / 1024 ** 2)}MB` : ""),
      modified: e.modified || null,
      path: e.path,
    });
  }

  // Complete-link grouping prevents transitive chains where endpoints are <80%.
  const clusters = [];
  for (const file of candidates) {
    let best = null;
    let bestAverage = -1;
    for (const cluster of clusters) {
      const scores = cluster.map((member) =>
        filenameSimilarity(file.name, member.name)
      );
      if (scores.some((score) => score < minSimilarity)) continue;
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      if (average > bestAverage) {
        best = cluster;
        bestAverage = average;
      }
    }
    if (best) best.push(file);
    else clusters.push([file]);
  }

  const groups = [];
  for (const files of clusters) {
    if (files.length < 2) continue;
    let similarity = 1;
    for (let i = 0; i < files.length; i += 1) {
      for (let j = i + 1; j < files.length; j += 1) {
        similarity = Math.min(
          similarity,
          filenameSimilarity(files[i].name, files[j].name)
        );
      }
    }
    groups.push({
      id: `doc-fn-${normalizeStem(files[0].name).slice(0, 12)}`,
      kind: "similar-doc",
      confidence: "review",
      title: allFileTypes
        ? `제목이 비슷한 파일 ${files.length}개`
        : `제목이 비슷한 문서 ${files.length}개`,
      reason: `제목 유사도 약 ${Math.round(similarity * 100)}% · 같은 파일인지 내용을 확인해 주세요.`,
      similarity,
      count: files.length,
      reclaimBytes: 0,
      actions: ["compare", "gather", "keep"],
      files: files.map(({ stem, ...file }) => file),
      source: "title-heuristic",
      matchBasis: "filename",
    });
  }
  return groups;
}

/**
 * @param {{
 *   entries?: object[],
 *   useFixture?: boolean,
 *   preferHeuristic?: boolean,
 *   minSimilarity?: number,
 *   useEmbeddings?: boolean,
 *   maxEmbeddingDocs?: number,
 *   allFileTypes?: boolean,
 * }} [opts]
 */
async function build(opts = {}) {
  const heuristic = clusterByFilename(opts.entries || [], {
    minSimilarity: opts.minSimilarity ?? 0.8,
    allFileTypes: opts.allFileTypes === true,
  });
  let contentGroups = [];
  let embedding = null;
  if (opts.useEmbeddings !== false) {
    try {
      embedding = await buildContentGroups(opts.entries || [], {
        minSimilarity: opts.minSimilarity ?? 0.8,
        maxDocs: opts.maxEmbeddingDocs ?? 16,
        tikaJar: opts.tikaJar,
        modelId: opts.modelId,
        cacheDir: opts.cacheDir,
      });
      contentGroups = embedding.groups || [];
    } catch (error) {
      embedding = {
        ok: false,
        source: "tika-sbert",
        groups: [],
        error: error.message || String(error),
      };
    }
  }

  const embeddedPaths = new Set(
    contentGroups.flatMap((group) =>
      (group.files || []).map((file) => file.path).filter(Boolean)
    )
  );
  const nonDuplicateHeuristic = heuristic.filter((group) => {
    const overlap = (group.files || []).filter((file) =>
      embeddedPaths.has(file.path)
    ).length;
    return overlap < 2;
  });
  let groups = [];
  let source = "skipped";

  if (opts.preferHeuristic) {
    groups = [...contentGroups, ...nonDuplicateHeuristic].map((g) => ({
      ...g,
      kind: "similar-doc",
      confidence: g.confidence || "review",
      actions: g.actions || ["compare", "gather", "keep"],
    }));
    source = contentGroups.length
      ? nonDuplicateHeuristic.length
        ? "tika-sbert+title-heuristic"
        : "tika-sbert"
      : nonDuplicateHeuristic.length
        ? "title-heuristic"
        : embedding?.error
          ? "embedding-fallback-empty"
          : "empty";
    if (!groups.length && opts.useFixture) {
      groups = loadFixture().map((g) => ({
        ...g,
        kind: "similar-doc",
        confidence: g.confidence || "review",
        actions: g.actions || ["compare", "gather", "keep"],
      }));
      source = groups.length ? "fixture" : "empty";
    }
  } else {
    groups = [...contentGroups, ...loadFixture()].map((g) => ({
      ...g,
      kind: "similar-doc",
      confidence: g.confidence || "review",
      actions: g.actions || ["compare", "gather", "keep"],
    }));
    const titles = new Set(groups.map((g) => g.title));
    for (const h of nonDuplicateHeuristic) {
      if (!titles.has(h.title)) groups.push(h);
    }
    source = contentGroups.length
      ? "tika-sbert+fixture+heuristic"
      : heuristic.length
        ? "fixture+heuristic"
        : "fixture";
  }

  const explained = await explainGroups(groups);
  return {
    ok: true,
    source,
    embedding,
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

module.exports = {
  build,
  loadFixture,
  clusterByFilename,
  normalizeStem,
  filenameSimilarity,
};
