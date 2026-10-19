"""A small GPT: the transformer from Step 07, shared by training and generation.

tokens -> token embedding + position embedding
       -> [block] x n_layer   (LayerNorm -> attention -> add, LayerNorm -> MLP -> add)
       -> LayerNorm -> linear -> logits
"""

from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class Config:
    vocab: int = 65
    block: int = 256      # context length
    n_layer: int = 6
    n_head: int = 6
    d_model: int = 384
    dropout: float = 0.2


class Attention(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.n_head = cfg.n_head
        self.qkv = nn.Linear(cfg.d_model, 3 * cfg.d_model, bias=False)  # W_Q, W_K, W_V for every head
        self.proj = nn.Linear(cfg.d_model, cfg.d_model)
        self.resid_drop = nn.Dropout(cfg.dropout)
        self.dropout = cfg.dropout

    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(x).split(C, dim=2)
        q, k, v = (t.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) for t in (q, k, v))
        # softmax(q.k / sqrt(d), causal mask) @ v, fused into one kernel
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True,
                                             dropout_p=self.dropout if self.training else 0)
        return self.resid_drop(self.proj(out.transpose(1, 2).reshape(B, T, C)))


class MLP(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(cfg.d_model, 4 * cfg.d_model),   # expand: run ~1.5k pattern detectors
            nn.GELU(),                                 # the nonlinearity that makes "if A and B" possible
            nn.Linear(4 * cfg.d_model, cfg.d_model),   # shrink: write conclusions back
            nn.Dropout(cfg.dropout),
        )

    def forward(self, x):
        return self.net(x)


class Block(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.ln1 = nn.LayerNorm(cfg.d_model)
        self.attn = Attention(cfg)
        self.ln2 = nn.LayerNorm(cfg.d_model)
        self.mlp = MLP(cfg)

    def forward(self, x):
        x = x + self.attn(self.ln1(x))   # gather from earlier tokens, add notes
        x = x + self.mlp(self.ln2(x))    # think about them, add notes
        return x


class GPT(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.tok = nn.Embedding(cfg.vocab, cfg.d_model)
        self.pos = nn.Embedding(cfg.block, cfg.d_model)
        self.drop = nn.Dropout(cfg.dropout)
        self.blocks = nn.ModuleList(Block(cfg) for _ in range(cfg.n_layer))
        self.ln_f = nn.LayerNorm(cfg.d_model)
        self.head = nn.Linear(cfg.d_model, cfg.vocab)
        self.apply(self._init)

    @staticmethod
    def _init(m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, std=0.02)
        if isinstance(m, nn.Linear) and m.bias is not None:
            nn.init.zeros_(m.bias)

    def forward(self, idx):
        T = idx.shape[1]
        x = self.drop(self.tok(idx) + self.pos(torch.arange(T, device=idx.device)))
        for block in self.blocks:
            x = block(x)
        return self.head(self.ln_f(x))

    @torch.no_grad()
    def generate(self, idx, n, temperature=1.0, top_k=None, generator=None):
        for _ in range(n):
            logits = self(idx[:, -self.cfg.block:])[:, -1, :] / temperature
            if top_k:
                v, _ = torch.topk(logits, top_k)
                logits[logits < v[:, [-1]]] = -float("inf")
            nxt = torch.multinomial(F.softmax(logits, dim=-1), 1, generator=generator)
            idx = torch.cat([idx, nxt], dim=1)
        return idx
