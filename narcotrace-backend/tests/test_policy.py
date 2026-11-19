"""Decision-policy tests (no model or images needed).  pytest -q"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.ml.kits import decide, KITS


def v(kit, colour, conf=0.95, card=True, exp="ok"): return decide(kit, colour, conf, card, exp)["verdict"]


def test_expected_colour_is_positive_per_kit():
    assert v("KIT-COC-04", "blue") == "positive"
    assert v("KIT-MDMA-03", "purple_black") == "positive"
    assert v("KIT-THC-02", "purple") == "positive"      # cannabis is purple (Duquenois-Levine), not orange-brown
    assert v("KIT-OPI-01", "purple") == "positive"


def test_both_orange_classes_mean_amphetamine_type_on_marquis():
    assert v("KIT-METH-05", "orange_brown") == v("KIT-METH-05", "orange_red") == "positive"


def test_same_colour_means_different_things_per_kit():
    assert v("KIT-COC-04", "purple") == "inconclusive"   # Scott: purple is not cocaine
    assert v("KIT-MDMA-03", "purple") == "inconclusive"  # Marquis purple is ambiguous (opiate vs MDMA/MDA)


def test_unexpected_colour_is_never_negative():
    assert v("KIT-COC-04", "orange_red") == "inconclusive"


def test_no_reaction_is_negative_only_when_trustworthy():
    assert v("KIT-COC-04", "no_reaction") == "negative"
    assert v("KIT-COC-04", "no_reaction", card=False) == "inconclusive"
    assert v("KIT-COC-04", "no_reaction", conf=0.5) == "inconclusive"


def test_bad_capture_is_inconclusive():
    for exp in ("dark", "clipped"): assert v("KIT-COC-04", "blue", exp=exp) == "inconclusive"
    assert v("KIT-COC-04", "blue", exp="dim") == "positive"       # dim/bright only warn
    for c in ("partial", "unreadable"): assert v("KIT-COC-04", c) == "inconclusive"


def test_every_kit_is_flagged_unverified_until_checked_against_the_real_chart():
    assert all(not k["chart_verified"] for k in KITS.values())


def test_decision_reasons_are_machine_codes_with_parameters():
    result = decide("KIT-COC-04", "blue", 0.5, True, "ok")

    assert result["reasons"] == [{"code": "LOW_CONFIDENCE", "min": 0.7}]
