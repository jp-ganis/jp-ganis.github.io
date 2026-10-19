"""Step 02: learn character embeddings and export them for the page.

The model is the smallest thing that can learn an embedding: look up the
current character's vector, project it to scores over the next character.
(That's the bigram model of Step 04.) We snapshot the embedding table before
and after training, project both to 2D with PCA, and write data/embeddings.js
(a script rather than JSON, so the page also works opened straight from disk).
"""

import json
import urllib.request
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CORPUS = DATA / "input.txt"
URL = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"

D_EMBED = 16
STEPS = 3000
BATCH = 4096
LR = 1e-2

torch.manual_seed(1337)
device = "cuda" if torch.cuda.is_available() else "cpu"

if not CORPUS.exists():
    DATA.mkdir(exist_ok=True)
    urllib.request.urlretrieve(URL, CORPUS)

text = CORPUS.read_text(encoding="utf-8")
vocab = sorted(set(text))
stoi = {c: i for i, c in enumerate(vocab)}
data = torch.tensor([stoi[c] for c in text], device=device)


class Bigram(nn.Module):
    def __init__(self, v, d):
        super().__init__()
        self.embed = nn.Embedding(v, d)
        self.out = nn.Linear(d, v)

    def forward(self, idx):
        return self.out(self.embed(idx))


model = Bigram(len(vocab), D_EMBED).to(device)
init = model.embed.weight.detach().cpu().clone()
opt = torch.optim.AdamW(model.parameters(), lr=LR)


def batch():
    ix = torch.randint(len(data) - 1, (BATCH,), device=device)
    return data[ix], data[ix + 1]


losses = []
for step in range(STEPS):
    x, y = batch()
    loss = F.cross_entropy(model(x), y)
    opt.zero_grad(set_to_none=True)
    loss.backward()
    opt.step()
    if step % 100 == 0 or step == STEPS - 1:
        losses.append([step, round(loss.item(), 4)])
        print(f"step {step:5d}  loss {loss.item():.4f}")

trained = model.embed.weight.detach().cpu()


def pca2(m):
    m = m - m.mean(0)
    _, _, v = torch.linalg.svd(m, full_matrices=False)
    return m @ v[:2].T


def r(t):
    return [[round(float(x), 3) for x in row] for row in t]


DATA.mkdir(exist_ok=True)
(DATA / "embeddings.js").write_text("window.EMBEDDINGS = " + json.dumps({
    "vocab": vocab,
    "d": D_EMBED,
    "init": r(init),
    "trained": r(trained),
    "init2d": r(pca2(init)),
    "trained2d": r(pca2(trained)),
    "losses": losses,
}) + ";\n")
print("wrote", DATA / "embeddings.js")
