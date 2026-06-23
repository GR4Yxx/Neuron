<template>
  <div class="chart-wrap" ref="wrapEl">
    <div class="chart-label">loss</div>
    <svg ref="svgEl" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  losses: { type: Array, default: () => [] }, // number[], one per SNAPSHOT_INTERVAL epochs
})

const wrapEl = ref(null)
const svgEl  = ref(null)
let svg = null

const PAD = { top: 10, right: 16, bottom: 24, left: 36 }

function draw() {
  if (!svg) return
  const data = props.losses
  const el = wrapEl.value
  if (!el) return

  const W = el.clientWidth  || 300
  const H = el.clientHeight || 120

  d3.select(svgEl.value).attr('width', W).attr('height', H)
  svg.selectAll('*').remove()

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top  - PAD.bottom

  const g = svg.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  if (data.length < 2) {
    g.append('text')
      .attr('x', innerW / 2).attr('y', innerH / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#444')
      .attr('font-size', 11)
      .attr('font-family', 'Courier New, monospace')
      .text('training…')
    return
  }

  const xScale = d3.scaleLinear().domain([0, data.length - 1]).range([0, innerW])
  const yScale = d3.scaleLinear()
    .domain([0, Math.max(...data) * 1.05])
    .range([innerH, 0])

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).ticks(4).tickSize(3))
    .call(ax => {
      ax.select('.domain').attr('stroke', '#333')
      ax.selectAll('text').attr('fill', '#444').attr('font-size', 9).attr('font-family', 'Courier New, monospace')
      ax.selectAll('.tick line').attr('stroke', '#333')
    })

  g.append('g')
    .call(d3.axisLeft(yScale).ticks(3).tickSize(3))
    .call(ax => {
      ax.select('.domain').attr('stroke', '#333')
      ax.selectAll('text').attr('fill', '#444').attr('font-size', 9).attr('font-family', 'Courier New, monospace')
      ax.selectAll('.tick line').attr('stroke', '#333')
    })

  // Line
  const line = d3.line()
    .x((_, i) => xScale(i))
    .y(d => yScale(d))
    .curve(d3.curveMonotoneX)

  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', '#00e5ff')
    .attr('stroke-width', 1.5)
    .attr('d', line)

  // Latest value dot
  const last = data[data.length - 1]
  g.append('circle')
    .attr('cx', xScale(data.length - 1))
    .attr('cy', yScale(last))
    .attr('r', 3)
    .attr('fill', '#00e5ff')
}

let ro = null

onMounted(async () => {
  await nextTick()
  svg = d3.select(svgEl.value)
  draw()

  ro = new ResizeObserver(draw)
  ro.observe(wrapEl.value)
})

onUnmounted(() => ro?.disconnect())

watch(() => props.losses, draw, { deep: true })
</script>

<style scoped>
.chart-wrap {
  position: relative;
  height: 130px;
  display: flex;
  align-items: stretch;
}

.chart-label {
  position: absolute;
  top: 10px;
  left: 0;
  font-size: 9px;
  color: #333;
  font-family: 'Courier New', monospace;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  padding-left: 2px;
}

svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
