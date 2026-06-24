/**
 * Computes per-class pixel means from the MNIST training set.
 * Outputs public/class_means.json — 10 × 784 float array.
 *
 * Usage: npm run means
 *
 * The dream feature uses these as starting points so gradient ascent begins
 * from a blurry-but-correct digit shape rather than zeros.
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadMNIST } from './mnist-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log('Loading full MNIST training set (60 000 images)…')
  const { train } = await loadMNIST()   // no maxTrain limit → all 60k
  console.log(`Loaded ${train.images.length} images`)

  const sums   = Array.from({ length: 10 }, () => new Float64Array(784))
  const counts = new Array(10).fill(0)

  for (let i = 0; i < train.images.length; i++) {
    const label = train.labels[i]
    counts[label]++
    const img = train.images[i]
    for (let j = 0; j < 784; j++) sums[label][j] += img[j]
  }

  const means = sums.map((sum, d) => Array.from(sum, v => v / counts[d]))

  const outPath = path.join(__dirname, '../public/class_means.json')
  fs.writeFileSync(outPath, JSON.stringify(means))

  console.log('Saved public/class_means.json')
  console.log('Samples per class:', counts.join(', '))
}

main().catch(err => { console.error(err); process.exit(1) })
