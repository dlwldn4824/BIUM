# BIUM — Pixel Home (macOS mini app)

밝고 아기자기한 픽셀 게임 UI입니다.  
중앙의 **디지털 집**과 방 사이를 돌아다니며 파일을 **찾아 가져오는 골든 리트리버**가 핵심입니다.

## macOS 미니앱으로 설치

```bash
cd digital-home-prototype
npm install
npm run install:local
```

- `/Applications/BIUM.app`
- 바탕화면 `BIUM.app`

실행하면 **작은 독립 창**이 뜨고, 메뉴바에도 아이콘이 남습니다.  
창을 닫아도 종료되지 않고 메뉴바에 남고, 아이콘 클릭으로 다시 열립니다.

개발 실행 (패키징 없이):

```bash
npm start
```

## 브라우저로만 보기

```bash
npx --yes serve -l 5173 .
```

http://localhost:5173

## 구조

```
assets/
  retriever/      # 64×64 PNG per action (idle, walk, search, …)
  rooms/          # desktop-room.png 등 교체 예정
  icons/
  objects/
js/
  components/RetrieverSprite.js   # img src frame cycle
  components/CatAgent.js          # room CSS moves + choreography
  data.js
  app.js
```

## 흐름

1. **탐색 시작** / **하나씩 확인하기**
2. 리트리버 Desktop → Laptop → Cloud 이동 + search
3. found → carry(파일 물고) → 중앙 복귀
4. 중복 팝업 → 하나만 남기기 → 위치 선택
5. clean / happy → 방의 파일 더미 제거 + 청결도 상승

프레임 애니메이션과 방 사이 좌표 이동은 분리되어 있습니다.  
CO₂ 수치는 표시하지 않습니다. 비용 숫자는 mock입니다.
