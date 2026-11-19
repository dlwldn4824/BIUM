from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets" / "ai-case-contest"
OUT = Path.home() / "Downloads" / "전국민_AI활용_사례_공모전_시즌2_BIUM_이지우.docx"
FONT = "맑은 고딕"
NAVY = (25, 48, 74)
BLUE = (46, 104, 166)
GRAY = (92, 101, 112)


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


def set_border(cell, color="D6DCE3", size="5"):
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


def set_margins(cell, top=90, start=120, bottom=90, end=120):
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


def add_text(cell, title, body="", fill="FFFFFF", center=False, size=8.4):
    cell.text = ""
    set_fill(cell, fill)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2 if body else 0)
    p.paragraph_format.line_spacing = 1.0
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(title)
    set_run(r, size + 0.7, bold=True, color=NAVY)
    if body:
        p = cell.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        if center:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(body)
        set_run(r, size)


def page_heading(doc, number, title, subtitle):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(f"2026 전국민 AI 활용 사례 공모전 시즌 2 · {number:02d}")
    set_run(r, 8.5, bold=True, color=BLUE)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    set_run(r, 17, bold=True, color=NAVY)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(5)
    r = p.add_run(subtitle)
    set_run(r, 9.2, color=GRAY)


def paragraph(doc, text, size=9, bold=False, color=None, after=3, align=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.05
    if align is not None:
        p.alignment = align
    r = p.add_run(text)
    set_run(r, size, bold=bold, color=color)
    return p


def caption(cell, title, body):
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(title)
    set_run(r, 8.5, bold=True, color=NAVY)
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(body)
    set_run(r, 7.5, color=GRAY)


doc = Document()
section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(12)
section.bottom_margin = Mm(12)
section.left_margin = Mm(14)
section.right_margin = Mm(14)

normal = doc.styles["Normal"]
normal.font.name = FONT
normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
normal.font.size = Pt(9)

# 1. 표지와 실제 경험
paragraph(doc, "2026 전국민 AI 활용 사례 공모전 시즌 2", 10, True, BLUE, 10)
paragraph(
    doc,
    "AI가 내 파일을 대신 버리지 않고,\n버릴 근거를 설명해 줍니다",
    24,
    True,
    NAVY,
    7,
)
paragraph(
    doc,
    "로컬 우선 AI 디지털 자원순환 에이전트 「BIUM」",
    13,
    True,
    BLUE,
    14,
)

hero = doc.add_table(rows=2, cols=2)
style_table(hero)
add_text(hero.cell(0, 0), "공모 분야", "④ 업무 생산성 개선을 위한 AI 활용", "EAF2F8", size=9)
add_text(hero.cell(0, 1), "참가자", "이지우", "F5F7FA", size=9)
add_text(
    hero.cell(1, 0),
    "내가 겪은 문제",
    "노트북·클라우드·메일에 ‘최종’, ‘진짜최종’, 사본 파일이 쌓였지만 무엇을 남겨야 할지 판단하려면 파일을 하나씩 열어봐야 했습니다.",
    "FFF7E8",
    size=8.8,
)
add_text(
    hero.cell(1, 1),
    "내가 AI를 쓴 방식",
    "파일 원문을 외부로 보내지 않고 기기 안에서 의미·이미지·해시를 비교해 후보를 만들고, AI가 제시한 근거를 확인한 뒤 제가 보존본을 최종 선택했습니다.",
    "EEF7F2",
    size=8.8,
)

paragraph(doc, "한 줄 요약", 11, True, NAVY, 2)
paragraph(
    doc,
    "‘자동 삭제’가 아니라 ‘설명 가능한 정리 후보’를 만드는 AI로 반복적인 파일 비교 시간을 줄인 실제 개발·활용 사례입니다.",
    11,
    True,
    BLUE,
    9,
)

facts = doc.add_table(rows=1, cols=3)
style_table(facts)
for cell, title, body in zip(
    facts.rows[0].cells,
    ["실제 적용", "사용자 통제", "재현 가능"],
    [
        "BIUM Mini·Findings Hub 프로토타입을 직접 개발하고 로컬 파일 탐색 흐름을 사용",
        "AI는 후보와 근거만 제시하고 삭제·보존 결정은 사람이 수행",
        "일반 PC에서도 파일명·본문·이미지·해시 비교 단계로 동일 흐름 적용 가능",
    ],
):
    add_text(cell, title, body, "F5F7FA", center=True, size=8)

paragraph(
    doc,
    "※ 본 자료의 화면은 직접 구현한 프로토타입입니다. 조직 KPI 수치는 기능 검증용 예시이며 실제 절감량으로 제시하지 않습니다.",
    7.8,
    color=GRAY,
    after=0,
)

doc.add_page_break()

# 2. 실제 사용 장면
page_heading(
    doc,
    2,
    "정리하고 싶지만, 함부로 지울 수 없었습니다",
    "문제 인식 → AI 탐색 → 후보 확인 → 보존본 선택까지 직접 사용한 흐름",
)

screens = doc.add_table(rows=1, cols=2)
style_table(screens)
for cell, image, title, body in (
    (
        screens.cell(0, 0),
        ASSETS / "bium-mini.png",
        "① BIUM Mini에서 탐색 시작",
        "로컬·연결 공간을 확인하고 유사 파일 또는 제목·내용 탐색을 시작합니다.",
    ),
    (
        screens.cell(0, 1),
        ASSETS / "bium-findings.png",
        "② Findings Hub에서 후보 확인",
        "사진·문서·완전 동일 후보를 나눠 보고 비교 대상으로 이동합니다.",
    ),
):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(image), width=Cm(7.4))
    caption(cell, title, body)

paragraph(doc, "제가 실제로 확인한 변화", 11, True, NAVY, 3)
changes = doc.add_table(rows=3, cols=2)
style_table(changes)
for row, before, after in zip(
    changes.rows,
    [
        "파일명을 보고 하나씩 열어 비교",
        "같은 파일인지 확신이 없어 정리를 미룸",
        "정리 도구가 자동 삭제할까 불안",
    ],
    [
        "AI가 의미·이미지 유사 후보를 먼저 묶어 검토 범위를 축소",
        "경로·수정일·유사도·Exact 여부를 함께 보고 판단",
        "보존본을 직접 고르고 복구 가능한 휴지통으로만 이동",
    ],
):
    add_text(row.cells[0], "이전", before, "FFF4E5", size=8.1)
    add_text(row.cells[1], "BIUM 사용 후", after, "EAF4EE", size=8.1)

paragraph(
    doc,
    "중요: 실제 확보 용량이나 시간 절감률은 아직 사용자 실증 전이므로 임의의 숫자로 꾸미지 않았습니다.",
    8,
    True,
    GRAY,
    0,
)

doc.add_page_break()

# 3. AI 활용 절차
page_heading(
    doc,
    3,
    "AI는 무엇을 보고 후보를 만들었나",
    "목적에 맞는 도구를 조합하고, 유사 후보와 완전 동일 판정을 분리했습니다",
)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(5)
p.add_run().add_picture(str(ASSETS / "bium-pipeline.png"), width=Cm(18.0))

pipeline = doc.add_table(rows=1, cols=3)
style_table(pipeline)
for cell, title, body, fill in zip(
    pipeline.rows[0].cells,
    ["유사 사진", "유사 문서", "Exact 확인"],
    [
        "지각 해시와 이미지 유사 탐색으로 연속 촬영·리사이즈 사진처럼 ‘거의 같은’ 후보를 묶습니다.",
        "Apache Tika로 본문을 로컬 추출하고 다국어 SBERT 임베딩의 코사인 유사도로 내용이 비슷한 문서를 찾습니다.",
        "크기가 같은 파일만 BLAKE3·MD5로 비교하여 바이트 단위로 동일한 사본을 마지막에 확정합니다.",
    ],
    ["FFF4E5", "EAF2F8", "EAF4EE"],
):
    add_text(cell, title, body, fill, size=8.1)

paragraph(doc, "선택 이유", 11, True, NAVY, 2)
paragraph(
    doc,
    "의미 유사도만으로 삭제를 결정하면 오탐 위험이 있고, 해시만 사용하면 수정본·유사본을 놓칩니다. 그래서 ‘AI로 넓게 발견하고 → Exact로 안전하게 확인하고 → 사람이 최종 승인’하는 순서를 사용했습니다.",
    9.3,
    after=6,
)

steps = doc.add_table(rows=1, cols=4)
style_table(steps)
for cell, title, body in zip(
    steps.rows[0].cells,
    ["1. 수집", "2. 분석", "3. 설명", "4. 결정"],
    [
        "경로·크기·수정일 등 최소 정보",
        "본문·이미지·해시를 기기 안에서 비교",
        "유사도와 위치 등 판단 근거 표시",
        "사용자가 보존본과 정리 대상을 선택",
    ],
):
    add_text(cell, title, body, "F5F7FA", center=True, size=7.7)

doc.add_page_break()

# 4. 재현성과 확산
page_heading(
    doc,
    4,
    "누구나 따라 할 수 있는 ‘승인형 파일 정리’",
    "특정 조직에만 필요한 기술이 아니라 개인 PC와 소규모 팀에서도 재현할 수 있습니다",
)

paragraph(doc, "재현 절차", 11, True, NAVY, 3)
repro = doc.add_table(rows=5, cols=2)
style_table(repro)
for row, number, body in zip(
    repro.rows,
    ["01", "02", "03", "04", "05"],
    [
        "정리할 폴더를 정하고 보존 제외 폴더와 기간을 먼저 설정합니다.",
        "완전 동일 파일과 유사 사진·문서를 서로 다른 후보군으로 탐색합니다.",
        "AI가 제시한 경로·수정일·유사도와 실제 미리보기를 함께 확인합니다.",
        "업무 접근성이 좋은 위치의 파일 하나를 보존본으로 직접 선택합니다.",
        "나머지는 즉시 영구 삭제하지 않고 복구 가능한 휴지통으로 이동합니다.",
    ],
):
    add_text(row.cells[0], number, "", "DCEAF7", center=True, size=9)
    add_text(row.cells[1], "", body, "FFFFFF", size=8.6)

paragraph(doc, "확산 가능성", 11, True, NAVY, 3)
spread = doc.add_table(rows=1, cols=3)
style_table(spread)
for cell, title, body in zip(
    spread.rows[0].cells,
    ["개인", "소규모 팀", "조직"],
    [
        "다운로드·사진·과제 폴더의 중복과 수정본 정리",
        "공유폴더에서 최신본·보존본을 합의하고 반복 비교 감소",
        "승인율·후보 용량·확보 용량을 집계하되 원문은 로컬에 유지",
    ],
):
    add_text(cell, title, body, "F5F7FA", center=True, size=8.1)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(2)
p.paragraph_format.space_after = Pt(2)
p.add_run().add_picture(str(ASSETS / "bium-dashboard.png"), width=Cm(11.5))
paragraph(
    doc,
    "조직 확장 화면 예시 · 표시 수치는 UI 기능 검증용 데모 데이터",
    7.7,
    color=GRAY,
    after=0,
    align=WD_ALIGN_PARAGRAPH.CENTER,
)

doc.add_page_break()

# 5. 윤리·책임성과 평가 기준 대응
page_heading(
    doc,
    5,
    "유용한 AI보다 먼저, 책임 있는 AI",
    "개인정보·저작권·오판 가능성을 줄이는 통제 장치를 활용 과정에 포함했습니다",
)

ethics = doc.add_table(rows=4, cols=2)
style_table(ethics)
for row, title, body in zip(
    ethics.rows,
    ["개인정보 보호", "오판 방지", "사용자 책임", "과장 방지"],
    [
        "파일 본문과 임베딩은 외부 서버로 보내지 않고 로컬에서 처리하며, 통합 목록에는 최소 메타데이터만 사용합니다.",
        "AI 유사도는 삭제 판정이 아니라 검토 후보 생성에만 사용하고, Exact 해시와 실제 미리보기로 다시 확인합니다.",
        "자동 영구 삭제를 금지하고 사용자가 보존본을 직접 선택하며, 정리 대상은 복구 가능한 휴지통으로 이동합니다.",
        "절감 시간·용량·탄소효과는 실제 측정 전에는 확정값으로 제시하지 않고 데모 수치와 실측치를 명확히 구분합니다.",
    ],
):
    add_text(row.cells[0], title, "", "DCEAF7", center=True, size=8.6)
    add_text(row.cells[1], "", body, "FFFFFF", size=8.4)

paragraph(doc, "평가기준에 대한 답", 11, True, NAVY, 3)
scores = doc.add_table(rows=2, cols=2)
style_table(scores)
for cell, title, body, fill in (
    (
        scores.cell(0, 0),
        "제안분야 적합성",
        "반복적인 파일 탐색·비교·정리 업무를 AI로 줄이는 구체적인 생산성 개선 사례",
        "F5F7FA",
    ),
    (
        scores.cell(0, 1),
        "AI 활용 적정성",
        "문서·이미지·Exact 목적별 도구를 분리하고 판단 근거와 최종 승인 절차를 결합",
        "F5F7FA",
    ),
    (
        scores.cell(1, 0),
        "창의성·실용성",
        "‘자동 삭제’ 대신 ‘설명 가능한 승인형 정리’로 일반 PC와 팀 업무에 재현 가능",
        "F5F7FA",
    ),
    (
        scores.cell(1, 1),
        "윤리·책임성",
        "로컬 처리, 최소수집, 오판 방지, 복구 가능성, 과장 없는 효과 표시를 적용",
        "F5F7FA",
    ),
):
    add_text(cell, title, body, fill, size=8.1)

paragraph(doc, "AI·기술 활용 표시", 10, True, NAVY, 2)
paragraph(
    doc,
    "Apache Tika(문서 본문 추출), 다국어 SBERT/MiniLM 계열 임베딩(문서 의미 유사도), 지각 해시·Czkawka(유사 이미지), BLAKE3·MD5(완전 동일 확인)를 활용했습니다. 화면과 설명자료는 참가자가 직접 구현·정리했습니다.",
    8.3,
    after=4,
)
paragraph(
    doc,
    "본 사례는 참가자의 실제 개발·적용 경험을 기반으로 작성했으며, 타인의 사례나 타 공모전 수상작을 복제하지 않았습니다.",
    8.4,
    True,
    BLUE,
    0,
)

doc.save(OUT)
print(OUT)
