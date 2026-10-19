"""Step 08: make the trained transformer talk.

Loads the best checkpoint from Step 07 (train/out/gpt.pt) and records two things:
  replay: one generation, character by character, with the model's full set of
          65 logits at every step, so the page can re-apply temperature and top-k
          to the real distributions in the browser.
  grid:   finished generations for several prompts x temperatures x top-k, all
          from the same seed, with simple health metrics for each.
Writes data/generate.js.
"""

import json
import re
from pathlib import Path

import torch
import torch.nn.functional as F

from model import GPT, Config

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

REPLAY_PROMPT, REPLAY_LEN, REPLAY_SEED = "JULIET:\n", 300, 7
PROMPTS = ["ROMEO:\n", "JULIET:\n", "HAMLET:\n"]   # Hamlet never appears in the training text
TEMPS = [0.1, 0.5, 0.8, 1.0, 1.3, 1.7, 2.5]
TOP_KS = [0, 10]                                    # 0 = off
GRID_LEN, GRID_SEED = 300, 42

device = "cuda" if torch.cuda.is_available() else "cpu"
ckpt = torch.load(ROOT / "train" / "out" / "gpt.pt", map_location=device)
vocab = ckpt["vocab"]
stoi = {c: i for i, c in enumerate(vocab)}
model = GPT(Config(**ckpt["config"])).to(device).eval()
model.load_state_dict(ckpt["model"])
print(f"checkpoint from step {ckpt['step']}, val {ckpt['val']:.3f}")

text = (DATA / "input.txt").read_text(encoding="utf-8")
train_text = text[:int(len(text) * 0.9)]
train_words = set(re.findall(r"[a-z']+", train_text.lower()))


def encode(s):
    return torch.tensor([[stoi[c] for c in s]], device=device)


def longest_copied(s):
    best = ""
    for i in range(len(s)):
        n = len(best) + 1
        while i + n <= len(s) and s[i:i + n] in train_text:
            best = s[i:i + n]
            n += 1
    return best


@torch.no_grad()
def replay():
    """Generate at T=1, keeping the logits behind every choice."""
    g = torch.Generator(device=device).manual_seed(REPLAY_SEED)
    idx = encode(REPLAY_PROMPT)
    steps = []
    for _ in range(REPLAY_LEN):
        logits = model(idx[:, -model.cfg.block:])[0, -1].float()
        nxt = torch.multinomial(F.softmax(logits, -1), 1, generator=g)
        steps.append({"logits": [round(v, 2) for v in logits.tolist()], "pick": vocab[nxt.item()]})
        idx = torch.cat([idx, nxt.view(1, 1)], dim=1)
    return steps


@torch.no_grad()
def generate(prompt, temperature, top_k):
    g = torch.Generator(device=device).manual_seed(GRID_SEED)
    out = model.generate(encode(prompt), GRID_LEN, temperature=temperature,
                         top_k=top_k or None, generator=g)
    return "".join(vocab[i] for i in out[0, len(prompt):].tolist())


grid = []
for prompt in PROMPTS:
    for t in TEMPS:
        for k in TOP_KS:
            s = generate(prompt, t, k)
            words = re.findall(r"[a-z']+", s.lower())
            real = sum(w in train_words for w in words) / max(len(words), 1)
            grid.append({"prompt": prompt, "temp": t, "topK": k, "text": s,
                         "realWords": round(real, 3), "copied": len(longest_copied(s))})
            print(f"{prompt.strip():8s} T={t:<4} k={k:<3} real {real:.0%}  copied {grid[-1]['copied']}")

(DATA / "generate.js").write_text("window.GENERATE = " + json.dumps({
    "vocab": vocab,
    "block": model.cfg.block,
    "replay": {"prompt": REPLAY_PROMPT, "steps": replay()},
    "temps": TEMPS,
    "topKs": TOP_KS,
    "prompts": PROMPTS,
    "grid": grid,
}, separators=(",", ":")) + ";\n", encoding="utf-8")
print("wrote", DATA / "generate.js")
