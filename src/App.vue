<template>
  <div id="layout">
    <!-- Left panel: network diagram + loss chart -->
    <div class="panel-left">
      <NetDiagram
        :weights="weights"
        :activations="activations"
        :mode="mode"
      />
      <LossChart v-if="mode === 'personalize' || losses.length > 0" :losses="losses" class="loss-chart" />
    </div>

    <!-- Right panel -->
    <div class="panel-right">

      <!-- Header -->
      <div class="rp-header">
        <span class="app-name">NEURON</span>
        <span class="mode-pill" :class="mode">
          {{ mode === 'recognize' ? '◉ Recognize' : mode === 'dream' ? '◉ Dreaming' : '◉ Training' }}
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
          <template v-if="mode === 'dream'">
            <span class="dream-status">
              {{ prediction.confidence < 0.5  ? 'conjuring…'
               : prediction.confidence < 0.8  ? 'taking shape…'
               : prediction.confidence < 0.95 ? 'crystallizing…'
               : 'crystallized ✦' }}
            </span>
            <span class="conf-pct">{{ (prediction.confidence * 100).toFixed(1) }}% confident</span>
          </template>
          <template v-else>
            <span class="conf-pct">{{ (prediction.confidence * 100).toFixed(1) }}%</span>
            <div v-if="prediction.top3 && prediction.top3.length > 1" class="runners">
              <span v-for="r in prediction.top3.slice(1)" :key="r.digit" class="runner-chip">
                <b>{{ r.digit }}</b> {{ (r.confidence * 100).toFixed(0) }}%
              </span>
            </div>
          </template>
        </template>
        <template v-else>
          <span class="digit placeholder">?</span>
          <span class="hint">{{ mode === 'dream' ? 'dreaming…' : 'draw a digit' }}</span>
        </template>

        <!-- Live prediction trail — shows recent recognition history while drawing -->
        <div v-if="predHistory.length > 0 && mode === 'recognize'" class="pred-trail">
          <span
            v-for="(item, i) in predHistory"
            :key="i"
            class="trail-chip"
            :style="{ opacity: (0.25 + (i / Math.max(predHistory.length - 1, 1)) * 0.75).toFixed(2) }"
          >{{ item.digit }}</span>
        </div>
      </div>

      <!-- Canvas -->
      <div class="canvas-card">
        <DrawCanvas
          :mode="mode"
          :dream-pixels="dreamGrid"
          @recognize="onRecognize"
          @train="onTrain"
          @clear="onClear"
        />
      </div>
      <div v-if="mode === 'dream'" class="dream-caption">
        the AI's learned representation of "{{ prediction?.digit ?? '?' }}"
      </div>

      <!-- Action row -->
      <div class="action-row">

        <!-- Dream section: explains the feature then offers the digit picker -->
        <div v-if="mode === 'recognize' && weights" class="dream-section">
          <div class="dream-section-hd">
            <span class="dream-section-title">DREAM A DIGIT</span>
            <span class="dream-section-desc">watch the AI render its mental image</span>
          </div>
          <div class="dream-row">
            <button
              v-for="d in 10"
              :key="d - 1"
              class="dream-digit"
              @click="startDream(d - 1)"
            >{{ d - 1 }}</button>
          </div>
        </div>

        <!-- Main action button -->
        <button
          v-if="mode === 'recognize'"
          class="btn-primary"
          :disabled="!weights"
          @click="startPersonalize"
        >Wrong? Teach it</button>
        <button
          v-else-if="mode === 'dream'"
          class="btn-primary btn-stop-dream"
          @click="stopDream"
        >■ Stop Dream</button>
        <button v-else class="btn-primary btn-training" disabled>
          <span class="spin">◌</span> Training…
        </button>

        <button
          v-if="losses.length > 0 && mode === 'recognize'"
          class="btn-reset"
          @click="resetModel"
        >↺ Reset to original model</button>
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
const predHistory   = ref([])        // last 6 live predictions while drawing
const dreamGrid     = ref(null)      // evolving dream pixel array, null when not dreaming

let worker = null
let originalWeights = null   // pristine copy — never overwritten after load
let storedMeans     = null   // class means for dream initialization

onMounted(async () => {
  let classMeans = null
  try {
    const [weightsRes, meansRes] = await Promise.all([
      fetch('/weights.json'),
      fetch('/class_means.json').catch(() => null),
    ])
    if (!weightsRes.ok) throw new Error(`HTTP ${weightsRes.status}`)
    originalWeights = markRaw(await weightsRes.json())
    weights.value   = originalWeights
    if (meansRes?.ok) classMeans = await meansRes.json()
    storedMeans = classMeans
  } catch (e) {
    console.error('Failed to load weights.json:', e.message)
    status.value = 'ready'
    return
  }

  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  worker.postMessage({ type: 'INIT', weights: weights.value, classMeans })
  status.value = 'ready'

  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case 'PREDICTION':
        prediction.value  = data.output
        activations.value = markRaw(data.activations)
        predHistory.value = [...predHistory.value, { digit: data.output.digit }].slice(-6)
        break
      case 'SNAPSHOT':
        weights.value     = markRaw(data.weights)
        activations.value = markRaw(data.activations)
        losses.value      = [...losses.value, data.loss]
        break
      case 'DONE':
        mode.value = 'recognize'
        break
      case 'DREAM_FRAME':
        dreamGrid.value   = markRaw(data.input)
        activations.value = markRaw(data.activations)
        prediction.value  = {
          digit:      data.label,
          confidence: data.confidence,
          top3:       [{ digit: data.label, confidence: data.confidence }],
        }
        break
      case 'DREAM_DONE':
        mode.value      = 'recognize'
        dreamGrid.value = null
        break
    }
  }
})

onUnmounted(() => worker?.terminate())

function startPersonalize() {
  mode.value = 'personalize'
}

function startDream(label) {
  if (!worker) return
  mode.value       = 'dream'
  dreamGrid.value  = null
  // Show target digit immediately at 0% confidence; DREAM_FRAME updates it live
  prediction.value = { digit: label, confidence: 0, top3: [{ digit: label, confidence: 0 }] }
  worker.postMessage({ type: 'DREAM', label })
}

function stopDream() {
  if (!worker) return
  worker.postMessage({ type: 'DREAM_STOP' })
  mode.value      = 'recognize'
  dreamGrid.value = null
}

function resetModel() {
  if (!originalWeights || !worker) return
  weights.value     = originalWeights
  activations.value = null
  prediction.value  = null
  losses.value      = []
  predHistory.value = []
  mode.value        = 'recognize'
  worker.postMessage({ type: 'INIT', weights: originalWeights, classMeans: storedMeans })
}

function onRecognize(input) {
  if (!worker) return
  worker.postMessage({ type: 'RECOGNIZE', input })
}

function onTrain({ input, label }) {
  if (!worker) return
  mode.value       = 'personalize'
  losses.value     = []
  prediction.value = null
  worker.postMessage({ type: 'TRAIN', input, label, epochs: FINETUNE_EPOCHS })
}

function onClear() {
  predHistory.value = []
  if (mode.value === 'recognize') {
    prediction.value  = null
    activations.value = null
  }
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

.mode-pill.dream {
  border-color: rgba(160, 80, 255, 0.6);
  color: #c080ff;
  background: rgba(160, 80, 255, 0.10);
  animation: dream-pill-pulse 1.8s ease-in-out infinite;
}

@keyframes dream-pill-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(160, 80, 255, 0); }
  50%       { box-shadow: 0 0 0 4px rgba(160, 80, 255, 0.18); }
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

/* Dream mode status text */
.dream-status {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: #b060ff;
  text-transform: uppercase;
  animation: dream-fade-cycle 1.6s ease-in-out infinite;
}

@keyframes dream-fade-cycle {
  0%, 100% { opacity: 0.6; }
  50%       { opacity: 1; }
}

/* Caption below canvas during dream */
.dream-caption {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-align: center;
  padding: 6px 0 2px;
  font-style: italic;
}

/* Dream section header + digit row */
.dream-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dream-section-hd {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.dream-section-title {
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #b060ff;
}

.dream-section-desc {
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--muted);
}

/* Live prediction trail */
.pred-trail {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.trail-chip {
  font-size: 16px;
  font-weight: bold;
  color: var(--accent);
  min-width: 20px;
  text-align: center;
  transition: opacity 0.15s;
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

/* Dream digit picker */
.dream-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dream-digit {
  width: 26px;
  height: 26px;
  font-family: inherit;
  font-size: 11px;
  border-radius: 5px;
  background: var(--dim);
  border: 1px solid var(--border);
  color: var(--muted);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}

.dream-digit:hover {
  border-color: rgba(160, 80, 255, 0.5);
  color: #b060ff;
  background: rgba(160, 80, 255, 0.07);
}

/* Buttons */
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

.btn-primary.btn-stop-dream {
  background: rgba(160, 80, 255, 0.18);
  color: #c090ff;
  border: 1px solid rgba(160, 80, 255, 0.45);
}

.btn-primary.btn-stop-dream:hover:not(:disabled) {
  opacity: 1;
  background: rgba(160, 80, 255, 0.28);
}

.spin {
  display: inline-block;
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-reset {
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid rgba(255, 32, 96, 0.35);
  color: var(--negative);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.08em;
  transition: background 0.15s, border-color 0.15s;
}

.btn-reset:hover {
  background: rgba(255, 32, 96, 0.08);
  border-color: var(--negative);
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
    height: 100dvh;
    overflow: hidden;
  }

  /* Network on top: fixed slice of the viewport */
  .panel-left {
    order: 1;
    flex: 0 0 28vh;
    min-height: 0;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 6px 8px;
  }

  /* Draw panel: fills remaining height exactly */
  .panel-right {
    order: 2;
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    justify-content: flex-start;
    gap: 0;
    padding: 0 10px 10px;
  }

  .rp-header {
    padding: 8px 0 6px;
    flex-shrink: 0;
  }

  .prediction {
    flex-shrink: 0;
    padding: 4px 0 2px;
    gap: 3px;
  }

  .digit       { font-size: 62px; }
  .conf-pct    { font-size: 14px; }
  .runners     { margin-top: 0; gap: 5px; }
  .runner-chip { font-size: 11px; padding: 2px 8px; }
  .pred-trail  { gap: 4px; margin-top: 0; }
  .trail-chip  { font-size: 13px; }

  /* Canvas card grows to fill all remaining vertical space */
  .canvas-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 8px;
  }

  .action-row  { flex-shrink: 0; padding-top: 8px; gap: 4px; }

  .btn-primary { padding: 11px; font-size: 12px; border-radius: 8px; }
  .btn-learn   { font-size: 10px; padding: 2px 0; }
  .dream-row   { gap: 3px; }
  .dream-digit { width: 22px; height: 22px; font-size: 10px; }
  .dream-section-desc { display: none; }
  .dream-caption { font-size: 9px; padding: 3px 0; }

  /* Hide loss chart on mobile — not enough space */
  .loss-chart  { display: none !important; }
}
</style>
