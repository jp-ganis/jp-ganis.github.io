// The live 3D view of the MLP: glowing edges for weights, sparks for signal and learning.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const LAYER_X = [-6.5, -2.2, 2.2, 6.5];
const ARROWS = ['↑', '→', '↓', '←'];
// compass offsets within the YZ plane for up / right / down / left
const COMPASS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export class Net3D {
  constructor(container, mlp, groupNames) {
    this.container = container;
    this.mlp = mlp;
    this.groupNames = groupNames;
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'net-labels';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(-13, 6, 18.5);

    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.target.set(-0.8, 0, 0);
    this.controls.enableDamping = true;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.autoRotate = !this.reduceMotion;
    this.controls.autoRotateSpeed = 0.3;
    // sway between two readable angles rather than spinning round to a side-on view
    this.controls.minAzimuthAngle = -1.15;
    this.controls.maxAzimuthAngle = -0.05;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 2.3;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.25, 0.32);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildNodes();
    this.buildEdges();
    this.buildSparks();

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.visible = true;
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(container);

    this.clock = new THREE.Clock();
    this.events = []; // scheduled node/edge updates {at, fn}
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    loop();
  }

  // ---------- layout ----------

  nodePositions() {
    const sizes = this.mlp.sizes;
    const pos = [];
    // inputs: one little compass per feature group, groups in a 2-column stack
    const inp = [];
    const nGroups = sizes[0] / 4;
    const rows = Math.ceil(nGroups / 2);
    for (let g = 0; g < nGroups; g++) {
      const row = Math.floor(g / 2), col = g % 2;
      const last = g === nGroups - 1 && nGroups % 2 === 1;
      const cy = ((rows - 1) / 2 - row) * 1.55;
      const cz = last ? 0 : (col - 0.5) * 2.1;
      for (let d = 0; d < 4; d++)
        inp.push(new THREE.Vector3(LAYER_X[0], cy + COMPASS[d][1] * 0.36, cz + COMPASS[d][0] * 0.36));
    }
    pos.push(inp);
    // hidden layers: grids
    for (let l = 1; l < sizes.length - 1; l++) {
      const n = sizes[l], cols = 4, rws = Math.ceil(n / cols), layer = [];
      for (let k = 0; k < n; k++) {
        const r = Math.floor(k / cols), c = k % cols;
        layer.push(new THREE.Vector3(LAYER_X[l], ((rws - 1) / 2 - r) * 1.15, (c - (cols - 1) / 2) * 1.15));
      }
      pos.push(layer);
    }
    // output: a compass
    pos.push(COMPASS.map(([z, y]) => new THREE.Vector3(LAYER_X[sizes.length - 1], y * 1.1, z * 1.1)));
    return pos;
  }

  buildNodes() {
    this.pos = this.nodePositions();
    const radius = [0.11, 0.15, 0.15, 0.27];
    this.nodes = this.pos.map((layer, l) => layer.map(p => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(radius[l], 18, 12),
        new THREE.MeshBasicMaterial({ color: 0x220a08, toneMapped: false }),
      );
      m.position.copy(p);
      this.scene.add(m);
      return m;
    }));
    this.nodeShown = this.pos.map(layer => new Float32Array(layer.length));
    this.nodeTarget = this.pos.map(layer => new Float32Array(layer.length));
    this.outArgmax = -1;

    const label = (text, cls, at) => {
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = text;
      const o = new CSS2DObject(div);
      o.position.copy(at);
      this.scene.add(o);
    };
    for (let g = 0; g < this.groupNames.length; g++) {
      const c = this.pos[0][g * 4].clone().add(this.pos[0][g * 4 + 2]).multiplyScalar(0.5);
      label(this.groupNames[g], 'net-label', c.add(new THREE.Vector3(0, -0.75, 0)));
    }
    this.pos[3].forEach((p, d) => label(ARROWS[d], 'net-label net-arrow', p.clone().multiplyScalar(1).add(new THREE.Vector3(0, COMPASS[d][1] * 0.55, COMPASS[d][0] * 0.55))));
    const heads = ['what it senses', `hidden · ${this.mlp.sizes[1]}`, `hidden · ${this.mlp.sizes[2]}`, 'Q per move'];
    heads.forEach((t, l) => label(t, 'net-label net-head', new THREE.Vector3(LAYER_X[l], l === 0 ? 3.9 : 3.0, 0)));
  }

  buildEdges() {
    const sizes = this.mlp.sizes;
    this.edgeIndex = []; // per layer, offset into the flat edge arrays
    let n = 0;
    for (let l = 0; l < sizes.length - 1; l++) { this.edgeIndex.push(n); n += sizes[l] * sizes[l + 1]; }
    this.nEdges = n;
    const positions = new Float32Array(n * 6);
    for (let l = 0; l < sizes.length - 1; l++) {
      const nIn = sizes[l], nOut = sizes[l + 1];
      for (let j = 0; j < nOut; j++)
        for (let i = 0; i < nIn; i++) {
          const e = this.edgeIndex[l] + j * nIn + i;
          const a = this.pos[l][i], b = this.pos[l + 1][j];
          positions.set([a.x, a.y, a.z, b.x, b.y, b.z], e * 6);
        }
    }
    this.edgeColors = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.edgeColors, 3));
    this.edgeGeo = geo;
    this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })));
    this.glow = new Float32Array(n);  // recent learning
    this.flow = new Float32Array(n);  // recent signal
  }

  buildSparks() {
    const N = 700;
    this.sparkPos = new Float32Array(N * 3);
    this.sparkCol = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkGeo = geo;
    const tex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.42, map: tex, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })));
    this.sparks = Array.from({ length: N }, () => null);
  }

  spawn(a, b, delay, dur, color, edge, kind, amount) {
    const k = this.sparks.indexOf(null);
    if (k < 0) return;
    this.sparks[k] = { a, b, t0: this.clock.elapsedTime + delay, dur, color, edge, kind, amount };
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // pull back on tall, narrow screens so the whole net fits
    this.camera.zoom = Math.min(1, (w / h) / 0.9);
    this.camera.updateProjectionMatrix();
  }

  // ---------- events from the game ----------

  // A forward pass: light the inputs, then send sparks layer by layer.
  forward(acts, probs) {
    const W = this.mlp.W, sizes = this.mlp.sizes;
    const step = this.reduceMotion ? 0 : 0.2;
    for (let l = 0; l < acts.length; l++) {
      const values = l === acts.length - 1 ? probs : acts[l];
      this.schedule(l * step + (l ? 0.15 : 0), () => this.nodeTarget[l].set(values));
    }
    this.schedule((acts.length - 1) * step + 0.15, () => {
      let m = 0;
      for (let k = 1; k < probs.length; k++) if (probs[k] > probs[m]) m = k;
      this.outArgmax = m;
    });
    if (this.reduceMotion) return;
    for (let l = 0; l < W.length; l++) {
      const nIn = sizes[l], nOut = sizes[l + 1], c = [];
      for (let j = 0; j < nOut; j++) {
        if (l < W.length - 1 && acts[l + 1][j] <= 0) continue;
        for (let i = 0; i < nIn; i++) {
          const v = acts[l][i] * W[l][j * nIn + i];
          if (v > 0) c.push([v, i, j]);
        }
      }
      c.sort((p, q) => q[0] - p[0]);
      const top = c.slice(0, 36), max = top[0]?.[0] || 1;
      for (const [v, i, j] of top) {
        const s = Math.pow(v / max, 0.7);
        this.spawn(this.pos[l][i], this.pos[l + 1][j], l * step + Math.random() * 0.06, 0.28,
          [2.2 * s, 0.35 * s, 0.12 * s], this.edgeIndex[l] + j * nIn + i, 'flow', s);
      }
    }
  }

  // After a training step: gold sparks run backwards along the weights that changed most.
  learned(delay = 0.75) {
    const sizes = this.mlp.sizes;
    const L = this.mlp.W.length;
    for (let l = L - 1; l >= 0; l--) {
      const d = this.mlp.delta[l], nIn = sizes[l];
      // Adam moves most weights by roughly the learning rate, so only the biggest changes
      // relative to the rest of the layer get to glow.
      let dmax = 1e-12;
      for (const v of d) dmax = Math.max(dmax, v);
      const amounts = Float32Array.from(d, v => Math.pow(v / dmax, 4) * 0.6);
      d.fill(0);
      const base = this.edgeIndex[l];
      const at = this.reduceMotion ? 0 : delay + (L - 1 - l) * 0.17;
      this.schedule(at, () => {
        for (let e = 0; e < amounts.length; e++) this.glow[base + e] = Math.max(this.glow[base + e], amounts[e]);
      });
      if (this.reduceMotion) continue;
      const order = Array.from(amounts.keys()).sort((p, q) => amounts[q] - amounts[p]).slice(0, 18);
      const max = amounts[order[0]] || 1;
      for (const e of order) {
        if (amounts[e] < 0.15) break;
        const j = Math.floor(e / nIn), i = e % nIn, s = Math.pow(amounts[e] / max, 0.6);
        this.spawn(this.pos[l + 1][j], this.pos[l][i], at - 0.17, 0.22, [1.9 * s, 1.25 * s, 0.45 * s], -1, 'learn', 0);
      }
    }
  }

  reset() {
    this.glow.fill(0); this.flow.fill(0);
    this.nodeTarget.forEach(t => t.fill(0));
    this.outArgmax = -1;
    this.sparks.fill(null);
    this.events = [];
  }

  schedule(delay, fn) { this.events.push({ at: this.clock.elapsedTime + delay, fn }); }

  // ---------- per frame ----------

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = this.clock.elapsedTime;
    if (!this.visible || document.hidden) return;

    this.events = this.events.filter(ev => (ev.at <= now ? (ev.fn(), false) : true));

    // nodes ease toward their targets
    const sizes = this.mlp.sizes, L = sizes.length - 1;
    for (let l = 0; l <= L; l++) {
      const shown = this.nodeShown[l], target = this.nodeTarget[l];
      let max = 1e-6;
      if (l > 0 && l < L) for (const v of target) max = Math.max(max, v);
      for (let k = 0; k < shown.length; k++) {
        const v = l === 0 || l === L ? target[k] : target[k] / max;
        shown[k] += (v - shown[k]) * Math.min(1, dt * 10);
        const s = Math.max(0, shown[k]);
        const hot = l === L && k === this.outArgmax ? 1.3 : 1;
        const col = this.nodes[l][k].material.color;
        if (l === 0) col.setRGB(0.10 + 1.7 * s, 0.035 + 0.42 * s, 0.03 + 0.2 * s);
        else col.setRGB((0.12 + 1.9 * s) * hot, (0.04 + 0.45 * s * s + (s > 0.85 ? 0.6 : 0)) * hot, (0.035 + 0.15 * s * s + (s > 0.85 ? 0.4 : 0)) * hot);
      }
    }

    // edges: weight magnitude + learning glow + signal flow
    const decayG = Math.pow(0.25, dt), decayF = Math.pow(0.08, dt);
    const ec = this.edgeColors;
    for (let l = 0; l < L; l++) {
      const W = this.mlp.W[l], base = this.edgeIndex[l];
      let max = 1e-6;
      for (let k = 0; k < W.length; k++) max = Math.max(max, Math.abs(W[k]));
      const dim = l === 0 ? 0.3 : 0.42;
      for (let k = 0; k < W.length; k++) {
        const e = base + k;
        const m = Math.pow(Math.abs(W[k]) / max, 2.4) * dim;
        const g = Math.min(1.4, this.glow[e]), f = this.flow[e];
        let r, gg, b;
        if (W[k] >= 0) { r = m; gg = 0.1 * m; b = 0.04 * m; }
        else { r = 0.05 * m; gg = 0.18 * m; b = 0.75 * m; }
        r += 0.75 * g + 1.1 * f; gg += 0.45 * g + 0.22 * f; b += 0.16 * g + 0.08 * f;
        ec[e * 6] = ec[e * 6 + 3] = r;
        ec[e * 6 + 1] = ec[e * 6 + 4] = gg;
        ec[e * 6 + 2] = ec[e * 6 + 5] = b;
        this.glow[e] *= decayG;
        this.flow[e] *= decayF;
      }
    }
    this.edgeGeo.attributes.color.needsUpdate = true;

    // sparks
    const sp = this.sparkPos, sc = this.sparkCol;
    for (let k = 0; k < this.sparks.length; k++) {
      const s = this.sparks[k];
      if (!s || now < s.t0) { sc[k * 3] = sc[k * 3 + 1] = sc[k * 3 + 2] = 0; continue; }
      const t = (now - s.t0) / s.dur;
      if (t >= 1) {
        if (s.kind === 'flow' && s.edge >= 0) this.flow[s.edge] = Math.max(this.flow[s.edge], s.amount);
        this.sparks[k] = null;
        sc[k * 3] = sc[k * 3 + 1] = sc[k * 3 + 2] = 0;
        continue;
      }
      const e = t * t * (3 - 2 * t);
      sp[k * 3] = s.a.x + (s.b.x - s.a.x) * e;
      sp[k * 3 + 1] = s.a.y + (s.b.y - s.a.y) * e;
      sp[k * 3 + 2] = s.a.z + (s.b.z - s.a.z) * e;
      const fade = Math.sin(Math.PI * Math.min(1, t * 1.15));
      sc[k * 3] = s.color[0] * fade; sc[k * 3 + 1] = s.color[1] * fade; sc[k * 3 + 2] = s.color[2] * fade;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;

    const az = this.controls.getAzimuthalAngle(), c = this.controls;
    if (az <= c.minAzimuthAngle + 0.02) c.autoRotateSpeed = -Math.abs(c.autoRotateSpeed);
    if (az >= c.maxAzimuthAngle - 0.02) c.autoRotateSpeed = Math.abs(c.autoRotateSpeed);
    this.controls.update();
    this.composer.render();
    this.labels.render(this.scene, this.camera);
  }
}
