from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt, RGBColor


OUT = Path.home() / "Downloads" / "2026_KOMIPO_BIUM_공모신청서_작성본.docx"
FONT = "맑은 고딕"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color="808080", size="6"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_run_font(run, size=10, bold=False, color=None):
    run.font.name = FONT
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def clear_cell(cell):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.05
    return p


def add_text(cell, text, size=9.5, bold=False, align=None, color=None):
    p = clear_cell(cell)
    if align is not None:
        p.alignment = align
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold, color=color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    return p


def add_lines(cell, lines, size=9.2):
    p = clear_cell(cell)
    for i, line in enumerate(lines):
        if i:
            p.add_run().add_break()
        run = p.add_run(line)
        set_run_font(run, size=size)
    return p


def style_table(table):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for row in table.rows:
        for cell in row.cells:
            set_cell_border(cell)
            set_cell_margins(cell)


def set_width(cell, width_cm):
    cell.width = Cm(width_cm)
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    tc_w.set(qn("w:w"), str(int(width_cm * 567)))
    tc_w.set(qn("w:type"), "dxa")


doc = Document()
section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(13)
section.bottom_margin = Mm(13)
section.left_margin = Mm(18)
section.right_margin = Mm(18)

normal = doc.styles["Normal"]
normal.font.name = FONT
normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
normal.font.size = Pt(9.5)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
r = p.add_run("[붙임1]")
set_run_font(r, 9, bold=True)
p.paragraph_format.space_after = Pt(3)

table = doc.add_table(rows=5, cols=4)
style_table(table)
title = table.cell(0, 0).merge(table.cell(0, 3))
add_text(
    title,
    "2026 KOMIPO 「혁신 50대 과제」 아이디어 공모 신청서(국민)",
    size=13,
    bold=True,
    align=WD_ALIGN_PARAGRAPH.CENTER,
)
set_cell_shading(title, "EAF2F8")

add_text(table.cell(1, 0), "성    명", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
add_text(table.cell(1, 1), "이지우", align=WD_ALIGN_PARAGRAPH.CENTER)
add_text(table.cell(1, 2), "연 락 처", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
add_text(
    table.cell(1, 3),
    "010-4824-6873",
    align=WD_ALIGN_PARAGRAPH.CENTER,
)

add_text(table.cell(2, 0), "제목(분야)", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
title_cell = table.cell(2, 1).merge(table.cell(2, 3))
add_lines(
    title_cell,
    [
        "로컬 우선 AI 디지털 자원순환 에이전트 「BIUM」",
        "(분야: ② AI 인프라 확대)",
    ],
    size=10.5,
)
title_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

add_text(table.cell(3, 0), "과제 요약", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
summary = table.cell(3, 1).merge(table.cell(3, 3))
add_lines(
    summary,
    [
        "○ PC·공유저장소·클라우드·메일에 흩어진 파일을 해시와 AI 의미 유사도로 분석하여 중복·유사·장기 미사용 데이터를 자동으로 묶어 제시",
        "○ 파일 원문은 외부 서버로 보내지 않고 로컬에서 처리하며, 사용자가 보존본과 삭제 대상을 최종 승인하는 설명 가능한 정리 방식",
        "○ 메뉴바 AI 에이전트와 조직 대시보드로 정리 행동을 일상 업무에 연결하여 저장비용·백업부하·보안 노출면을 함께 절감",
    ],
    size=9.2,
)

note = table.cell(4, 0).merge(table.cell(4, 3))
add_text(note, "", size=8)

widths = [3.0, 6.0, 3.0, 5.4]
for row in table.rows:
    for index, width in enumerate(widths):
        if index < len(row.cells):
            set_width(row.cells[index], width)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(4)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("○ 공모분야 : ①청정에너지 선도 / ②AI 인프라 확대 / ③지속성장 촉진")
set_run_font(r, 8.5)

fit = doc.add_table(rows=4, cols=3)
style_table(fit)
headers = ["청정에너지 선도", "AI 인프라 확대", "지속성장 촉진"]
for i, text in enumerate(headers):
    add_text(fit.cell(0, i), text, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_shading(fit.cell(0, i), "F2F2F2")
category_rows = [
    (
        "재생에너지 확대 등\n에너지 전환 선도",
        "AI기반 업무 자동화 및\n일하는 방식 혁신",
        "협력기업, 지역사회와의\n동반성장 및 상생협력",
    ),
    (
        "탄소감축, 자원순환 등\n친환경 발전소 구현",
        "발전·정비·안전관리의\n지능화 및 현장 적용",
        "안전, 인적자원 관리 등\n지속가능경영 기반 고도화",
    ),
    (
        "해외 재생에너지\n신규 사업영역 확대",
        "데이터·디지털 플랫폼 기반\n서비스 및 신사업 발굴",
        "재무건전성 확보를 통한\n신성장 동력 창출",
    ),
]
for row_index, row_values in enumerate(category_rows, start=1):
    for column_index, text in enumerate(row_values):
        add_text(
            fit.cell(row_index, column_index),
            text,
            size=7.8,
            align=WD_ALIGN_PARAGRAPH.CENTER,
        )

for text in [
    "○ 개인정보 수집·이용 동의서 제출 필수",
    "  - 혁신 50대 과제 선정 결과 알림, 포상 지급 등을 위해 성명, 연락처 기재",
    "○ 2개 이상의 분야에 복수 응모 가능하며 양식을 준수하여 작성 바랍니다.",
    "○ 본문은 가급적 2페이지 이내로 요약 작성, 설명 자료는 추가로 제출 가능",
]:
    p = doc.add_paragraph(style=None)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(text)
    set_run_font(r, 8)

doc.add_page_break()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.LEFT
r = p.add_run("(본 문)")
set_run_font(r, 9)
p.paragraph_format.space_after = Pt(2)

body = doc.add_table(rows=4, cols=2)
style_table(body)
labels = [
    "제목(분야)",
    "추진배경\n(현황)",
    "구체적\n추진방안",
    "기대효과",
]
contents = [
    [
        "로컬 우선 AI 디지털 자원순환 에이전트 「BIUM」",
        "(분야: ② AI 인프라 확대)",
    ],
    [
        "○ 디지털 업무 확대에 따라 PC, 부서 공유폴더, 클라우드와 메일에 동일·유사 문서가 반복 저장되고 ‘최종·진짜최종’ 같은 버전이 누적됨.",
        "  - 사용량은 확인할 수 있어도 업무상 보존 가치와 중복 여부를 한눈에 판단하기 어려워 담당자가 파일을 일일이 열어보는 시간이 발생함.",
        "○ 불필요 데이터는 저장공간뿐 아니라 백업·동기화·재해복구 범위와 정보보안 관리 대상을 함께 확대함.",
        "○ 기존 정리 도구는 단일 저장소의 완전 동일 파일 탐지에 치우쳐, 여러 공간에 흩어진 문서의 의미상 유사성이나 안전한 보존본 선택 근거를 제공하지 못함.",
        "○ 따라서 업무 파일 원문을 외부로 반출하지 않으면서 AI가 정리 후보를 설명하고, 사람이 최종 승인하는 로컬 우선 자동화가 필요함.",
    ],
    [
        "○ 1단계｜분산 저장공간 인벤토리 구축",
        "  - 사내 PC·공유저장소·클라우드·메일 커넥터에서 파일명, 경로, 크기, 수정일, 해시 등 최소 메타데이터만 수집하고 파일 본문은 외부 서버로 전송하지 않음.",
        "○ 2단계｜‘유사 후보 우선 → 완전 동일 확정’ AI 탐지",
        "  - 사진은 지각 해시, 문서는 Apache Tika로 로컬 본문 추출 후 다국어 SBERT 임베딩의 코사인 유사도 80% 이상을 후보로 구성.",
        "  - 크기 사전 필터와 BLAKE3·MD5 해시로 완전 동일 파일을 최종 확인해 오탐과 불필요한 전수 연산을 줄임.",
        "○ 3단계｜설명 가능한 보존·정리 추천",
        "  - 최신 수정일, 저장 위치, 원본 경로, 업무 접근성을 근거로 ‘남길 파일 1개’를 추천하고 나머지는 복구 가능한 휴지통 이동 대상으로 제시.",
        "  - 자동 삭제하지 않고 사용자가 비교 화면에서 승인하도록 하며, 예외 폴더·보존기간·권한 정책을 적용.",
        "○ 4단계｜현장형 AI 에이전트와 조직 대시보드",
        "  - 메뉴바의 경량 에이전트가 탐색·검토·승인 흐름을 안내하고, 관리자는 부서별 후보 용량·승인율·확보 용량·처리시간을 집계.",
        "○ 실증 로드맵(8주)",
        "  - 1~2주: 대상 부서와 보존정책 정의 → 3~4주: 폐쇄망 PC 파일럿 → 5~6주: 승인형 정리와 저장소 연동 → 7~8주: 정확도·업무시간·확보용량 평가 후 확대.",
    ],
    [
        "○ 계량 효과",
        "  - 중복·유사 파일 검토시간, 정리 승인율, 실제 확보용량, 백업 대상량을 전후 비교하여 절감 효과를 검증.",
        "  - 저장장치 증설과 클라우드 구독·백업·네트워크 비용을 줄이고, 반복 파일 탐색·수동 비교 업무시간을 단축.",
        "○ 비계량 효과",
        "  - 데이터 최소수집·로컬 분석으로 정보보안과 개인정보보호를 강화하고 불필요한 데이터 보유 위험을 축소.",
        "  - 설명 가능한 추천과 사용자 승인 절차로 AI 자동화에 대한 현장 수용성과 신뢰를 확보.",
        "  - 자원순환형 디지털 업무문화를 정착시키고 향후 발전·정비·안전 문서 지능화 플랫폼으로 확장 가능.",
        "※ 탄소효과는 고정 환산값으로 단정하지 않고 실제 저장소의 지역·전력·서비스별 검증 계수를 확보한 경우에만 별도 산정.",
    ],
]

for row_index, label in enumerate(labels):
    add_text(body.cell(row_index, 0), label, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_shading(body.cell(row_index, 0), "EAF2F8")
    add_lines(
        body.cell(row_index, 1),
        contents[row_index],
        size=7.65 if row_index == 2 else 8.0,
    )
    body.cell(row_index, 1).paragraphs[0].paragraph_format.line_spacing = 0.92
    set_cell_margins(body.cell(row_index, 1), top=45, start=95, bottom=45, end=95)
    set_width(body.cell(row_index, 0), 2.8)
    set_width(body.cell(row_index, 1), 14.6)

row_heights = [Cm(1.2), Cm(4.6), Cm(9.7), Cm(5.0)]
for row, height in zip(body.rows, row_heights):
    row.height = height

footer = doc.add_paragraph()
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.paragraph_format.space_before = Pt(4)
r = footer.add_run("제안자: 이지우")
set_run_font(r, 9, bold=True)

doc.save(OUT)
print(OUT)
