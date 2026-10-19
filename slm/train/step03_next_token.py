"""Step 03: next-token distributions for every cut point of one sentence.

There's no neural model yet, so the distributions come from counting: for each
prefix, find the longest ending of it (up to MAX_CTX characters) that appears
at least MIN_SEEN times in tiny-Shakespeare, and tally what came next. Logits
are the log of the (smoothed) probabilities, so softmax maps them straight back.
Writes data/next_token.js.
"""

import json
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SENTENCE = "To be, or not to be, that is the question."
MAX_CTX = 10
MIN_SEEN = 20
TOP = 8
SMOOTH = 0.05

text = (DATA / "input.txt").read_text(encoding="utf-8")  # fetched by step02
vocab = sorted(set(text))


def next_counts(ctx):
    if not ctx:
        return Counter(text)
    return Counter(m.group(1) for m in re.finditer("(?=" + re.escape(ctx) + "(.))", text, re.S))


positions = []
for i in range(len(SENTENCE)):
    prefix, target = SENTENCE[:i], SENTENCE[i]
    for k in range(min(MAX_CTX, len(prefix)), -1, -1):
        counts = next_counts(prefix[len(prefix) - k:])
        if sum(counts.values()) >= MIN_SEEN:
            break
    n = sum(counts.values())
    p = {c: (counts[c] + SMOOTH) / (n + SMOOTH * len(vocab)) for c in vocab}
    mean = sum(math.log(v) for v in p.values()) / len(vocab)
    logit = {c: math.log(v) - mean for c, v in p.items()}

    ranked = sorted(vocab, key=lambda c: -p[c])
    top = ranked[:TOP]
    if target not in top:
        top[-1] = target
    positions.append({
        "k": k,
        "seen": n,
        "top": [[c, round(logit[c], 2), round(p[c], 4)] for c in top],
        "rest": round(1 - sum(p[c] for c in top), 4),
        "rank": ranked.index(target) + 1,
    })
    print(f"{prefix[-12:]!r:>16} -> {target!r}  ctx={k:2d} seen={n:6d}  p(target)={p[target]:.3f}")

(DATA / "next_token.js").write_text("window.NEXT_TOKEN = " + json.dumps({
    "sentence": SENTENCE,
    "vocabSize": len(vocab),
    "positions": positions,
}) + ";\n")
print("wrote", DATA / "next_token.js")
