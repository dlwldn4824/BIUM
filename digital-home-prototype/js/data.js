/** @typedef {{ isMock: true }} MockFlag */

window.DigitalHomeData = {
  isMock: true,
  overallClean: 63,
  summary: {
    usedGb: 356,
    totalGb: 494,
    cleanableGb: 8.7,
    deltaGb: 8.2,
    scannedFiles: 12842,
    savingKrw: 36000, // home/event only — not on Mini
  },
  effects: { spaceGb: 0, costKrw: 0, files: 0 },
  rooms: {
    desktop: { id: "desktop", label: "Desktop Room", x: "22%", y: "28%", clean: 54, used: 256, total: 512 },
    laptop: { id: "laptop", label: "Laptop Room", x: "72%", y: "28%", clean: 72, used: 128, total: 250 },
    phone: { id: "phone", label: "Phone Room", x: "22%", y: "68%", clean: 81, used: 64, total: 128 },
    cloud: { id: "cloud", label: "Cloud Room", x: "72%", y: "68%", clean: 48, used: 120, total: 200 },
    mail: { id: "mail", label: "Mailbox", x: "50%", y: "88%", clean: 60, used: 12, total: 15 },
  },
  /** Connected spaces shown in Mini (order matters) */
  spaces: [
    { id: "mac-local", name: "MacBook", used: 275, total: 494, icon: "device", connected: true },
    { id: "windows-peer", name: "Windows Desktop", used: 421, total: 1024, icon: "device", connected: true },
    { id: "gdrive", name: "Google Drive", used: 78, total: 100, icon: "cloud", connected: true },
    { id: "onedrive", name: "OneDrive", used: null, total: null, icon: "cloud", connected: false },
  ],
  finds: [
    { id: "duplicate", label: "중복 파일", icon: "⧉", gb: 18.7, count: 342 },
    { id: "old", label: "오래된 파일", icon: "◷", gb: 12.4, count: 851 },
    { id: "large", label: "대용량 방치 파일", icon: "▣", gb: 10.2, count: 56 },
    { id: "mail", label: "오래된 메일/첨부", icon: "✉", gb: 6.0, count: 412 },
  ],
  agent: {
    line: "지금은 쉬고 있어요",
    sub: "바탕화면 펫 · 대기 중",
    location: "idle",
  },
  duplicate: {
    reclaimMb: 856,
    files: [
      {
        name: "발표최종.pdf",
        place: "MacBook / Downloads",
        size: "428MB",
        keepId: "laptop",
        keepLabel: "MacBook",
        keepDesc: "현재 작업 중",
      },
      {
        name: "발표최종 (1).pdf",
        place: "Desktop / Downloads",
        size: "428MB",
        keepId: "desktop",
        keepLabel: "Desktop",
        keepDesc: "최근 사용하지 않음",
      },
      {
        name: "발표최종 (2).pdf",
        place: "Google Drive / 학교",
        size: "428MB",
        keepId: "gdrive",
        keepLabel: "Google Drive",
        keepDesc: "클라우드 보관 · 모든 기기에서 접근 가능",
        recommended: true,
        reason: "여러 기기에서 접근할 수 있는 위치예요.",
      },
    ],
  },
  speeches: {
    idle: "지금은 깨끗해요",
    desktop: "Desktop으로!",
    laptop: "MacBook으로!",
    phone: "Phone Room~",
    cloud: "클라우드로!",
    mail: "우편함 확인!",
    search: "찾는 중...",
    found: "어? 이거 아까 봤는데?",
    carry: "같은 파일 가져갈게!",
    clean: "정리하는 중!",
    happy: "꼬리 흔들~ 완료!",
    sleep: "zzz... 대기 중",
  },
  agentName: "Neko",
  nekoStory: ["sleep", "run", "found", "carry", "happy"],
};
