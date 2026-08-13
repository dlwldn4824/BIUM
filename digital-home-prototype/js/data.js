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
    { id: "duplicate", label: "완전 동일", icon: "⧉", gb: 0.8, count: 3 },
    { id: "similar-photos", label: "비슷한 사진", icon: "🖼", gb: 0.04, count: 8 },
    { id: "similar-docs", label: "비슷한 문서 (재확인)", icon: "📄", gb: 0, count: 4 },
    { id: "cold-stale", label: "오래 안 씀 · 잠재우기", icon: "☾", gb: 36.4, count: 8291 },
    { id: "mail", label: "스팸·오래된 안읽음", icon: "✉", gb: 2.8, count: 1630 },
  ],
  /** Populated when Gmail is connected */
  mailCleanup: null,
  /** Lifecycle candidates: exact → similar → review → cold hibernate */
  candidates: {
    exact: { groups: [] },
    similarPhotos: {
      groups: [
        {
          id: "photo-stack-jeju",
          kind: "similar-photo",
          confidence: "high",
          title: "비슷한 사진 8장",
          reason: "같은 장소에서 비슷한 구도로 촬영된 사진이에요.",
          count: 8,
          reclaimBytes: 44040192,
          keepOptions: [1, 3, "all"],
          pickHint: {
            sharpest: "IMG_3324.jpg",
            eyesOpen: true,
            highestRes: "IMG_3324.jpg",
          },
          explain:
            "같은 장소에서 연속 촬영된 사진 8장으로 보여요. 선명도·해상도 기준으로 IMG_3324.jpg를 남기면 약 42MB를 확보할 수 있어요.",
          files: [
            { name: "IMG_3317.jpg", place: "MacBook / Pictures/Jeju", size: "5.2MB" },
            { name: "IMG_3318.jpg", place: "MacBook / Pictures/Jeju", size: "5.4MB" },
            { name: "IMG_3319.jpg", place: "MacBook / Pictures/Jeju", size: "5.1MB" },
            { name: "IMG_3320.jpg", place: "MacBook / Pictures/Jeju", size: "5.6MB" },
            { name: "IMG_3321.jpg", place: "MacBook / Pictures/Jeju", size: "5.3MB" },
            { name: "IMG_3322.jpg", place: "MacBook / Pictures/Jeju", size: "5.0MB" },
            { name: "IMG_3323.jpg", place: "MacBook / Pictures/Jeju", size: "5.5MB" },
            { name: "IMG_3324.jpg", place: "MacBook / Pictures/Jeju", size: "5.9MB" },
          ],
        },
      ],
    },
    similarDocs: {
      groups: [
        {
          id: "doc-chic-deck",
          kind: "similar-doc",
          confidence: "review",
          title: "비슷한 발표 자료 4개",
          reason: "완전히 같은 파일은 아니에요. 버전 파일일 가능성이 높아요.",
          similarity: 0.91,
          count: 4,
          reclaimBytes: 0,
          actions: ["compare", "gather", "keep"],
          explain:
            "이 4개 파일은 같은 프로젝트의 여러 버전으로 보입니다(유사도 약 91%). 가장 최근으로 보이는 파일은 CHIC_발표_진짜최종.pptx예요. 완전히 같다고 단정하지 말고 비교해 보세요.",
          files: [
            { name: "CHIC_발표.pptx", place: "MacBook / Documents", size: "12MB", modified: "2026-07-02" },
            { name: "CHIC_발표_최종.pptx", place: "MacBook / Documents", size: "13MB", modified: "2026-07-18" },
            { name: "CHIC_발표_진짜최종.pptx", place: "Desktop / Documents", size: "14MB", modified: "2026-08-01" },
            { name: "CHIC_발표_수정본.pptx", place: "Google Drive / 학교", size: "13MB", modified: "2026-07-22" },
          ],
        },
      ],
    },
    coldStale: {
      groups: [
        {
          id: "cold-drive-jeju-2018",
          kind: "stale",
          confidence: "cold",
          title: "여행 사진 · 오래 안 연 폴더",
          reason:
            "이 폴더, 2년 8개월 동안 열지 않았어요. 삭제하기 불안하다면 잠재우기로 보관할까요?",
          idleLabel: "2년 8개월",
          count: 8291,
          reclaimBytes: 39093780480,
          place: "Google Drive / 여행/제주_2018",
          actions: ["leave", "hibernate", "clean"],
          carbonDefer: true,
          explain:
            "2년 8개월 동안 거의 쓰지 않은 데이터 8,291개(36.4GB)예요. 지우지 않고 잠재우면 저빈도 보관으로 옮길 수 있어요.",
          files: [
            {
              name: "제주_2018 (폴더)",
              place: "Google Drive / 여행",
              size: "36.4GB",
              lastOpened: "2023-11-02",
              itemCount: 8291,
            },
            {
              name: "IMG_1042.JPG",
              place: "Google Drive / 여행/제주_2018",
              size: "4.8MB",
              lastOpened: "2023-11-02",
            },
            {
              name: "IMG_1888.JPG",
              place: "Google Drive / 여행/제주_2018",
              size: "5.1MB",
              lastOpened: "2023-11-02",
            },
            {
              name: "드론_일몰.mp4",
              place: "Google Drive / 여행/제주_2018",
              size: "1.2GB",
              lastOpened: "2023-10-18",
            },
          ],
        },
      ],
    },
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
