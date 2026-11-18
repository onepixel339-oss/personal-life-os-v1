#!/usr/bin/env python3
"""i18n Arabic dictionary additions (v1.2) — line-anchored, safe with diacritics."""
import sys

PATH = "src/lib/lifeos/i18n.ts"
lines = open(PATH, encoding="utf-8").readlines()


def find(substr, start=0):
    for i in range(start, len(lines)):
        if substr in lines[i]:
            return i
    return -1


def replace_line(substr, new_line):
    i = find(substr)
    if i < 0:
        print(f"NOT FOUND: {substr}")
        sys.exit(1)
    lines[i] = new_line
    print(f"replaced line {i + 1}: {substr[:40]}...")


def insert_after(substr, block, label):
    i = find(substr)
    if i < 0:
        print(f"NOT FOUND anchor: {substr}")
        sys.exit(1)
    for j, bl in enumerate(block):
        lines.insert(i + 1 + j, bl)
    print(f"inserted {label} after line {i + 1}")


# 1) existing key updates (Arabic)
replace_line('"app.tagline"', '  "app.tagline": "رفيق يومك، براحتك.",\n')
replace_line('"register.body"', '  "register.body": "رفيق هادئ ليومك اللي عايز ترتبه: فترات حوالين أوقات الصلاة، ومساحات للذاكرة وملاحظات وروتين — وكل حاجة على جهازك بس.",\n')
replace_line('"about.version"', '  "about.version": "الإصدار 1.2.0 · مخطط 1 · رفيق يومك، براحتك.",\n')

# 2) new v1.2 block after Arabic install.dismiss
NEW_BLOCK = [
    "\n",
    "  /* v1.2 — الجمعة، اليوم الحي، رمضان، القفلة، البصيرات، صدق البيانات */\n",
    '  "friday.title": "الجمعة يوم المراجعة",\n',
    '  "friday.body": "التطبيق ده عمره ما هيبعت إشعار — دي قاعدة. بس منبه موبايلك بيعمل اللازم: حط منبه يوم الجمعة، بعد الصلاة بساعة، اسمه «مراجعة الأسبوع»، وسيب الأسبوع ياخد نفسه.",\n',
    '  "friday.bodyRamadan": "التطبيق ده عمره ما هيبعت إشعار — دي قاعدة. في رمضان حط منبه الجمعة بعد التراويح — الليل ساعتها ألطف.",\n',
    '  "friday.alarmText": "مراجعة الأسبوع — الجمعة بعد الصلاة بساعة",\n',
    '  "friday.alarmTextRamadan": "مراجعة الأسبوع — الجمعة بعد التراويح",\n',
    '  "friday.copy": "انسخ نص المنبه",\n',
    '  "friday.copied": "اتنسخ — الصقه في تطبيق الساعة",\n',
    '  "friday.done": "حليتها",\n',
    '  "friday.dismiss": "إخفاء اقتراح الجمعة",\n',
    '  "tz.title": "التوقيت اتغيّر",\n',
    '  "tz.body": "التوقيت اتقلب (صيفي/شتوي)، والأوقات اليدوية ممكن تكون اتحركت ساعة. الوضع المحسوب بيلحق ساعة جهازك لوحده — مفيش حاجة تتعمل هناك.",\n',
    '  "tz.openPrayer": "راجع أوقات الصلاة",\n',
    '  "tz.ok": "تمام",\n',
    '  "tz.dismiss": "إخفاء تلميح التوقيت",\n',
    '  "ramadan.greeting": "رمضان كريم",\n',
    '  "ramadan.cardTitle": "إيقاع رمضان",\n',
    '  "ramadan.cardBody": "في رمضان اليوم بيتقلب: سحور، صباح هادي، فطار، تراويح. بضغطة واحدة بنعيد تسمية الفترات الخمس على الإيقاع — وأنكورات الصلاة زي ما هي بالظبط.",\n',
    '  "ramadan.cardNote": "وبيرجع لحاله لوحده بهدوء بعد رمضان.",\n',
    '  "ramadan.apply": "طبّق إيقاع رمضان",\n',
    '  "ramadan.notNow": "مش دلوقتي",\n',
    '  "ramadan.appliedToast": "اتطبق إيقاع رمضان",\n',
    '  "ramadan.dismiss": "إخفاء اقتراح رمضان",\n',
    '  "closure.hint": "لما يومك يخلص، اقفله بهدوء — مفيش نقاط، ومفيش حاجة بتتحسب عليك.",\n',
    '  "closure.cta": "قفلة اليوم",\n',
    '  "closure.done": "يومك اتقفل بهدوء — تصبح على خير.",\n',
    '  "closure.undo": "رجّعها",\n',
    '  "closure.undoAria": "إلغاء قفلة اليوم",\n',
    '  "insights.title": "أسبوعك في تلات أسئلة",\n',
    '  "insights.desc": "مكتوبة من أسبوعك نفسه — جُمل، مش درجات.",\n',
    '  "insights.captured": "التقطت {n} حاجات في البريد.",\n',
    '  "insights.created": "عملت {n} حاجات جديدة.",\n',
    '  "insights.completed": "خلّصت {n} حاجات.",\n',
    '  "insights.quiet": "أسبوع هادي — مفيش جديد اتكتب، وده عادي جدًا.",\n',
    '  "insights.delta.quieter": "أهدى من الأسبوع اللي فات — نفس أهدأ.",\n',
    '  "insights.delta.busier": "أكتر زحمة من الأسبوع اللي فات.",\n',
    '  "insights.delta.same": "شبه الأسبوع اللي فات — ثابت.",\n',
    '  "insights.closureMost": "أغلب أيامك اتقفلت بهدوء.",\n',
    '  "insights.closureSome": "قفلت شوية أيام بهدوء.",\n',
    '  "insights.absence": "غبت {n} أيام ورجعت — وده اللي يهم.",\n',
    '  "insights.focus": "الأسبوع ده كله {full} — ممكن تدي {quiet} يوم.",\n',
    '  "more.reviewToday": "يوم المراجعة",\n',
    '  "more.remindersNoteRamadan": "ملحوظة رمضان: المراجعة الأسبوعية بتتنقل للجمعة بالليل، بعد التراويح.",\n',
    '  "review.fridayNote": "النهارده الجمعة — ربع ساعة مراجعة هتكفي.",\n',
]

# only insert once — find the AR install.dismiss (the one after the ar dict start)
ar_start = find("/* العربية */") if find("/* العربية */") >= 0 else find("export const ar")
if ar_start < 0:
    # fallback: ar dict is after the en dict's closing; find second occurrence
    ar_start = find('"app.tagline"', find('"app.tagline"') + 1)
i_ar_install = find('"install.dismiss"', ar_start)
if i_ar_install < 0:
    print("ar install.dismiss not found")
    sys.exit(1)
for j, bl in enumerate(NEW_BLOCK):
    lines.insert(i_ar_install + 1 + j, bl)
print(f"inserted v1.2 AR block after line {i_ar_install + 1}")

# 3) data keys after Arabic data.autoConfirmDesc
i_ar_auto = find('"data.autoConfirmDesc"', ar_start)
DATA_BLOCK = [
    "\n",
    "  /* v1.2 — صدق البيانات: شبكة الأمان مقابل التأمين، التذكير الشهري، الحماية، سجل الأخطاء */\n",
    '  "data.nudge": "عدى وقت على آخر ملف نسخة نزّلته — دلوقتي وقت مناسب تنزّل واحد.",\n',
    '  "data.nudgeDo": "نزّلها دلوقتي",\n',
    '  "data.honestyFile": "الملف بيعيش بره الجهاز — ده اللي بيحميك من الفقد.",\n',
    '  "data.honestyAuto": "النسخ التلقائية جوه المتصفح ده — بتحميك من الغلط، مش من الفقد.",\n',
    '  "data.persistHonest": "المتصفح ممكن ينضّف البيانات دي لو الذاكرة ضاقت. تقدر تطلب منه ميعملش — بضغطة واحدة.",\n',
    '  "data.persistAsk": "اطلب من المتصفح حماية البيانات دي",\n',
    '  "data.persistAsked": "اتطلب — والإجابة الصادقة هتظهر فوق",\n',
    '  "data.errorLog": "سجل الأخطاء (محلي بس)",\n',
    '  "data.errorLogDesc": "آخر ٥٠ خطأ على الجهاز ده، محفوظين محليًا — ده الـ«تليمتري» الوحيد اللي هيبقى عند التطبيق. انسخهم لو بعت أي مشكلة.",\n',
    '  "data.errorLogEmpty": "مفيش أخطاء متسجلة — جهاز هادي.",\n',
    '  "data.errorLogCopy": "انسخ السجل",\n',
    '  "data.errorLogCopied": "السجل اتنسخ",\n',
    '  "data.errorLogClear": "امسح",\n',
]
for j, bl in enumerate(DATA_BLOCK):
    lines.insert(i_ar_auto + 1 + j, bl)
print(f"inserted v1.2 AR data block after line {i_ar_auto + 1}")

# 4) Ramadan entries in the four period maps
def extend_map(anchor_key, entries, label):
    i = find(anchor_key)
    if i < 0:
        print(f"NOT FOUND: {anchor_key}")
        sys.exit(1)
    # find the closing "};" after i
    j = i
    while "};" not in lines[j]:
        j += 1
    block = ["  /* Ramadan rhythm (v1.2) */\n"] + [e + "\n" for e in entries]
    for k, bl in enumerate(block):
        lines.insert(j + k, bl)
    print(f"extended {label}")

extend_map("const PERIOD_AR", [
    '  Suhoor: "السحور",',
    '  "Ramadan Morning": "صباح رمضان",',
    '  "Before Iftar": "قبل الفطار",',
    '  "After Iftar": "بعد الفطار",',
    '  "Taraweeh & Night": "التراويح والليل",',
], "PERIOD_AR")

extend_map("const PERIOD_TAGLINE_AR", [
    '  "The quiet night kitchen": "مطبخ الليل الهادي",',
    '  "Slow hours": "ساعات بطيئة",',
    '  "Hold it gently": "امسكها بلطف",',
    '  "The day opens again": "اليوم بيفتح تاني",',
], "PERIOD_TAGLINE_AR")

extend_map("const PERIOD_EMPTY_AR", [
    '  Suhoor: "ركن هادي للسحور.",',
    '  "Ramadan Morning": "نهار رمضان على مهله.",',
    '  "Before Iftar": "ساعات قبل الفطار — براحتك.",',
    '  "After Iftar": "اليوم فتح تاني.",',
    '  "Taraweeh & Night": "اترك الليل مفتوحاً.",',
], "PERIOD_EMPTY_AR")

extend_map("const PERIOD_EMPTY_EN", [
    '  Suhoor: "A quiet suhoor corner.",',
    '  "Ramadan Morning": "Ramadan daylight, slowly.",',
    '  "Before Iftar": "Hours before iftar — gently.",',
    '  "After Iftar": "The day opens again.",',
    '  "Taraweeh & Night": "Leave the night open.",',
], "PERIOD_EMPTY_EN")

open(PATH, "w", encoding="utf-8").writelines(lines)
print("done")
