// Step 01: a live tokenizer. Three schemes over the same input:
//   chars  - the 65-symbol character vocabulary we'll train on
//   bpe    - byte-pair merges learned (in the browser) from a small corpus
//   words  - one ID per word seen in the corpus; anything else is [UNK]

const CHARS = "\n !$&',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CHAR_ID = new Map([...CHARS].map((c, i) => [c, i]));

const CORPUS = `To be, or not to be, that is the question:
Whether 'tis nobler in the mind to suffer
The slings and arrows of outrageous fortune,
Or to take arms against a sea of troubles
And by opposing end them. To die: to sleep;
No more; and by a sleep to say we end
The heart-ache and the thousand natural shocks
That flesh is heir to, 'tis a consummation
Devoutly to be wish'd. To die, to sleep;
To sleep: perchance to dream: ay, there's the rub;
For in that sleep of death what dreams may come
When we have shuffled off this mortal coil,
Must give us pause: there's the respect
That makes calamity of so long life;
Friends, Romans, countrymen, lend me your ears;
I come to bury Caesar, not to praise him.
The evil that men do lives after them;
The good is oft interred with their bones;
So let it be with Caesar. The noble Brutus
Hath told you Caesar was ambitious:
If it were so, it was a grievous fault,
And grievously hath Caesar answer'd it.
Shall I compare thee to a summer's day?
Thou art more lovely and more temperate:
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date;
Sometime too hot the eye of heaven shines,
And often is his gold complexion dimm'd;
And every fair from fair sometime declines,
By chance or nature's changing course untrimm'd;
But thy eternal summer shall not fade,
Nor lose possession of that fair thou owest;
Nor shall Death brag thou wander'st in his shade,
When in eternal lines to time thou growest:
So long as men can breathe or eyes can see,
So long lives this and this gives life to thee.`;

// GPT-style pre-split: words keep their leading space, merges never cross chunks.
const PRESPLIT = / ?[A-Za-z']+| ?[^A-Za-z'\s]+|\s+/g;
const WORDSPLIT = /[A-Za-z']+|[^A-Za-z'\s]|\s/g;
const MAX_MERGES = 240;

function trainBPE(text, maxMerges) {
  const counts = new Map();
  for (const chunk of text.match(PRESPLIT)) counts.set(chunk, (counts.get(chunk) || 0) + 1);
  const words = [...counts].map(([w, n]) => ({ syms: [...w], n }));
  const merges = [];
  while (merges.length < maxMerges) {
    const pairs = new Map();
    for (const { syms, n } of words) {
      for (let i = 0; i < syms.length - 1; i++) {
        const key = syms[i] + "\u0000" + syms[i + 1];
        pairs.set(key, (pairs.get(key) || 0) + n);
      }
    }
    let best = null, bestN = 1;
    for (const [k, n] of pairs) if (n > bestN) { best = k; bestN = n; }
    if (!best) break;
    const [a, b] = best.split("\u0000");
    merges.push([a, b]);
    for (const w of words) w.syms = mergePair(w.syms, a, b);
  }
  return merges;
}

function mergePair(syms, a, b) {
  const out = [];
  for (let i = 0; i < syms.length; i++) {
    if (i < syms.length - 1 && syms[i] === a && syms[i + 1] === b) { out.push(a + b); i++; }
    else out.push(syms[i]);
  }
  return out;
}

const MERGES = trainBPE(CORPUS, MAX_MERGES);
const WORD_VOCAB = [...new Set(CORPUS.match(WORDSPLIT))].sort();
const WORD_ID = new Map(WORD_VOCAB.map((w, i) => [w, i]));

function charToken(c) {
  return CHAR_ID.has(c) ? { text: c, id: CHAR_ID.get(c) } : { text: c, id: null };
}

function encodeChars(text) {
  return [...text].map(charToken);
}

function encodeBPE(text, k) {
  k = Math.min(k, MERGES.length);
  const ids = new Map();
  MERGES.slice(0, k).forEach(([a, b], r) => ids.set(a + b, CHARS.length + r));
  const out = [];
  for (const chunk of text.match(PRESPLIT) || []) {
    let syms = [...chunk];
    for (let r = 0; r < k; r++) syms = mergePair(syms, MERGES[r][0], MERGES[r][1]);
    for (const s of syms) out.push(s.length === 1 ? charToken(s) : { text: s, id: ids.get(s) });
  }
  return out;
}

function encodeWords(text) {
  return (text.match(WORDSPLIT) || []).map(w =>
    WORD_ID.has(w) ? { text: w, id: WORD_ID.get(w) } : { text: w, id: null, unk: true });
}

// --- UI --------------------------------------------------------------------

const root = document.getElementById("tok-demo");
const input = root.querySelector("#tok-input");
const chips = root.querySelector("#tok-chips");
const stats = root.querySelector("#tok-stats");
const idsOut = root.querySelector("#tok-ids");
const slider = root.querySelector("#tok-merges");
const sliderRow = root.querySelector(".tok-slider");
const sliderVal = root.querySelector("#tok-merges-val");
const modeBtns = root.querySelectorAll("[data-mode]");

slider.max = MERGES.length;
let mode = "bpe";

const show = s => s.replace(/ /g, "·").replace(/\n/g, "↵");

function render() {
  const text = input.value;
  const k = +slider.value;
  const toks = mode === "chars" ? encodeChars(text)
             : mode === "bpe" ? encodeBPE(text, k)
             : encodeWords(text);

  chips.replaceChildren(...toks.map((t, i) => {
    const el = document.createElement("span");
    el.className = "chip" + (i % 2 ? " alt" : "") + (t.id === null ? " unk" : "");
    const s = document.createElement("span");
    s.className = "chip-text";
    s.textContent = t.unk ? t.text : show(t.text);
    const n = document.createElement("span");
    n.className = "chip-id";
    n.textContent = t.id === null ? "UNK" : t.id;
    el.append(s, n);
    return el;
  }));

  const vocab = mode === "chars" ? CHARS.length
              : mode === "bpe" ? CHARS.length + k
              : WORD_VOCAB.length;
  const unks = toks.filter(t => t.id === null).length;
  stats.textContent = `${toks.length} tokens from ${[...text].length} characters · vocabulary of ${vocab}` +
    (unks ? ` · ${unks} unknown` : "");
  idsOut.textContent = "[" + toks.map(t => t.id ?? "UNK").join(", ") + "]";

  sliderRow.hidden = mode !== "bpe";
  sliderVal.textContent = k;
  modeBtns.forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === mode));
}

modeBtns.forEach(b => b.addEventListener("click", () => { mode = b.dataset.mode; render(); }));
input.addEventListener("input", render);
slider.addEventListener("input", render);
render();
