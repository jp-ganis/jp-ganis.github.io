// Step 06: real attention weights from a one-layer, four-head model.
// Data comes from train/step06_attention.py via data/attention.js.

(() => {
  const A = window.ATTENTION;
  const root = document.getElementById("attn-demo");
  if (!A || !root) return;

  const SVG = "http://www.w3.org/2000/svg";
  const text = [...A.text], N = text.length;
  const strip = root.querySelector("#attn-strip");
  const matrix = root.querySelector("#attn-matrix");
  const readout = root.querySelector("#attn-readout");
  const headBtns = root.querySelectorAll("[data-head]");

  const show = c => c === " " ? "·" : c === "\n" ? "↵" : c;
  const average = text.map((_, i) => Array(i + 1).fill(1 / (i + 1)));
  const weightsFor = h => h === "avg" ? average : A.heads[h];

  let head = 1, query = text.indexOf("k");

  // --- text strip ----------------------------------------------------------

  const cells = text.map((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "attn-cell";
    b.textContent = show(c);
    b.setAttribute("aria-label", `Position ${i}`);
    b.addEventListener("pointerenter", () => setQuery(i));
    b.addEventListener("focus", () => setQuery(i));
    b.addEventListener("click", () => setQuery(i));
    strip.append(b);
    if (c === "\n") strip.append(Object.assign(document.createElement("span"), { className: "attn-break" }));
    return b;
  });

  // --- matrix (query rows x key columns, lower triangle) -------------------

  const CELL = 5, M = 2;
  const size = M * 2 + N * CELL;
  matrix.setAttribute("viewBox", `0 0 ${size} ${size}`);
  const rects = [];
  for (let i = 0; i < N; i++) {
    const row = [];
    for (let j = 0; j < N; j++) {
      const r = document.createElementNS(SVG, "rect");
      r.setAttribute("x", M + j * CELL);
      r.setAttribute("y", M + i * CELL);
      r.setAttribute("width", CELL - 0.4);
      r.setAttribute("height", CELL - 0.4);
      if (j > i) r.setAttribute("class", "masked");
      r.dataset.i = i;
      matrix.append(r);
      row.push(r);
    }
    rects.push(row);
  }
  const rowMark = document.createElementNS(SVG, "rect");
  rowMark.setAttribute("class", "attn-rowmark");
  rowMark.setAttribute("x", M - 0.5);
  rowMark.setAttribute("width", N * CELL + 0.6);
  rowMark.setAttribute("height", CELL + 0.6);
  matrix.append(rowMark);
  matrix.addEventListener("pointermove", e => {
    const r = e.target.closest("rect[data-i]");
    if (r) setQuery(+r.dataset.i);
  });

  const tint = w => `color-mix(in oklab, var(--accent) ${Math.round(Math.sqrt(w) * 100)}%, var(--panel))`;

  function paintMatrix() {
    const W = weightsFor(head);
    for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) rects[i][j].style.fill = tint(W[i][j]);
  }

  function setQuery(i) {
    query = i;
    const w = weightsFor(head)[i];
    cells.forEach((c, j) => {
      c.classList.toggle("is-query", j === i);
      c.classList.toggle("masked", j > i);
      c.style.background = j <= i && j !== i ? tint(w[j]) : "";
    });
    rowMark.setAttribute("y", M + i * CELL - 0.3);

    const top = w.map((v, j) => [j, v]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    readout.replaceChildren(document.createTextNode(`${show(text[i])} at position ${i} attends to: `));
    top.forEach(([j, v]) => {
      const k = document.createElement("code");
      const back = i - j;
      k.textContent = `${show(text[j])} ${back ? back + " back" : "itself"} ${(v * 100).toFixed(0)}%`;
      readout.append(k);
    });
  }

  function setHead(h) {
    head = h;
    headBtns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.head) === String(h)));
    paintMatrix();
    setQuery(query);
  }

  headBtns.forEach(b => b.addEventListener("click", () =>
    setHead(b.dataset.head === "avg" ? "avg" : +b.dataset.head)));
  setHead(1);
})();
