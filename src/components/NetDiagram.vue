<template>
  <div class="net-wrap" ref="wrapEl">
    <svg ref="svgEl" :width="svgW" :height="svgH" />
    <div v-if="tt.visible" class="node-tooltip" :style="{ left: tt.x + 'px', top: tt.y + 'px' }">
      <div class="tt-header">{{ tt.header }}</div>
      <div class="tt-sub">{{ tt.sub }}</div>
      <canvas v-if="tt.showCanvas" ref="ttCanvas" width="28" height="28" class="tt-canvas" />
      <div class="tt-value" :class="{ 'tt-accent': tt.highlight }">{{ tt.value }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { ARCHITECTURE, DISPLAY_NODES } from '../../config.js'

const props = defineProps({
  weights:     { type: Array,  default: null },
  activations: { type: Array,  default: null },
  mode:        { type: String, default: 'recognize' },
})

const wrapEl   = ref(null)
const svgEl    = ref(null)
const ttCanvas = ref(null)

const tt = ref({ visible: false, x: 0, y: 0, header: '', sub: '', value: '', highlight: false, showCanvas: false, neuronIdx: 0 })

const LAYER_META = [
  { name: 'INPUT',    sub: 'pixel',  total: ARCHITECTURE[0] },
  { name: 'HIDDEN 1', sub: 'neuron', total: ARCHITECTURE[1] },
  { name: 'HIDDEN 2', sub: 'neuron', total: ARCHITECTURE[2] },
  { name: 'OUTPUT',   sub: 'digit',  total: ARCHITECTURE[3] },
]

let   NODE_R = 5   // computed in buildLayout — do not use as a constant
const PAD_X  = 60
const PAD_Y  = 36

const svgW = ref(600)
const svgH = ref(400)

let svg          = null
let positions    = []
let nodeGroups   = []   // [{ circles: D3Selection, isOutput: bool }] per layer
let animTimers   = []
let animDebounce = null

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function buildLayout() {
  const w = wrapEl.value?.clientWidth  || 600
  const h = wrapEl.value?.clientHeight || 400

  svgW.value = w
  svgH.value = h

  const maxNodes = Math.max(...DISPLAY_NODES)
  // Spread nodes to fill available height, capped so they don't get too far apart
  const vGap = Math.min((h - PAD_Y * 2) / (maxNodes - 1), 28)
  NODE_R = Math.max(Math.round(vGap * 0.34), 3)  // ~1/3 of gap, min 3px

  const layerX = ARCHITECTURE.map((_, l) =>
    PAD_X + l * ((w - PAD_X * 2) / (ARCHITECTURE.length - 1))
  )

  positions = ARCHITECTURE.map((realCount, l) => {
    const n      = DISPLAY_NODES[l]
    const totalH = (n - 1) * vGap
    const startY = h / 2 - totalH / 2
    const step   = realCount / n
    return Array.from({ length: n }, (_, i) => ({
      x: layerX[l],
      y: startY + i * vGap,
      realIdx: Math.round(i * step),
    }))
  })
}

// ---------------------------------------------------------------------------
// Full redraw (structure only — called on mount, resize, weight change)
// ---------------------------------------------------------------------------

function redraw() {
  if (!svg) return
  svg.selectAll('*').remove()
  nodeGroups = []

  drawEdges()
  drawNodes()
  drawLabels()

  // Re-apply activations without animation after a structural rebuild
  if (props.activations) animateActivations(props.activations, false)
}

function drawEdges() {
  const g = svg.append('g').attr('class', 'edges')
  const weights = props.weights

  for (let l = 0; l < ARCHITECTURE.length - 1; l++) {
    const srcNodes = positions[l]
    const dstNodes = positions[l + 1]
    const layerW   = weights?.[l]?.w
    const inSize   = ARCHITECTURE[l]

    for (const src of srcNodes) {
      for (const dst of dstNodes) {
        let color   = 'rgba(50,50,50,0.22)'
        let opacity = 1

        if (layerW) {
          const w    = layerW[dst.realIdx * inSize + src.realIdx]
          const absW = Math.abs(w)
          const t    = Math.min(absW / 1.5, 1)
          opacity    = 0.03 + t * 0.72
          color      = w >= 0 ? '#00e5ff' : '#ff2060'
        }

        g.append('line')
          .attr('x1', src.x).attr('y1', src.y)
          .attr('x2', dst.x).attr('y2', dst.y)
          .attr('stroke', color)
          .attr('stroke-width', 0.7)
          .attr('stroke-opacity', opacity)
      }
    }
  }
}

function drawNodes() {
  ARCHITECTURE.forEach((_, l) => {
    const isOutput = l === ARCHITECTURE.length - 1
    const meta     = LAYER_META[l]
    const g        = svg.append('g')

    const circles = g.selectAll('circle')
      .data(positions[l])
      .enter()
      .append('circle')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r',  isOutput ? NODE_R + 1 : NODE_R)
      .attr('fill',         '#1a2035')
      .attr('stroke',       isOutput ? 'rgba(0,229,255,0.5)' : '#252a40')
      .attr('stroke-width', isOutput ? 1 : 0.5)
      .attr('cursor', 'crosshair')
      .on('mouseover mousemove', function(event, d) {
        const [mx, my] = d3.pointer(event, wrapEl.value)
        const act      = props.activations?.[l]?.[d.realIdx]
        const hasAct   = act != null

        const value     = !hasAct     ? '–'
                        : isOutput    ? `${(act * 100).toFixed(1)}%`
                        :               act.toFixed(3)
        const sub       = isOutput
                        ? `digit ${d.realIdx}`
                        : `${meta.sub} ${d.realIdx} / ${meta.total}`

        // Show weight heatmap for Hidden Layer 1 neurons (784 input weights → 28×28 grid)
        const showCanvas = l === 1 && !!props.weights

        // Keep tooltip inside the wrapper
        const wrapW = wrapEl.value?.clientWidth ?? 600
        const tipW  = 150
        const x = mx + 14 + tipW > wrapW ? mx - tipW - 8 : mx + 14
        const y = Math.max(8, my - 42)

        tt.value = { visible: true, x, y, header: meta.name, sub, value, highlight: isOutput && hasAct, showCanvas, neuronIdx: d.realIdx }
      })
      .on('mouseout', () => { tt.value.visible = false; tt.value.showCanvas = false })

    nodeGroups.push({ circles, isOutput })
  })
}

function drawLabels() {
  ARCHITECTURE.forEach((realCount, l) => {
    svg.append('text')
      .attr('x', positions[l][0].x)
      .attr('y', PAD_Y - 16)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .attr('font-size', 10)
      .attr('font-family', 'Courier New, monospace')
      .text(realCount === DISPLAY_NODES[l] ? realCount : `×${realCount}`)

    if (l === ARCHITECTURE.length - 1) {
      svg.selectAll(null)
        .data(positions[l])
        .enter()
        .append('text')
        .attr('x', d => d.x + NODE_R + 6)
        .attr('y', d => d.y + 4)
        .attr('fill', '#666')
        .attr('font-size', 10)
        .attr('font-family', 'Courier New, monospace')
        .text((_, i) => i)
    }
  })
}

// ---------------------------------------------------------------------------
// Weight heatmap — renders a Hidden Layer 1 neuron's 784 input weights as
// a 28×28 image: cyan = positive weights, magenta = negative, dark = near-zero
// ---------------------------------------------------------------------------

function drawWeightCanvas() {
  const el = ttCanvas.value
  if (!el || !props.weights) return

  const inSize = ARCHITECTURE[0]  // 784
  const layerW = props.weights[0].w
  const offset = tt.value.neuronIdx * inSize
  const vals   = layerW.slice(offset, offset + inSize)

  // Normalize so the largest magnitude = 1
  let absMax = 0
  for (const v of vals) { const a = Math.abs(v); if (a > absMax) absMax = a }
  if (absMax === 0) absMax = 1

  const ctx = el.getContext('2d')
  const img = ctx.createImageData(28, 28)
  const d   = img.data

  // Base color matches --surface: rgb(12, 14, 26)
  const BR = 12, BG = 14, BB = 26

  for (let i = 0; i < inSize; i++) {
    const t = vals[i] / absMax  // -1..+1
    let r, g, b
    if (t >= 0) {
      // dark → cyan (#00e5ff)
      r = Math.round(BR * (1 - t))
      g = Math.round(BG * (1 - t) + 229 * t)
      b = Math.round(BB * (1 - t) + 255 * t)
    } else {
      // dark → magenta (#ff2060)
      const s = -t
      r = Math.round(BR * (1 - s) + 255 * s)
      g = Math.round(BG * (1 - s) + 32  * s)
      b = Math.round(BB * (1 - s) + 96  * s)
    }
    d[i * 4]     = r
    d[i * 4 + 1] = g
    d[i * 4 + 2] = b
    d[i * 4 + 3] = 255
  }

  ctx.putImageData(img, 0, 0)
}

// Redraw canvas whenever tooltip shows a new layer-1 neuron
watch(() => tt.value.showCanvas, show => {
  if (show) nextTick(() => drawWeightCanvas())
})
watch(() => tt.value.neuronIdx, () => {
  if (tt.value.showCanvas) nextTick(() => drawWeightCanvas())
})

// ---------------------------------------------------------------------------
// Activation animation — forward pass + backprop sweep
// ---------------------------------------------------------------------------

const LAYER_DELAY    = 300  // ms between layers (forward)
const FADE_MS        = 200  // node transition duration
const SCAN_MS        = 240  // scan-line travel time between layers
const BACK_DELAY     = 180  // ms between backprop layers
const BACK_FADE      = 140  // backprop node transition duration
// backprop starts after forward pass completes + short pause
const BACKPROP_START = (ARCHITECTURE.length - 1) * LAYER_DELAY + FADE_MS + 250

// Glowing vertical bar that sweeps from one layer column to the next
function scanLine(fromX, toX, delay, color) {
  const t = setTimeout(() => {
    if (!svg) return
    svg.append('rect')
      .attr('x', fromX - 1)
      .attr('y', PAD_Y)
      .attr('width', 2)
      .attr('height', svgH.value - PAD_Y * 2)
      .attr('fill', color)
      .attr('opacity', 0.7)
      .attr('rx', 1)
      .attr('pointer-events', 'none')
      .transition()
      .duration(SCAN_MS)
      .ease(d3.easeLinear)
      .attr('x', toX - 1)
      .attr('opacity', 0)
      .remove()
  }, delay)
  animTimers.push(t)
}

function animateActivations(activations, animate = true) {
  animTimers.forEach(clearTimeout)
  animTimers = []

  if (!activations) {
    nodeGroups.forEach(({ circles }) => {
      circles.transition().duration(300).attr('fill', '#1a2035')
    })
    return
  }

  activations.forEach((layerActs, l) => {
    const delay = animate ? l * LAYER_DELAY : 0

    // Scan line sweeps in from the previous layer just before this one lights up
    if (animate && l > 0) {
      scanLine(positions[l - 1][0].x, positions[l][0].x,
               Math.max(0, delay - SCAN_MS), '#00e5ff')
    }

    const t = setTimeout(() => {
      const ng = nodeGroups[l]
      if (!ng) return
      ng.circles
        .transition().duration(animate ? FADE_MS : 0).ease(d3.easeCubicOut)
        .attr('fill', d => nodeColor(layerActs[d.realIdx] ?? 0, ng.isOutput))
        .attr('stroke', d => {
          if (!ng.isOutput) return '#252a40'
          const v = Math.min(Math.max(layerActs[d.realIdx] ?? 0, 0), 1)
          return `rgba(0,229,255,${(0.3 + v * 0.7).toFixed(2)})`
        })
    }, delay)

    animTimers.push(t)
  })
}

// Backward magenta sweep — simulates error signal flowing back through layers
function animateBackprop(activations) {
  for (let l = ARCHITECTURE.length - 1; l >= 0; l--) {
    const ri    = ARCHITECTURE.length - 1 - l   // reverse index (0 = output layer first)
    const delay = BACKPROP_START + ri * BACK_DELAY

    // Scan line sweeping right-to-left
    if (l < ARCHITECTURE.length - 1) {
      scanLine(positions[l + 1][0].x, positions[l][0].x,
               Math.max(0, delay - SCAN_MS), '#ff2060')
    }

    // Flash nodes magenta, then settle back to their activation colour
    const t = setTimeout(() => {
      const ng = nodeGroups[l]
      if (!ng) return
      ng.circles
        .transition().duration(BACK_FADE / 2)
        .attr('fill', d => {
          const act = Math.min(Math.max(activations[l]?.[d.realIdx] ?? 0, 0), 1)
          return `rgba(255,32,96,${(0.2 + act * 0.6).toFixed(2)})`
        })
        .transition().duration(BACK_FADE)
        .attr('fill', d => nodeColor(activations[l]?.[d.realIdx] ?? 0, ng.isOutput))
    }, delay)

    animTimers.push(t)
  }
}

function nodeColor(act, isOutput) {
  const t = Math.min(Math.max(act, 0), 1)
  if (isOutput) {
    // dark navy → electric cyan
    const r = Math.round(t * 0)
    const g = Math.round(50 + t * 179)
    const b = Math.round(80 + t * 175)
    return `rgb(${r},${g},${b})`
  }
  // dark navy → bright blue-white
  const r = Math.round(26  + t * 190)
  const g = Math.round(32  + t * 200)
  const b = Math.round(64  + t * 191)
  return `rgb(${r},${g},${b})`
}

// ---------------------------------------------------------------------------
// Watchers & lifecycle
// ---------------------------------------------------------------------------

// Rebuild edges + nodes when weights load or change after fine-tuning
watch(() => props.weights, () => { buildLayout(); redraw() })

// Forward pass on recognition; forward + backprop sweep on training snapshots
watch(() => props.activations, acts => {
  if (!acts) return

  if (props.mode === 'personalize') {
    // Training snapshots are infrequent — always play full animation + backprop
    animateActivations(acts, true)
    animateBackprop(acts)
    return
  }

  // Recognize / dream: update node colors instantly so rapid updates don't jitter.
  // In recognize mode, debounce the full scan-line animation to fire after drawing stops.
  animateActivations(acts, false)
  clearTimeout(animDebounce)
  if (props.mode === 'recognize') {
    animDebounce = setTimeout(() => animateActivations(acts, true), 280)
  }
})

let ro = null

onMounted(async () => {
  await nextTick()
  svg = d3.select(svgEl.value)
  buildLayout()
  redraw()

  ro = new ResizeObserver(() => { buildLayout(); redraw() })
  ro.observe(wrapEl.value)
})

onUnmounted(() => {
  ro?.disconnect()
  animTimers.forEach(clearTimeout)
  clearTimeout(animDebounce)
})
</script>

<style scoped>
.net-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

svg { display: block; }

/* ── Node tooltip ── */
.node-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 130px;
  z-index: 10;
}

.tt-header {
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 0.18em;
  color: var(--accent);
  margin-bottom: 3px;
}

.tt-sub {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 5px;
  letter-spacing: 0.04em;
}

.tt-value {
  font-size: 16px;
  font-weight: bold;
  color: var(--text);
  letter-spacing: 0.02em;
}

.tt-accent { color: var(--accent); }

.tt-canvas {
  display: block;
  width: 84px;
  height: 84px;
  margin: 6px 0 4px;
  border-radius: 4px;
  image-rendering: pixelated;
  border: 1px solid var(--border);
}
</style>
