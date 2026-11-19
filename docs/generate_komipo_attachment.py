from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUT = Path.home() / "Downloads" / "2026_KOMIPO_BIUM_추가설명자료_2p.docx"
PIPELINE_IMAGE = Path("/tmp/komipo-pipeline.png")
ARCH_IMAGE = Path("/tmp/komipo-architecture.png")
FONT = "맑은 고딕"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color="B7B7B7", size="5"):
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


def set_cell_margins(cell, top=70, start=100, bottom=70, end=100):
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


def set_run(run, size=9, bold=False, color=None):
    run.font.name = FONT
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_heading(doc, kicker, title, subtitle):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(kicker)
    set_run(r, 8.5, bold=True, color=(49, 93, 120))
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    set_run(r, 17, bold=True)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(5)
    r = p.add_run(subtitle)
    set_run(r, 9.2, color=(75, 75, 75))


def add_picture(doc, path, width_cm):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    p.add_run().add_picture(str(path), width=Cm(width_cm))


def style_table(table):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for row in table.rows:
        for cell in row.cells:
            set_cell_border(cell)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def add_cell_text(cell, title, body, title_color=(24, 55, 70), size=8.5):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.line_spacing = 1.0
    r = p.add_run(title)
    set_run(r, size + 0.6, bold=True, color=title_color)
    r = p.add_run("\n" + body)
    set_run(r, size)


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    repeat = OxmlElement("w:tblHeader")
    repeat.set(qn("w:val"), "true")
    tr_pr.append(repeat)


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

add_heading(
    doc,
    "추가 설명자료 01 · AI 탐지 파이프라인",
    "유사 후보를 먼저 찾고, Exact로 안전하게 확정",
    "현재 구현된 로컬 AI 탐지 흐름 · 공모분야 ② AI 인프라 확대",
)
add_picture(doc, PIPELINE_IMAGE, 18.1)

cards = doc.add_table(rows=1, cols=3)
style_table(cards)
items = [
    (
        "발견 밀도",
        "연속 촬영 사진과 수정·최종본 문서를 먼저 묶어 사용자가 체감하는 정리 후보를 빠르게 확보합니다.",
        "FFF4E5",
    ),
    (
        "삭제 신뢰도",
        "크기가 같은 파일만 BLAKE3·MD5로 확인하여 완전 동일 사본을 마지막 단계에서 확정합니다.",
        "E8F5EF",
    ),
    (
        "최종 통제",
        "AI는 근거와 후보만 제시하고, 실제 보존 위치와 정리 대상은 사용자가 직접 승인합니다.",
        "EAF1FF",
    ),
]
for cell, (title, body, fill) in zip(cards.rows[0].cells, items):
    set_cell_shading(cell, fill)
    add_cell_text(cell, title, body, size=8.1)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(5)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("핵심 구현 원칙")
set_run(r, 10, bold=True)

principles = doc.add_table(rows=3, cols=2)
style_table(principles)
principle_rows = [
    ("문서 의미 유사도", "Apache Tika 3.3.2 본문 추출 → 다국어 MiniLM SBERT 임베딩 → 코사인 유사도 80% 이상"),
    ("장애 대응", "Tika·모델 사용이 어려우면 파일명 정규화와 80% 유사도 휴리스틱으로 빠르게 대체"),
    ("개인정보·보안", "본문과 임베딩은 로컬에서 처리하며 통합 인덱스에는 최소 메타데이터와 fingerprint만 사용"),
]
for row, values in zip(principles.rows, principle_rows):
    add_cell_text(row.cells[0], values[0], "", size=8.1)
    add_cell_text(row.cells[1], "", values[1], size=8.1)
    set_cell_shading(row.cells[0], "F2F2F2")

doc.add_page_break()

add_heading(
    doc,
    "추가 설명자료 02 · 구현도와 실증 가능성",
    "로컬 앱부터 클라우드·메일·조직 지표까지 연결된 작동 프로토타입",
    "실구현, 인증 필요, 향후 연동을 구분하여 제안 범위를 명확히 표시",
)
add_picture(doc, ARCH_IMAGE, 18.1)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(0)
p.paragraph_format.space_after = Pt(3)
r = p.add_run("현재 구현 범위")
set_run(r, 10, bold=True)

matrix = doc.add_table(rows=1, cols=3)
style_table(matrix)
headers = ["영역", "구현 내용", "구현 상태"]
for cell, text in zip(matrix.rows[0].cells, headers):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    set_run(r, 8.5, bold=True)
    set_cell_shading(cell, "D9EAF7")
set_repeat_table_header(matrix.rows[0])

implementation_rows = [
    (
        "사용자 앱",
        "macOS 메뉴바 Mini, 데스크톱 펫, 탐색·후보 비교·보존 위치 선택",
        "구현 완료",
    ),
    (
        "로컬 AI",
        "Czkawka 유사 사진·중복, Tika 본문, SBERT 80%, Node 해시 대체 경로",
        "구현 완료",
    ),
    (
        "외부 연결",
        "Drive·Gmail OAuth, Naver IMAP, LAN fingerprint API",
        "실연동 구현 · 사용자 인증 필요",
    ),
    (
        "정리 실행",
        "복수 위치 중 보존본 선택, macOS Trash·Drive trashed=true",
        "구현 완료",
    ),
    (
        "운영 가시화",
        "후보·승인·확보용량을 집계하는 조직 KPI 대시보드",
        "화면 프로토타입",
    ),
    (
        "배포",
        "macOS arm64/x64 DMG·ZIP, Windows x64 NSIS 빌드 설정",
        "빌드 자동화 구성",
    ),
]
for area, detail, status in implementation_rows:
    row = matrix.add_row()
    for index, text in enumerate((area, detail, status)):
        row.cells[index].text = ""
        p = row.cells[index].paragraphs[0]
        p.paragraph_format.line_spacing = 0.95
        r = p.add_run(text)
        set_run(r, 7.7, bold=index == 0)
    set_cell_shading(row.cells[0], "F7F7F7")

for row in matrix.rows:
    row.cells[0].width = Cm(2.8)
    row.cells[1].width = Cm(9.2)
    row.cells[2].width = Cm(6.1)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(5)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("KOMIPO 실증 전 보완 항목")
set_run(r, 10, bold=True)

limits = doc.add_table(rows=1, cols=3)
style_table(limits)
limit_items = [
    ("보안·권한", "사내 SSO·권한·보존기간·감사로그를 발전사 정책에 맞게 연동"),
    ("검증", "폐쇄망 샘플로 정확도, 오탐률, 검토시간, 실제 확보용량을 측정"),
    ("확장", "OneDrive는 현재 연결 자리만 존재하므로 M365 실연동을 파일럿 범위에서 추가"),
]
for cell, (title, body) in zip(limits.rows[0].cells, limit_items):
    set_cell_shading(cell, "F2F2F2")
    add_cell_text(cell, title, body, size=7.9)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(4)
p.paragraph_format.space_after = Pt(0)
r = p.add_run(
    "※ 비용·탄소 효과는 확정치로 제시하지 않고, 실증에서 확보한 저장량·요금·전력 배출계수로 별도 산정합니다."
)
set_run(r, 7.7, color=(90, 90, 90))

doc.save(OUT)
print(OUT)
