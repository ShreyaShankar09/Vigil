"""Server-rendered Form 6 draft; official English legal wording is still a placeholder."""
from __future__ import annotations

from html import escape

PLACEHOLDER = (
    "PLACEHOLDER — exact official English Form 6 wording is pending legal review. "
    "This document is not an official government form."
)

LABELS: dict[str, dict[str, str]] = {
    "en": {
        "title": "FORM 6 — TEST MEMO", "evidence": "Evidence ID", "case": "Case ID",
        "officer": "Officer", "datetime": "Date/time of test", "place": "Place",
        "sample": "Sample description", "kit": "Test kit", "reaction": "Observed reaction colour",
        "result": "Preliminary result", "ai": "AI assist", "hash": "Photo SHA-256",
        "chain": "Custody chain integrity", "yes": "VERIFIED", "no": "BROKEN — DO NOT RELY",
        "note": "Presumptive field test only. Confirmatory analysis by an FSL is required.",
    },
    "hi": {
        "title": "प्रपत्र 6 — परीक्षण ज्ञापन", "evidence": "साक्ष्य आईडी", "case": "मामला आईडी",
        "officer": "अधिकारी", "datetime": "परीक्षण की तिथि/समय", "place": "स्थान",
        "sample": "नमूने का विवरण", "kit": "परीक्षण किट", "reaction": "देखी गई रंग प्रतिक्रिया",
        "result": "प्रारंभिक परिणाम", "ai": "एआई सहायता", "hash": "फोटो SHA-256",
        "chain": "अभिरक्षा श्रृंखला की अखंडता", "yes": "सत्यापित", "no": "टूटी — भरोसा न करें",
        "note": "केवल प्रारंभिक क्षेत्रीय परीक्षण। FSL द्वारा पुष्टिकरण विश्लेषण आवश्यक है।",
    },
    "kn": {
        "title": "ಫಾರ್ಮ್ 6 — ಪರೀಕ್ಷಾ ಮೆಮೊ", "evidence": "ಸಾಕ್ಷ್ಯ ಐಡಿ", "case": "ಪ್ರಕರಣ ಐಡಿ",
        "officer": "ಅಧಿಕಾರಿ", "datetime": "ಪರೀಕ್ಷೆಯ ದಿನಾಂಕ/ಸಮಯ", "place": "ಸ್ಥಳ",
        "sample": "ಮಾದರಿಯ ವಿವರಣೆ", "kit": "ಪರೀಕ್ಷಾ ಕಿಟ್", "reaction": "ಗಮನಿಸಿದ ಬಣ್ಣದ ಪ್ರತಿಕ್ರಿಯೆ",
        "result": "ಪ್ರಾಥಮಿಕ ಫಲಿತಾಂಶ", "ai": "ಎಐ ಸಹಾಯ", "hash": "ಫೋಟೋ SHA-256",
        "chain": "ಕಸ್ಟಡಿ ಸರಪಳಿಯ ಸಮಗ್ರತೆ", "yes": "ಪರಿಶೀಲಿಸಲಾಗಿದೆ", "no": "ಮುರಿದಿದೆ — ನಂಬಬೇಡಿ",
        "note": "ಪ್ರಾಥಮಿಕ ಕ್ಷೇತ್ರ ಪರೀಕ್ಷೆ ಮಾತ್ರ. FSL ದೃಢೀಕರಣ ವಿಶ್ಲೇಷಣೆ ಅಗತ್ಯ.",
    },
    "ta": {
        "title": "படிவம் 6 — சோதனை அறிக்கை", "evidence": "சான்று ஐடி", "case": "வழக்கு ஐடி",
        "officer": "அதிகாரி", "datetime": "சோதனை தேதி/நேரம்", "place": "இடம்",
        "sample": "மாதிரி விளக்கம்", "kit": "சோதனைக் கருவி", "reaction": "காணப்பட்ட நிற மாற்றம்",
        "result": "முதற்கட்ட முடிவு", "ai": "AI உதவி", "hash": "புகைப்பட SHA-256",
        "chain": "காவல் தொடர் ஒருமைப்பாடு", "yes": "சரிபார்க்கப்பட்டது", "no": "முறிந்தது — நம்ப வேண்டாம்",
        "note": "முதற்கட்ட களச் சோதனை மட்டுமே. FSL உறுதிப்படுத்தும் பகுப்பாய்வு தேவை.",
    },
    "te": {
        "title": "ఫారం 6 — పరీక్ష మెమో", "evidence": "ఆధార ఐడి", "case": "కేసు ఐడి",
        "officer": "అధికారి", "datetime": "పరీక్ష తేదీ/సమయం", "place": "స్థలం",
        "sample": "నమూనా వివరణ", "kit": "పరీక్ష కిట్", "reaction": "గమనించిన రంగు ప్రతిచర్య",
        "result": "ప్రాథమిక ఫలితం", "ai": "AI సహాయం", "hash": "ఫోటో SHA-256",
        "chain": "కస్టడీ గొలుసు సమగ్రత", "yes": "ధృవీకరించబడింది", "no": "విరిగింది — నమ్మవద్దు",
        "note": "ప్రాథమిక ఫీల్డ్ పరీక్ష మాత్రమే. FSL నిర్ధారణ విశ్లేషణ అవసరం.",
    },
    "ml": {
        "title": "ഫോം 6 — പരിശോധനാ മെമ്മോ", "evidence": "തെളിവ് ഐഡി", "case": "കേസ് ഐഡി",
        "officer": "ഉദ്യോഗസ്ഥൻ", "datetime": "പരിശോധന തീയതി/സമയം", "place": "സ്ഥലം",
        "sample": "സാമ്പിൾ വിവരണം", "kit": "പരിശോധന കിറ്റ്", "reaction": "കണ്ട നിറപ്രതികരണം",
        "result": "പ്രാഥമിക ഫലം", "ai": "AI സഹായം", "hash": "ഫോട്ടോ SHA-256",
        "chain": "കസ്റ്റഡി ശൃംഖലയുടെ സമഗ്രത", "yes": "പരിശോധിച്ചു", "no": "തകർന്നു — ആശ്രയിക്കരുത്",
        "note": "പ്രാഥമിക ഫീൽഡ് പരിശോധന മാത്രം. FSL സ്ഥിരീകരണ വിശകലനം ആവശ്യമാണ്.",
    },
    "mr": {
        "title": "फॉर्म 6 — चाचणी नोंद", "evidence": "पुरावा आयडी", "case": "प्रकरण आयडी",
        "officer": "अधिकारी", "datetime": "चाचणीची तारीख/वेळ", "place": "ठिकाण",
        "sample": "नमुन्याचे वर्णन", "kit": "चाचणी किट", "reaction": "निरीक्षणातील रंग प्रतिक्रिया",
        "result": "प्राथमिक निकाल", "ai": "AI सहाय्य", "hash": "फोटो SHA-256",
        "chain": "ताबा साखळीची अखंडता", "yes": "पडताळले", "no": "खंडित — विश्वास ठेवू नका",
        "note": "केवळ प्राथमिक क्षेत्रीय चाचणी. FSL पुष्टीकरण विश्लेषण आवश्यक आहे.",
    },
    "bn": {
        "title": "ফর্ম ৬ — পরীক্ষার মেমো", "evidence": "প্রমাণ আইডি", "case": "মামলা আইডি",
        "officer": "কর্মকর্তা", "datetime": "পরীক্ষার তারিখ/সময়", "place": "স্থান",
        "sample": "নমুনার বিবরণ", "kit": "পরীক্ষার কিট", "reaction": "পর্যবেক্ষিত রঙের প্রতিক্রিয়া",
        "result": "প্রাথমিক ফলাফল", "ai": "AI সহায়তা", "hash": "ছবির SHA-256",
        "chain": "হেফাজত শৃঙ্খলের অখণ্ডতা", "yes": "যাচাইকৃত", "no": "ভাঙা — নির্ভর করবেন না",
        "note": "শুধু প্রাথমিক মাঠ পরীক্ষা। FSL নিশ্চিতকরণ বিশ্লেষণ প্রয়োজন।",
    },
    "gu": {
        "title": "ફોર્મ 6 — પરીક્ષણ નોંધ", "evidence": "પુરાવા ID", "case": "કેસ ID",
        "officer": "અધિકારી", "datetime": "પરીક્ષણની તારીખ/સમય", "place": "સ્થળ",
        "sample": "નમૂનાનું વર્ણન", "kit": "પરીક્ષણ કિટ", "reaction": "નિરીક્ષણ કરેલી રંગ પ્રતિક્રિયા",
        "result": "પ્રાથમિક પરિણામ", "ai": "AI સહાય", "hash": "ફોટો SHA-256",
        "chain": "કસ્ટડી શ્રૃંખલાની અખંડિતતા", "yes": "ચકાસાયેલ", "no": "તૂટેલી — વિશ્વાસ ન કરો",
        "note": "માત્ર પ્રાથમિક ક્ષેત્ર પરીક્ષણ. FSL પુષ્ટિ વિશ્લેષણ જરૂરી છે.",
    },
    "pa": {
        "title": "ਫਾਰਮ 6 — ਟੈਸਟ ਮੈਮੋ", "evidence": "ਸਬੂਤ ਆਈਡੀ", "case": "ਕੇਸ ਆਈਡੀ",
        "officer": "ਅਧਿਕਾਰੀ", "datetime": "ਟੈਸਟ ਦੀ ਮਿਤੀ/ਸਮਾਂ", "place": "ਥਾਂ",
        "sample": "ਨਮੂਨੇ ਦਾ ਵੇਰਵਾ", "kit": "ਟੈਸਟ ਕਿੱਟ", "reaction": "ਦੇਖੀ ਰੰਗ ਪ੍ਰਤੀਕਿਰਿਆ",
        "result": "ਮੁੱਢਲਾ ਨਤੀਜਾ", "ai": "AI ਸਹਾਇਤਾ", "hash": "ਫੋਟੋ SHA-256",
        "chain": "ਹਿਰਾਸਤ ਲੜੀ ਦੀ ਅਖੰਡਤਾ", "yes": "ਪੜਤਾਲਿਆ", "no": "ਟੁੱਟੀ — ਭਰੋਸਾ ਨਾ ਕਰੋ",
        "note": "ਕੇਵਲ ਮੁੱਢਲਾ ਮੈਦਾਨੀ ਟੈਸਟ। FSL ਪੁਸ਼ਟੀ ਵਿਸ਼ਲੇਸ਼ਣ ਲੋੜੀਂਦਾ ਹੈ।",
    },
    "or": {
        "title": "ଫର୍ମ 6 — ପରୀକ୍ଷା ମେମୋ", "evidence": "ପ୍ରମାଣ ID", "case": "ମାମଲା ID",
        "officer": "ଅଧିକାରୀ", "datetime": "ପରୀକ୍ଷା ତାରିଖ/ସମୟ", "place": "ସ୍ଥାନ",
        "sample": "ନମୁନା ବର୍ଣ୍ଣନା", "kit": "ପରୀକ୍ଷା କିଟ୍", "reaction": "ଦେଖାଯାଇଥିବା ରଙ୍ଗ ପ୍ରତିକ୍ରିୟା",
        "result": "ପ୍ରାରମ୍ଭିକ ଫଳାଫଳ", "ai": "AI ସହାୟତା", "hash": "ଫଟୋ SHA-256",
        "chain": "ହେପାଜତ ଶୃଙ୍ଖଳାର ଅଖଣ୍ଡତା", "yes": "ଯାଞ୍ଚ ହୋଇଛି", "no": "ଭାଙ୍ଗିଛି — ଭରସା କରନ୍ତୁ ନାହିଁ",
        "note": "କେବଳ ପ୍ରାରମ୍ଭିକ କ୍ଷେତ୍ର ପରୀକ୍ଷା। FSL ନିଶ୍ଚିତକରଣ ବିଶ୍ଳେଷଣ ଆବଶ୍ୟକ।",
    },
    "as": {
        "title": "ফৰ্ম ৬ — পৰীক্ষাৰ মেমো", "evidence": "প্ৰমাণ আইডি", "case": "গোচৰ আইডি",
        "officer": "বিষয়া", "datetime": "পৰীক্ষাৰ তাৰিখ/সময়", "place": "স্থান",
        "sample": "নমুনাৰ বিৱৰণ", "kit": "পৰীক্ষা কিট", "reaction": "দেখা ৰঙৰ প্ৰতিক্ৰিয়া",
        "result": "প্ৰাথমিক ফলাফল", "ai": "AI সহায়", "hash": "ফটোৰ SHA-256",
        "chain": "জিম্মা শৃংখলৰ অখণ্ডতা", "yes": "পৰীক্ষিত", "no": "ভঙা — নিৰ্ভৰ নকৰিব",
        "note": "কেৱল প্ৰাথমিক ক্ষেত্ৰ পৰীক্ষা। FSL নিশ্চিতকৰণ বিশ্লেষণ প্ৰয়োজন।",
    },
    "ur": {
        "title": "فارم ۶ — ٹیسٹ میمو", "evidence": "ثبوت آئی ڈی", "case": "کیس آئی ڈی",
        "officer": "افسر", "datetime": "ٹیسٹ کی تاریخ/وقت", "place": "مقام",
        "sample": "نمونے کی تفصیل", "kit": "ٹیسٹ کٹ", "reaction": "مشاہدہ شدہ رنگ",
        "result": "ابتدائی نتیجہ", "ai": "AI معاونت", "hash": "تصویر SHA-256",
        "chain": "تحویل کی زنجیر کی سالمیت", "yes": "تصدیق شدہ", "no": "ٹوٹ گئی — بھروسا نہ کریں",
        "note": "صرف ابتدائی فیلڈ ٹیسٹ۔ FSL کی تصدیقی جانچ ضروری ہے۔",
    },
}


def build_form6(ev: dict, chain_ok: bool, lang: str = "en") -> bytes:
    from weasyprint import HTML

    localized = LABELS.get(lang, LABELS["en"])
    english = LABELS["en"]
    officer = f'{ev["officer_name"]} ({ev["officer_id"]})'
    coords = ""
    if ev.get("lat") is not None and ev.get("lng") is not None:
        coords = f' ({ev["lat"]:.5f}, {ev["lng"]:.5f})'
    rows = [
        ("evidence", ev["id"]),
        ("case", ev["case_id"]),
        ("officer", officer),
        ("datetime", ev["captured_at"]),
        ("place", f'{ev["location"]}{coords}'),
        ("sample", ev["sample_type"]),
        ("kit", ev["test_kit_id"]),
        ("reaction", ev["reaction_color"]),
        ("result", f'{ev["verdict"].upper()} - {ev["substance"]} (presumptive only)'),
        ("ai", f'{ev["model_version"]}, confidence {ev["confidence"]:.1f}%'),
        ("hash", ev["image_sha256"]),
        ("chain", localized["yes"] if chain_ok else localized["no"]),
    ]

    def page(labels: dict[str, str], rtl: bool = False) -> str:
        row_html = "".join(
            f'<tr><th>{escape(labels[key])}</th><td>{escape(str(value))}</td></tr>'
            for key, value in rows
        )
        return (
            '<section class="page" dir="rtl" style="direction:rtl" >' if rtl else '<section class="page">'
        ) + (
            f'<h1>{escape(labels["title"])}</h1>'
            f'<p class="placeholder">{escape(PLACEHOLDER)}</p>'
            f'<table>{row_html}</table>'
            f'<p class="note">{escape(labels["note"])}</p>'
            '<p class="signature">Officer signature: ____________________ &nbsp;&nbsp; Witness: ____________________</p>'
            '</section>'
        )

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
@page {{ size: A4; margin: 18mm; }}
body {{ font-family: "Noto Sans", "Noto Sans Devanagari", sans-serif; font-size: 10pt; color: #111; }}
.page {{ page-break-after: always; }}
.page:last-child {{ page-break-after: auto; }}
h1 {{ text-align: center; font-size: 16pt; }}
.placeholder {{ color: #a00000; border: 1px solid #a00000; padding: 8px; font-size: 9pt; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 14px; }}
th, td {{ border: 1px solid #555; padding: 7px; text-align: left; vertical-align: top; }}
th {{ width: 34%; background: #eee; }}
.note {{ margin-top: 22px; font-size: 9pt; }}
.signature {{ margin-top: 36px; border-top: 1px solid #555; padding-top: 8px; }}
[dir="rtl"] {{ font-family: "Noto Nastaliq Urdu", "Noto Sans", sans-serif; text-align: right; }}
[dir="rtl"] th, [dir="rtl"] td {{ text-align: right; }}
</style></head><body>
{page(english)}
{page(localized, rtl=lang == "ur")}
</body></html>"""
    return HTML(string=html).write_pdf()
