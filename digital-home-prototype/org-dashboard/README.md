# BIUM Org · 절감 KPI 대시보드 (웹)

사내 관리자용 프로토타입입니다. 직원 BIUM 사용으로 모인 **데이터 절감 / 비용 / 다음 달 기대치**를 KPI로 봅니다.

## 실행

로컬 파일로 열면 `fetch`가 막힐 수 있어 간단 서버로 엽니다.

```bash
cd digital-home-prototype/org-dashboard
npx --yes serve -p 5177
```

브라우저: http://localhost:5177

## 화면 KPI

| KPI | 의미 |
|-----|------|
| 이번 달 데이터 절감 | 조직 합산 정리 GB (목표 대비 %) |
| 비용 절감 | BIUM과 동일 오더: `GB × (36000/8.7)` 원/년 |
| 탄소 절감 | `GB × 0.04` kgCO₂e/년 (공개 추정 오더) |
| 활성 사용자 | 시팅 대비 도입률 |
| 다음 달 기대 절감 | 주간 추세 기반 low/mid/high |
| 부서별 절감 | 목표 대비 진행 |

## 실연동 방향 (다음 단계)

1. Electron 클라이언트가 스캔/정리 완료 시 익명·집계 이벤트 전송  
   - `reclaimedBytes`, `cleanableBytes`, `actions`, `deptId`, `userHash`
2. 집계 API가 일/주/월 롤업 → `sample.json`과 동일 스키마 JSON 제공
3. 이 대시보드가 `GET /api/org/kpi?period=YYYY-MM` 를 fetch

데모 스키마: [`data/sample.json`](./data/sample.json)
