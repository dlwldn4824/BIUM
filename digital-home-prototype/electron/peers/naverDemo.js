/**
 * Demo Naver Mail attachment index when IMAP credentials are missing.
 * Bridges the same contentKey as Mac/Drive seed → 3-space story.
 */

const QUOTA = {
  usedBytes: Math.round(4.3 * 1024 ** 3),
  totalBytes: 5 * 1024 ** 3,
};

function buildDemoNaverIndex(seedFromOthers = []) {
  const seed =
    seedFromOthers.find((e) => e.contentKey && e.size >= 256 * 1024) ||
    seedFromOthers.find((e) => e.hash && e.size >= 256 * 1024) ||
    null;
  const hashAlg = seed?.md5 ? "md5" : seed?.hashAlg || "md5";
  const hash =
    seed?.md5 ||
    seed?.hash ||
    "demo-naver-md5-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const contentKey =
    seed?.contentKey ||
    (hashAlg === "md5" ? `md5:${hash}` : `${hashAlg}:${hash}`);
  const size = seed?.size || 207_000_000;
  const base = seed?.name ? String(seed.name).replace(/\.[^.]+$/, "") : "보고서";
  const name = `${base}_보고서최종.pdf`;

  return [
    {
      source: "naver-imap",
      path: `naver://demo/1/1/${encodeURIComponent(name)}`,
      name,
      size,
      hash: seed?.md5 || (hashAlg === "md5" ? hash : seed?.hash || hash),
      hashAlg,
      contentKey,
      md5: seed?.md5 || (hashAlg === "md5" ? hash : null),
      modified: "2023-03-12T09:00:00.000Z",
      room: "mail",
      subject: "발표 자료 공유합니다",
      from: "demo@naver.com",
    },
  ];
}

function buildNaverMailCleanup(
  attachCount = 287,
  reclaimBytes = Math.round(4.3 * 1024 ** 3)
) {
  return {
    ok: true,
    demo: true,
    source: "naver-demo",
    reclaimBytes,
    groups: [
      {
        id: "naver-old-attach",
        kind: "old-attach",
        title: "오래된 대용량 첨부",
        reason:
          "1년 이상 된 메일의 첨부예요. Drive·로컬과 겹치면 하나만 남길 수 있어요.",
        count: attachCount,
        reclaimBytes,
        actionLabel: "첨부 후보 보기",
        recommended: true,
      },
    ],
  };
}

module.exports = {
  QUOTA,
  buildDemoNaverIndex,
  buildNaverMailCleanup,
};
