"""Step 06: a single layer of multi-head self-attention, trained, then inspected.

Model: token embedding + position embedding -> one layer of 4 causal attention
heads (with a residual connection) -> linear layer to logits. No MLP, no layer
norm, no stacking yet; that's Step 07. We record its attention weights on one
line of text, plus its validation loss next to the bigram's.
Writes data/attention.js.
"""

import json
import math
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

BLOCK = 64       # context length
D_MODEL = 64     # embedding size
N_HEAD = 4
STEPS = 4000
BATCH = 64
LR = 3e-3
DEMO = "First Citizen:\nBefore we proceed any further, hear me speak."

torch.manual_seed(1337)
device = "cuda" if torch.cuda.is_available() else "cpu"

text = (DATA / "input.txt").read_text(encoding="utf-8")  # fetched by step02
vocab = sorted(set(text))
stoi = {c: i for i, c in enumerate(vocab)}
data = torch.tensor([stoi[c] for c in text], device=device)
split = int(len(data) * 0.9)
train_data, val_data = data[:split], data[split:]


def batch(src):
    ix = torch.randint(len(src) - BLOCK - 1, (BATCH,), device=device)
    x = torch.stack([src[i:i + BLOCK] for i in ix])
    y = torch.stack([src[i + 1:i + BLOCK + 1] for i in ix])
    return x, y


class Attention(nn.Module):
    def __init__(self):
        super().__init__()
        self.q = nn.Linear(D_MODEL, D_MODEL, bias=False)   # all heads' W_Q side by side
        self.k = nn.Linear(D_MODEL, D_MODEL, bias=False)
        self.v = nn.Linear(D_MODEL, D_MODEL, bias=False)
        self.proj = nn.Linear(D_MODEL, D_MODEL)
        self.register_buffer("mask", torch.tril(torch.ones(BLOCK, BLOCK)).bool())

    def forward(self, x):
        B, T, C = x.shape
        hs = C // N_HEAD
        split_heads = lambda t: t.view(B, T, N_HEAD, hs).transpose(1, 2)   # (B, heads, T, hs)
        q, k, v = split_heads(self.q(x)), split_heads(self.k(x)), split_heads(self.v(x))
        scores = q @ k.transpose(-2, -1) / math.sqrt(hs)                    # query . key
        scores = scores.masked_fill(~self.mask[:T, :T], float("-inf"))     # no peeking ahead
        weights = F.softmax(scores, dim=-1)                                # each row sums to 1
        out = (weights @ v).transpose(1, 2).reshape(B, T, C)               # weighted sum of values
        return self.proj(out), weights


class AttentionLM(nn.Module):
    def __init__(self):
        super().__init__()
        self.tok = nn.Embedding(len(vocab), D_MODEL)
        self.pos = nn.Embedding(BLOCK, D_MODEL)
        self.attn = Attention()
        self.head = nn.Linear(D_MODEL, len(vocab))

    def forward(self, idx):
        T = idx.shape[1]
        x = self.tok(idx) + self.pos(torch.arange(T, device=idx.device))
        a, weights = self.attn(x)
        return self.head(x + a), weights


@torch.no_grad()
def val_loss(model, n=50):
    losses = []
    for _ in range(n):
        x, y = batch(val_data)
        logits, _ = model(x)
        losses.append(F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1)).item())
    return sum(losses) / n


model = AttentionLM().to(device)
opt = torch.optim.AdamW(model.parameters(), lr=LR)
for step in range(STEPS + 1):
    x, y = batch(train_data)
    logits, _ = model(x)
    loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
    opt.zero_grad(set_to_none=True)
    loss.backward()
    opt.step()
    if step % 500 == 0:
        print(f"step {step:5d}  train {loss.item():.3f}  val {val_loss(model):.3f}")

model.eval()
final_val = val_loss(model, 200)
with torch.no_grad():
    idx = torch.tensor([[stoi[c] for c in DEMO]], device=device)
    _, weights = model(idx)

    g = torch.Generator(device=device).manual_seed(42)
    out = torch.tensor([[stoi["\n"]]], device=device)
    for _ in range(300):
        logits, _ = model(out[:, -BLOCK:])
        nxt = torch.multinomial(F.softmax(logits[:, -1], dim=-1), 1, generator=g)
        out = torch.cat([out, nxt], dim=1)
    sample = "".join(vocab[i] for i in out[0, 1:].tolist())

(DATA / "attention.js").write_text("window.ATTENTION = " + json.dumps({
    "text": DEMO,
    "heads": [[[round(w, 4) for w in row[:i + 1]] for i, row in enumerate(h.tolist())]
              for h in weights[0].cpu()],
    "valLoss": round(final_val, 3),
    "params": sum(p.numel() for p in model.parameters()),
    "sample": sample,
}) + ";\n")
print(f"final val {final_val:.3f}  params {sum(p.numel() for p in model.parameters()):,}")
print("wrote", DATA / "attention.js")
