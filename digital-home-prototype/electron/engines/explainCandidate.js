/**
 * Candidate explanation — Claude-assisted when key present, else rule stub.
 * Detection stays in open-source engines; this only narrates why a group was bundled.
 */

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 ** 2) return `${Math.max(1, Math.round(n / 1024 ** 2))}MB`;
  if (n >= 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${n}B`;
}

function stubExplain(group) {
  if (!group) return "";
  if (group.kind === "similar-photo" || group.kind === "similar-photos") {
    const n = group.count || group.files?.length || 0;
    const reclaim = formatBytes(group.reclaimBytes);
    const best = group.pickHint?.sharpest || group.files?.[0]?.name || "대표 사진";
    return `같은 장소에서 연속 촬영된 사진 ${n}장으로 보여요. 선명도·해상도 기준으로 ${best}를 남기면 약 ${reclaim}를 확보할 수 있어요.`;
  }
  if (group.kind === "similar-doc" || group.kind === "similar-docs") {
    const pct = Math.round((group.similarity || 0) * 100);
    const names = (group.files || []).map((f) => f.name).filter(Boolean);
    const latest =
      [...(group.files || [])].sort((a, b) =>
        String(b.modified || "").localeCompare(String(a.modified || ""))
      )[0]?.name || names[names.length - 1];
    return `이 ${names.length}개 파일은 같은 프로젝트의 여러 버전으로 보입니다(유사도 약 ${pct}%). 가장 최근으로 보이는 파일은 ${latest}예요. 완전히 같다고 단정하지 말고 비교해 보세요.`;
  }
  if (group.kind === "duplicate" || group.kind === "exact") {
    const n = group.files?.length || group.count || 0;
    return `이름은 다르지만 내용이 완전히 같은 파일 ${n}개예요. 로컬 Desktop에 하나만 남기면 클라우드 복제를 줄일 수 있어요.`;
  }
  return group.reason || "";
}

/**
 * @param {object} group
 * @returns {Promise<object>} group with explain filled
 */
async function explainGroup(group) {
  if (!group) return group;
  // Future: call Anthropic when ANTHROPIC_API_KEY is set (metadata-only prompt).
  // Hackathon default: deterministic stub — no file bodies leave the machine.
  const explain = stubExplain(group);
  return { ...group, explain };
}

async function explainGroups(groups) {
  const list = Array.isArray(groups) ? groups : [];
  return Promise.all(list.map((g) => explainGroup(g)));
}

module.exports = {
  stubExplain,
  explainGroup,
  explainGroups,
  formatBytes,
};
