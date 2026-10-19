// Step 04: the bigram table (counted vs learned), sampling from it, and why
// lookup tables don't scale to longer contexts.
// Data comes from train/step04_bigram.py via data/bigram.js.

(() => {
  const B = window.BIGRAM;
  const root = document.getElementById("bg-demo");
  if (!B || !root) return;

  const SVG = "http://www.w3.org/2000/svg";
  const V = B.vocab.length;
  const heat = root.querySelector("#bg-heat");
  const readout = root.querySelector("#bg-readout");
  const lossOut = root.querySelector("#bg-loss");
  const genOut = root.querySelector("#bg-gen");
  const genBtn = root.querySelector("#bg-generate");
  const modeBtns = root.querySelectorAll("[data-bg]");
  const sparse = root.querySelector("#bg-sparse");

  const show = c => c === " " ? "·" : c === "\n" ? "↵" : c;
  const name = c => c === " " ? "space" : c === "\n" ? "newline" : `'${c}'`;

  // --- heatmap -------------------------------------------------------------

  const CELL = 7, M = 22;
  const size = M + V * CELL;
  heat.setAttribute("viewBox", `0 0 ${size} ${size}`);

  const axis = (x, y, txt, rot) => {
    const t = document.createElementNS(SVG, "text");
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.setAttribute("class", "bg-axis");
    if (rot) t.setAttribute("transform", `rotate(90 ${x} ${y})`);
    t.textContent = txt;
    heat.append(t);
  };
  axis(M, 14, "next character →");
  axis(14, M, "current character →", true);

  const rects = [];
  for (let i = 0; i < V; i++) {
    const row = [];
    for (let j = 0; j < V; j++) {
      const r = document.createElementNS(SVG, "rect");
      r.setAttribute("x", M + j * CELL);
      r.setAttribute("y", M + i * CELL);
      r.setAttribute("width", CELL - 0.5);
      r.setAttribute("height", CELL - 0.5);
      r.dataset.i = i;
      r.dataset.j = j;
      heat.append(r);
      row.push(r);
    }
    rects.push(row);
  }
  const rowMark = document.createElementNS(SVG, "rect");
  rowMark.setAttribute("class", "bg-rowmark");
  rowMark.setAttribute("x", M - 1);
  rowMark.setAttribute("width", V * CELL + 1.5);
  rowMark.setAttribute("height", CELL + 0.5);
  heat.append(rowMark);

  let mode = "count";
  let row = B.vocab.indexOf("q");
  let hoverCol = null;

  function paint() {
    const P = B[mode];
    rects.forEach((r, i) => r.forEach((el, j) => {
      // power curve so mid-range probabilities stay visible next to q -> u
      const t = Math.round(Math.min(1, Math.pow(P[i][j], 0.35)) * 100);
      el.style.fill = `color-mix(in oklab, var(--accent) ${t}%, var(--panel))`;
    }));
    lossOut.textContent = mode === "count"
      ? `Loss ${B.loss.count}, from counting alone. A random guess scores ${B.loss.uniform}.`
      : `Loss ${B.loss.neural}, down from ${B.loss.neuralInit} at random initialisation. Same answer, by training.`;
  }

  function describe() {
    const P = B[mode][row];
    const top = P.map((p, j) => [j, p]).sort((a, b) => b[1] - a[1]).slice(0, 6).filter(([, p]) => p >= 0.005);
    rowMark.setAttribute("y", M + row * CELL - 0.25);
    readout.replaceChildren(document.createTextNode(`After ${name(B.vocab[row])}: `));
    top.forEach(([j, p]) => {
      const k = document.createElement("code");
      k.textContent = `${show(B.vocab[j])} ${p.toFixed(2)}`;
      readout.append(k);
    });
    if (hoverCol !== null && !top.some(([j]) => j === hoverCol)) {
      const k = document.createElement("code");
      k.className = "hover";
      k.textContent = `${show(B.vocab[hoverCol])} ${P[hoverCol].toFixed(3)}`;
      readout.append(" … ", k);
    }
  }

  heat.addEventListener("pointermove", e => {
    const el = e.target.closest("rect[data-i]");
    if (!el) return;
    row = +el.dataset.i;
    hoverCol = +el.dataset.j;
    describe();
  });
  heat.addEventListener("pointerleave", () => { hoverCol = null; describe(); });

  // --- sampling ------------------------------------------------------------

  function sample(probs) {
    let r = Math.random(), acc = 0;
    for (let j = 0; j < probs.length; j++) { acc += probs[j]; if (r < acc) return j; }
    return probs.length - 1;
  }

  function generate() {
    const P = B[mode];
    let i = B.vocab.indexOf("\n"), out = "";
    for (let n = 0; n < 240; n++) { i = sample(P[i]); out += B.vocab[i]; }
    genOut.textContent = out.trim();
  }

  // --- sparsity table ------------------------------------------------------

  const words = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  const humanise = n => {
    for (const [v, w] of words) if (n >= v) return `${+(n / v).toPrecision(2)} ${w}`;
    return Math.round(n).toLocaleString();
  };
  const sup = n => String(n).split("").map(d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]).join("");

  B.sparsity.forEach(({ n, possible, seen }) => {
    const tr = document.createElement("tr");
    const share = seen / possible;
    [n, seen.toLocaleString(), `65${sup(n)}`, share >= 0.01 ? `${+(share * 100).toPrecision(2)}%` : `1 in ${humanise(1 / share)}`]
      .forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.append(td); });
    sparse.append(tr);
  });

  // --- wiring --------------------------------------------------------------

  function setMode(m) {
    mode = m;
    modeBtns.forEach(b => b.setAttribute("aria-pressed", b.dataset.bg === mode));
    paint();
    describe();
  }
  modeBtns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.bg)));
  genBtn.addEventListener("click", generate);
  setMode("count");
  generate();
})();
