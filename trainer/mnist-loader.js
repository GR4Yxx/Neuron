import fs from 'fs'
import path from 'path'
import https from 'https'
import zlib from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, '.mnist-cache')

const FILES = {
  trainImages: 'train-images-idx3-ubyte.gz',
  trainLabels: 'train-labels-idx1-ubyte.gz',
  testImages:  't10k-images-idx3-ubyte.gz',
  testLabels:  't10k-labels-idx1-ubyte.gz',
}

const BASE_URL = 'https://storage.googleapis.com/cvdf-datasets/mnist'

/**
 * Returns parsed MNIST data. Downloads and caches binary files on first run.
 * @param {{ maxTrain?: number }} options
 * @returns {Promise<{ train: Split, test: Split }>}
 *   Split = { images: number[][], labels: number[] }
 *   Each image is a number[] of length 784 with values in [0, 1].
 */
export async function loadMNIST({ maxTrain = Infinity } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  const [trainImgBuf, trainLblBuf, testImgBuf, testLblBuf] = await Promise.all([
    ensureCached('trainImages'),
    ensureCached('trainLabels'),
    ensureCached('testImages'),
    ensureCached('testLabels'),
  ])

  const trainImages = parseImages(trainImgBuf, maxTrain)
  const trainLabels = parseLabels(trainLblBuf, maxTrain)
  const testImages  = parseImages(testImgBuf)
  const testLabels  = parseLabels(testLblBuf)

  return {
    train: { images: trainImages, labels: trainLabels },
    test:  { images: testImages,  labels: testLabels },
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureCached(key) {
  const filename = FILES[key]
  const cachedPath = path.join(CACHE_DIR, filename.replace('.gz', ''))

  if (fs.existsSync(cachedPath)) {
    return fs.readFileSync(cachedPath)
  }

  const url = `${BASE_URL}/${filename}`
  process.stdout.write(`Downloading ${filename}... `)
  const compressed = await download(url)
  const decompressed = zlib.gunzipSync(compressed)
  fs.writeFileSync(cachedPath, decompressed)
  console.log(`done (${(decompressed.length / 1024).toFixed(0)} KB)`)
  return decompressed
}

function download(url) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const request = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`))
        }
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    }
    request(url)
  })
}

function parseImages(buf, limit = Infinity) {
  // IDX3: magic(4) | count(4) | rows(4) | cols(4) | pixels...
  const count = Math.min(buf.readUInt32BE(4), limit)
  const rows  = buf.readUInt32BE(8)
  const cols  = buf.readUInt32BE(12)
  const size  = rows * cols
  const images = new Array(count)

  for (let i = 0; i < count; i++) {
    const offset = 16 + i * size
    const img = new Array(size)
    for (let j = 0; j < size; j++) {
      img[j] = buf[offset + j] / 255
    }
    images[i] = img
  }

  return images
}

function parseLabels(buf, limit = Infinity) {
  // IDX1: magic(4) | count(4) | labels...
  const count = Math.min(buf.readUInt32BE(4), limit)
  const labels = new Array(count)
  for (let i = 0; i < count; i++) {
    labels[i] = buf[8 + i]
  }
  return labels
}
