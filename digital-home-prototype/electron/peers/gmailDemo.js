/**
 * Hackathon demo — Gmail cleanup recommendations (spam + stale unread).
 * Metadata / estimates only; never stores message bodies.
 */

const QUOTA = {
  usedBytes: Math.round(12.4 * 1024 ** 3),
  totalBytes: 15 * 1024 ** 3,
};

function buildMailCleanup() {
  const spamBytes = Math.round(1.6 * 1024 ** 3);
  const unreadBytes = Math.round(1.2 * 1024 ** 3);
  return {
    ok: true,
    demo: true,
    source: "demo",
    reclaimBytes: spamBytes + unreadBytes,
    groups: [
      {
        id: "spam",
        kind: "spam",
        title: "스팸함",
        reason: "스팸·프로모션이 쌓여 있어요. 비우면 바로 공간을 확보할 수 있어요.",
        count: 1284,
        reclaimBytes: spamBytes,
        actionLabel: "스팸함 비우기",
        recommended: true,
      },
      {
        id: "old-unread",
        kind: "old-unread",
        title: "오래된 안 읽은 메일",
        reason: "90일 이상 열지 않은 안 읽은 메일이에요. 필요 없다면 정리해 보세요.",
        count: 346,
        reclaimBytes: unreadBytes,
        actionLabel: "오래된 안읽음 정리",
        recommended: true,
      },
    ],
  };
}

module.exports = { QUOTA, buildMailCleanup };
