"""把 Kahoot 題目轉成本系統題庫。
用法：python tools/kahoot2quiz.py <Kahoot 網址或 ID> [更多網址...]
輸出：quizzes/<標題>/
  <標題>.json  主持頁直接選這個（圖片用 Kahoot 圖床縮小版網址）
  題目.csv     用 Excel 改題目用（UTF-8 BOM）；連同 Q*.png 一起選也能載入
  題目.md      方便閱讀
  Q1.png ...   原始圖片
"""
import csv, json, re, sys, urllib.request, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "quizzes"
clean = lambda s: re.sub(r"\s*\n\s*", " ", re.sub(r"<[^>]+>", "", s or "")).strip()
L = "ABCDEF"


def img_url(q):
    # 縮小版（原圖常 2MB 以上，出題時來不及載入）
    mid = (q.get("imageMetadata") or {}).get("id")
    return f"https://images-cdn.kahoot.it/{mid}?auto=webp&width=1600" if mid else (q.get("image") or "")


def convert(arg):
    m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", arg)
    if not m:
        sys.exit(f"找不到 Kahoot ID：{arg}")
    url = f"https://create.kahoot.it/rest/kahoots/{m.group(0)}/card/?includeKahoot=true"
    k = json.load(urllib.request.urlopen(url))["kahoot"]
    title = clean(k["title"])
    d = OUT / re.sub(r'[\\/:*?"<>|]', "", title)
    d.mkdir(parents=True, exist_ok=True)
    qs, rows, md = [], [], [f"# {title}\n"]
    for q in k["questions"]:
        if q.get("type") not in ("quiz", "true_false"):
            print(f"  略過非選擇題：{clean(q.get('question') or q.get('title'))}")
            continue
        n = len(qs) + 1
        ch = q.get("choices", [])
        item = {
            "q": clean(q.get("question")),
            "choices": [clean(c.get("answer")) for c in ch],
            "correct": [i for i, c in enumerate(ch) if c.get("correct")],
            "time": (q.get("time") or 20000) // 1000,
            "img": img_url(q),
        }
        qs.append(item)
        img = ""
        if q.get("image"):
            img = f"Q{n}.png"
            urllib.request.urlretrieve(q["image"], d / img)
        ans = ",".join(L[i] for i in item["correct"])
        rows.append([n, item["q"], *(item["choices"] + [""] * 4)[:4], ans, item["time"], img])
        md.append(f"## 第 {n} 題（{item['time']} 秒）\n\n{item['q']}\n")
        if img:
            md.append(f"![]({img})\n")
        md += [f"{L[i]}. {c}{'　✅' if i in item['correct'] else ''}" for i, c in enumerate(item["choices"])] + [""]
    (d / f"{d.name}.json").write_text(json.dumps({"title": title, "questions": qs}, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(d / "題目.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["題號", "題目", "A", "B", "C", "D", "正解", "秒數", "圖片"])
        w.writerows(rows)
    (d / "題目.md").write_text("\n".join(md), encoding="utf-8")
    print(f"✓ {title}：{len(qs)} 題 → {d}")


for a in sys.argv[1:]:
    convert(a)
