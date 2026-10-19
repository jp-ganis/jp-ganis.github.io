// Step 08: generation. (a) Replay one real generation step by step, re-applying
// temperature and top-k to the model's actual logits. (b) Finished generations
// across prompts x temperatures x top-k.
// Data comes from train/step08_generate.py via data/generate.js.

(() => {
  const G = window.GENERATE;
  if (!G) return;

  const show = c => c === " " ? "·" : c === "\n" ? "↵" : c;
  const pct = p => p >= 0.995 ? "100%" : p >= 0.1 ? Math.round(p * 100) + "%" : (p * 100).toFixed(1) + "%";

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function segment(container, options, label, onPick) {
    const btns = options.map((o, i) => {
      const b = el("button", null, label(o));
      b.type = "button";
      b.addEventListener("click", () => pick(i));
      container.append(b);
      return b;
    });
    function pick(i) {
      btns.forEach((b, j) => b.setAttribute("aria-pressed", j === i));
      onPick(options[i]);
    }
    return pick;
  }

  // softmax(logits / T), keeping only the top k (0 = all). Returns probs by token id.
  function distribution(logits, T, k) {
    const z = logits.map(v => v / T);
    let keep = null;
    if (k) {
      const cut = [...z].sort((a, b) => b - a)[k - 1];
      keep = z.map(v => v >= cut);
    }
    const m = Math.max(...z);
    const e = z.map((v, i) => keep && !keep[i] ? 0 : Math.exp(v - m));
    const sum = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / sum);
  }

  // --- (a) the loop, replayed ----------------------------------------------

  (() => {
    const root = document.getElementById("gen-demo");
    if (!root) return;
    const R = G.replay, N = R.steps.length, TOP = 10;
    const textOut = root.querySelector("#gen-text");
    const head = root.querySelector("#gen-head");
    const pos = root.querySelector("#gen-pos");
    const playBtn = root.querySelector("#gen-play");
    const tSlider = root.querySelector("#gen-t");
    const tOut = root.querySelector("#gen-t-out");
    const rows = root.querySelector("#gen-rows");
    const risk = root.querySelector("#gen-risk");
    pos.max = N;

    const full = R.prompt + R.steps.map(s => s.pick).join("");
    let i = 0, T = 1, K = 0;

    // Chance of never picking outside the top 10 across the whole replay.
    function survival(T, k) {
      return R.steps.reduce((acc, s) => {
        const p = distribution(s.logits, T, k).sort((a, b) => b - a);
        return acc * (1 - p.slice(TOP).reduce((a, b) => a + b, 0));
      }, 1);
    }
    const fmtSurvive = s => s < 1e-6 ? "less than 1 in a million"
      : s < 1e-3 ? `about 1 in ${(+(1 / s).toPrecision(2)).toLocaleString()}` : pct(s);
    const sharpened = document.getElementById("gen-survive");
    if (sharpened) sharpened.textContent = fmtSurvive(survival(1, 0));

    function renderText() {
      const len = R.prompt.length + i;
      const start = Math.max(0, len - G.block);
      const frag = [];
      if (start) frag.push(el("span", "gen-gone", full.slice(0, start)));
      const pEnd = Math.max(start, R.prompt.length);
      if (pEnd > start) frag.push(el("span", "gen-prompt", full.slice(start, pEnd)));
      if (i) {
        frag.push(document.createTextNode(full.slice(pEnd, len - 1)));
        frag.push(el("span", "gen-last", full[len - 1] === "\n" ? "↵\n" : full[len - 1]));
      }
      if (i < N) frag.push(el("span", "gen-cursor", "▍"));
      textOut.replaceChildren(...frag);
      head.textContent = i < N
        ? `Step ${i + 1} of ${N}. The model sees ${Math.min(len, G.block)} of ${G.block} characters${start ? `; ${start} have scrolled out` : ""}.`
        : `Done: ${N} characters, one forward pass each.${start ? ` The first ${start} characters (including the prompt) scrolled out of the window.` : ""}`;
    }

    function renderBars() {
      if (i >= N) { rows.replaceChildren(); risk.textContent = ""; return; }
      const s = R.steps[i];
      const base = distribution(s.logits, 1, 0);
      const p = distribution(s.logits, T, K);
      const order = base.map((_, j) => j).sort((a, b) => base[b] - base[a]);
      const scale = Math.max(...p, ...order.slice(0, TOP).map(j => base[j]));
      const out = order.slice(0, TOP).map(j => {
        const c = G.vocab[j], cut = K && p[j] === 0;
        const r = el("div", "gen-row" + (c === s.pick ? " is-pick" : "") + (cut ? " is-cut" : ""));
        const track = el("span", "nt-track");
        const b = el("span", "nt-bar prob");
        b.style.width = Math.max(p[j] / scale * 100, cut ? 0 : 0.6) + "%";
        const ghost = el("span", "gen-ghost");
        ghost.style.left = base[j] / scale * 100 + "%";
        track.append(b, ghost, el("span", "nt-val", cut ? "cut" : pct(p[j])));
        r.append(el("span", "nt-tok", show(c)), track, el("span", "nt-flag", c === s.pick ? "picked" : ""));
        return r;
      });
      const tail = order.slice(TOP).reduce((a, j) => a + p[j], 0);
      const rest = el("div", "gen-row nt-rest");
      const track = el("span", "nt-track");
      const b = el("span", "nt-bar rest");
      b.style.width = tail / scale * 100 + "%";
      track.append(b, el("span", "nt-val", K && K <= TOP ? "cut" : pct(tail)));
      const pickedTail = !order.slice(0, TOP).some(j => G.vocab[j] === s.pick);
      rest.append(el("span", "nt-tok", "…"), track,
        el("span", pickedTail ? "nt-flag" : "nt-rest-label", pickedTail ? `picked ${show(s.pick)}` : `${G.vocab.length - TOP} others`));
      rows.replaceChildren(...out, rest);

      const sv = survival(T, K);
      risk.textContent = K && K <= TOP
        ? `With top-k ${K}, nothing outside the top ${TOP} can be picked.`
        : `Chance of all ${N} steps without a pick outside the top ${TOP}: ${fmtSurvive(sv)}.`;
    }

    function set(n) {
      i = Math.max(0, Math.min(N, n));
      pos.value = i;
      renderText();
      renderBars();
    }

    segment(root.querySelector("#gen-k"), [0, 20, 10, 5, 1], k => k ? (k === 1 ? "1 (greedy)" : String(k)) : "off",
      k => { K = k; renderBars(); })(0);
    tSlider.addEventListener("input", () => {
      T = +tSlider.value;
      tOut.textContent = T.toFixed(1);
      renderBars();
    });

    let timer = null;
    function stop() { clearInterval(timer); timer = null; playBtn.textContent = "Play"; }
    playBtn.addEventListener("click", () => {
      if (timer) return stop();
      if (i >= N) set(0);
      playBtn.textContent = "Pause";
      timer = setInterval(() => { set(i + 1); if (i >= N) stop(); }, 120);
    });
    root.querySelector("#gen-next").addEventListener("click", () => { stop(); set(i + 1); });
    pos.addEventListener("input", () => { stop(); set(+pos.value); });
    set(0);
  })();

  // --- (b) turn the dial ---------------------------------------------------

  (() => {
    const root = document.getElementById("dial-demo");
    if (!root) return;
    const textOut = root.querySelector("#dial-text");
    const realOut = root.querySelector("#dial-real"), realBar = root.querySelector("#dial-real-bar");
    const copiedOut = root.querySelector("#dial-copied"), copiedBar = root.querySelector("#dial-copied-bar");
    const state = { prompt: G.prompts[0], temp: 1, topK: 0 };

    function render() {
      const g = G.grid.find(r => r.prompt === state.prompt && r.temp === state.temp && r.topK === state.topK);
      if (!g) return;
      textOut.replaceChildren(el("span", "gen-prompt", g.prompt), document.createTextNode(g.text.trimEnd()));
      realOut.textContent = `Words that exist in the training text: ${Math.round(g.realWords * 100)}%`;
      realBar.style.width = g.realWords * 100 + "%";
      copiedOut.textContent = `Longest stretch copied word-for-word: ${g.copied} characters`;
      copiedBar.style.width = Math.min(100, g.copied / 80 * 100) + "%";
    }

    const name = p => p.replace(/:\n$/, "");
    segment(root.querySelector("#dial-prompt"), G.prompts, name, p => { state.prompt = p; render(); })(0);
    segment(root.querySelector("#dial-k"), G.topKs, k => k ? String(k) : "off", k => { state.topK = k; render(); })(0);
    segment(root.querySelector("#dial-t"), G.temps, t => t.toFixed(1), t => { state.temp = t; render(); })(G.temps.indexOf(1));
  })();
})();
