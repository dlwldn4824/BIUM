# 디지털 다이어트 (Digital Diet)

macOS **메뉴바 상주** 클라우드·디지털 공간 정리 앱입니다.

Dock에는 안 뜨고, 화면 오른쪽 위 메뉴바에 집 아이콘만 상주합니다.  
아이콘을 클릭하면 바로 **내 디지털 집**이 열립니다.

## 설치 (실제 메뉴바 앱)

```bash
cd digital-diet
npm install
npm run install:local
```

설치 위치:

- `/Applications/Digital Diet.app`
- 바탕화면 `Digital Diet.app` (바로가기)

## 사용법

1. 메뉴바(화면 상단 오른쪽)에서 **집 아이콘** 클릭 → 앱 열림  
2. 아이콘 **우클릭**  
   - `로그인 시 자동 실행` 체크 → 맥 켤 때마다 메뉴바에 자동 상주  
   - `디지털 다이어트 종료` → 완전 종료  
3. Spotlight(`⌘ + Space`)에서 `Digital Diet` 또는 `디지털 다이어트`로 실행 가능  

## 개발 모드

```bash
npm start
```

개발 모드에서는 실행 직후 패널이 한 번 열립니다.  
패키징된 `.app`은 조용히 메뉴바에만 있다가 클릭 시 열립니다.

## 클라우드 OAuth · 실제 삭제

1. 앱에서 **Client ID 설정** → Google / Microsoft Client ID 저장  
2. **Google** / **Microsoft** 연결 (브라우저 OAuth + PKCE)  
3. **클라우드 스캔** → Drive · OneDrive · Gmail 첨부 후보를 방에 표시  
4. 쓰레기 확인 후 **실제로 치우기**
   - 로컬: macOS 휴지통
   - Drive / OneDrive / Gmail: 각 API로 삭제·휴지통 이동

자세한 발급 절차: [`docs/OAUTH_SETUP.md`](docs/OAUTH_SETUP.md)

## 중복 스캔 엔진 (Czkawka)

GUI는 쓰지 않고 **CLI만** 붙인다. MIT.

```bash
# macOS arm64 CLI 받기 (권장 — brew GUI 의존성 없음)
npm run fetch:czkawka

# 터미널에서 실제 스캔 확인
npm run scan:local

# 엔진 강제
export BIUM_SCAN_ENGINE=auto   # auto | czkawka | node | fixture
```

- `auto`: `vendor/bin/czkawka_cli` 또는 `CZKAWKA_CLI`가 있으면 BLAKE3, 없으면 Node SHA 폴백  
- 메뉴바 앱 **로컬 스캔** 버튼 → 같은 엔진  
- 설계: 루트 [`docs/SCAN_ENGINE.md`](../docs/SCAN_ENGINE.md)

## MVP 범위

- 메뉴바 상주 + 클릭 시 팝오버
- 기기·클라우드를 방으로 시각화, 중복을 쓰레기봉투로 표시
- 데모 데이터 / 로컬 스캔(Czkawka 우선) / 클라우드 스캔
- OAuth 토큰은 `safeStorage`로 암호화 저장
- 실제 삭제 지원 (설정에서 끌 수 있음)
