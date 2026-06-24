import { forward, backward, step, loss, inputGradient } from './network.js'
import { SNAPSHOT_INTERVAL, FINETUNE_LEARNING_RATE } from '../config.js'

let weights    = null
let classMeans = null  // 10 × 784 float arrays — per-class MNIST pixel averages
let dreamId    = 0     // incremented on each new dream — lets old ticks self-cancel

self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'INIT':
      weights    = data.weights
      classMeans = data.classMeans ?? null
      break

    case 'RECOGNIZE': {
      if (!weights) break
      const { activations, output } = forward(data.input, weights)
      let maxIdx = 0
      for (let i = 1; i < output.length; i++) if (output[i] > output[maxIdx]) maxIdx = i

      const top3 = output
        .map((p, i) => ({ digit: i, confidence: p }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)

      self.postMessage({ type: 'PREDICTION', output: { digit: maxIdx, confidence: output[maxIdx], top3 }, activations })
      break
    }

    case 'TRAIN': {
      if (!weights) break
      const { input, label, epochs } = data
      for (let epoch = 0; epoch < epochs; epoch++) {
        const { activations, output } = forward(input, weights)
        const gradients = backward(activations, weights, label)
        weights = step(weights, gradients, FINETUNE_LEARNING_RATE)

        if ((epoch + 1) % SNAPSHOT_INTERVAL === 0) {
          const currentLoss = loss(output, label)
          self.postMessage({ type: 'SNAPSHOT', weights, activations, loss: currentLoss })
        }
      }
      self.postMessage({ type: 'DONE' })
      break
    }

    case 'DREAM': {
      if (!weights) break
      const myId = ++dreamId
      const { label } = data
      const STEPS  = 50    // class mean gives us the shape; we just need light sharpening
      const LR     = 0.003 // very small — barely moves pixels from the mean
      const REG    = 0.008
      const TV_W   = 0.014
      const ANCHOR = 0.30  // pulls x back toward the starting mean, prevents shape drift
      const B1     = 0.9, B2 = 0.999, EPS = 1e-8

      // Seed from the per-class MNIST mean. x0 is kept as the anchor target.
      let x
      if (classMeans) {
        const mean = classMeans[label]
        x = Array.from(mean, v => Math.max(0, Math.min(1, v * 0.65 + (Math.random() - 0.5) * 0.01)))
      } else {
        x = new Array(784).fill(0)
      }
      const x0 = x.slice()  // anchor: optimizer is penalised for drifting away from this
      let m = new Array(784).fill(0)
      let v = new Array(784).fill(0)
      let s = 0

      function tick() {
        if (dreamId !== myId) return

        for (let i = 0; i < 2 && s < STEPS; i++, s++) {
          const { activations } = forward(x, weights)
          const grad = inputGradient(activations, weights, label)

          for (let j = 0; j < 784; j++) {
            const r = Math.floor(j / 28), c = j % 28
            let tv = 0
            if (r > 0)  tv += Math.sign(x[j] - x[(r - 1) * 28 + c])
            if (r < 27) tv += Math.sign(x[j] - x[(r + 1) * 28 + c])
            if (c > 0)  tv += Math.sign(x[j] - x[r * 28 + (c - 1)])
            if (c < 27) tv += Math.sign(x[j] - x[r * 28 + (c + 1)])
            // Anchor term: gradient of ||x - x0||^2 pulls x back toward the mean shape
            grad[j] += REG * x[j] + TV_W * tv + ANCHOR * (x[j] - x0[j])
          }

          const bc1 = 1 - Math.pow(B1, s + 1)
          const bc2 = 1 - Math.pow(B2, s + 1)
          for (let j = 0; j < 784; j++) {
            m[j] = B1 * m[j] + (1 - B1) * grad[j]
            v[j] = B2 * v[j] + (1 - B2) * grad[j] * grad[j]
            x[j] = Math.max(0, Math.min(1, x[j] - LR * (m[j] / bc1) / (Math.sqrt(v[j] / bc2) + EPS)))
          }

        }

        // Filter on every frame so the display is always clean
        const displayX = keepTopComponents(x, 0.07, 2)

        const { activations, output } = forward(displayX, weights)
        self.postMessage({
          type: 'DREAM_FRAME',
          input: displayX.slice(),
          activations,
          step: s,
          confidence: output[label],
          label,
        })

        if (s < STEPS) setTimeout(tick, 30)
        else           self.postMessage({ type: 'DREAM_DONE' })
      }

      setTimeout(tick, 0)
      break
    }

    case 'DREAM_STOP':
      dreamId++   // invalidates any running tick
      break
  }
}

// BFS flood-fill — keeps the k largest connected pixel regions, zeros out the rest.
// Eliminates scattered isolated pixels without touching the main digit body.
function keepTopComponents(x, threshold, k) {
  const binary = x.map(v => v > threshold ? 1 : 0)
  const labels = new Int32Array(784).fill(-1)
  const sizes  = []

  for (let i = 0; i < 784; i++) {
    if (!binary[i] || labels[i] >= 0) continue
    const lbl = sizes.length
    const stack = [i]
    labels[i] = lbl
    let sz = 0
    while (stack.length) {
      const idx = stack.pop()
      sz++
      const r = Math.floor(idx / 28), c = idx % 28
      if (r > 0  && binary[idx - 28] && labels[idx - 28] < 0) { labels[idx - 28] = lbl; stack.push(idx - 28) }
      if (r < 27 && binary[idx + 28] && labels[idx + 28] < 0) { labels[idx + 28] = lbl; stack.push(idx + 28) }
      if (c > 0  && binary[idx -  1] && labels[idx -  1] < 0) { labels[idx -  1] = lbl; stack.push(idx -  1) }
      if (c < 27 && binary[idx +  1] && labels[idx +  1] < 0) { labels[idx +  1] = lbl; stack.push(idx +  1) }
    }
    sizes.push({ lbl, sz })
  }

  const topLabels = new Set(
    sizes.sort((a, b) => b.sz - a.sz).slice(0, k).map(e => e.lbl)
  )
  return x.map((v, i) => topLabels.has(labels[i]) ? v : 0)
}

// 3×3 box blur — suppresses high-frequency adversarial noise in dream images
function blur2d(x) {
  const out = new Array(784)
  for (let r = 0; r < 28; r++) {
    for (let c = 0; c < 28; c++) {
      let sum = 0, cnt = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc
          if (nr >= 0 && nr < 28 && nc >= 0 && nc < 28) {
            sum += x[nr * 28 + nc]
            cnt++
          }
        }
      }
      out[r * 28 + c] = sum / cnt
    }
  }
  return out
}
