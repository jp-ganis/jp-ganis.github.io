"""Step 04: the bigram model, built both ways.

1. Counting: tally every adjacent pair into a 65x65 grid, normalise each row.
2. Neural: a 65x65 table of logits, random at first, trained with Adam.
Both should land on (almost) the same probabilities. We also measure how
quickly a counting table runs out of data as the context gets longer.
Writes data/bigram.js.
"""

import json
from pathlib import Path

import torch
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

STEPS = 2000
BATCH = 8192
LR = 0.1

torch.manual_seed(1337)
device = "cuda" if torch.cuda.is_available() else "cpu"

text = (DATA / "input.txt").read_text(encoding="utf-8")  # fetched by step02
vocab = sorted(set(text))
V = len(vocab)
stoi = {c: i for i, c in enumerate(vocab)}
data = torch.tensor([stoi[c] for c in text], device=device)
x_all, y_all = data[:-1], data[1:]

# 1. Counting (add-one smoothing so no pair is impossible)
counts = torch.zeros(V, V, device=device)
counts.index_put_((x_all, y_all), torch.ones_like(x_all, dtype=torch.float), accumulate=True)
p_count = (counts + 1) / (counts + 1).sum(1, keepdim=True)
loss_count = F.nll_loss(p_count.log()[x_all], y_all).item()

# 2. Neural: the logit table is the whole model
logits = torch.randn(V, V, device=device, requires_grad=True)
opt = torch.optim.Adam([logits], lr=LR)
loss_init = F.cross_entropy(logits[x_all], y_all).item()
for step in range(STEPS):
    ix = torch.randint(len(x_all), (BATCH,), device=device)
    loss = F.cross_entropy(logits[x_all[ix]], y_all[ix])
    opt.zero_grad(set_to_none=True)
    loss.backward()
    opt.step()
with torch.no_grad():
    p_neural = F.softmax(logits, dim=1)
    loss_neural = F.cross_entropy(logits[x_all], y_all).item()

print(f"uniform guess {torch.log(torch.tensor(float(V))).item():.3f}")
print(f"neural before {loss_init:.3f}  after {loss_neural:.3f}")
print(f"counting      {loss_count:.3f}")

# How fast does a lookup table run out of data?
sparsity = []
for n in range(1, 11):
    seen = len({text[i:i + n] for i in range(len(text) - n + 1)})
    sparsity.append({"n": n, "possible": V ** n, "seen": seen})
    print(f"context {n:2d}: {seen:9,d} seen of {V ** n:.2e} possible")


def r(t):
    return [[round(float(x), 5) for x in row] for row in t.cpu()]


(DATA / "bigram.js").write_text("window.BIGRAM = " + json.dumps({
    "vocab": vocab,
    "count": r(p_count),
    "neural": r(p_neural),
    "loss": {"uniform": round(torch.log(torch.tensor(float(V))).item(), 3),
             "count": round(loss_count, 3),
             "neuralInit": round(loss_init, 3),
             "neural": round(loss_neural, 3)},
    "sparsity": sparsity,
}) + ";\n")
print("wrote", DATA / "bigram.js")
