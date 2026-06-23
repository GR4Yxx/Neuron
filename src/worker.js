import { forward, backward, step, loss } from './network.js'
import { SNAPSHOT_INTERVAL, FINETUNE_LEARNING_RATE } from '../config.js'

let weights = null

self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'INIT':
      weights = data.weights
      break

    case 'RECOGNIZE': {
      if (!weights) break
      const { activations, output } = forward(data.input, weights)
      let maxIdx = 0
      for (let i = 1; i < output.length; i++) if (output[i] > output[maxIdx]) maxIdx = i

      // Top-3 sorted by confidence
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
  }
}
