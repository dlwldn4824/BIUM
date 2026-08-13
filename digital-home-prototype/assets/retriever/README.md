# Retriever — transparent PNG frames only

## Spec (required)

```text
64 × 64 PNG
투명 배경
그림자 없음
외곽 glow 없음
anti-aliasing 없음 (alpha 0 or 255 only)
캐릭터 발 위치 y = 56 고정
모든 프레임 동일 캔버스
```

## Display

정수 배율만 허용:

| asset | CSS size |
|------:|---------:|
| 64 | 64 / 128 / 192 / 256 |

```css
.retriever {
  width: 128px;
  height: 128px;
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transform: translateZ(0);
}
```

- SVG에 PNG를 embed한 asset 사용 금지
- `transform: scale(1.37)` 같은 비정수 배율 금지
- drop-shadow / glow 금지

## Runtime (atlas)

런타임은 폴더별 PNG가 아니라 OpenPets/petx 스타일 atlas를 쓴다.

```
assets/pets/retriever/
  pet.json
  spritesheet.png   # 8 cols × 16 rows × 64px
```

`PetAtlas.js` + `RetrieverSprite.js`가 `background-position`으로 재생한다.  
표시: **64 → 128 (정수 2배)**.

소스 프레임 폴더는 atlas 재조립용:

```
idle/ walk-right/ walk-left/ search/ found/
carry-right/ carry-left/ clean/ happy/ sleep/
```

자세한 오픈소스 매핑: `docs/DESKTOP_PET_REFERENCES.md`

## Next assets

새 프레임은 **처음부터 64×64 진짜 픽셀아트**로 제작한 뒤 atlas에 다시 붙인다.  
큰 래스터를 축소한 “가짜 픽셀”은 얼굴이 뭉개지므로 교체 대상이다.
