// Step 03: one sentence is many training examples. For each cut point, show
// context -> target, and logits -> softmax -> probabilities for the next char.
// Data comes from train/step03_next_token.py via data/next_token.js.

(() => {
  const D = window.NEXT_TOKEN;
  const root = document.getElementById("nt-demo");
  if (!D || !root) return;

  const S = D.sentence;
  const strip = root.querySelector("#nt-strip");
  const slider = root.querySelector("#nt-pos");
  const exampleOut = root.querySelector("#nt-example");
  const ctxOut = root.querySelector("#nt-ctx");
  const rows = root.querySelector("#nt-rows");
  const playBtn = root.querySelector("#nt-play");

  const show = c => c === " " ? "·" : c === "\n" ? "↵" : c;
  slider.max = S.length - 1;

  const cells = [...S].map((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nt-cell";
    b.textContent = show(c);
    b.setAttribute("aria-label", `Cut before character ${i + 1}`);
    b.addEventListener("click", () => { stop(); set(i); });
    strip.append(b);
    return b;
  });

  function bar(cls, widthPct, leftPct = 0) {
    const track = document.createElement("span");
    track.className = "nt-track";
    const b = document.createElement("span");
    b.className = "nt-bar " + cls;
    b.style.left = leftPct + "%";
    b.style.width = Math.max(widthPct, 0.6) + "%";
    track.append(b);
    return track;
  }

  function cell(cls, text) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  }

  // Logit axis is fixed across positions so bars are comparable as you scrub.
  const all = D.positions.flatMap(p => p.top.map(t => t[1]));
  const LMIN = Math.min(0, ...all), LMAX = Math.max(...all);
  const lx = v => (v - LMIN) / (LMAX - LMIN) * 100;

  function set(i) {
    slider.value = i;
    const p = D.positions[i], target = S[i];
    cells.forEach((c, j) => {
      c.classList.toggle("ctx", j < i);
      c.classList.toggle("used", j < i && j >= i - p.k);
      c.classList.toggle("target", j === i);
    });

    exampleOut.replaceChildren(
      cell("nt-ex-ctx", i ? S.slice(0, i).replace(/ /g, "·") : "(nothing yet)"),
      cell("nt-arrow", "→"),
      cell("nt-ex-target", show(target)));
    ctxOut.textContent = p.k
      ? `Counted from the last ${p.k} character${p.k > 1 ? "s" : ""}, "${S.slice(i - p.k, i)}", seen ${p.seen.toLocaleString()} times in Shakespeare.`
      : `No context yet, so this is just how common each character is overall.`;

    const header = document.createElement("div");
    header.className = "nt-row nt-head";
    header.append(cell("", "next"), cell("", "logit"), cell("nt-sm", ""), cell("", "probability"));
    const body = p.top.map(([c, logit, prob]) => {
      const r = document.createElement("div");
      r.className = "nt-row" + (c === target ? " is-target" : "");
      const lg = bar(logit < 0 ? "neg" : "pos",
        Math.abs(lx(logit) - lx(0)), Math.min(lx(logit), lx(0)));
      lg.append(cell("nt-val", logit.toFixed(1)));
      const pr = bar("prob", prob * 100);
      pr.append(cell("nt-val", prob < 0.01 ? prob.toFixed(3) : prob.toFixed(2)));
      r.append(cell("nt-tok", show(c)), lg, cell("nt-sm", "softmax"), pr);
      if (c === target) r.append(cell("nt-flag", "actual next"));
      return r;
    });
    const rest = document.createElement("div");
    rest.className = "nt-row nt-rest";
    rest.append(cell("nt-tok", "…"), cell("nt-rest-label", `${D.vocabSize - p.top.length} other tokens`),
      cell("nt-sm", ""), bar("prob rest", p.rest * 100));
    rest.lastChild.append(cell("nt-val", p.rest.toFixed(2)));
    rows.replaceChildren(header, ...body, rest);
  }

  let timer = null;
  function stop() { clearInterval(timer); timer = null; playBtn.textContent = "Play"; }
  playBtn.addEventListener("click", () => {
    if (timer) return stop();
    playBtn.textContent = "Pause";
    timer = setInterval(() => set((+slider.value + 1) % S.length), 700);
  });
  slider.addEventListener("input", () => { stop(); set(+slider.value); });
  set(4);
})();
