"""Step 07: train the full transformer on tiny-Shakespeare.

Settings follow Karpathy's nanoGPT character-level Shakespeare run. Along the
way we log train/val loss and sample text, so the page can show it learning to
write. 10.8M parameters on ~1MB of text will overfit, so we keep the checkpoint
with the best validation loss (early stopping) and, for every sample, measure
the longest stretch copied verbatim from the training text.
Saves train/out/gpt.pt (best checkpoint, for Step 08) and writes data/transformer.js.
"""

import json
import math
import re
import time
from pathlib import Path

import torch
import torch.nn.functional as F

from model import GPT, Config

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "train" / "out"

STEPS = 5000
BATCH = 64
LR, LR_MIN, WARMUP = 1e-3, 1e-4, 100
EVAL_EVERY, EVAL_BATCHES = 250, 100
SAMPLE_AT = {0, 100, 250, 500, 1000, 2000, 3500, 5000}
SAMPLE_LEN = 300

torch.manual_seed(1337)
device = "cuda" if torch.cuda.is_available() else "cpu"
amp = torch.autocast(device_type=device, dtype=torch.bfloat16) if device == "cuda" else torch.autocast("cpu", enabled=False)

text = (DATA / "input.txt").read_text(encoding="utf-8")  # fetched by step02
vocab = sorted(set(text))
stoi = {c: i for i, c in enumerate(vocab)}
data = torch.tensor([stoi[c] for c in text])
split = int(len(data) * 0.9)
splits = {"train": data[:split], "val": data[split:]}

cfg = Config(vocab=len(vocab))
model = GPT(cfg).to(device)
n_params = sum(p.numel() for p in model.parameters())
print(f"{n_params:,} parameters")
opt = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9, 0.99), weight_decay=0.1)


def batch(name):
    src = splits[name]
    ix = torch.randint(len(src) - cfg.block - 1, (BATCH,))
    x = torch.stack([src[i:i + cfg.block] for i in ix])
    y = torch.stack([src[i + 1:i + cfg.block + 1] for i in ix])
    return x.to(device, non_blocking=True), y.to(device, non_blocking=True)


def lr_at(step):
    if step < WARMUP:
        return LR * (step + 1) / WARMUP
    t = (step - WARMUP) / (STEPS - WARMUP)
    return LR_MIN + 0.5 * (LR - LR_MIN) * (1 + math.cos(math.pi * t))


@torch.no_grad()
def evaluate():
    model.eval()
    out = {}
    for name in splits:
        losses = []
        for _ in range(EVAL_BATCHES):
            x, y = batch(name)
            with amp:
                logits = model(x)
            losses.append(F.cross_entropy(logits.view(-1, logits.size(-1)).float(), y.view(-1)).item())
        out[name] = round(sum(losses) / len(losses), 4)
    model.train()
    return out


@torch.no_grad()
def sample():
    model.eval()
    g = torch.Generator(device=device).manual_seed(42)
    idx = torch.tensor([[stoi["\n"]]], device=device)
    with amp:
        out = model.generate(idx, SAMPLE_LEN, generator=g)
    model.train()
    return "".join(vocab[i] for i in out[0, 1:].tolist())


train_text = text[:split]


def longest_copied(s):
    """Longest substring of s that appears word-for-word in the training text."""
    best = ""
    for i in range(len(s)):
        n = len(best) + 1
        while i + n <= len(s) and s[i:i + n] in train_text:
            best = s[i:i + n]
            n += 1
    return best


# Reference points from earlier steps, on the same validation text.
counts = torch.zeros(len(vocab), len(vocab))
tr = splits["train"]
counts.index_put_((tr[:-1], tr[1:]), torch.ones(len(tr) - 1), accumulate=True)
p = (counts + 1) / (counts + 1).sum(1, keepdim=True)
va = splits["val"]
bigram_val = F.nll_loss(p.log()[va[:-1]], va[1:]).item()
attn_js = (DATA / "attention.js").read_text(encoding="utf-8")
attention_val = float(re.search(r'"valLoss": ([\d.]+)', attn_js).group(1))

OUT.mkdir(parents=True, exist_ok=True)
curve, samples = [], []
best = {"step": 0, "val": float("inf")}
t0 = time.time()
for step in range(STEPS + 1):
    if step % EVAL_EVERY == 0 or step == STEPS:
        losses = evaluate()
        curve.append({"step": step, **losses})
        print(f"step {step:5d}  train {losses['train']:.3f}  val {losses['val']:.3f}  ({time.time() - t0:.0f}s)")
        if losses["val"] < best["val"]:
            best = {"step": step, "val": losses["val"]}
            torch.save({"model": model.state_dict(), "config": cfg.__dict__, "vocab": vocab,
                        "step": step, "val": losses["val"]}, OUT / "gpt.pt")
    if step in SAMPLE_AT:
        txt = sample()
        samples.append({"step": step, "text": txt, "copied": len(longest_copied(txt))})
    if step == STEPS:
        break
    for g in opt.param_groups:
        g["lr"] = lr_at(step)
    x, y = batch("train")
    with amp:
        logits = model(x)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
    opt.zero_grad(set_to_none=True)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()

model.load_state_dict(torch.load(OUT / "gpt.pt")["model"])
txt = sample()
best.update(text=txt, copied=len(longest_copied(txt)))
print(f"best: step {best['step']} val {best['val']:.3f}, longest copied run {best['copied']} chars")

(DATA / "transformer.js").write_text("window.TRANSFORMER = " + json.dumps({
    "config": cfg.__dict__,
    "params": n_params,
    "curve": curve,
    "samples": samples,
    "best": best,
    "refs": {"uniform": round(math.log(len(vocab)), 3),
             "bigram": round(bigram_val, 3),
             "attention": attention_val},
    "minutes": round((time.time() - t0) / 60, 1),
}) + ";\n")
print("wrote", DATA / "transformer.js", "and", OUT / "gpt.pt")
