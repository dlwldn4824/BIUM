# OAuth 설정 (Google Drive · Gmail · OneDrive)

앱에서 **Client ID 설정**을 연 뒤 아래 값을 붙여넣으면 됩니다.

## Google (Drive + Gmail)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 접속
2. 프로젝트 생성
3. **API 및 서비스 → 라이브러리**에서 사용 설정
   - Google Drive API
   - Gmail API
4. **OAuth 동의 화면** 구성 (외부/테스트 사용자에 본인 Gmail 추가)
5. **사용자 인증 정보 → OAuth 클라이언트 ID 만들기**
   - 애플리케이션 유형: **데스크톱 앱**
6. 발급된 Client ID를 앱 설정에 저장
7. 앱에서 **Google 연결** → 브라우저 로그인 → Drive/Gmail 스캔

필요 스코프:
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/gmail.modify`

## Microsoft (OneDrive)

1. [Azure Portal 앱 등록](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. **새 등록**
   - 지원 계정 유형: 개인 Microsoft 계정 포함
   - 리디렉션 URI: **공용 클라이언트/네이티브** → `http://127.0.0.1`
3. **인증**에서 **공용 클라이언트 흐름 허용 = 예** (PKCE)
4. **API 사용 권한** 추가
   - Microsoft Graph: `User.Read`, `Files.ReadWrite`, (위임)
5. 개요의 **애플리케이션(클라이언트) ID**를 앱에 저장
6. 앱에서 **Microsoft 연결** → OneDrive 스캔

## 삭제 동작

| 대상 | 동작 |
| --- | --- |
| 로컬 파일 | macOS 휴지통으로 이동 (`shell.trashItem`) |
| Google Drive | Drive API로 삭제(휴지통) |
| OneDrive | Graph API로 삭제(휴지통) |
| Gmail | 해당 메일을 휴지통으로 이동 |

설정에서 **실제 삭제 허용**을 끄면 삭제 IPC가 거부됩니다.
