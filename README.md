# BIUM — my home

> 메뉴바에서 여는 **작은 디지털 집**.  
> 바탕화면 펫이 Mac · Drive · Gmail · 네이버 메일을 돌아다니며  
> **완전 동일 · 비슷한 사진 · 메일 정리 후보**를 묶어 추천합니다.

macOS **메뉴바 유틸리티**(Electron) · CHIC 해커톤  
GitHub: [dlwldn4824/BIUM](https://github.com/dlwldn4824/BIUM)

---

## 화면으로 보는 BIUM

### 1) Mini 홈 — Cozy Home

메뉴바 아이콘을 누르면 뜨는 컴팩트 팝오버입니다.  
정리 후보 용량, 새로 발견한 건수, 연결된 기기, 탐색 CTA가 한 화면에 모입니다.

![Mini — Cozy Home](docs/screenshots/01-mini-cozy.png)

- **정리 후보** — 지금 비울 수 있을 법한 용량 요약 (클릭 시 탄소·비용 추정치)
- **새로 발견** — 중복 · 비슷한 사진 · 메일 등 발견 허브
- **연결된 기기** — MacBook / Drive / Gmail / 네이버 등 (수에 따라 창 높이 조절)
- **서식지** — 강아지·고양이가 방 안을 돌아다님
- **탐색 시작** — 바탕화면 펫이 공간을 돌아다니며 스캔

---

### 2) 설정 — 테마 · 펫 · Google · 네이버

톱니바퀴에서 테마, 데스크톱 펫, Google OAuth, 네이버 IMAP을 설정합니다.

![설정](docs/screenshots/02-settings.png)

| 항목 | 설명 |
|------|------|
| **Cozy Home / Midnight** | 크림 톤 · 블루·블랙 모던 |
| **노트북에서 돌아다니기** | 바탕화면 펫 on/off |
| **Pet** | Neko / Golden Puppy (서식지에는 둘 다 배회) |
| **Google 연결** | Desktop Client ID → Drive·Gmail OAuth |
| **Gmail 정리** | 스팸 · 90일+ 안읽음 **실API** 추천 |
| **네이버 메일** | IMAP + 앱 비밀번호 · 오래된 첨부 MD5 |

---

### 3) Mini 홈 — Midnight

블루·블랙 모던 테마. 방 일러스트·창 배경색도 Midnight에 맞춥니다.

![Mini — Midnight](docs/screenshots/03-mini-midnight.png)

---

### 4) 새로 발견 → 정리 허브

**새로 발견 N건**을 누르면 후보별로 나뉩니다.

![발견한 항목 — 중복 파일](docs/screenshots/04-findings-duplicates.png)

| 종류 | 의미 | 사용자 선택 |
|------|------|-------------|
| **똑같은 파일** | MD5/BLAKE3 완전 동일 · Drive 교차 가능 | **여러 위치에 남기기** 후 나머지 휴지통 |
| **비슷한 사진** | Czkawka `image` 지각 해시 (Pictures·Desktop) | 1장 / 3장 추천 |
| **메일 정리** | Gmail 스팸·오래된 안읽음 / 네이버 대용량 첨부 | 추천 확인 |

파이프라인 메모: [`docs/SIMILARITY_PIPELINE.md`](docs/SIMILARITY_PIPELINE.md)

---

## 핵심 흐름

```mermaid
flowchart LR
  A[메뉴바 Mini] --> B[Google / 네이버 연결]
  B --> C[탐색 시작]
  C --> D[Mac · Drive · Mail 스캔]
  D --> E[동일 · 유사 사진 · 메일 후보]
  E --> F[남길 위치 다중 선택]
  F --> G[로컬 Trash / Drive trash]

  style A fill:#f7f0e6,stroke:#8a7263,color:#4a3428
  style G fill:#e8f5ef,stroke:#0f8f7b,color:#0b6f60
```

메타데이터·해시 중심 · 파일 본문은 BIUM 서버로 전송하지 않습니다.

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

### Google / Gmail 실연결

1. Google Cloud Desktop OAuth Client ID  
2. **Drive API** · **Gmail API** 사용 설정  
3. BIUM 설정 → Google로 로그인 / Gmail 연결  

### 네이버 메일

1. 메일 설정에서 IMAP 사용함  
2. 2단계 인증 **앱 비밀번호**  
3. BIUM 설정 → 네이버로 연결  

---

## 사내 KPI 대시보드 (웹)

조직 단위 **데이터 절감 · 비용 · 다음 달 기대치** 프로토타입:

```bash
cd digital-home-prototype/org-dashboard
npx --yes serve -p 5177
# http://localhost:5177
```

- 데모 스키마: `org-dashboard/data/sample.json`  
- BIUM 절감 공식과 동일 오더 (`GB × 36000/8.7` 원/년, `0.04 kgCO₂e/GB·년`)  
- 자세한 설명: [`org-dashboard/README.md`](digital-home-prototype/org-dashboard/README.md)

---

## 사용한 오픈소스

통째 fork 대신 **필요한 패턴·바이너리·에셋만** 참고·이식했습니다.  
상세 전략: [`docs/OSS_COMPOSITION.md`](docs/OSS_COMPOSITION.md)

### 런타임 · 빌드

| 프로젝트 | 라이선스 | 용도 |
|----------|----------|------|
| [Electron](https://github.com/electron/electron) | MIT | macOS 메뉴바 앱 · Desktop Pet 창 |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT | `.app` 패키징 (`npm run dist`) |
| [imapflow](https://github.com/postalsys/imapflow) | MIT | 네이버 메일 IMAP |

### 탐색 · 중복 · 에이전트 패턴

| 프로젝트 | 라이선스 | BIUM에서의 역할 |
|----------|----------|-----------------|
| [Czkawka](https://github.com/qarmin/czkawka) | MIT | 중복 `dup` + 유사 이미지 `image` CLI |
| [imagededup](https://github.com/idealo/imagededup) | Apache-2.0 | 사진 near-duplicate 장기 훅 자리 |
| [Apache Tika](https://tika.apache.org/) | Apache-2.0 | 문서 텍스트 추출 훅 자리 |
| [Sentence Transformers](https://www.sbert.net/) | Apache-2.0 | 문서 임베딩 유사도 훅 자리 |
| [LocalSend](https://github.com/localsend/localsend) / [protocol](https://github.com/localsend/protocol) | MIT | LAN 기기 발견 아이디어 → `electron/peers/lanPeer.js` |
| [WindowPet](https://github.com/SeakMengs/WindowPet) | MIT | 투명·always-on-top 패턴 → `electron/desktopPet.js` |
| [OpenPet](https://github.com/X-T-E-R/OpenPet) | — | Agent 이벤트 → 펫 행동 → `electron/agentEvents.js` |

### 펫 · 스프라이트

| 프로젝트 | 라이선스 | BIUM에서의 역할 |
|----------|----------|-----------------|
| [crgimenes/neko](https://github.com/crgimenes/neko) | BSD-2-Clause | 고전 Neko 스프라이트 |
| [adryd325/oneko.js](https://github.com/adryd325/oneko.js) | — | oneko 8×4 / 32px 그리드 참고 |
| PawPal 계열 GIF | 각 저장소 라이선스 | Golden Puppy (`assets/pets/pawpal-puppy`) |

크레딧: [`digital-home-prototype/assets/pets/neko/CREDITS.md`](digital-home-prototype/assets/pets/neko/CREDITS.md)

### 클라우드 API

| API | 용도 |
|-----|------|
| Google Drive API | 메타데이터 · MD5 · trash (본문 미업로드) |
| Gmail API | 스팸 · 90일+ 안읽음 건수 추천 |
| 네이버 IMAP | 오래된 첨부 후보 · MD5 교차 |

---

## 저장소 구조

```text
.
├── digital-home-prototype/     # BIUM macOS 앱 (Electron)
│   ├── electron/               # tray, pet, federated scan, OAuth, IMAP
│   │   ├── actions/keepOne.js  # 다중 위치 keep → trash
│   │   └── providers/          # google.js, naverImap.js
│   ├── org-dashboard/          # 사내 절감 KPI 웹 프로토타입
│   ├── js/ css/                # Mini + Home UI
│   ├── assets/                 # 펫 PNG/GIF, 방 배경
│   └── vendor/bin/             # czkawka_cli
├── docs/
│   ├── screenshots/
│   ├── OSS_COMPOSITION.md
│   ├── SIMILARITY_PIPELINE.md
│   └── 피피티_개요.md
└── README.md
```

---

## 발표 자료

문제 정의 · 페인포인트 · 기대효과 슬라이드 개요는  
[`docs/피피티_개요.md`](docs/피피티_개요.md) 를 참고하세요.

---

## 라이선스

앱 코드: MIT (해커톤용)  
포함 바이너리·에셋은 각 원저작물 라이선스를 따릅니다.
