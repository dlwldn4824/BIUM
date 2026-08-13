/** @typedef {{ isMock: true }} MockFlag */

window.DigitalHomeData = {
  isMock: true,
  overallClean: 63,
  summary: {
    usedGb: null,
    totalGb: null,
    cleanableGb: 0,
    findCount: 0,
    deltaGb: 0,
    scannedFiles: 0,
    savingKrw: 36000, // impact sheet scale base only
  },
  effects: { spaceGb: 0, costKrw: 0, files: 0 },
  rooms: {
    desktop: { id: "desktop", label: "Desktop Room", x: "22%", y: "28%", clean: 54, used: 256, total: 512 },
    laptop: { id: "laptop", label: "Laptop Room", x: "72%", y: "28%", clean: 72, used: 128, total: 250 },
    phone: { id: "phone", label: "Phone Room", x: "22%", y: "68%", clean: 81, used: 64, total: 128 },
    cloud: { id: "cloud", label: "Cloud Room", x: "72%", y: "68%", clean: 48, used: 120, total: 200 },
    mail: { id: "mail", label: "Mailbox", x: "50%", y: "88%", clean: 60, used: 12, total: 15 },
  },
  /** Connected spaces — filled live from getConnections */
  spaces: [
    { id: "mac-local", name: "MacBook", used: null, total: null, icon: "device", connected: true },
  ],
  finds: [
    { id: "duplicate", label: "똑같은 파일", icon: "⧉", gb: 0, count: 0 },
    { id: "similar-photos", label: "비슷한 사진", icon: "🖼", gb: 0, count: 0 },
    { id: "similar-docs", label: "비슷한 문서", icon: "📄", gb: 0, count: 0 },
    { id: "cold-stale", label: "오래 안 연 폴더", icon: "☾", gb: 0, count: 0 },
    { id: "mail", label: "메일 정리", icon: "✉", gb: 0, count: 0 },
  ],
  /** Populated when Gmail is connected */
  mailCleanup: null,
  /** Lifecycle candidates: similar photos → docs → exact → cold */
  candidates: {
    similarPhotos: { groups: [] },
    similarDocs: { groups: [] },
    exact: { groups: [] },
    coldStale: { groups: [] },
  },
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
        keepDesc: "로컬 Desktop · 클라우드보다 환경에 유리",
        recommended: true,
        reason:
          "Desktop에 남기면 Drive 복제를 줄여 탄소·구독 부담을 낮출 수 있어요.",
      },
      {
        name: "발표최종 (2).pdf",
        place: "Google Drive / 학교",
        size: "428MB",
        keepId: "gdrive",
        keepLabel: "Google Drive",
        keepDesc: "클라우드 보관 · 데이터센터 부하 지속",
        recommended: false,
        reason:
          "Drive에 남기면 클라우드에 계속 쌓여요. 탄소 절감을 위해 로컬을 추천해요.",
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
