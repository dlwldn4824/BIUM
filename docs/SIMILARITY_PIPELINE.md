# 유사도 3단계 재정리 파이프라인

BIUM은 “파일을 멋대로 지우는” 대신 **정리 가능한 묶음으로 재구성**한다.

## 신뢰도 등급

| 등급 | 종류 | 사용자 행동 |
|------|------|-------------|
| **확실함** | 완전 동일 (해시 일치) | 하나만 남기기 제안 · **로컬 Desktop 추천** |
| **높은 유사도** | 비슷한 사진 스택 | 1장 / 3장 / 모두 보기 선택 |
| **재확인 필요** | 유사 문서·버전 파일명 | 비교 / 모으기 / 그대로 두기 (삭제 강제 없음) |

용어:

- **중복** = exact hash match  
- **재확인 후보** = 의미·파일명 유사 (지우면 위험할 수 있음)

## 해커톤 구현 (현재)

```text
Czkawka / index       → exact duplicates
Czkawka image         → similar photos
Apache Tika 3.3.2     → PDF/PPT/DOC 본문 로컬 추출
Multilingual MiniLM   → SBERT 임베딩 + cosine ≥ 0.80
filename heuristic    → 추출·모델 실패 시 80% fallback
explainCandidate      → 규칙 기반 설명
Mini Findings Hub     → 3등급 UI
```

코드:

- `digital-home-prototype/electron/engines/similarPhotos.js`
- `digital-home-prototype/electron/engines/similarDocs.js`
- `digital-home-prototype/electron/engines/documentEmbeddings.js`
- `digital-home-prototype/electron/engines/explainCandidate.js`
- fixtures: `similar-photos.sample.json`, `similar-docs.sample.json`

## 장기 스택

```text
[파일 스캔]
   ↓
Czkawka
   ├─ exact duplicate
   ├─ similar image
   └─ similar video
   ↓
imagededup (pHash / dHash / CNN)
   └─ 사진 near-duplicate clustering
   ↓
Apache Tika
   └─ PDF/PPT/DOC 텍스트·메타데이터 추출
   ↓
Sentence Transformers
   └─ 문서 임베딩 · cosine similarity
   ↓
filename similarity
   ↓
후보 그룹 생성
   ↓
Claude (메타만)
   └─ 후보 설명 / 최신본 추정 / 차이 요약
   ↓
Mini
   ├─ 완전 동일
   ├─ 비슷한 사진
   └─ 비슷한 문서 (재확인)
```

## Claude 역할

탐지 엔진이 아니다. 오픈소스가 후보를 만든 뒤에만:

- 왜 묶였는지
- 어떤 파일이 최신으로 보이는지
- 비교를 권하는지

를 1~2문장으로 설명한다. `ANTHROPIC_API_KEY`가 없으면 규칙 기반 stub을 쓴다.

## 탄소·로컬 우선

완전 동일 keep 추천은 **Google Drive가 아니라 Desktop/로컬**.  
클라우드 사본을 줄이는 쪽이 데이터센터 부하·구독 부담 완화에 유리하다.
