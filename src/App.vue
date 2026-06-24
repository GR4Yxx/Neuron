<template>
  <div id="layout">
    <!-- Left panel: network diagram + loss chart -->
    <div class="panel-left">
      <NetDiagram
        :weights="weights"
        :activations="activations"
        :mode="mode"
      />
      <LossChart v-if="mode === 'personalize' || losses.length > 0" :losses="losses" />
    </div>

    <!-- Right panel -->
    <div class="panel-right">

      <!-- Header -->
      <div class="rp-header">
        <span class="app-name">NEURON</span>
        <span class="mode-pill" :class="mode">
          {{ mode === 'recognize' ? '◉ Recognize' : '◎ Training' }}
        </span>
      </div>

      <!-- Prediction -->
      <div class="prediction">
        <template v-if="status === 'loading'">
          <span class="digit placeholder">…</span>
          <span class="hint">loading model</span>
        </template>
        <template v-else-if="prediction">
          <span class="digit">{{ prediction.digit }}</span>
          <span class="conf-pct">{{ (prediction.confidence * 100).toFixed(1) }}%</span>
          <div class="runners">
            <span v-for="r in prediction.top3.slice(1)" :key="r.digit" class="runner-chip">
              <b>{{ r.digit }}</b> {{ (r.confidence * 100).toFixed(0) }}%
            </span>
          </div>
        </template>
        <template v-else>
          <span class="digit placeholder">?</span>
          <span class="hint">draw a digit</span>
        </template>
      </div>

      <!-- Canvas -->
      <div class="canvas-card">
        <DrawCanvas :mode="mode" @recognize="onRecognize" @train="onTrain" />
      </div>

      <!-- Action row -->
      <div class="action-row">
        <button
          v-if="mode === 'recognize'"
          class="btn-primary"
          :disabled="!weights"
          @click="startPersonalize"
        >Wrong? Teach it</button>
        <button v-else class="btn-primary btn-training" disabled>
          <span class="spin">◌</span> Training…
        </button>
        <button class="btn-learn" @click="showLearnMore = true">How does this work? ↗</button>
      </div>

    </div>
  </div>

  <Teleport to="body">
    <LearnMore v-if="showLearnMore" @close="showLearnMore = false" />
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted, markRaw } from 'vue'
import { FINETUNE_EPOCHS } from '../config.js'
import NetDiagram  from './components/NetDiagram.vue'
import LossChart   from './components/LossChart.vue'
import DrawCanvas  from './components/DrawCanvas.vue'
import LearnMore   from './components/LearnMore.vue'

const mode          = ref('recognize')
const weights       = ref(null)
const activations   = ref(null)
const losses        = ref([])
const prediction    = ref(null)
const status        = ref('loading') // 'loading' | 'ready'
const showLearnMore = ref(false)

let worker = null

onMounted(async () => {
  try {
    const res = await fetch('/weights.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    weights.value = markRaw(await res.json())
  } catch (e) {
    console.error('Failed to load weights.json:', e.message)
    status.value = 'ready'
    return
  }

  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  worker.postMessage({ type: 'INIT', weights: weights.value })
  status.value = 'ready'

  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case 'PREDICTION':
        prediction.value  = data.output
        activations.value = markRaw(data.activations)
        break
      case 'SNAPSHOT':
        weights.value     = markRaw(data.weights)
        activations.value = markRaw(data.activations)
        losses.value      = [...losses.value, data.loss]
        break
      case 'DONE':
        mode.value = 'recognize'
        break
    }
  }
})

onUnmounted(() => worker?.terminate())

function startPersonalize() {
  mode.value = 'personalize'
}

function onRecognize(input) {
  if (!worker) return
  worker.postMessage({ type: 'RECOGNIZE', input })
}

function onTrain({ input, label }) {
  if (!worker) return
  mode.value    = 'personalize'
  losses.value  = []
  prediction.value = null
  worker.postMessage({ type: 'TRAIN', input, label, epochs: FINETUNE_EPOCHS })
}
</script>

<style scoped>
#layout {
  display: flex;
  height: 100vh;
}

/* ── Left panel ─────────────────────────────────────── */
.panel-left {
  flex: 1;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  padding: 16px 12px 12px;
  overflow: hidden;
  min-width: 0;
  border-right: 1px solid var(--border);
}

/* ── Right panel ────────────────────────────────────── */
.panel-right {
  width: 424px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 16px 20px;
  background: var(--bg);
}

/* Header */
.rp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0 14px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}

.app-name {
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.25em;
  color: var(--accent);
}

.mode-pill {
  font-size: 10px;
  letter-spacing: 0.12em;
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid var(--border);
  color: var(--muted);
  transition: all 0.2s;
}

.mode-pill.personalize {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(0,229,255,0.06);
}

/* Prediction */
.prediction {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 16px 0 10px;
}

.digit {
  font-size: 148px;
  font-weight: bold;
  line-height: 1;
  color: var(--accent);
  text-shadow: 0 0 48px rgba(0,229,255,0.45);
  letter-spacing: -0.02em;
}

.digit.placeholder {
  color: var(--dim);
  text-shadow: none;
}

.conf-pct {
  font-size: 22px;
  color: var(--text);
  letter-spacing: 0.08em;
}

.hint {
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.1em;
}

.runners {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.runner-chip {
  font-size: 15px;
  color: var(--muted);
  background: var(--dim);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 5px 14px;
  letter-spacing: 0.04em;
}

.runner-chip b {
  color: var(--text);
  font-weight: bold;
  margin-right: 5px;
}

/* Canvas card */
.canvas-card {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  line-height: 0;
}

/* Action row */
.action-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding-top: 14px;
}

.btn-primary {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: var(--accent);
  color: #000;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: opacity 0.15s, transform 0.1s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.88;
  transform: translateY(-1px);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-primary:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.btn-training {
  background: var(--dim);
  color: var(--muted);
  letter-spacing: 0.08em;
}

.spin {
  display: inline-block;
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-learn {
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  text-align: center;
  transition: color 0.15s;
}

.btn-learn:hover { color: var(--accent); }


/* ── Mobile layout ──────────────────────────────────── */
@media (max-width: 767px) {
  #layout {
    flex-direction: column;
    height: auto;
    min-height: 100dvh;
  }

  /* Network diagram on top */
  .panel-left {
    order: 1;
    flex: none;
    height: 280px;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 10px 8px;
  }

  /* Draw/predict panel below */
  .panel-right {
    order: 2;
    width: 100%;
    justify-content: flex-start;
    gap: 14px;
    padding: 0 12px 20px;
  }

  /* Smaller digit on narrow screens */
  .digit { font-size: 88px; }

  .prediction { padding: 10px 0 4px; }
}
</style>
