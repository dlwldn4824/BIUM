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

## 최근 기능 요약

- Google Drive OAuth · MD5 교차 중복 · Drive trash  
- Gmail 실연결 · 스팸 / 90일+ 안읽음 추천  
- 네이버 IMAP · 오래된 첨부  
- 로컬 유사 사진 (Czkawka `image`)  
- 남길 위치 **다중 선택** keep-one  
- Mini 서식지 — 선택한 펫 배회  
- 기기 수에 따른 Mini 창 높이  
- 사내 KPI 웹: [`org-dashboard/`](./org-dashboard/)

## 구조

```text
electron/        tray, Desktop Pet, federated scan, OAuth, IMAP
electron/actions keepOne (multi keep → trash)
org-dashboard/   조직 절감 KPI 웹
js/ css/         Mini popover + Home
assets/          pet PNG/GIF (정수 배율), rooms/
vendor/bin/      czkawka_cli
```

## 참고 문서

- [`docs/OSS_COMPOSITION.md`](../docs/OSS_COMPOSITION.md) — OSS 조합 전략  
- [`docs/screenshots/`](../docs/screenshots/) — README 캡처  
- [`org-dashboard/README.md`](./org-dashboard/README.md) — 사내 KPI 대시보드  
- [`assets/pets/neko/CREDITS.md`](assets/pets/neko/CREDITS.md) — Neko 크레딧  
