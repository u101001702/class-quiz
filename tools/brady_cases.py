"""ACLS 心搏過緩案例題 → 題庫（改編自 TCH-012 interactive/index-v1.html）
用法：python tools/brady_cases.py
輸出：quizzes/心搏過緩/
"""
import csv, json, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "quizzes"
L = "ABCD"
ALG = "AHA 2025 Adult Bradycardia Algorithm"

CASE1 = [  # 原 A1、A2、A4（A3 過緩定義已移除）
 dict(scene="凌晨內科病房，22 歲游泳校隊，因蜂窩性組織炎住院。熟睡中 HR 42，竇性節律。叫醒他：沒有不舒服、意識清楚、血壓正常。",
      q="你第一個要回答的問題是什麼？",
      choices=["HR 已低於 50，先給 atropine 1 mg", "這個心跳對「這個人、這個情境」合理嗎？有沒有灌流不足？", "先貼經皮起搏貼片備用", "立刻會診心臟科放經靜脈起搏"],
      correct=[1], time=30,
      why="Algorithm 第一框：先看情境再看數字（Assess appropriateness for clinical condition）。運動員、睡眠中的無症狀竇性過緩可以是正常的。",
      src=f"{ALG}, Box 1；AHA 2025 Part 9"),
 dict(scene="還是照流程把 Box 2 問一遍。",
      q="判斷「心肺失代償」的五個問題，哪一項「不在」其中？",
      choices=["低血壓", "急性意識改變", "缺血性胸痛", "心跳低於 50/min"],
      correct=[3], time=20,
      why="五問：低血壓、急性意識改變、休克徵象、缺血性胸痛、急性心衰竭。心跳數字本身不是失代償。任一項是 → Box 3；都沒有 → Box 7。",
      src=f"{ALG}, Box 2"),
 dict(scene="五個問題都是「沒有」，他想繼續睡。",
      q="穩定支（Box 7）的處置，哪一項「不是」流程圖上寫的？",
      choices=["預防性先給一劑 atropine", "找出並處理潛在原因", "考慮給氧", "做 12 導程心電圖"],
      correct=[0], time=20,
      why="Box 7 原文：Identify and treat underlying causes、Support ABCs、Consider oxygen、Obtain 12-lead ECG、Observe。重點：慢，不一定要治。",
      src=f"{ALG}, Box 7；AHA 2025 Part 9 Recommendation 1（COR 1, LOE C-EO）"),
]

CASE2 = [  # 原 B1、B2（改寫）、B4（B3、B5 已移除）
 dict(scene="68 歲男性，起床頭暈、差點昏倒。HR 34、BP 76/42、SpO₂ 88%，四肢濕冷、回答變慢。12 導程：完全房室阻斷、寬 QRS 逸搏。",
      q="Box 2：低血壓「是」、急性意識改變「是」。你的第一步？",
      choices=["先照會心臟科，等評估完再處理", "先觀察，看會不會自己恢復", "維持呼吸道、給氧、必要時正壓通氣，接監視器、摸脈搏", "既然是完全房室阻斷，直接放經靜脈起搏"],
      correct=[2], time=30,
      why="Box 3（失代償支）：Maintain patent airway and provide oxygen／Assist breathing with positive-pressure ventilation as necessary／Attach cardiorespiratory monitor／Monitor pulse。缺氧本身會造成心搏過緩。「正壓通氣」與「Monitor pulse」是 2025 新加的字樣。",
      src=f"{ALG}, Box 3；AHA 2025 Part 9"),
 dict(scene="給氧後 SpO₂ 上來了，但 HR 仍 34、血壓仍低、意識仍差。IV 已建立。",
      q="依 AHA 2025 algorithm，下一步要給什麼藥物？",
      choices=["Epinephrine", "Aspirin", "Acetaminophen", "Atropine"],
      correct=[3], time=20,
      why="Atropine 1 mg IV bolus，每 3–5 分鐘重複，總量 3 mg（COR 2a, LOE B-NR）。補充：這位是寬 QRS 的高度房室阻斷，ACC/AHA/HRS 2018 提醒 atropine 應謹慎使用，ERC 2025 更直接建議不要給；AHA 2025 algorithm 仍把 atropine 列為第一線藥物。",
      src=f"{ALG}；AHA 2025 Part 9 Recommendation 2；ACC/AHA/HRS 2018 §6.3.2；ERC 2025"),
 dict(scene="Atropine 已給到總量 3 mg，HR 還是 34，病人仍低血壓、意識差。",
      q="依 AHA 2025，下一步？",
      choices=["Isoproterenol（AHA 2025 algorithm 首選第二線藥）", "TCP 和／或 dopamine 5–20 mcg/kg/min 或 epinephrine 2–10 mcg/min 滴注，同時準備經靜脈起搏", "依 AHA 2025 建議劑量推 push-dose epinephrine", "Epinephrine 5–20 mcg/kg/min 或 dopamine 2–10 mcg/min 滴注"],
      correct=[1], time=40,
      why="Atropine 無效 → IV adrenergic agonists（epinephrine、dopamine）或 TCP，同時準備緊急經靜脈起搏（COR 2b, LOE C-LD）。Isoproterenol 2025 algorithm 未列；push-dose epi AHA 2025 未提供劑量；最後一個選項把兩個藥的劑量與單位對調了，是常見陷阱。",
      src=f"{ALG}；AHA 2025 Part 9 Recommendation 4"),
]


def write(name, title, qs, note):
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    quiz = {"title": title, "questions": [{k: q[k] for k in ("scene", "q", "choices", "correct", "time")} | {"img": ""} for q in qs]}
    (d / f"{name}.json").write_text(json.dumps(quiz, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(d / "題目.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["題號", "情境", "題目", "A", "B", "C", "D", "正解", "秒數", "圖片"])
        for i, q in enumerate(qs, 1):
            w.writerow([i, q["scene"], q["q"], *q["choices"], L[q["correct"][0]], q["time"], ""])
    md = [f"# {title}\n", f"{note}\n"]
    for i, q in enumerate(qs, 1):
        md += [f"## 第 {i} 題（{q['time']} 秒）\n", f"> {q['scene']}\n", f"**{q['q']}**\n"]
        md += [f"{L[j]}. {c}{'　✅' if j in q['correct'] else ''}" for j, c in enumerate(q["choices"])]
        md += ["", f"**解說**：{q['why']}", "", f"**來源**：{q['src']}", ""]
    (d / "題目.md").write_text("\n".join(md), encoding="utf-8")
    print(f"✓ {title}：{len(qs)} 題")


SRC = "改編自 TCH-012 互動教材 index-v1.html"
write("心搏過緩", "心搏過緩", CASE1 + CASE2,
      f"{SRC}。第 1–3 題＝案例 A（A3 已移除）；第 4–6 題＝案例 B（B2 改寫為藥物選擇；B3、B5 已移除）")
