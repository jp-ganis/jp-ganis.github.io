"""Step 05: character-pair counts for training a bigram live in the browser.

The browser doesn't need the text itself: sampling a random training position
is the same as sampling a pair from the train counts, and the validation loss
can be computed exactly from the val counts. First 90% is train, last 10% val.
Writes data/pairs.js.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

text = (DATA / "input.txt").read_text(encoding="utf-8")  # fetched by step02
vocab = sorted(set(text))
stoi = {c: i for i, c in enumerate(vocab)}
split = int(len(text) * 0.9)


def pair_counts(s):
    m = [[0] * len(vocab) for _ in vocab]
    for a, b in zip(s, s[1:]):
        m[stoi[a]][stoi[b]] += 1
    return m


(DATA / "pairs.js").write_text("window.PAIRS = " + json.dumps({
    "vocab": vocab,
    "train": pair_counts(text[:split]),
    "val": pair_counts(text[split:]),
}) + ";\n")
print("wrote", DATA / "pairs.js")
