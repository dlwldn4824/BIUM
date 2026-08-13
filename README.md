# BIUM — my home

> 메뉴바에서 여는 **작은 디지털 집**.  
> 바탕화면 펫이 Mac · Windows · Drive · Gmail을 돌아다니며  
> **중복 파일**과 **정리할 메일**을 찾아 추천합니다.

macOS **메뉴바 유틸리티**(Electron) · CHIC 해커톤

---

## 화면으로 보는 BIUM

### 1) Mini 홈 — Cozy Home

메뉴바 아이콘을 누르면 뜨는 컴팩트 팝오버입니다.  
정리 후보 용량, 새로 발견한 건수, 연결된 기기, 탐색 CTA가 한 화면에 모입니다.

![Mini — Cozy Home](docs/screenshots/01-mini-cozy.png)

- **정리 후보** — 지금 비울 수 있을 법한 용량 요약  
- **새로 발견** — 클릭하면 중복 파일 목록으로 바로 이동  
- **연결된 기기** — MacBook / Windows / Drive 등 연결 상태  
- **탐색 시작** — 바탕화면 펫이 공간을 돌아다니며 스캔

---

### 2) 설정 — 테마 · 펫 · 바탕화면

톱니바퀴에서 테마, 데스크톱 펫 on/off, 캐릭터를 고릅니다.

![설정](docs/screenshots/02-settings.png)

| 항목 | 설명 |
|------|------|
| **Cozy Home** | 따뜻한 크림 톤 |
| **Midnight** | 블루 · 블랙 모던 (+ 전용 방 배경) |
| **노트북에서 돌아다니기** | 바탕화면 펫 표시 on/off |
| **Pet** | Neko(고전 고양이) / Golden Puppy |

---

### 3) Mini 홈 — Midnight

블루·블랙 모던 테마. 방 일러스트도 Midnight 전용 배경으로 바뀝니다.

![Mini — Midnight](docs/screenshots/03-mini-midnight.png)

---

### 4) 새로 발견 → 중복 파일

**새로 발견 N건** 또는 **발견한 항목 보기**를 누르면  
이름은 달라도 **내용이 같은 파일**을 기기별로 보여 줍니다.

![발견한 항목 — 중복 파일](docs/screenshots/04-findings-duplicates.png)

- 파일명 · 위치(기기/경로) · 용량  
- 하나만 남기면 확보 가능한 용량 안내  
- Gmail 연결 시 **스팸함 / 오래된 안 읽은 메일** 정리도 함께 추천

---

## 핵심 흐름

```text
메뉴바 클릭 → Mini 홈
      ↓
탐색 시작 → 바탕화면 펫이 Mac → Desktop → Drive → Mail 순회
      ↓
중복·메일 정리 후보 수집 (메타데이터·해시만, 파일 본문 미전송)
      ↓
새로 발견 / 발견한 항목 → 사용자가 남길 위치 결정
```

---

## 설치 (macOS)

```bash
cd digital-home-prototype
npm install
npm run install:local
```

- `/Applications/BIUM.app`
- 바탕화면 `BIUM.app`

메뉴바 집 아이콘을 클릭해 Mini를 엽니다. (Dock 아이콘 없음 · `LSUIElement`)

개발 실행:

```bash
cd digital-home-prototype
npm start
```

브라우저로 UI만 보기:

```bash
cd digital-home-prototype
npx --yes serve -l 5173 .
# http://localhost:5173
```

---

## 사용한 오픈소스

통째 fork 대신 **필요한 패턴·바이너리·에셋만** 참고·이식했습니다.  
상세 전략: [`docs/OSS_COMPOSITION.md`](docs/OSS_COMPOSITION.md)

### 런타임 · 빌드

| 프로젝트 | 라이선스 | 용도 |
|----------|----------|------|
| [Electron](https://github.com/electron/electron) | MIT | macOS 메뉴바 앱 · Desktop Pet 창 |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT | `.app` 패키징 (`npm run dist`) |

### 탐색 · 중복 · 에이전트 패턴

| 프로젝트 | 라이선스 | BIUM에서의 역할 |
|----------|----------|-----------------|
| [Czkawka](https://github.com/qarmin/czkawka) | MIT | 중복 탐색 CLI (`vendor/bin/czkawka_cli`) · size → hash 그룹 아이디어 |
| [LocalSend](https://github.com/localsend/localsend) / [protocol](https://github.com/localsend/protocol) | MIT | LAN 기기 발견 아이디어만 (파일 전송 API 미사용) → `electron/peers/lanPeer.js` |
| [WindowPet](https://github.com/SeakMengs/WindowPet) | MIT | 투명·always-on-top·작은 창 이동 패턴 → `electron/desktopPet.js` |
| [OpenPet](https://github.com/X-T-E-R/OpenPet) | — | Agent 이벤트 → 펫 행동 매핑 → `electron/agentEvents.js` |

### 펫 · 스프라이트

| 프로젝트 | 라이선스 | BIUM에서의 역할 |
|----------|----------|-----------------|
| [crgimenes/neko](https://github.com/crgimenes/neko) | BSD-2-Clause | 고전 Neko 스프라이트 시트 |
| [adryd325/oneko.js](https://github.com/adryd325/oneko.js) | — | oneko 8×4 / 32px 그리드 레이아웃 참고 |
| OpenPets / Petx / WindowPet 계열 에셋 참고 | 각 저장소 라이선스 | Golden Puppy 프레임 구성 참고 (`assets/pets/`) |

크레딧 상세: [`digital-home-prototype/assets/pets/neko/CREDITS.md`](digital-home-prototype/assets/pets/neko/CREDITS.md)

### 폰트 (UI)

| 폰트 | 제공 | 용도 |
|------|------|------|
| [IBM Plex Sans KR](https://fonts.google.com/specimen/IBM+Plex+Sans+KR) | SIL OFL | Mini / 설정 UI 본문 |
| [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) | SIL OFL | 픽셀 홈(레거시) 타이틀 |

### 클라우드 API (프로토콜)

| API | 용도 |
|-----|------|
| Google Drive API | 대용량·메타데이터 후보 (본문 미다운로드) |
| Gmail API | 스팸·오래된 안읽음 **정리 추천** (해커톤 데모 포함) |

---

## 저장소 구조

```text
.
├── digital-home-prototype/   # BIUM macOS 앱 (Electron)
│   ├── electron/             # main, tray, pet, scan, peers
│   ├── js/ css/              # Mini + Home UI
│   ├── assets/               # 펫 PNG, 방 배경
│   └── vendor/bin/           # czkawka_cli 등
├── docs/
│   ├── screenshots/          # README 캡처
│   ├── OSS_COMPOSITION.md
│   └── 피피티_개요.md         # 발표용 내러티브
├── digital-diet/             # 초기 실험 코드
└── README.md                 # ← 지금 문서
```

---

## 발표 자료

문제 정의 · 페인포인트 · 기대효과 슬라이드 개요는  
[`docs/피피티_개요.md`](docs/피피티_개요.md) 를 참고하세요.

---

## 라이선스

앱 코드: MIT (해커톤용)  
포함 바이너리·에셋은 각 원저작물 라이선스를 따릅니다.
