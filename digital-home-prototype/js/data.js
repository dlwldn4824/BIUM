/** @typedef {{ isMock: true }} MockFlag */

window.DigitalHomeData = {
  isMock: true,
  overallClean: 63,
  summary: {
    cleanableGb: 47.3,
    savingKrw: 36000, // mock only — not verified billing data
  },
  effects: { spaceGb: 0, costKrw: 0, files: 0 },
  rooms: {
    desktop: { id: "desktop", label: "Desktop Room", x: "22%", y: "28%", clean: 54, used: 256, total: 512 },
    laptop: { id: "laptop", label: "Laptop Room", x: "72%", y: "28%", clean: 72, used: 128, total: 250 },
    phone: { id: "phone", label: "Phone Room", x: "22%", y: "68%", clean: 81, used: 64, total: 128 },
    cloud: { id: "cloud", label: "Cloud Room", x: "72%", y: "68%", clean: 48, used: 120, total: 200 },
    mail: { id: "mail", label: "Mailbox", x: "50%", y: "88%", clean: 60, used: 12, total: 15 },
  },
  spaces: [
    { id: "desktop", name: "Desktop", used: 256, total: 512, icon: "device" },
    { id: "laptop", name: "Laptop", used: 128, total: 250, icon: "device" },
    { id: "phone", name: "Phone", used: 64, total: 128, icon: "phone" },
    { id: "gdrive", name: "Google Drive", used: 78, total: 100, icon: "cloud" },
    { id: "onedrive", name: "OneDrive", used: 42, total: 100, icon: "cloud" },
    { id: "mail", name: "Mail", used: 12, total: 15, icon: "mail" },
  ],
  finds: [
    { id: "duplicate", label: "중복 파일", gb: 18.7, count: 342 },
    { id: "old", label: "오래된 파일", gb: 12.4, count: 851 },
    { id: "large", label: "대용량 파일", gb: 10.2, count: 56 },
    { id: "mail", label: "오래된 메일 첨부", gb: 6.0, count: 412 },
  ],
  duplicate: {
    reclaimMb: 856,
    files: [
      { name: "발표최종.pdf", place: "MacBook / Downloads", size: "428MB", keepId: "laptop", keepLabel: "MacBook", keepDesc: "현재 작업 중" },
      { name: "발표최종 (1).pdf", place: "Desktop / Downloads", size: "428MB", keepId: "desktop", keepLabel: "Desktop", keepDesc: "최근 사용하지 않음" },
      { name: "발표최종 (2).pdf", place: "Google Drive / 학교", size: "428MB", keepId: "gdrive", keepLabel: "Google Drive", keepDesc: "클라우드 보관 · 모든 기기에서 접근 가능", recommended: true, reason: "여러 기기에서 접근할 수 있는 위치예요." },
    ],
  },
  speeches: {
    idle: "둘러볼까?",
    desktop: "Desktop 탐색 중...",
    laptop: "Laptop으로!",
    phone: "Phone Room~",
    cloud: "Cloud 수납장!",
    mail: "우편함 확인 중",
    search: "뒤져보는 중...",
    found: "같은 파일 발견!",
    carry: "가져갈게요!",
    clean: "정리 완료!",
    happy: "깨끗해졌어요!",
    sleep: "잠깐 쉴게요",
  },
};
