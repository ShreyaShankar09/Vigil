import json
from pathlib import Path

from app.custody import link_hash, verify_chain

VECTORS_PATH = Path(__file__).parent / "vectors" / "custody.json"


def test_shared_custody_vectors_include_unicode_and_match_hashes():
    document = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    vectors = document["vectors"]

    assert len(vectors) == 5
    assert any(not vector["payload"]["actor"].isascii() for vector in vectors)
    for vector in vectors:
        assert link_hash(vector["prev_hash"], vector["payload"]) == vector["hash"]
        assert verify_chain([vector]) == (True, None)
