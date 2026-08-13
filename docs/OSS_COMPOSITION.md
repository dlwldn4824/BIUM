# 오픈소스 조합 전략

통째로 fork하지 않고, **필요한 부분만** 참고·이식한다.

| 필요한 기능 | 참고 OSS | 가져올 부분 | BIUM 현재 위치 |
|-------------|----------|-------------|----------------|
| 파일 탐색·중복 | [Czkawka](https://github.com/qarmin/czkawka) MIT | CLI/`czkawka_core` 아이디어: size → prehash → **BLAKE3** → 그룹 | `electron/engines/czkawka.js` + vendored `czkawka_cli` |
| 문서 본문 추출 | [Apache Tika 3.3.2](https://tika.apache.org/) Apache-2.0 | PDF·PPT·DOC 등에서 텍스트를 로컬 추출 | `electron/engines/documentEmbeddings.js` + `vendor/tika/` |
| 문서 의미 유사도 | [Sentence Transformers Multilingual MiniLM](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) Apache-2.0 | 384차원 임베딩 · cosine ≥ 0.80 | Transformers.js ONNX 로컬 추론 |
| Mac ↔ Windows LAN | [LocalSend](https://github.com/localsend/localsend) / [protocol](https://github.com/localsend/protocol) | UDP 멀티캐스트 발견 + HTTP(S) REST. **파일 전송 API는 안 씀** | `electron/peers/lanPeer.js` (BIUM fingerprint 전용) |
| 화면 위 고양이 | [WindowPet](https://github.com/SeakMengs/WindowPet) MIT | 투명 / always-on-top / click-through / 작은 창 이동 | `electron/desktopPet.js` + `pet.html` (Electron 이식; 추후 Tauri 가능) |
| Agent 상태 → 행동 | [OpenPet](https://github.com/X-T-E-R/OpenPet) | 외부 이벤트로 walk / bubble / attention | `electron/agentEvents.js` |

## 권장 장기 스택

```text
Tauri + React + Rust
  + czkawka_core (임베드 또는 CLI)
  + LocalSend식 discovery (fingerprint only)
  + WindowPet식 overlay
  + OpenPet식 event runtime
```

해커톤 MVP는 **Electron으로 동일 패턴을 먼저 증명**하고, WindowPet과 생태계를 맞출 때 Tauri로 옮긴다.

## 교환하는 데이터 (LocalSend 응용)

파일 바이트는 절대 보내지 않는다.

```json
{
  "device": "MacBook",
  "size": 882901231,
  "hash": "5ab20...",
  "hashAlg": "blake3",
  "contentKey": "blake3:5ab20...",
  "modified": 1786612231
}
```

고양이 전송도 캐릭터 에셋이 아니라 이벤트만:

```text
Mac:  CAT_EXIT_RIGHT
Win:  CAT_ENTER_LEFT
```

## 이벤트 → 펫 (OpenPet 매핑)

| Agent 이벤트 | 펫 행동 |
|--------------|---------|
| `SCAN_STARTED` | wake / run |
| `DEVICE_CHANGED` | transfer exit/enter |
| `SCANNING` | search + 말풍선 |
| `DUPLICATE_FOUND` | found `!` + carry |
| `SCAN_COMPLETED` | sleep / idle |
| `ATTENTION` | 말풍선 + 메뉴바 배지 |

## BIUM LAN 포트

LocalSend 기본 `53317`과 충돌하지 않도록 BIUM은 **`53821`** (UDP+TCP)을 쓴다.  
멀티캐스트 그룹 아이디어만 LocalSend(`224.0.0.167`)를 참고한다.
