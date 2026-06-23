<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">

      <div class="modal-header">
        <span class="modal-title">HOW NEURON WORKS</span>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">

        <!-- Stats bar -->
        <div class="stats">
          <div class="stat">
            <span class="stat-n">95.13%</span>
            <span class="stat-lbl">test accuracy</span>
          </div>
          <div class="stat-div" />
          <div class="stat">
            <span class="stat-n">109k</span>
            <span class="stat-lbl">parameters</span>
          </div>
          <div class="stat-div" />
          <div class="stat">
            <span class="stat-n">60k</span>
            <span class="stat-lbl">training images</span>
          </div>
        </div>

        <!-- What is this -->
        <section>
          <h3>WHAT IS THIS?</h3>
          <p>
            Neuron is a feedforward neural network trained on 60,000 handwritten digits from the
            MNIST dataset. Draw any digit — it runs a live forward pass and predicts what you
            wrote, entirely in your browser with no backend or API.
          </p>
        </section>

        <!-- Architecture diagram -->
        <section>
          <h3>THE NETWORK</h3>
          <svg class="arch-svg" viewBox="0 0 392 168" xmlns="http://www.w3.org/2000/svg">
            <!-- Connection fill polygons -->
            <polygon v-for="(c, i) in connections" :key="`poly-${i}`"
              :points="c.poly" fill="rgba(0,229,255,0.04)" />
            <!-- Sample connection lines -->
            <line v-for="(ln, i) in sampleLines" :key="`ln-${i}`"
              :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
              stroke="rgba(0,229,255,0.16)" stroke-width="0.6" />
            <!-- Node dots -->
            <circle v-for="(dot, i) in allDots" :key="`dot-${i}`"
              :cx="dot.x" :cy="dot.y" r="3"
              :fill="dot.output ? 'rgba(0,229,255,0.85)' : 'rgba(0,229,255,0.5)'"
            />
            <!-- Layer size labels -->
            <text v-for="l in archLayers" :key="`n-${l.x}`"
              :x="l.x" y="155" text-anchor="middle"
              fill="#00e5ff" font-size="11" font-family="Courier New" font-weight="bold">
              {{ l.actual }}
            </text>
            <!-- Layer sublabels -->
            <text v-for="l in archLayers" :key="`s-${l.x}`"
              :x="l.x" y="165" text-anchor="middle"
              fill="#6878a8" font-size="8" font-family="Courier New">
              {{ l.sub }}
            </text>
          </svg>
          <p class="note">
            Input pixels connect to every neuron in each hidden layer. Each connection carries a
            learned weight — the left panel shows them live as cyan (positive) and magenta
            (negative) edges.
          </p>
        </section>

        <!-- Forward pass -->
        <section>
          <h3>FROM DRAWING TO PREDICTION</h3>
          <p>
            Your 28×28 canvas becomes 784 pixel values (0 = white, 1 = black). Each hidden
            neuron computes a weighted sum of its inputs then applies <em>ReLU</em>, which zeros
            out negatives. The 10 output neurons run <em>Softmax</em>, converting raw scores into
            probabilities that sum to 100%.
          </p>
          <div class="formula">output = ReLU( Σ wᵢ · xᵢ + b )</div>
        </section>

        <!-- Training -->
        <section>
          <h3>WRONG? TEACH IT</h3>
          <p>When you correct a wrong prediction, the network runs 25 rounds of <em>backpropagation</em>:</p>
          <ol>
            <li>Forward pass — compute what the network currently thinks</li>
            <li>Loss — <em>cross-entropy</em> measures how wrong the answer was</li>
            <li>Backward pass — trace each weight's contribution to the error</li>
            <li>Update — nudge all 109k weights a tiny amount toward the correct answer</li>
          </ol>
          <p class="aside">
            The learning rate is kept low (0.001) so teaching one digit doesn't erase the
            model's general knowledge — a common trap called catastrophic forgetting.
          </p>
        </section>

      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['close'])

const CY  = 70   // vertical center of dot columns
const GAP = 9    // px between dots

const archLayers = [
  { x: 44,  display: 14, actual: 784, sub: 'pixels',  output: false },
  { x: 152, display: 10, actual: 128, sub: 'neurons', output: false },
  { x: 252, display: 7,  actual: 64,  sub: 'neurons', output: false },
  { x: 352, display: 10, actual: 10,  sub: 'digits',  output: true  },
]

function ys(count) {
  const h = (count - 1) * GAP
  const s = CY - h / 2
  return Array.from({ length: count }, (_, i) => s + i * GAP)
}

const layerYs = archLayers.map(l => ys(l.display))

const allDots = archLayers.flatMap((l, i) =>
  layerYs[i].map(y => ({ x: l.x, y, output: l.output }))
)

const connections = archLayers.slice(0, -1).map((l, i) => {
  const src = layerYs[i]
  const dst = layerYs[i + 1]
  const x2  = archLayers[i + 1].x
  return {
    poly: `${l.x},${src[0]} ${l.x},${src.at(-1)} ${x2},${dst.at(-1)} ${x2},${dst[0]}`,
  }
})

const sampleLines = archLayers.slice(0, -1).flatMap((l, i) => {
  const src = layerYs[i]
  const dst = layerYs[i + 1]
  const x2  = archLayers[i + 1].x
  return [0, Math.floor(src.length / 3), Math.floor(2 * src.length / 3), src.length - 1]
    .map(si => ({
      x1: l.x, y1: src[si],
      x2, y2: dst[Math.min(Math.round(si * dst.length / src.length), dst.length - 1)],
    }))
})
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(6, 8, 15, 0.86);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: 100%;
  max-width: 520px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  font-family: inherit;
  line-height: 1;
  transition: color 0.15s;
}

.close-btn:hover { color: var(--text); }

.modal-body {
  overflow-y: auto;
  padding: 20px 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Stats ── */
.stats {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--dim);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 20px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-n {
  font-size: 20px;
  font-weight: bold;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.stat-lbl {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--muted);
  text-transform: uppercase;
}

.stat-div {
  width: 1px;
  height: 32px;
  background: var(--border);
}

/* ── Sections ── */
section h3 {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: var(--accent);
  margin-bottom: 10px;
}

section p {
  font-size: 13px;
  color: var(--text);
  line-height: 1.75;
}

section em {
  font-style: normal;
  color: var(--accent);
}

section ol {
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 10px 0;
}

section li {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
}

/* ── Arch SVG ── */
.arch-svg {
  width: 100%;
  height: auto;
  display: block;
  margin: 10px 0 6px;
}

/* ── Formula ── */
.formula {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: var(--accent);
  background: var(--dim);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 16px;
  margin-top: 12px;
  text-align: center;
  letter-spacing: 0.04em;
}

/* ── Notes ── */
.note {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.6;
  margin-top: 6px;
}

.aside {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.6;
  border-left: 2px solid var(--border);
  padding-left: 12px;
  margin-top: 2px;
}
</style>
