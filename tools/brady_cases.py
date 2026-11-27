"""ACLS 心搏過緩案例題 → 題庫
直接從 TCH-012 互動教材網頁抓原文（情境、題目、選項、正解、解說），不手打。
用法：python tools/brady_cases.py
輸出：quizzes/心搏過緩/

要調整哪些題目，改下面的 PICK 與 OVERRIDE 即可。
"""
import csv, json, pathlib, re, html
from playwright.sync_api import sync_playwright

SRC_HTML = pathlib.Path.home() / "Documents/小焜/Claude Code/TCH-012_acls-bradycardia-2025/interactive/index-v1.html"
OUT = pathlib.Path(__file__).resolve().parent.parent / "quizzes"
L = "ABCDEF"

# 要用的決策點（依序）
PICK = ["A1", "A2", "A4", "B1", "B2", "B4"]

# 改寫：搶答一次只能按一個，複選題要改成單選；B2 依焜哥指定改成藥物選擇
OVERRIDE = {
    "A4": dict(q="依 2025 algorithm 穩定支（Box 7），下列哪一項「不是」圖上寫的處置？", correct=[1]),
    "B2": dict(q="依 AHA 2025 algorithm，下一步要給什麼藥物？",
               choices=["Epinephrine", "Aspirin", "Acetaminophen", "Atropine"], correct=[3]),
}
# 前一個決策點被拿掉時，把它的情境接在這一題前面，劇情才接得上
CARRY = {"B4": "B3"}


def seconds(choices):  # 作答秒數依選項長度
    n = max(len(c) for c in choices)
    return 20 if n <= 20 else 30 if n <= 35 else 40


def strip(h):
    h = re.sub(r"<(br|/p|/li)\s*/?>", "\n", h or "")
    return html.unescape(re.sub(r"<[^>]+>", "", h)).strip()


def load_cases():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(SRC_HTML.as_uri())
        cases = pg.evaluate("""() => window.__BRADY.CASES.map(c => ({
            title: c.title, intro: c.intro,
            steps: c.steps.map(s => ({id: s.id, scene: s.scene, q: s.q, opts: s.opts, ans: s.ans, why: s.why}))
        }))""")
        b.close()
    return cases


def build():
    steps = {}
    for ci, c in enumerate(load_cases()):
        for s in c["steps"]:
            steps[s["id"]] = (ci, c, s)
    qs, seen = [], set()
    for sid in PICK:
        ci, c, s = steps[sid]
        head = f"【案例{'一二三四五'[ci]}：{c['title']}】"
        body = []
        if ci not in seen:  # 每個案例第一題放病人背景
            body.append(strip(c["intro"]))
            seen.add(ci)
        if sid in CARRY:
            body.append(strip(steps[CARRY[sid]][2]["scene"]))
        body.append(strip(s["scene"]))
        o = OVERRIDE.get(sid, {})
        choices = o.get("choices", s["opts"])
        qs.append(dict(
            id=sid, scene=head + "".join(body), q=o.get("q", s["q"]), choices=choices,
            correct=o.get("correct", s["ans"]), time=seconds(choices), why=strip(s["why"]), changed=bool(o),
        ))
    return qs


def write(name, title, qs, note):
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    quiz = {"title": title, "questions": [{k: q[k] for k in ("scene", "q", "choices", "correct", "time")} | {"img": ""} for q in qs]}
    (d / f"{name}.json").write_text(json.dumps(quiz, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(d / "題目.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["題號", "情境", "題目", "A", "B", "C", "D", "正解", "秒數", "圖片"])
        for i, q in enumerate(qs, 1):
            w.writerow([i, q["scene"], q["q"], *(q["choices"] + [""] * 4)[:4], ",".join(L[c] for c in q["correct"]), q["time"], ""])
    md = [f"# {title}\n", f"{note}\n"]
    for i, q in enumerate(qs, 1):
        md += [f"## 第 {i} 題（原 {q['id']}{'，已改寫' if q['changed'] else ''}；{q['time']} 秒）\n", f"> {q['scene']}\n", f"**{q['q']}**\n"]
        md += [f"{L[j]}. {c}{'　✅' if j in q['correct'] else ''}" for j, c in enumerate(q["choices"])]
        md += ["", "**原教材解說**（出處縮寫見 TCH-012 參考文獻）：", "", q["why"], ""]
    (d / "題目.md").write_text("\n".join(md), encoding="utf-8")
    print(f"✓ {title}：{len(qs)} 題")


if __name__ == "__main__":
    write("心搏過緩", "心搏過緩", build(),
          f"自動擷取自 {SRC_HTML.name}（TCH-012）。使用決策點：{'、'.join(PICK)}。改寫：{'、'.join(OVERRIDE)}。")
