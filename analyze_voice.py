import collections
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
from sklearn.decomposition import NMF
from sklearn.feature_extraction.text import TfidfVectorizer


ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "output" / "raw_reviews.jsonl"
OUTPUT = ROOT / "output"


LABEL_PATTERNS = {
    "file_flood": [
        r"\b(out of|running out of|not enough|low) (space|storage)\b",
        r"\b(storage|drive|inbox|phone|cloud) (is |was )?(full|cluttered|messy)\b",
        r"\btoo many (files|photos|emails|messages|copies)\b",
        r"\b(hundreds|thousands|millions) of (files|photos|emails|messages|images)\b",
        r"\b(digital )?(clutter|mess|overwhelm(?:ed|ing)?)\b",
        r"용량.{0,10}(부족|모자|가득|없)",
        r"(파일|사진|메일|알림).{0,10}(쌓|너무 많|수백|수천|정리)",
        r"(저장공간|공간).{0,10}(부족|모자|가득|확보)",
    ],
    "duplicates": [
        r"\bduplicate(?:d|s)?\b", r"\bdupes?\b", r"\bmultiple copies\b",
        r"\bsame (file|photo|picture|image|video)s?\b", r"\brepeated (file|photo|picture|image|video)s?\b",
        r"중복", r"(똑같|동일|같은).{0,8}(파일|사진|이미지|영상)", r"사본",
    ],
    "multi_cloud_sync": [
        r"\b(one ?drive|google drive|dropbox|icloud|google one|cloud storage)\b",
        r"\b(multiple|several|different) (clouds?|drives?|accounts?|devices?|platforms?)\b",
        r"\bacross (devices?|accounts?|clouds?|platforms?)\b",
        r"\b(sync|synced|syncing|backup|backed up|upload|uploaded|download)\b",
        r"(여러|각각|서로 다른).{0,10}(클라우드|드라이브|계정|기기)",
        r"(구글 ?드라이브|원드라이브|드롭박스|아이클라우드|클라우드)",
        r"(동기화|백업|업로드|다운로드)",
    ],
    "mail_overload": [
        r"\b(inbox|emails?|mailbox|newsletters?|spam|junk mail|unsubscribe|senders?|unread)\b",
        r"메일", r"받은편지함", r"스팸", r"광고.{0,4}(메일|문자)", r"구독.{0,4}(해지|메일)", r"읽지 않은",
    ],
    "manual_time": [
        r"\b(one by one|manually|manual|tedious|time[- ]consuming|takes? forever|hours?|days?)\b",
        r"\bkeep (the app|it|screen|phone) (open|running)\b",
        r"\bwatch (it|the scan)|\bwait(?:ing|ed)?\b",
        r"(일일이|하나씩|수동|귀찮|번거|오래 걸|시간이? (많이|너무)|계속.{0,8}(켜|보고|기다))",
    ],
    "organization_retrieval": [
        r"\b(organize|organisation|organization|sort|categorize|folders?|file manager)\b",
        r"\b(can'?t|cannot|couldn'?t) find\b", r"\b(search|lost|missing) (files?|photos?|documents?)\b",
        r"(정리|분류|폴더|파일관리|검색)", r"(파일|사진|문서).{0,8}(찾기|못 찾|사라|어디)",
    ],
    "cost_paywall": [
        r"\b(subscription|premium|paywall|price|pricing|expensive|cost|charged?|billing|fee|trial)\b",
        r"\b(pay|paid|money)\b", r"\btoo many ads?\b",
        r"(구독|결제|유료|가격|비싸|요금|돈|과금|무료체험|광고가? 너무)",
    ],
    "deletion_anxiety": [
        r"\b(accidentally|wrong (file|photo|email)|important (file|photo|email)|lost|restore|recover|undo|preview|safe to delete)\b",
        r"\b(delete|remove|erase).{0,35}\b(important|original|wrong|all|everything)\b",
        r"\bwhich (one|file|photo|copy).{0,20}\b(keep|delete|remove)\b",
        r"(실수|잘못).{0,8}(삭제|지우)", r"(중요|원본).{0,8}(삭제|지우|사라)",
        r"(복구|복원|되돌리|미리보기|안전하게|무엇을.{0,8}지우)",
    ],
    "performance_wait": [
        r"\b(slow|slower|lag|laggy|freeze|freezes|frozen|crash|crashes|scan|scanning|background)\b",
        r"\btakes? (too long|forever|hours?)\b",
        r"(느리|버벅|멈춤|멈추|먹통|튕|스캔|백그라운드|오래 걸)",
    ],
    "privacy_permissions": [
        r"\b(privacy|permission|permissions|credentials|password|security|access to (all|my)|read my)\b",
        r"\b(upload(?:ed|ing)? my (files|photos|emails|data))\b",
        r"(개인정보|사생활|권한|접근 권한|비밀번호|보안|내 (파일|사진|메일).{0,8}(접근|업로드))",
    ],
    "automation_control": [
        r"\b(automatic|automatically|automation|auto clean|rules?|filters?|bulk|batch|select all|similar files?|similar emails?)\b",
        r"\bdelete all (from|by)|\bkeep (newest|one copy)\b",
        r"(자동|규칙|필터|일괄|한꺼번에|전체 선택|비슷한 (파일|사진|메일)|최신.{0,5}남기)",
    ],
    "reliability_failure": [
        r"\b(doesn'?t work|didn'?t work|not working|stopped working|error|failed|failure|bug|broken|crash|freeze|won'?t open|can'?t log in|cannot connect)\b",
        r"(작동.{0,5}않|안 ?됨|오류|에러|실패|버그|고장|튕|로그인.{0,5}안|연결.{0,5}안)",
    ],
    "proven_cleanup_value": [
        r"\b(freed|free(?:d)? up|cleared|cleaned|removed|deleted|saved|recovered)\b.{0,25}\b(\d+(?:\.\d+)?\s*(?:gb|mb|tb)|space|storage|emails?|files?|photos?)\b",
        r"\b\d+(?:\.\d+)?\s*(?:gb|mb|tb)\b.{0,30}\b(freed|free|cleared|cleaned|removed|deleted|saved|recovered)\b",
        r"(\d+(?:\.\d+)?\s*(?:기가|메가|테라|gb|mb|tb)).{0,25}(비우|확보|정리|삭제|지우)",
        r"(수백|수천|\d+).{0,8}(메일|파일|사진).{0,20}(정리|삭제|지우|해지)",
    ],
}

COMPILED = {
    label: [re.compile(pattern, re.I) for pattern in patterns]
    for label, patterns in LABEL_PATTERNS.items()
}

CORE_DEMAND = {
    "file_flood", "duplicates", "multi_cloud_sync", "mail_overload",
    "manual_time", "organization_retrieval", "cost_paywall",
    "deletion_anxiety", "automation_control", "proven_cleanup_value",
}


def redact(text: str) -> str:
    text = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[email]", text)
    text = re.sub(r"https?://\S+|www\.\S+", "[url]", text)
    return re.sub(r"\s+", " ", text).strip()


def labels_for(text: str) -> list[str]:
    return [
        label for label, patterns in COMPILED.items()
        if any(pattern.search(text) for pattern in patterns)
    ]


def info_score(row: dict) -> float:
    text = row["text"]
    labels = row["labels"]
    core_count = sum(label in CORE_DEMAND for label in labels)
    score = core_count * 2.5 + len(labels) * 0.75
    score += min(len(text) / 120, 3.0)
    score += 1.5 if row["score"] <= 3 else 0
    score += 0.75 if re.search(r"\d", text) else 0
    score += min(math.log1p(row["thumbs_up"]) / 2, 1.5)
    score += 0.25 if re.search(r"[가-힣]", text) else 0
    if len(text) < 25:
        score -= 4
    return round(score, 4)


with INPUT.open(encoding="utf-8") as handle:
    rows = [json.loads(line) for line in handle]

for row in rows:
    row["text"] = redact(row["text"])
    row["labels"] = labels_for(row["text"])
    row["analysis_locale"] = "ko" if re.search(r"[가-힣]", row["text"]) else "other"
    row["info_score"] = info_score(row)

candidates = [
    row for row in rows
    if len(row["text"]) >= 20
    and row["labels"]
    and (set(row["labels"]) & CORE_DEMAND or row["score"] <= 3)
]

category_quota = {
    "cloud_dedupe": 1250,
    "email_cleanup": 1250,
    "device_cleanup": 1250,
    "cloud_storage": 1250,
}

selected = []
for category, quota in category_quota.items():
    pool = [row for row in candidates if row["source_category"] == category]
    app_names = sorted({row["app_name"] for row in pool})
    base = quota // max(1, len(app_names))
    chosen_keys = set()
    chosen = []

    for app_name in app_names:
        app_pool = sorted(
            [row for row in pool if row["app_name"] == app_name],
            key=lambda row: (row["info_score"], row["thumbs_up"], len(row["text"])),
            reverse=True,
        )
        for row in app_pool[:base]:
            chosen.append(row)
            chosen_keys.add(row["review_key"])

    remaining = sorted(
        [row for row in pool if row["review_key"] not in chosen_keys],
        key=lambda row: (row["info_score"], row["thumbs_up"], len(row["text"])),
        reverse=True,
    )
    chosen.extend(remaining[: quota - len(chosen)])
    selected.extend(chosen[:quota])

if len(selected) < 5000:
    selected_keys = {row["review_key"] for row in selected}
    global_remaining = sorted(
        [row for row in candidates if row["review_key"] not in selected_keys],
        key=lambda row: (row["info_score"], row["thumbs_up"], len(row["text"])),
        reverse=True,
    )
    selected.extend(global_remaining[: 5000 - len(selected)])

assert len(selected) == 5000, f"Expected 5000 voices, got {len(selected)}"

selected.sort(key=lambda row: (row["source_category"], -row["info_score"], row["review_key"]))

public_rows = []
for index, row in enumerate(selected, start=1):
    public_rows.append({
        "voice_id": f"RV-{index:04d}",
        "review_key": row["review_key"],
        "app_name": row["app_name"],
        "source_category": row["source_category"],
        "locale": row["analysis_locale"],
        "score": row["score"],
        "date": row["date"],
        "thumbs_up": row["thumbs_up"],
        "text": row["text"],
        "labels": row["labels"],
        "source_url": row["source_url"],
    })

with (OUTPUT / "real_voice_5000.jsonl").open("w", encoding="utf-8") as handle:
    for row in public_rows:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def counter(field):
    return collections.Counter(row[field] for row in public_rows)


label_counts = collections.Counter()
for row in public_rows:
    label_counts.update(row["labels"])

metrics = {
    "method": {
        "raw_collected": 27692,
        "after_exact_text_deduplication": len(rows),
        "pain_bearing_candidates": len(candidates),
        "final_stratified_sample": len(public_rows),
        "sampling_note": "Purposive, stratified pain-point sample; percentages describe this sample, not the general population.",
    },
    "source_category": dict(counter("source_category")),
    "app": dict(counter("app_name").most_common()),
    "locale": dict(counter("locale")),
    "score": {str(k): v for k, v in sorted(counter("score").items())},
    "labels": {
        label: {"count": count, "share": round(count / len(public_rows), 4)}
        for label, count in label_counts.most_common()
    },
}


english_texts = [row["text"] for row in public_rows if row["locale"] == "other"]
vectorizer = TfidfVectorizer(
    min_df=8,
    max_df=0.65,
    stop_words="english",
    ngram_range=(1, 2),
    max_features=8000,
)
matrix = vectorizer.fit_transform(english_texts)
nmf = NMF(n_components=14, random_state=42, init="nndsvda", max_iter=500)
nmf.fit_transform(matrix)
terms = np.array(vectorizer.get_feature_names_out())
topics = []
for topic_id, component in enumerate(nmf.components_, start=1):
    top = terms[component.argsort()[-12:][::-1]].tolist()
    topics.append({"topic": topic_id, "top_terms": top})
metrics["discovery_topics_nmf"] = topics


representatives = {}
for label in LABEL_PATTERNS:
    pool = [row for row in public_rows if label in row["labels"]]
    pool.sort(
        key=lambda row: (
            bool(re.search(r"\d", row["text"])),
            row["thumbs_up"],
            min(len(row["text"]), 450),
        ),
        reverse=True,
    )
    representatives[label] = [
        {
            "voice_id": row["voice_id"],
            "app_name": row["app_name"],
            "score": row["score"],
            "text": row["text"][:500],
        }
        for row in pool[:12]
    ]

with (OUTPUT / "analysis_metrics.json").open("w", encoding="utf-8") as handle:
    json.dump(metrics, handle, ensure_ascii=False, indent=2)
    handle.write("\n")

with (OUTPUT / "representative_voices.json").open("w", encoding="utf-8") as handle:
    json.dump(representatives, handle, ensure_ascii=False, indent=2)
    handle.write("\n")

print(json.dumps(metrics, ensure_ascii=False, indent=2))
