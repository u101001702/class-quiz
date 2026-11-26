"""把 Kahoot 題目轉成本系統題庫 JSON。
用法：python tools/kahoot2quiz.py <Kahoot 網址或 ID> [更多網址...]
輸出：quizzes/<標題>.json（圖片沿用 Kahoot 圖床網址）
"""
import json, re, sys, urllib.request, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "quizzes"
clean = lambda s: re.sub(r"\s*\n\s*", " ", re.sub(r"<[^>]+>", "", s or "")).strip()

def img_url(q):
    # 用 Kahoot 圖床的縮小版（原圖常 2MB 以上，出題時來不及載入）
    mid = (q.get("imageMetadata") or {}).get("id")
    if mid:
        return f"https://images-cdn.kahoot.it/{mid}?auto=webp&width=1600"
    return q.get("image") or ""

def convert(arg):
    m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", arg)
    if not m:
        sys.exit(f"找不到 Kahoot ID：{arg}")
    url = f"https://create.kahoot.it/rest/kahoots/{m.group(0)}/card/?includeKahoot=true"
    k = json.load(urllib.request.urlopen(url))["kahoot"]
    qs = []
    for q in k["questions"]:
        if q.get("type") not in ("quiz", "true_false"):
            print(f"  略過非選擇題：{clean(q.get('question') or q.get('title'))}")
            continue
        ch = q.get("choices", [])
        qs.append({
            "q": clean(q.get("question")),
            "choices": [clean(c.get("answer")) for c in ch],
            "correct": [i for i, c in enumerate(ch) if c.get("correct")],
            "time": (q.get("time") or 20000) // 1000,
            "img": img_url(q),
        })
    title = clean(k["title"])
    OUT.mkdir(exist_ok=True)
    p = OUT / (re.sub(r'[\\/:*?"<>|]', "", title) + ".json")
    p.write_text(json.dumps({"title": title, "questions": qs}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ {title}：{len(qs)} 題 → {p}")

for a in sys.argv[1:]:
    convert(a)
