from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill


SOURCE = (
    Path.home()
    / "Downloads"
    / "붙임2. 공모요약서 양식(엑셀 파일 제출).xlsx"
)
OUTPUT = Path.home() / "Downloads" / "붙임2_공모요약서_BIUM_이지우.xlsx"

TITLE = "로컬 우선 AI 디지털 자원순환 에이전트 「BIUM」"
SUMMARY = (
    "• PC·공유저장소·클라우드·메일에 흩어진 파일을 해시와 AI 의미 유사도로 분석하여 "
    "중복·유사·장기 미사용 데이터를 자동으로 묶어 제시\n"
    "• 파일 원문은 외부 서버로 보내지 않고 로컬에서 처리하며, 사용자가 보존본과 삭제 대상을 "
    "최종 승인하는 설명 가능한 정리 방식\n"
    "• 메뉴바 AI 에이전트와 조직 대시보드로 정리 행동을 일상 업무에 연결하여 "
    "저장비용·백업부하·보안 노출면을 함께 절감"
)


workbook = load_workbook(SOURCE)
sheet = workbook["공모요약서"]

sheet["E2"] = "이지우"
sheet["E3"] = "010-4824-6873"
sheet["E3"].font = Font(
    name=sheet["E2"].font.name or "맑은 고딕",
    size=sheet["E2"].font.sz or 10,
    bold=False,
    color="000000",
)
sheet["E3"].fill = PatternFill(fill_type=None)

sheet["A7"] = 1
sheet["B7"] = "AI 인프라 확대"
sheet["C7"] = TITLE
sheet["D7"] = SUMMARY
sheet["E7"] = ""

sheet.row_dimensions[7].height = 92
sheet.page_setup.orientation = "landscape"
sheet.page_setup.fitToWidth = 1
sheet.page_setup.fitToHeight = 1
sheet.sheet_properties.pageSetUpPr.fitToPage = True
sheet.print_area = "A1:E7"

workbook.save(OUTPUT)
print(OUTPUT)
