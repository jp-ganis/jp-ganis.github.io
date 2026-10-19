// Step 07: (a) the architecture drawn as a residual stream, (b) the full
// transformer's training run, with samples, against earlier models.
// Data comes from train/step07_transformer.py via data/transformer.js.

(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  };
  const fmt = n => n.toLocaleString();

  // --- (a) architecture ----------------------------------------------------

  (() => {
    const root = document.getElementById("arch-demo");
    if (!root) return;
    const svg = root.querySelector("#arch");
    const info = root.querySelector("#arch-info");
    const d = 384, V = 65, ctx = 256, L = 6;

    const parts = {
      embed: ["Token + position embedding", V * d + ctx * d,
        "Each character's learned 384-number vector (Step 02), plus a learned vector for its position. Their sum is the notepad's first entry."],
      stream: ["Residual stream: the notepad", 0,
        "One 384-number vector per position, running the full height of the model. Every sublayer reads it and adds its notes back."],
      ln: ["LayerNorm", 2 * d,
        "Rescales each vector to mean 0, spread 1 (plus a learned scale and shift) before a sublayer reads it, keeping values stable through six blocks."],
      attn: ["Attention: communication", 3 * d * d + d * d + d,
        "Six heads, each with its own W_Q, W_K, W_V. Each position gathers from earlier ones (Step 06) and notes what it found."],
      mlp: ["MLP: computation", d * 4 * d + 4 * d + 4 * d * d + d,
        "Expand to 1,536 pattern detectors, apply a nonlinearity, shrink back. Each position works on its own notepad, with the same weights everywhere, like a conv filter."],
      add: ["Residual add", 0,
        "x = x + sublayer(x). Notes are added, never overwritten, so a clumsy layer can't erase earlier work, and gradients get a straight path back."],
      out: ["Final LayerNorm + linear", 2 * d + d * V + V,
        "Turns each position's final notepad into 65 logits. Softmax gives the next-character probabilities (Step 03)."],
    };

    const W = 420, X = 110;       // stream x
    const BX = 190;               // branch column x
    const box = (key, x, y, w, h, label, cls = "") => {
      const g = el("g", { class: `arch-part ${cls}`, tabindex: 0, role: "button", "data-key": key }, svg);
      el("rect", { x, y, width: w, height: h, rx: 6 }, g);
      el("text", { x: x + w / 2, y: y + h / 2, dy: "0.35em", "text-anchor": "middle" }, g).textContent = label;
      return g;
    };
    const plus = (y) => {
      const g = el("g", { class: "arch-part arch-add", tabindex: 0, role: "button", "data-key": "add" }, svg);
      el("circle", { cx: X, cy: y, r: 9 }, g);
      el("text", { x: X, y, dy: "0.35em", "text-anchor": "middle" }, g).textContent = "+";
    };
    const wire = (pts, cls = "") => el("path", { d: "M" + pts.map(p => p.join(",")).join("L"), class: `arch-wire ${cls}` }, svg);

    // stream
    const s = el("g", { class: "arch-part arch-stream-g", tabindex: 0, role: "button", "data-key": "stream" }, svg);
    el("line", { x1: X, y1: 46, x2: X, y2: 384, class: "arch-stream" }, s);
    el("line", { x1: X, y1: 46, x2: X, y2: 384, class: "arch-hit" }, s);

    box("embed", X - 90, 10, 180, 36, "token + position embedding");

    // one block, drawn once, repeated x6
    el("rect", { x: X - 34, y: 66, width: W - X + 16, height: 286, rx: 10, class: "arch-frame" }, svg);
    el("text", { x: W - 10, y: 86, "text-anchor": "end", class: "arch-times" }, svg).textContent = `× ${L}`;
    el("text", { x: X + 18, y: 344, class: "arch-small" }, svg).textContent = "one block";

    // attention branch
    wire([[X, 96], [BX - 20, 96], [BX - 20, 104]]);
    box("ln", BX - 60, 104, 80, 26, "LayerNorm", "small");
    wire([[BX - 20, 130], [BX - 20, 140]]);
    box("attn", BX - 70, 140, 200, 40, "attention (6 heads)", "attn");
    wire([[BX + 30, 180], [BX + 30, 200], [X, 200]]);
    plus(200);

    // MLP branch
    wire([[X, 222], [BX - 20, 222], [BX - 20, 230]]);
    box("ln", BX - 60, 230, 80, 26, "LayerNorm", "small");
    wire([[BX - 20, 256], [BX - 20, 266]]);
    box("mlp", BX - 70, 266, 200, 40, "MLP  384 → 1536 → 384", "mlp");
    wire([[BX + 30, 306], [BX + 30, 324], [X, 324]]);
    plus(324);

    box("out", X - 90, 384, 180, 36, "LayerNorm → linear → 65 logits");
    el("text", { x: X - 14, y: 60, "text-anchor": "end", class: "arch-small" }, svg).textContent = "notepad";

    function select(key) {
      const [title, n, body] = parts[key];
      const total = key === "attn" || key === "mlp" || key === "ln" ? n * L * (key === "ln" ? 2 : 1) : n;
      info.replaceChildren();
      const h = document.createElement("strong");
      h.textContent = title;
      const p = document.createElement("span");
      p.textContent = " " + body;
      info.append(h, p);
      if (n) {
        const m = document.createElement("span");
        m.className = "arch-params";
        m.textContent = key === "attn" || key === "mlp" || key === "ln"
          ? ` ${fmt(n)} parameters each, ${fmt(total)} across the model.`
          : ` ${fmt(n)} parameters.`;
        info.append(m);
      }
      svg.querySelectorAll(".arch-part").forEach(g => g.classList.toggle("on", g.dataset.key === key));
    }
    svg.querySelectorAll(".arch-part").forEach(g => {
      g.addEventListener("click", () => select(g.dataset.key));
      g.addEventListener("focus", () => select(g.dataset.key));
      g.addEventListener("pointerenter", () => select(g.dataset.key));
    });
    select("stream");
  })();

  // --- (b) the training run ------------------------------------------------

  (() => {
    const T = window.TRANSFORMER;
    const root = document.getElementById("gpt-demo");
    if (!T || !root) return;

    const svg = root.querySelector("#gpt-plot");
    const tip = root.querySelector("#gpt-tip");
    const stepBtns = root.querySelector("#gpt-steps");
    const sampleOut = root.querySelector("#gpt-sample");
    const sampleHead = root.querySelector("#gpt-sample-head");
    const finalOut = root.querySelector("#gpt-final");
    const copiedOut = root.querySelector("#gpt-copied");
    const copiedBar = root.querySelector("#gpt-copied-bar");

    const last = T.curve.at(-1), best = T.best;
    finalOut.textContent = `${fmt(T.params)} parameters · ${T.minutes} minutes on one RTX 3070 · best validation loss ${best.val.toFixed(2)} at step ${fmt(best.step)}`;

    const W = 400, H = 230, L = 36, R = 96, Tp = 24, B = 28;
    const SMAX = last.step, YMIN = 0.5, YMAX = 4.5;
    const xOf = s => L + s / SMAX * (W - L - R);
    const yOf = v => Tp + (1 - (Math.min(YMAX, Math.max(YMIN, v)) - YMIN) / (YMAX - YMIN)) * (H - Tp - B);

    const grid = el("g", { class: "ch-grid" }, svg);
    for (let y = YMIN; y <= YMAX; y += 0.5) {
      el("line", { x1: L, x2: W - R, y1: yOf(y), y2: yOf(y) }, grid);
      if (y % 1 === 0) el("text", { x: L - 6, y: yOf(y), dy: "0.35em", "text-anchor": "end" }, grid).textContent = y;
    }
    for (let s = 0; s <= SMAX; s += 1000)
      el("text", { x: xOf(s), y: H - B + 16, "text-anchor": "middle" }, grid).textContent = fmt(s);
    el("text", { x: W - R, y: H - 2, "text-anchor": "end" }, grid).textContent = "training steps";
    el("text", { x: 4, y: 10 }, grid).textContent = "loss";

    [[T.refs.uniform, "random guess"], [T.refs.bigram, `bigram ${T.refs.bigram.toFixed(2)}`],
     [T.refs.attention, `1 attention layer ${T.refs.attention.toFixed(2)}`]].forEach(([v, label]) => {
      el("line", { x1: L, x2: W - R, y1: yOf(v), y2: yOf(v), class: "ch-ref" }, svg);
      el("text", { x: W - R + 4, y: yOf(v), dy: "0.35em", class: "ch-note" }, svg).textContent = label;
    });

    el("rect", { x: xOf(best.step), y: Tp, width: xOf(SMAX) - xOf(best.step), height: H - Tp - B, class: "ch-band" }, svg);
    el("text", { x: (xOf(best.step) + xOf(SMAX)) / 2, y: Tp + 12, "text-anchor": "middle", class: "ch-note" }, svg)
      .textContent = "overfitting: train ↓, validation ↑";
    el("circle", { cx: xOf(best.step), cy: yOf(best.val), r: 4, class: "ch-best" }, svg);
    el("text", { x: xOf(best.step) + 6, y: yOf(best.val) - 10, class: "ch-note strong" }, svg)
      .textContent = `best ${best.val.toFixed(2)}, kept`;

    const path = key => T.curve.map((p, k) => (k ? "L" : "M") + xOf(p.step).toFixed(1) + "," + yOf(p[key]).toFixed(1)).join("");
    el("path", { d: path("train"), class: "ch-line series-1" }, svg);
    el("path", { d: path("val"), class: "ch-line series-2" }, svg);
    el("text", { x: W - R + 4, y: yOf(last.val) + 4, dy: "0.35em", class: "ch-note strong" }, svg).textContent = `val ${last.val.toFixed(2)}`;
    el("text", { x: W - R + 4, y: yOf(last.train) - 4, dy: "0.35em", class: "ch-note" }, svg).textContent = `train ${last.train.toFixed(2)}`;

    const marker = el("line", { y1: Tp, y2: H - B, class: "ch-marker" }, svg);
    const hover = el("line", { y1: Tp, y2: H - B, class: "ch-guide", visibility: "hidden" }, svg);
    const hit = el("rect", { x: L, y: Tp, width: W - L - R, height: H - Tp - B, fill: "transparent" }, svg);

    hit.addEventListener("pointermove", e => {
      const box = svg.getBoundingClientRect();
      const s = ((e.clientX - box.left) / box.width * W - L) / (W - L - R) * SMAX;
      const p = T.curve.reduce((a, b) => Math.abs(b.step - s) < Math.abs(a.step - s) ? b : a);
      hover.setAttribute("x1", xOf(p.step)); hover.setAttribute("x2", xOf(p.step));
      hover.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.style.left = (xOf(p.step) / W * 100) + "%";
      tip.innerHTML = `<b>Step ${fmt(p.step)}</b><br>validation ${p.val.toFixed(2)}<br>training ${p.train.toFixed(2)}`;
    });
    hit.addEventListener("pointerleave", () => { hover.setAttribute("visibility", "hidden"); tip.hidden = true; });

    const all = [...T.samples, { ...best, label: `best (${fmt(best.step)})` }].sort((a, b) => a.step - b.step || (a.label ? 1 : -1));
    const btns = all.map((smp, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = smp.label || fmt(smp.step);
      b.addEventListener("click", () => show(k));
      stepBtns.append(b);
      return b;
    });

    function show(k) {
      const smp = all[k];
      btns.forEach((b, j) => b.setAttribute("aria-pressed", j === k));
      marker.setAttribute("x1", xOf(smp.step));
      marker.setAttribute("x2", xOf(smp.step));
      const at = T.curve.reduce((a, b) => Math.abs(b.step - smp.step) < Math.abs(a.step - smp.step) ? b : a);
      sampleHead.textContent = smp.label
        ? `The kept checkpoint, step ${fmt(smp.step)} (validation loss ${smp.val.toFixed(2)})`
        : `Sampled at step ${fmt(smp.step)} (validation loss ${at.val.toFixed(2)})`;
      sampleOut.textContent = smp.text.trim();
      copiedOut.textContent = `Longest stretch copied word-for-word from the training text: ${smp.copied} characters`;
      copiedBar.style.width = Math.min(100, smp.copied / 80 * 100) + "%";
      copiedBar.classList.toggle("high", smp.copied >= 40);
    }
    show(all.findIndex(x => x.label));
  })();

  // --- (c) the journey in one table ----------------------------------------

  (() => {
    const T = window.TRANSFORMER, A = window.ATTENTION, B = window.BIGRAM;
    const root = document.getElementById("journey-compare");
    if (!T || !A || !B || !root) return;

    // Bigram sample: drawn from the Step 04 table with a fixed seed so it doesn't jump around.
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    let i = B.vocab.indexOf("\n"), bigram = "";
    for (let n = 0; n < 300; n++) {
      let r = rand(), j = 0;
      const row = B.count[i];
      while (j < row.length - 1 && (r -= row[j]) > 0) j++;
      bigram += B.vocab[(i = j)];
    }

    const rows = [
      ["Bigram", "Step 04", T.refs.bigram, "4k", bigram],
      ["One attention layer", "Step 06", T.refs.attention, `${Math.round(A.params / 1000)}k`, A.sample || ""],
      ["Transformer, 6 blocks", "Step 07", T.best.val, `${(T.params / 1e6).toFixed(1)}M`, T.best.text],
    ];
    rows.forEach(([name, step, loss, params, txt]) => {
      const card = document.createElement("div");
      card.className = "jc-row";
      const head = document.createElement("div");
      head.className = "jc-head";
      head.innerHTML = `<strong></strong><span class="jc-meta"></span>`;
      head.firstChild.textContent = name;
      head.lastChild.textContent = `${step} · ${params} parameters · val loss ${loss.toFixed(2)}`;
      const pre = document.createElement("pre");
      pre.className = "bg-gen jc-text";
      pre.textContent = txt.trim().split("\n").slice(0, 6).join("\n");
      card.append(head, pre);
      root.append(card);
    });
  })();
})();
