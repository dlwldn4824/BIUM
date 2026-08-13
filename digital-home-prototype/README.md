# BIUM — Pixel / Mini Home (macOS)

메뉴바 **my home** 팝오버 + 바탕화면 펫.  
전체 소개 · 스크린샷 · 오픈소스 목록은 저장소 루트 [`README.md`](../README.md) 를 보세요.

## 설치

```bash
npm install
npm run install:local
```

- `/Applications/BIUM.app`
- 바탕화면 `BIUM.app`

개발:

```bash
npm start
```

브라우저:

```bash
npx --yes serve -l 5173 .
```

## 구조

```text
electron/     tray, Desktop Pet, federated scan, Gmail/Drive
js/ css/      Mini popover + Home
assets/       pet PNG (정수 배율), rooms/
vendor/bin/   czkawka_cli
```

## 참고 문서

- [`docs/OSS_COMPOSITION.md`](../docs/OSS_COMPOSITION.md) — OSS 조합 전략  
- [`docs/screenshots/`](../docs/screenshots/) — README 캡처  
- [`assets/pets/neko/CREDITS.md`](assets/pets/neko/CREDITS.md) — Neko 크레딧  
