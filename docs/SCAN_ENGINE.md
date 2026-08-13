# 스캔 엔진 — Czkawka Core (권장)

GUI를 가져오지 않는다. **중복 탐지 엔진만** 쓰고, 결과는 Retriever Agent UI에 보여준다.

## 엔진 선택

| 엔진 | 라이선스 | 역할 | 해커톤 적합도 |
|------|----------|------|--------------:|
| **[Czkawka](https://github.com/qarmin/czkawka)** (`czkawka_core` / CLI) | **MIT** | 완전 중복(BLAKE3), 유사 이미지/영상, 빈 폴더, JSON | ★★★★★ |
| [jdupes](https://github.com/jbruchon/jdupes) | MIT | 완전 중복만 초고속 | ★★★★☆ (최소 MVP) |
| [dupeGuru](https://github.com/arsenetar/dupeguru) | **GPL-3.0** | 파일명 fuzzy | ★★☆☆☆ (제품화 시 부담) |

**기본 선택: Czkawka.** GUI/Krokiet는 쓰지 않고 CLI(또는 추후 `czkawka_core` 임베드)만 사용한다.

## 파이프라인

```text
[Local Agent / Electron main]
        ↓
  czkawka_cli dup …  →  JSON
        ↓
  engines/czkawka.js  (어댑터)
        ↓
  BIUM duplicate groups
        ↓
  Retriever Agent
        ↓
  🐕 방 이동 → search → found → carry → 말풍선
        ↓
  "똑같은 파일 3개를 찾았어요!" + keep-one UI
```

완전 중복 내부 흐름 (Czkawka):

```text
파일 → 크기 그룹 → Prehash → BLAKE3 → hash 동일 → 완전 동일
```

이름이 `발표.pdf` / `발표 (1).pdf` / `진짜최종.pdf`처럼 달라도 **내용 hash가 같으면** 한 그룹이다.

## 클라우드는 별층

Czkawka는 **로컬 경로** 중심이다. Google Drive / OneDrive는:

1. API로 메타·파일(또는 MD5)을 가져오고  
2. **같은 fingerprint 체계**로 로컬 그룹과 합친다  

해커톤 MVP: `Czkawka(로컬) + Drive 하나 + Retriever UI`.

## Reference Path → 중요 폴더 보호

Czkawka의 **Reference directories**는 비교에는 쓰이지만 자동 이동/삭제 대상에서 제외된다.  
BIUM의 “원본 폴더는 지우지 않기”에 그대로 매핑한다.

```text
--reference-directories ~/Documents/중요자료
```

## 레포 구현

| 경로 | 역할 |
|------|------|
| `digital-diet/electron/engines/czkawka.js` | CLI spawn + JSON 파싱 → BIUM groups |
| `digital-diet/electron/scanner.js` | `engine: auto\|czkawka\|node` (없으면 Node SHA 폴백) |
| `digital-diet/fixtures/czkawka-duplicates.sample.json` | CLI 없을 때 데모용 |
| `digital-home-prototype/js/scan/mapCzkawka.js` | JSON / diet group → modal `duplicate` 형태 |
| `digital-home-prototype/electron/localAgent.js` | Local Agent IPC + 방 이동 progress |
| `digital-home-prototype/js/scan/session.js` | Renderer 스캔 세션 (Electron 또는 fixture) |
| `digital-home-prototype/vendor/bin/czkawka_cli` | 벤더 CLI |
| `digital-home-prototype/electron/desktopPet.js` | 투명 always-on-top Desktop Pet (창 자체가 이동) |
| `digital-home-prototype/pet.html` | 펫 전용 투명 렌더러 |

환경 변수:

```bash
export CZKAWKA_CLI=/path/to/czkawka_cli   # optional
export BIUM_SCAN_ENGINE=auto               # auto | czkawka | node | fixture
```

설치 (macOS arm64 — 권장):

```bash
cd digital-diet
npm run fetch:czkawka   # → vendor/bin/czkawka_cli (GitHub Release 12.x)
npm run scan:local      # Downloads/Desktop/Documents 실제 스캔
```

`brew install czkawka`는 GUI/ffmpeg 의존성이 커서 해커톤에선 Release CLI가 더 낫다.

## 하지 않을 것

- Czkawka GTK/Slint GUI를 제품 UI로 임베드  
- dupeGuru 코드 병합 (GPL)  
- 해커톤에서 BLAKE3 파이프라인을 처음부터 재구현  
