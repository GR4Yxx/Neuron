// Pure functions — no class, no module-level state.
// Weights format: Array<{ w: number[], b: number[] }>
// weights[l].w is row-major: w[j * in_size + k] = weight from input[k] to output neuron[j]

/**
 * @param {number[]} input - Flattened pixel array, length = ARCHITECTURE[0]
 * @param {Array<{w: number[], b: number[]}>} weights
 * @returns {{ activations: number[][], output: number[] }}
 *   activations[0] = input, activations[l+1] = post-activation of layer l
 */
export function forward(input, weights) {
  const activations = [input]
  let a = input

  for (let l = 0; l < weights.length; l++) {
    const { w, b } = weights[l]
    const inSize = a.length
    const outSize = b.length
    const z = new Array(outSize)

    for (let j = 0; j < outSize; j++) {
      let sum = b[j]
      const row = j * inSize
      for (let k = 0; k < inSize; k++) {
        sum += w[row + k] * a[k]
      }
      z[j] = sum
    }

    a = l === weights.length - 1 ? softmax(z) : relu(z)
    activations.push(a)
  }

  return { activations, output: activations[activations.length - 1] }
}

/**
 * Cross-entropy loss.
 * @param {number[]} output - Softmax probabilities
 * @param {number} label - Integer 0–9
 * @returns {number}
 */
export function loss(output, label) {
  return -Math.log(Math.max(output[label], 1e-15))
}

/**
 * Backpropagation. Returns gradients in same shape as weights.
 * @param {number[][]} activations - From forward()
 * @param {Array<{w: number[], b: number[]}>} weights
 * @param {number} label - Integer 0–9
 * @returns {Array<{w: number[], b: number[]}>} gradients
 */
export function backward(activations, weights, label) {
  const L = weights.length
  const gradients = new Array(L)

  // Combined gradient of cross-entropy loss + softmax at output layer
  let delta = activations[L].slice()
  delta[label] -= 1

  for (let l = L - 1; l >= 0; l--) {
    const a_in = activations[l]
    const inSize = a_in.length
    const outSize = delta.length

    const grad_w = new Array(outSize * inSize)
    for (let j = 0; j < outSize; j++) {
      const row = j * inSize
      const dj = delta[j]
      for (let k = 0; k < inSize; k++) {
        grad_w[row + k] = dj * a_in[k]
      }
    }

    gradients[l] = { w: grad_w, b: delta.slice() }

    if (l > 0) {
      // Backprop through relu: gradient is 0 where post-activation was 0
      const relu_in = activations[l]
      const { w } = weights[l]
      const newDelta = new Array(inSize).fill(0)

      for (let k = 0; k < inSize; k++) {
        if (relu_in[k] <= 0) continue
        for (let j = 0; j < outSize; j++) {
          newDelta[k] += w[j * inSize + k] * delta[j]
        }
      }

      delta = newDelta
    }
  }

  return gradients
}

/**
 * SGD weight update. Returns new weights; inputs are not mutated.
 * @param {Array<{w: number[], b: number[]}>} weights
 * @param {Array<{w: number[], b: number[]}>} gradients
 * @param {number} lr
 * @returns {Array<{w: number[], b: number[]}>}
 */
export function step(weights, gradients, lr) {
  return weights.map((layer, l) => {
    const gw = gradients[l].w
    const gb = gradients[l].b
    return {
      w: layer.w.map((v, i) => v - lr * gw[i]),
      b: layer.b.map((v, i) => v - lr * gb[i]),
    }
  })
}

/**
 * Gradient of cross-entropy loss w.r.t. the input pixels.
 * Used for gradient ascent (dream mode) — returns a 784-length array.
 * @param {number[][]} activations - From forward()
 * @param {Array<{w: number[], b: number[]}>} weights
 * @param {number} label - Target digit to maximise
 * @returns {number[]} dinput — same shape as input
 */
export function inputGradient(activations, weights, label) {
  const L = weights.length

  // Same combined softmax + CE delta as backward()
  let delta = activations[L].slice()
  delta[label] -= 1

  for (let l = L - 1; l >= 0; l--) {
    const a_in   = activations[l]
    const inSize  = a_in.length
    const outSize = delta.length
    const { w }   = weights[l]
    const next    = new Array(inSize).fill(0)

    for (let k = 0; k < inSize; k++) {
      for (let j = 0; j < outSize; j++) next[k] += w[j * inSize + k] * delta[j]
      // ReLU mask — skip for l=0 (input layer has no activation)
      if (l > 0 && a_in[k] <= 0) next[k] = 0
    }
    delta = next
  }

  return delta
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function relu(z) {
  const out = new Array(z.length)
  for (let i = 0; i < z.length; i++) out[i] = z[i] > 0 ? z[i] : 0
  return out
}

function softmax(z) {
  let max = z[0]
  for (let i = 1; i < z.length; i++) if (z[i] > max) max = z[i]
  const exp = new Array(z.length)
  let sum = 0
  for (let i = 0; i < z.length; i++) {
    exp[i] = Math.exp(z[i] - max)
    sum += exp[i]
  }
  for (let i = 0; i < z.length; i++) exp[i] /= sum
  return exp
}
