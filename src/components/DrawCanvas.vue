<template>
  <div class="draw-wrap">
    <canvas
      ref="canvasEl"
      :width="CANVAS_PX"
      :height="CANVAS_PX"
      @mousedown="onDown"
      @mousemove="onMove"
      @mouseup="onUp"
      @mouseleave="onUp"
      @touchstart.prevent="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onUp"
    />
    <div class="draw-controls" v-if="mode !== 'dream'">
      <button class="btn-clear" @click="clear">Clear</button>
      <template v-if="mode === 'personalize'">
        <div class="label-picker">
          <span class="label-hint">Label:</span>
          <button
            v-for="d in 10"
            :key="d - 1"
            :class="['digit-btn', { active: selectedLabel === d - 1 }]"
            @click="selectedLabel = d - 1"
          >{{ d - 1 }}</button>
        </div>
        <button class="btn-train" @click="emitTrain">Train</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { BRUSH_SIZE } from '../../config.js'

const GRID      = 28
const CELL      = 14
const CANVAS_PX = GRID * CELL

const props = defineProps({
  mode:        { type: String, default: 'recognize' },
  dreamPixels: { type: Array,  default: null },
})

const emit = defineEmits(['recognize', 'train', 'clear'])

const canvasEl     = ref(null)
const drawing      = ref(false)
const selectedLabel = ref(0)
let ctx  = null
let grid = new Float32Array(GRID * GRID)
let lastRecognizeMs = 0   // throttle live recognition

onMounted(() => {
  ctx = canvasEl.value.getContext('2d')
  redraw()
})

watch(() => props.mode, (val) => {
  if (val === 'recognize') selectedLabel.value = 0
})

// Render externally-provided dream pixels onto the canvas
watch(() => props.dreamPixels, (pixels) => {
  if (!pixels || !ctx) return
  // Dark background + cyan tint to match the app's cyberpunk color scheme
  ctx.fillStyle = '#06080f'
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX)
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const v = pixels[r * GRID + c]
      if (v > 0.06) {
        const t = Math.pow(Math.min(v / 0.75, 1), 0.55)  // gamma lift — dim pixels stay visible
        ctx.fillStyle = `rgb(0,${Math.round(t * 229)},${Math.round(t * 255)})`
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL)
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function cellAt(x, y) {
  return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) }
}

function paint(x, y) {
  const { col, row } = cellAt(x, y)
  for (let dr = 0; dr < BRUSH_SIZE; dr++) {
    for (let dc = 0; dc < BRUSH_SIZE; dc++) {
      const r = row + dr, c = col + dc
      if (r >= 0 && r < GRID && c >= 0 && c < GRID) grid[r * GRID + c] = 1
    }
  }
  redraw()

  // Throttled live recognition — fires every 180ms while drawing
  if (props.mode === 'recognize') {
    const now = Date.now()
    if (now - lastRecognizeMs > 180) {
      lastRecognizeMs = now
      emit('recognize', Array.from(grid))
    }
  }
}

function redraw() {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX)
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const v = grid[r * GRID + c]
      if (v > 0) {
        const alpha = Math.round(v * 255).toString(16).padStart(2, '0')
        ctx.fillStyle = `#111111${alpha}`
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL)
      }
    }
  }
}

function clear() {
  grid = new Float32Array(GRID * GRID)
  redraw()
  emit('clear')
}

// ---------------------------------------------------------------------------
// Mouse / touch — locked in dream mode
// ---------------------------------------------------------------------------

function onDown(e) {
  if (props.mode === 'dream') return
  drawing.value = true
  paint(e.offsetX, e.offsetY)
}

function onMove(e) {
  if (!drawing.value || props.mode === 'dream') return
  paint(e.offsetX, e.offsetY)
}

function onUp() {
  if (!drawing.value) return
  drawing.value = false
  if (props.mode === 'recognize') emit('recognize', Array.from(grid))
}

function onTouchStart(e) {
  if (props.mode === 'dream') return
  drawing.value = true
  const rect = canvasEl.value.getBoundingClientRect()
  const t = e.touches[0]
  paint(t.clientX - rect.left, t.clientY - rect.top)
}

function onTouchMove(e) {
  if (!drawing.value || props.mode === 'dream') return
  const rect = canvasEl.value.getBoundingClientRect()
  const t = e.touches[0]
  paint(t.clientX - rect.left, t.clientY - rect.top)
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function emitTrain() {
  emit('train', { input: Array.from(grid), label: selectedLabel.value })
  clear()
}
</script>

<style scoped>
.draw-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

canvas {
  display: block;
  cursor: crosshair;
  width: 100%;
  aspect-ratio: 1;
  image-rendering: pixelated;
}

.draw-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  padding: 10px 12px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.btn-clear {
  padding: 6px 14px;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  cursor: pointer;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  transition: border-color 0.15s, color 0.15s;
}

.btn-clear:hover {
  border-color: var(--muted);
  color: var(--text);
}

.btn-train {
  padding: 6px 18px;
  font-family: inherit;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.08em;
  cursor: pointer;
  border-radius: 7px;
  border: none;
  background: var(--accent);
  color: #000;
  transition: opacity 0.15s;
}

.btn-train:hover { opacity: 0.85; }

.label-picker {
  display: flex;
  align-items: center;
  gap: 3px;
}

.label-hint {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-right: 4px;
}

.digit-btn {
  width: 24px;
  height: 24px;
  font-family: inherit;
  font-size: 11px;
  border-radius: 5px;
  background: var(--dim);
  border: 1px solid var(--border);
  color: var(--muted);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}

.digit-btn:hover { border-color: var(--muted); color: var(--text); }

.digit-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(0,229,255,0.08);
}

@media (max-width: 767px) {
  .draw-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  canvas {
    flex: 1;
    min-height: 0;
    width: auto;
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: 1;
    align-self: center;
  }

  .draw-controls {
    flex-shrink: 0;
    padding: 6px 10px;
    gap: 6px;
  }

  .digit-btn  { width: 22px; height: 22px; font-size: 10px; }
  .label-hint { font-size: 9px; }
  .btn-clear, .btn-train { padding: 5px 10px; font-size: 10px; }
}
</style>
