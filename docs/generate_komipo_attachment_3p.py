from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt, RGBColor


OUT = Path.home() / "Downloads" / "2026_KOMIPO_BIUM_추가설명자료_3p.docx"
MINI = Path("/tmp/bium-mini-implemented.png")
FINDINGS = Path("/tmp/bium-findings-implemented.png")
PIPELINE = Path("/tmp/komipo-pipeline.png")
DASHBOARD = Path("/tmp/bium-dashboard-wide.png")
FONT = "맑은 고딕"


def set_run(run, size=9, bold=False, color=None):
    run.font.name = FONT
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def set_fill(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_border(cell, color="C7C7C7", size="5"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        node = borders.find(qn(f"w:{edge}"))
        if node is None:
            node = OxmlElement(f"w:{edge}")
            borders.append(node)
        node.set(qn("w:val"), "single")
        node.set(qn("w:sz"), size)
        node.set(qn("w:color"), color)


def set_margins(cell, top=75, start=110, bottom=75, end=110):
    tc_pr = cell._tc.get_or_add_tcPr()
    margins = tc_pr.first_child_found_in("w:tcMar")
    if margins is None:
        margins = OxmlElement("w:tcMar")
        tc_pr.append(margins)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = margins.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            margins.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def style_table(table):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for row in table.rows:
        for cell in row.cells:
            set_border(cell)
            set_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def heading(doc, page, title, subtitle):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(f"추가 설명자료 {page:02d}")
    set_run(r, 8.5, bold=True, color=(49, 93, 120))
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    set_run(r, 16.5, bold=True)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(5)
    r = p.add_run(subtitle)
    set_run(r, 9.2, color=(75, 75, 75))


def caption(cell, title, body):
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(title)
    set_run(r, 9.3, bold=True)
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(body)
    set_run(r, 7.8, color=(80, 80, 80))


def card(cell, title, body, fill):
    cell.text = ""
    set_fill(cell, fill)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    set_run(r, 9.2, bold=True, color=(24, 55, 70))
    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.0
    r = p.add_run(body)
    set_run(r, 8.1)


doc = Document()
section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(11)
section.bottom_margin = Mm(11)
section.left_margin = Mm(13)
section.right_margin = Mm(13)

normal = doc.styles["Normal"]
normal.font.name = FONT
normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
normal.font.size = Pt(9)

# 1. 실제 사용자 화면
heading(
    doc,
    1,
    "메뉴바에서 탐색하고, 후보를 직접 확인",
    "실제 구현된 BIUM Mini와 Findings Hub 실행 화면",
)

screens = doc.add_table(rows=1, cols=2)
style_table(screens)
for cell, image, title, body in (
    (
        screens.cell(0, 0),
        MINI,
        "BIUM Mini",
        "정리 후보·새 발견·연결 기기와 두 가지 탐색 방식을 한 화면에서 제공",
    ),
    (
        screens.cell(0, 1),
        FINDINGS,
        "Findings Hub",
        "동일·유사 후보를 종류별로 보여주고 사용자가 검토 단계로 진입",
    ),
):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(image), width=Cm(7.4))
    caption(cell, title, body)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(5)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("사용자 흐름")
set_run(r, 10, bold=True)

flow = doc.add_table(rows=1, cols=4)
style_table(flow)
for cell, text, fill in zip(
    flow.rows[0].cells,
    [
        "① 탐색 시작\n로컬·연결 공간 확인",
        "② 후보 생성\n사진·문서·Exact 분리",
        "③ 비교·선택\n남길 위치 직접 지정",
        "④ 복구 가능한 정리\n로컬·Drive 휴지통",
    ],
    ["FFF4E5", "FFF4E5", "EAF1FF", "E8F5EF"],
):
    cell.text = ""
    set_fill(cell, fill)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    set_run(r, 8.1, bold=True)

doc.add_page_break()

# 2. 탐지 파이프라인
heading(
    doc,
    2,
    "유사 후보를 먼저 찾고, Exact로 안전하게 확정",
    "사진·문서·완전 동일 탐지를 분리해 정리 효과와 신뢰도를 함께 확보",
)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(5)
p.add_run().add_picture(str(PIPELINE), width=Cm(18.1))

cards = doc.add_table(rows=1, cols=3)
style_table(cards)
for cell, values in zip(
    cards.rows[0].cells,
    [
        (
            "유사 사진",
            "Czkawka image와 지각 해시로 연속 촬영·리사이즈처럼 거의 같은 이미지를 묶습니다.",
            "FFF4E5",
        ),
        (
            "유사 문서",
            "Tika로 본문을 로컬 추출하고 다국어 SBERT 코사인 유사도 80% 이상을 후보로 구성합니다.",
            "FFF4E5",
        ),
        (
            "Exact 확정",
            "크기가 같은 파일만 BLAKE3·MD5로 비교하여 바이트 단위 동일 사본을 확정합니다.",
            "E8F5EF",
        ),
    ],
):
    card(cell, *values)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(5)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("설계 원칙")
set_run(r, 10, bold=True)

principles = doc.add_table(rows=3, cols=2)
style_table(principles)
for row, (label, detail) in zip(
    principles.rows,
    [
        ("로컬 우선", "파일 본문과 임베딩은 외부 서버로 보내지 않고 기기 안에서 처리"),
        ("설명 가능한 추천", "파일명·위치·수정일·유사도 등 사용자가 확인할 수 있는 근거 제시"),
        ("사용자 최종 승인", "자동 삭제하지 않고 보존본과 정리 대상을 사용자가 직접 결정"),
    ],
):
    card(row.cells[0], label, "", "F2F2F2")
    card(row.cells[1], "", detail, "FFFFFF")

doc.add_page_break()

# 3. 조직 운영 화면과 구현 범위
heading(
    doc,
    3,
    "개인 정리 행동을 조직 운영 지표로 연결",
    "구현된 조직 KPI 화면과 KOMIPO 실증 시 필요한 보완 범위",
)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(2)
p.add_run().add_picture(str(DASHBOARD), width=Cm(18.1))

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(4)
r = p.add_run("조직 KPI 화면 프로토타입 · 현재 수치는 기능 검증용 데모 데이터")
set_run(r, 7.7, color=(90, 90, 90))

matrix = doc.add_table(rows=1, cols=3)
style_table(matrix)
for cell, text in zip(matrix.rows[0].cells, ["구현 영역", "현재 구현", "실증 시 보완"]):
    cell.text = ""
    set_fill(cell, "D9EAF7")
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    set_run(r, 8.6, bold=True)

rows = [
    ("탐색·분석", "로컬 파일, Drive·Gmail, Naver IMAP, LAN fingerprint", "사내 저장소·M365 연결"),
    ("AI 엔진", "유사 사진, Tika·SBERT 문서 80%, BLAKE3 Exact", "업무 문서 표본 정확도 검증"),
    ("사용자 통제", "후보 비교, 보존 위치 선택, 복구 가능한 휴지통", "보존기간·권한·감사로그"),
    ("운영 지표", "후보·승인·확보용량·부서별 KPI 화면", "실측 텔레메트리와 비용계수"),
]
for values in rows:
    row = matrix.add_row()
    for index, text in enumerate(values):
        row.cells[index].text = ""
        p = row.cells[index].paragraphs[0]
        p.paragraph_format.line_spacing = 0.95
        r = p.add_run(text)
        set_run(r, 7.7, bold=index == 0)
        if index == 0:
            set_fill(row.cells[index], "F7F7F7")

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(4)
p.paragraph_format.space_after = Pt(0)
r = p.add_run(
    "※ 비용·탄소 효과는 확정값으로 단정하지 않고, 파일럿에서 확인한 확보용량·저장요금·전력 배출계수로 산정합니다."
)
set_run(r, 7.7, color=(90, 90, 90))

doc.save(OUT)
print(OUT)
