# 멀티 에이전트 · 통합 인덱스

> 오픈소스 조합 맵: [OSS_COMPOSITION.md](./OSS_COMPOSITION.md)  
> (Czkawka · LocalSend · WindowPet · OpenPet)

원본 파일은 중앙에 올리지 않는다. 각 Agent는 **메타데이터 + 해시**만 푸시한다.

```text
메뉴바 Mini / Desktop Pet
        │
   orchestrator.js
        │
 ┌──────┼──────────┐
 │      │          │
Mac   Windows    Google Drive
Local  Peer      API (OAuth)
Agent  (stub*)   metadata+md5
 │      │          │
 └──────┴────┬─────┘
             ↓
        indexStore
     (bium-index.json)
             ↓
   contentKey 매칭 중복
```

## 해커톤 범위

| 구현 | 상태 |
|------|------|
| Mac Local Agent (Czkawka/Node) | ✅ |
| LAN peer discovery (LocalSend식, port 53821) | ✅ fingerprint only |
| Windows Peer stub (LAN 없을 때) | ✅ 데모 |
| Google Drive OAuth + metadata | ✅ (Client ID 없으면 데모 인덱스) |
| OpenPet식 agent events → 펫 | ✅ `agentEvents.js` |
| OneDrive / iCloud / Mail | 확장 예정 (UI에 연결 안 됨으로 표시) |

LAN에 다른 BIUM Agent가 있으면 stub 대신 그 기기의 `/api/bium/v1/fingerprints`를 받는다.

## 인덱스 엔트리

```json
{
  "deviceId": "mac-local",
  "deviceLabel": "MacBook",
  "path": "~/Downloads/CHIC_final.mp4",
  "size": 4928301921,
  "hash": "a82c...",
  "hashAlg": "blake3",
  "contentKey": "blake3:a82c...",
  "modified": "2026-07-13"
}
```

중복 키: `contentKey` (동일 크기·동일 해시).  
Drive MD5와 로컬 BLAKE3는 알고리즘이 다르므로, OAuth 실연결 시 **크기+이름 stem**으로 soft-bridge 후 필요 시만 추가 검증.

## Google 연결

```bash
export BIUM_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
```

Mini → **+ 공간 연결 (Google Drive)**  
스코프: `drive.readonly` (본문 다운로드 없이 목록·md5·쿼ota).

## 주요 파일

| 경로 | 역할 |
|------|------|
| `digital-home-prototype/electron/orchestrator.js` | 연합 스캔 |
| `digital-home-prototype/electron/indexStore.js` | 통합 인덱스 |
| `digital-home-prototype/electron/peers/lanPeer.js` | LocalSend식 발견 + fingerprint HTTP |
| `digital-home-prototype/electron/peers/windowsStub.js` | Windows 피어 데모 (LAN 폴백) |
| `digital-home-prototype/electron/agentEvents.js` | OpenPet식 이벤트 버스 |
| `digital-home-prototype/electron/desktopPet.js` | WindowPet식 투명 overlay |
| `digital-home-prototype/electron/providers/google.js` | Drive OAuth |
| `digital-home-prototype/electron/store.js` | 토큰 (파일 내용 없음) |
