"""Kit-specific colour charts and the decision policy.

WHY THIS FILE EXISTS: the CNN only says which COLOUR it sees. What a colour means depends on WHICH REAGENT produced it,
so the substance is looked up per kit. A colour that is not expected for that kit is never reported as "negative" -
it is inconclusive (possible adulterant / other substance / bad reaction) and goes to the lab.

Colour expectations below come from published presumptive-test references (Marquis: MDMA/MDA purple to black,
amphetamine/methamphetamine orange to brown, opiates purple; modified Scott: cocaine blue; Duquenois-Levine: cannabis purple/violet).
They are NOT a substitute for the manufacturer's chart of the exact kit your department buys: replace `expected` with it
and set chart_verified=True once someone has checked."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

COMMON_NOTE = "Presumptive colour tests are screening only; many compounds and adulterants react. Confirmatory laboratory testing is required."


class KitChart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reagent: str = Field(min_length=1)
    expected: dict[str, str]
    ambiguous: dict[str, str]
    read_window_s: int | None
    source_citation: str = Field(min_length=1)
    chart_verified: bool
    verified_by: str | None
    verified_on: date | None

    @model_validator(mode="after")
    def verified_has_auditor_and_date(self) -> "KitChart":
        if self.chart_verified != (self.verified_by is not None and self.verified_on is not None):
            raise ValueError("Verified charts must record both verified_by and verified_on")
        return self


_CHART_PATH = Path(__file__).with_name("kit_charts.json")


def load_charts(path: Path = _CHART_PATH) -> dict[str, dict]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to load kit chart data from {path}") from exc
    if not isinstance(raw, dict) or not raw:
        raise ValueError("Kit chart data must be a non-empty object")
    charts: dict[str, dict] = {}
    allowed_colours = {
        "blue", "purple", "purple_black", "orange_brown", "orange_red",
        "no_reaction", "partial", "unreadable",
    }
    for kit_id, values in raw.items():
        chart = KitChart.model_validate(values)
        if not kit_id or set(chart.expected) & set(chart.ambiguous):
            raise ValueError(f"Invalid or overlapping chart entries for {kit_id}")
        if not (set(chart.expected) | set(chart.ambiguous)) <= allowed_colours:
            raise ValueError(f"Chart {kit_id} contains an unknown colour class")
        charts[kit_id] = chart.model_dump(mode="json")
    return charts


KITS = load_charts()
KIT_NOTES = {"Marquis": "Marquis cannot tell amphetamine from methamphetamine; read within 60 s of adding the reagent."}

COLOUR_LABEL = {"blue": "Blue", "purple": "Purple", "purple_black": "Purple-black", "orange_brown": "Orange-brown", "orange_red": "Orange-red",
                "no_reaction": "No colour change", "partial": "Partial reaction", "unreadable": "Unreadable"}

CONF_MIN = 0.70
REQUIRE_CARD = True


NOTICE_MESSAGES = {
    "CARD_NOT_FOUND": "Reference card not detected.",
    "EXPOSURE_DARK": "Scene is too dark.",
    "EXPOSURE_CLIPPED": "Reference card exposure is clipped.",
    "TEST_REGION_UNREADABLE": "Test region is unreadable.",
    "PARTIAL_REACTION": "Reaction is partial or uneven.",
    "LOW_CONFIDENCE": "Model confidence is below {min:.0%}.",
    "COLOR_AMBIGUOUS": "Observed color is ambiguous for this reagent.",
    "COLOR_NOT_EXPECTED": "Observed color is not expected for this reagent.",
    "EXPOSURE_DIM": "Lighting is dim.",
    "EXPOSURE_BRIGHT": "Lighting is bright; check for glare.",
    "CALIBRATION_RESIDUAL_HIGH": "Color calibration residual is high.",
}


def notice_message(notice: dict) -> str:
    template = NOTICE_MESSAGES.get(notice["code"], "Analysis notice.")
    return template.format(**{key: value for key, value in notice.items() if key != "code"})


def decide(
    kit_id: str,
    colour: str,
    conf: float,
    card_found: bool,
    exposure: str,
    extra_reasons: list[dict] | None = None,
) -> dict:
    """-> {verdict, substance, reaction_color, reasons[]}. verdict in positive | negative | inconclusive."""
    kit = KITS[kit_id]; reasons = list(extra_reasons or []); label = COLOUR_LABEL.get(colour, colour)
    out = lambda v, s: dict(verdict=v, substance=s, reaction_color=label, reasons=reasons)
    if REQUIRE_CARD and not card_found: reasons.append({"code": "CARD_NOT_FOUND"})
    if exposure == "dark": reasons.append({"code": "EXPOSURE_DARK"})
    if exposure == "clipped": reasons.append({"code": "EXPOSURE_CLIPPED"})
    if colour == "unreadable": reasons.append({"code": "TEST_REGION_UNREADABLE"})
    if colour == "partial": reasons.append({"code": "PARTIAL_REACTION"})
    if conf < CONF_MIN: reasons.append({"code": "LOW_CONFIDENCE", "min": CONF_MIN})
    if reasons: return out("inconclusive", "Undetermined")
    if colour in kit["expected"]: return out("positive", kit["expected"][colour])
    if colour == "no_reaction": return out("negative", "No controlled substance detected by this test")
    if colour in kit["ambiguous"]:
        reasons.append({"code": "COLOR_AMBIGUOUS", "color": colour, "reagent": kit["reagent"]})
    else:
        reasons.append({"code": "COLOR_NOT_EXPECTED", "color": colour, "reagent": kit["reagent"]})
    return out("inconclusive", "Undetermined")
