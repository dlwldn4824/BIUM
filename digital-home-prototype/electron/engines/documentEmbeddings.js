/**
 * Local document-content similarity:
 * Apache Tika extracts text, multilingual MiniLM produces SBERT embeddings.
 * No document body or embedding is sent to BIUM servers.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const SUPPORTED_RE = /\.(pdf|docx?|pptx?|xlsx?|odt|ods|odp|rtf|txt|md)$/i;
const TIKA_JAR = "tika-app-3.3.2.jar";
let extractorPromise = null;

function tikaCandidates(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.BIUM_TIKA_JAR) candidates.push(process.env.BIUM_TIKA_JAR);
  if (process.resourcesPath) {
    candidates.push(
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "vendor",
        "tika",
        TIKA_JAR
      ),
      path.join(process.resourcesPath, "vendor", "tika", TIKA_JAR)
    );
  }
  candidates.push(
    path.join(__dirname, "..", "..", "vendor", "tika", TIKA_JAR)
  );
  return candidates;
}

function resolveTikaJar(explicit) {
  return tikaCandidates(explicit).find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || null;
}

function javaBinary() {
  if (process.env.JAVA_HOME) {
    const binary = path.join(
      process.env.JAVA_HOME,
      "bin",
      process.platform === "win32" ? "java.exe" : "java"
    );
    if (fs.existsSync(binary)) return binary;
  }
  return "java";
}

function cleanText(value, maxChars = 24_000) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

async function extractText(filePath, options = {}) {
  const jar = resolveTikaJar(options.tikaJar);
  if (!jar) throw new Error("Apache Tika JAR를 찾지 못했어요");
  const { stdout } = await execFileAsync(
    javaBinary(),
    ["-jar", jar, "--text", filePath],
    {
      timeout: options.timeoutMs ?? 20_000,
      maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
      windowsHide: true,
    }
  );
  return cleanText(stdout, options.maxChars);
}

function sampleChunks(text, { chunkChars = 700, maxChunks = 5 } = {}) {
  const value = cleanText(text);
  if (!value) return [];
  if (value.length <= chunkChars) return [value];
  const count = Math.min(maxChunks, Math.ceil(value.length / chunkChars));
  const maxStart = Math.max(0, value.length - chunkChars);
  return Array.from({ length: count }, (_, index) => {
    const start =
      count === 1 ? 0 : Math.round((maxStart * index) / (count - 1));
    return value.slice(start, start + chunkChars);
  });
}

async function getExtractor(options = {}) {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir =
        options.cacheDir ||
        process.env.BIUM_MODEL_CACHE ||
        path.join(os.homedir(), ".bium", "models");
      env.allowRemoteModels = true;
      return pipeline("feature-extraction", options.modelId || MODEL_ID, {
        dtype: options.dtype || "q8",
      });
    })().catch((error) => {
      extractorPromise = null;
      throw error;
    });
  }
  return extractorPromise;
}

function normalizeVector(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => value / norm);
}

function meanVectors(vectors) {
  if (!vectors.length) return [];
  const mean = Array(vectors[0].length).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < vector.length; i += 1) mean[i] += vector[i];
  }
  return normalizeVector(mean.map((value) => value / vectors.length));
}

async function embedTexts(documents, options = {}) {
  const extractor = await getExtractor(options);
  const chunks = [];
  const owners = [];
  documents.forEach((document, docIndex) => {
    for (const chunk of sampleChunks(document.text, options)) {
      chunks.push(chunk);
      owners.push(docIndex);
    }
  });
  if (!chunks.length) return documents.map(() => []);

  const output = await extractor(chunks, {
    pooling: "mean",
    normalize: true,
  });
  const chunkVectors = output.tolist();
  const grouped = documents.map(() => []);
  chunkVectors.forEach((vector, index) => grouped[owners[index]].push(vector));
  return grouped.map(meanVectors);
}

function cosineSimilarity(left, right) {
  if (!left?.length || left.length !== right?.length) return 0;
  let score = 0;
  for (let i = 0; i < left.length; i += 1) score += left[i] * right[i];
  return Math.max(-1, Math.min(1, score));
}

function placeLabel(filePath) {
  const home = os.homedir();
  if (!filePath) return "Local";
  const relative = filePath.startsWith(home)
    ? filePath.slice(home.length).replace(/^[/\\]/, "")
    : filePath;
  return relative.split(path.sep).filter(Boolean).slice(0, 2).join(" / ") || "Local";
}

function clusterEmbeddings(documents, vectors, minSimilarity = 0.8) {
  const clusters = [];
  documents.forEach((document, index) => {
    const vector = vectors[index];
    if (!vector?.length) return;
    let bestCluster = null;
    let bestAverage = -1;
    for (const cluster of clusters) {
      const scores = cluster.map((member) =>
        cosineSimilarity(vector, vectors[member])
      );
      if (scores.some((score) => score < minSimilarity)) continue;
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      if (average > bestAverage) {
        bestCluster = cluster;
        bestAverage = average;
      }
    }
    if (bestCluster) bestCluster.push(index);
    else clusters.push([index]);
  });

  return clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster, groupIndex) => {
      let similarity = 1;
      for (let i = 0; i < cluster.length; i += 1) {
        for (let j = i + 1; j < cluster.length; j += 1) {
          similarity = Math.min(
            similarity,
            cosineSimilarity(vectors[cluster[i]], vectors[cluster[j]])
          );
        }
      }
      const files = cluster.map((index) => {
        const entry = documents[index].entry;
        return {
          name: entry.name || path.basename(entry.path),
          path: entry.path,
          place: entry.place || entry.deviceLabel || placeLabel(entry.path),
          size:
            entry.sizeLabel ||
            (entry.size ? `${Math.max(1, Math.round(entry.size / 1024 ** 2))}MB` : ""),
          modified: entry.modified || null,
        };
      });
      return {
        id: `doc-embed-${groupIndex}-${String(files[0]?.name || "doc")
          .replace(/\W+/g, "")
          .slice(0, 12)}`,
        kind: "similar-doc",
        confidence: similarity >= 0.9 ? "high" : "medium",
        title: `본문이 비슷한 문서 ${files.length}개`,
        reason: `Tika 본문 추출 · SBERT 코사인 유사도 약 ${Math.round(similarity * 100)}%`,
        similarity,
        count: files.length,
        reclaimBytes: 0,
        actions: ["compare", "gather", "keep"],
        files,
        source: "tika-sbert",
        engine: "apache-tika+multilingual-minilm",
        embeddingModel: MODEL_ID,
      };
    });
}

async function buildContentGroups(entries, options = {}) {
  const maxDocs = options.maxDocs ?? 16;
  const maxFileSize = options.maxFileSize ?? 80 * 1024 * 1024;
  const candidates = (entries || [])
    .filter((entry) => {
      const filePath = String(entry.path || "");
      const name = entry.name || path.basename(filePath);
      return (
        filePath &&
        SUPPORTED_RE.test(name) &&
        fs.existsSync(filePath) &&
        (!entry.size || entry.size <= maxFileSize)
      );
    })
    .slice(0, maxDocs);

  const documents = [];
  const errors = [];
  for (const entry of candidates) {
    try {
      const text = await extractText(entry.path, options);
      if (text.length >= (options.minTextChars ?? 80)) {
        documents.push({ entry, text });
      }
    } catch (error) {
      errors.push({ path: entry.path, error: error.message || String(error) });
    }
  }
  if (documents.length < 2) {
    return {
      ok: true,
      source: "tika-sbert",
      groups: [],
      extractedCount: documents.length,
      errors,
    };
  }

  const vectors = await embedTexts(documents, options);
  return {
    ok: true,
    source: "tika-sbert",
    groups: clusterEmbeddings(
      documents,
      vectors,
      options.minSimilarity ?? 0.8
    ),
    extractedCount: documents.length,
    model: options.modelId || MODEL_ID,
    errors,
  };
}

module.exports = {
  MODEL_ID,
  SUPPORTED_RE,
  resolveTikaJar,
  extractText,
  sampleChunks,
  cosineSimilarity,
  clusterEmbeddings,
  buildContentGroups,
};
