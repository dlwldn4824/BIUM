# Digital Diet — Pixel Home Prototype

밝고 아기자기한 픽셀 게임 UI 프로토타입입니다.  
중앙의 **디지털 집**과 방 사이를 돌아다니는 **고양이 에이전트**가 핵심입니다.

## 실행

```bash
cd digital-home-prototype
npx --yes serve -l 5173 .
```

브라우저: http://localhost:5173

## 구조

```
assets/
  cat/cat-sprite-sheet.png
  rooms/          # desktop-room.png 등 교체 예정
  icons/
  objects/        # box, files, folder...
js/
  components/CatSprite.js
  components/CatAgent.js
  data.js         # isMock: true
  app.js
```

## 흐름

1. **탐색 시작** / **하나씩 확인하기**
2. 고양이 Desktop → Laptop → Cloud 이동 + search
3. found → carry → 중앙 복귀
4. 중복 팝업 → 하나만 남기기 → 위치 선택
5. clean / happy → 방의 파일 더미 제거 + 청결도 상승

CO₂ 수치는 표시하지 않습니다. 비용 숫자는 mock입니다.
