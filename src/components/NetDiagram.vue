<template>
  <div class="net-wrap" ref="wrapEl">
    <svg ref="svgEl" :width="svgW" :height="svgH" />
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

const wrapEl = ref(null)
const svgEl  = ref(null)

let   NODE_R = 5   // computed in buildLayout — do not use as a constant
const PAD_X  = 60
const PAD_Y  = 36

const svgW = ref(600)
const svgH = ref(400)

let svg       = null
let positions = []
let nodeGroups = []   // [{ circles: D3Selection, isOutput: bool }] per layer
let animTimers = []

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
    const g = svg.append('g')

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
// Activation animation — propagates layer by layer
// ---------------------------------------------------------------------------

const LAYER_DELAY = 90   // ms between each layer lighting up
const FADE_MS     = 110  // transition duration per layer

function animateActivations(activations, animate = true) {
  animTimers.forEach(clearTimeout)
  animTimers = []

  if (!activations) {
    nodeGroups.forEach(({ circles }) => {
      circles.transition().duration(200).attr('fill', '#2e2e2e')
    })
    return
  }

  activations.forEach((layerActs, l) => {
    const delay = animate ? l * LAYER_DELAY : 0
    const t = setTimeout(() => {
      const ng = nodeGroups[l]
      if (!ng) return

      ng.circles
        .transition()
        .duration(animate ? FADE_MS : 0)
        .ease(d3.easeCubicOut)
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

// Animate activations layer-by-layer on each new prediction
watch(() => props.activations, acts => { if (acts) animateActivations(acts, true) })

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
})
</script>

<style scoped>
.net-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

svg { display: block; }
</style>
