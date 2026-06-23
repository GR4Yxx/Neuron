#!/usr/bin/env node
/**
 * Standalone trainer. Uses the same network.js and config.js as the browser app.
 *
 * Usage:
 *   npm run train
 *   npm run train -- --epochs 30 --lr 0.01 --hidden 128,64 --samples 10000 --output ./custom.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ARCHITECTURE, LEARNING_RATE, WEIGHTS_PATH } from '../config.js'
import { forward, loss, backward, step } from '../src/network.js'
import { loadMNIST } from './mnist-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2))
const EPOCHS     = args.epochs  ? parseInt(args.epochs)              : 30
const LR         = args.lr      ? parseFloat(args.lr)               : LEARNING_RATE
const HIDDEN     = args.hidden  ? args.hidden.split(',').map(Number) : ARCHITECTURE.slice(1, -1)
const MAX_TRAIN  = args.samples ? parseInt(args.samples)            : 10000
const BATCH_SIZE = args.batch   ? parseInt(args.batch)              : 64
const OUT        = args.output  ? args.output : path.join(__dirname, '..', WEIGHTS_PATH)

const arch = [ARCHITECTURE[0], ...HIDDEN, ARCHITECTURE[ARCHITECTURE.length - 1]]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Architecture: [${arch.join(' → ')}]`)
  console.log(`Epochs: ${EPOCHS} | LR: ${LR} | Batch: ${BATCH_SIZE} | Train samples: ${MAX_TRAIN}`)
  console.log()

  console.log('Loading MNIST...')
  const { train, test } = await loadMNIST({ maxTrain: MAX_TRAIN })
  console.log(`Loaded ${train.images.length} train, ${test.images.length} test samples\n`)

  let weights = initWeights(arch)

  for (let epoch = 1; epoch <= EPOCHS; epoch++) {
    const t0 = Date.now()
    const { weights: w, avgLoss } = trainEpoch(train.images, train.labels, weights, LR, BATCH_SIZE)
    weights = w
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    process.stdout.write(`Epoch ${String(epoch).padStart(2)} / ${EPOCHS}  loss: ${avgLoss.toFixed(4)}  (${elapsed}s)\r`)
  }

  console.log('\n')
  const accuracy = evaluate(test.images, test.labels, weights)
  console.log(`Test accuracy: ${(accuracy * 100).toFixed(2)}% on ${test.images.length} samples`)

  const outPath = path.resolve(OUT)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(weights))
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0)
  console.log(`\nWeights written to ${outPath} (${kb} KB)`)
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

function trainEpoch(images, labels, weights, lr, batchSize) {
  const indices = shuffle(Array.from({ length: images.length }, (_, i) => i))
  let totalLoss = 0

  for (let b = 0; b < indices.length; b += batchSize) {
    const batch = indices.slice(b, Math.min(b + batchSize, indices.length))
    let accumulated = null

    for (const idx of batch) {
      const { activations, output } = forward(images[idx], weights)
      totalLoss += loss(output, labels[idx])
      const grads = backward(activations, weights, labels[idx])

      if (!accumulated) {
        accumulated = grads
      } else {
        for (let l = 0; l < grads.length; l++) {
          for (let i = 0; i < grads[l].w.length; i++) accumulated[l].w[i] += grads[l].w[i]
          for (let i = 0; i < grads[l].b.length; i++) accumulated[l].b[i] += grads[l].b[i]
        }
      }
    }

    // Average gradients over batch
    const n = batch.length
    for (const layer of accumulated) {
      for (let i = 0; i < layer.w.length; i++) layer.w[i] /= n
      for (let i = 0; i < layer.b.length; i++) layer.b[i] /= n
    }

    weights = step(weights, accumulated, lr)
  }

  return { weights, avgLoss: totalLoss / images.length }
}

function evaluate(images, labels, weights) {
  let correct = 0
  for (let i = 0; i < images.length; i++) {
    const { output } = forward(images[i], weights)
    let maxIdx = 0
    for (let j = 1; j < output.length; j++) if (output[j] > output[maxIdx]) maxIdx = j
    if (maxIdx === labels[i]) correct++
  }
  return correct / images.length
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initWeights(arch) {
  return arch.slice(0, -1).map((inSize, i) => {
    const outSize = arch[i + 1]
    const std = Math.sqrt(2 / inSize) // He init for ReLU
    const w = Array.from({ length: outSize * inSize }, () => randn() * std)
    const b = new Array(outSize).fill(0)
    return { w, b }
  })
}

function randn() {
  // Box-Muller transform
  const u1 = 1 - Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function parseArgs(argv) {
  const result = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1]
      i++
    }
  }
  return result
}

main().catch(err => { console.error(err.message); process.exit(1) })
