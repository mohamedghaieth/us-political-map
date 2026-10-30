"""Static reference data: states, parties, rating vocabulary, constitutional constants.

These are facts that do not change between election cycles (state names, capitals,
FIPS codes, Senate class structure, governor election years by state). Everything that
does change (officeholders, candidates, ratings) is ingested from sources.
"""
from __future__ import annotations

# fips, abbr, English name, Arabic name, capital (en), capital (ar)
STATES = [
    ("01", "AL", "Alabama", "ألاباما", "Montgomery", "مونتغمري"),
    ("02", "AK", "Alaska", "ألاسكا", "Juneau", "جونو"),
    ("04", "AZ", "Arizona", "أريزونا", "Phoenix", "فينيكس"),
    ("05", "AR", "Arkansas", "أركنساس", "Little Rock", "ليتل روك"),
    ("06", "CA", "California", "كاليفورنيا", "Sacramento", "ساكرامنتو"),
    ("08", "CO", "Colorado", "كولورادو", "Denver", "دنفر"),
    ("09", "CT", "Connecticut", "كونيتيكت", "Hartford", "هارتفورد"),
    ("10", "DE", "Delaware", "ديلاوير", "Dover", "دوفر"),
    ("12", "FL", "Florida", "فلوريدا", "Tallahassee", "تالاهاسي"),
    ("13", "GA", "Georgia", "جورجيا", "Atlanta", "أتلانتا"),
    ("15", "HI", "Hawaii", "هاواي", "Honolulu", "هونولولو"),
    ("16", "ID", "Idaho", "أيداهو", "Boise", "بويسي"),
    ("17", "IL", "Illinois", "إلينوي", "Springfield", "سبرينغفيلد"),
    ("18", "IN", "Indiana", "إنديانا", "Indianapolis", "إنديانابوليس"),
    ("19", "IA", "Iowa", "أيوا", "Des Moines", "دي موين"),
    ("20", "KS", "Kansas", "كانساس", "Topeka", "توبيكا"),
    ("21", "KY", "Kentucky", "كنتاكي", "Frankfort", "فرانكفورت"),
    ("22", "LA", "Louisiana", "لويزيانا", "Baton Rouge", "باتون روج"),
    ("23", "ME", "Maine", "مين", "Augusta", "أوغوستا"),
    ("24", "MD", "Maryland", "ماريلاند", "Annapolis", "أنابوليس"),
    ("25", "MA", "Massachusetts", "ماساتشوستس", "Boston", "بوسطن"),
    ("26", "MI", "Michigan", "ميشيغان", "Lansing", "لانسينغ"),
    ("27", "MN", "Minnesota", "مينيسوتا", "Saint Paul", "سانت بول"),
    ("28", "MS", "Mississippi", "ميسيسيبي", "Jackson", "جاكسون"),
    ("29", "MO", "Missouri", "ميزوري", "Jefferson City", "جيفرسون سيتي"),
    ("30", "MT", "Montana", "مونتانا", "Helena", "هيلينا"),
    ("31", "NE", "Nebraska", "نبراسكا", "Lincoln", "لينكولن"),
    ("32", "NV", "Nevada", "نيفادا", "Carson City", "كارسون سيتي"),
    ("33", "NH", "New Hampshire", "نيو هامبشاير", "Concord", "كونكورد"),
    ("34", "NJ", "New Jersey", "نيوجيرسي", "Trenton", "ترينتون"),
    ("35", "NM", "New Mexico", "نيو مكسيكو", "Santa Fe", "سانتا في"),
    ("36", "NY", "New York", "نيويورك", "Albany", "ألباني"),
    ("37", "NC", "North Carolina", "كارولاينا الشمالية", "Raleigh", "رالي"),
    ("38", "ND", "North Dakota", "داكوتا الشمالية", "Bismarck", "بسمارك"),
    ("39", "OH", "Ohio", "أوهايو", "Columbus", "كولومبس"),
    ("40", "OK", "Oklahoma", "أوكلاهوما", "Oklahoma City", "أوكلاهوما سيتي"),
    ("41", "OR", "Oregon", "أوريغون", "Salem", "سالم"),
    ("42", "PA", "Pennsylvania", "بنسلفانيا", "Harrisburg", "هاريسبرغ"),
    ("44", "RI", "Rhode Island", "رود آيلاند", "Providence", "بروفيدنس"),
    ("45", "SC", "South Carolina", "كارولاينا الجنوبية", "Columbia", "كولومبيا"),
    ("46", "SD", "South Dakota", "داكوتا الجنوبية", "Pierre", "بيير"),
    ("47", "TN", "Tennessee", "تينيسي", "Nashville", "ناشفيل"),
    ("48", "TX", "Texas", "تكساس", "Austin", "أوستن"),
    ("49", "UT", "Utah", "يوتا", "Salt Lake City", "سولت ليك سيتي"),
    ("50", "VT", "Vermont", "فيرمونت", "Montpelier", "مونتبيلييه"),
    ("51", "VA", "Virginia", "فرجينيا", "Richmond", "ريتشموند"),
    ("53", "WA", "Washington", "واشنطن", "Olympia", "أوليمبيا"),
    ("54", "WV", "West Virginia", "فرجينيا الغربية", "Charleston", "تشارلستون"),
    ("55", "WI", "Wisconsin", "ويسكونسن", "Madison", "ماديسون"),
    ("56", "WY", "Wyoming", "وايومنغ", "Cheyenne", "شايان"),
]
# Federal district and territories (non-voting House delegates; no senators; not on the state map)
OTHER_JURISDICTIONS = [
    ("11", "DC", "District of Columbia", "واشنطن العاصمة", "Washington", "واشنطن"),
    ("72", "PR", "Puerto Rico", "بورتوريكو", "San Juan", "سان خوان"),
    ("66", "GU", "Guam", "غوام", "Hagåtña", "هاغاتنا"),
    ("78", "VI", "U.S. Virgin Islands", "جزر العذراء الأمريكية", "Charlotte Amalie", "شارلوت أمالي"),
    ("60", "AS", "American Samoa", "ساموا الأمريكية", "Pago Pago", "باغو باغو"),
    ("69", "MP", "Northern Mariana Islands", "جزر ماريانا الشمالية", "Saipan", "سايبان"),
]

ABBR_BY_NAME = {s[2]: s[1] for s in STATES + OTHER_JURISDICTIONS}
FIPS_BY_ABBR = {s[1]: s[0] for s in STATES + OTHER_JURISDICTIONS}
ABBR_BY_FIPS = {s[0]: s[1] for s in STATES + OTHER_JURISDICTIONS}

# Governor general-election years (state constitutions). 2026 is verified against the
# ingested Wikipedia table at build time; the remaining 14 states are listed here.
GOV_ELECTION_YEAR_OTHER = {
    "KY": 2027, "LA": 2027, "MS": 2027,
    "DE": 2028, "IN": 2028, "MO": 2028, "MT": 2028, "NC": 2028, "ND": 2028, "UT": 2028, "WA": 2028, "WV": 2028,
    "NJ": 2029, "VA": 2029,  # last held November 2025
}

PARTIES = [
    # code, English, Arabic, group (used for coloring), color
    ("D", "Democratic Party", "الحزب الديمقراطي", "D", "#1f5fbf"),
    ("R", "Republican Party", "الحزب الجمهوري", "R", "#c8202f"),
    ("I", "Independent", "مستقل", "I", "#6b7280"),
    ("L", "Libertarian Party", "الحزب الليبرتاري", "O", "#6b7280"),
    ("G", "Green Party", "حزب الخضر", "O", "#6b7280"),
    ("O", "Other / minor party", "حزب آخر / أحزاب صغيرة", "O", "#6b7280"),
    ("U", "Unknown", "غير متوفر", "U", "#9ca3af"),
]

PARTY_NAME_TO_CODE = {
    "democratic": "D", "democrat": "D", "democratic-farmer-labor": "D", "dfl": "D",
    "republican": "R", "gop": "R",
    "independent": "I", "no party preference": "I", "unaffiliated": "I", "nonpartisan": "I",
    "libertarian": "L", "green": "G", "working families": "O",
}


def party_code(name: str | None) -> str:
    if not name:
        return "U"
    n = name.strip().lower().replace("–", "-").replace("—", "-")
    # state-branded Democratic affiliates (e.g. Democratic-Farmer-Labor, Democratic-NPL)
    if n.startswith("democrat"):
        return "D"
    if n.startswith("republican"):
        return "R"
    for key, code in PARTY_NAME_TO_CODE.items():
        if n == key or n.startswith(key + " ") or n.startswith(key + "/") or n.startswith(key + ","):
            return code
    return "O"


# ---------------------------------------------------------------------------
# Forecaster rating vocabulary:  "Lean R (flip)", "Tossup", "Safe D", "Likely D", "Tilt R", "Solid R"
RATING_LEVELS = {"solid": 4, "safe": 4, "likely": 3, "lean": 2, "tilt": 1, "tossup": 0, "toss-up": 0}


def parse_rating(raw: str) -> dict | None:
    """-> {level, party, flip, label}. level: 4 solid/safe, 3 likely, 2 lean, 1 tilt, 0 tossup."""
    if not raw:
        return None
    text = raw.strip()
    low = text.lower()
    flip = "flip" in low
    low = low.replace("(flip)", "").replace("flip", "").strip()
    if low.startswith("toss"):
        return {"level": 0, "party": None, "flip": flip, "label": "Tossup"}
    parts = low.replace("/", " ").split()
    if len(parts) >= 2 and parts[0] in RATING_LEVELS and parts[-1] in ("r", "d", "i"):
        return {"level": RATING_LEVELS[parts[0]], "party": parts[-1].upper(), "flip": flip,
                "label": text.replace("(flip)", "").strip()}
    return None


# Senate: control by the Vice President in a 50-50 split. Configurable constants.
VICE_PRESIDENT_PARTY = "R"  # JD Vance (R) presides over the Senate until Jan 2029
SENATE_MAJORITY = 51
HOUSE_MAJORITY = 218
