# Desktop Pet 오픈소스 참고 → BIUM Retriever Agent

해커톤 전략: **애니메이션 규격은 오픈소스, 캐릭터 그림만 BIUM**.

## 추천 조합

| 소스 | 라이선스 | 가져올 것 |
|------|----------|-----------|
| [OpenPets](https://github.com/alterhq/openpets) | MIT | 8×9 Codex Pets atlas, `idle` / `running-right` / `running-left` / … |
| [petx](https://github.com/IchenDEV/petx) | (패키지 README 확인) | 프레임 테이블 + sprite renderer 패턴 |
| [WindowPet](https://github.com/SeakMengs/WindowPet) | MIT | React/Tauri 펫 오버레이·커스텀 펫 UX |
| [OpenPet](https://github.com/X-T-E-R/OpenPet) | 확인 필요 | 자율 걷기 + 말풍선 + 이벤트 API 아이디어 |
| [pixelcat](https://github.com/JOhnsonKC201/pixelcat) | 확인 필요 | 고양이 에셋/동작 참고 |
| [PawPal](https://github.com/zebangeth/PawPal) | MIT (에셋은 ASSET_LICENSE) | 강아지 데스크톱 펫 구조 |
| [Peon Pet](https://github.com/Luodian/peon-pet) | 확인 필요 | atlas 제작 파이프라인 아이디어 |
| Shijima-Qt / Shimeji | **GPL-3.0** | 구조만 참고, 코드 복사 지양 |

## OpenPets / petx 기본 행

| Row | Animation |
| --: | --------- |
| 0 | idle |
| 1 | running-right |
| 2 | running-left |
| 3 | waving |
| 4 | jumping |
| 5 | failed |
| 6 | waiting |
| 7 | running |
| 8 | review |

## BIUM 서비스 매핑

```text
Desktop Pet          BIUM Retriever Agent
─────────────        ────────────────────
idle            →    idle
running-right   →    방 사이 이동 (→)
running-left    →    방 사이 이동 (←)
waiting/search  →    search (상자·파일 냄새)
waving/jumping  →    found / happy
(+ BIUM rows)   →    carry-right / carry-left / clean / sleep
```

실제 플로우:

```text
idle
  → running-right / left   (CSS 좌표로 Desktop→Cloud 이동)
  → search
  → found  + "!"
  → carry-*  (파일 물고 복귀)
  → happy
```

## 레포 구현

```text
assets/pets/neko/             # 고양이 (classic Neko / oneko)
assets/pets/pawpal-puppy/     # 강아지 (PawPal 金毛 puppy GIFs)
js/petSelect.js               # Neko ↔ Golden Puppy 전환
js/components/GifPet.js       # GIF 상태 플레이어
```

| Pet | 출처 | 라이선스 |
|-----|------|----------|
| Neko | [crgimenes/neko](https://github.com/crgimenes/neko) | BSD-2-Clause |
| Golden Puppy | [PawPal](https://github.com/zebangeth/PawPal) `金毛 puppy` | 코드 MIT · **GIF는 ASSET_LICENSE 별도** |

설정 → Pet 에서 전환. 스토리: sleep → run → found → carry → happy.

## 다음에 할 일

1. 진짜 64×64 리트리버 픽셀 아트로 `spritesheet.png`만 교체  
2. (옵션) `@petx/webcomponent` 또는 WindowPet 커스텀 펫 포맷으로 export  
3. 고양이 트랙은 pixelcat / WindowPet 캐릭터 검토  
4. GPL 프로젝트는 **규격·아이디어만**, 코드 병합 금지
