# Neuron

A browser-based neural network that recognises handwritten digits in real time — and lets you see, teach, and explore what it has learned.

Draw a digit. Watch activations sweep through 109,000 weights layer by layer. Correct a wrong prediction and watch it learn on the spot. Or ask it to dream: the network renders its own mental image of any digit using gradient ascent. No backend, no API — everything runs in your browser.

---

## Features

### ◉ Live recognition
Draw any digit 0–9. The model predicts as you draw, updating every 180 ms with the top prediction, confidence score, and top-3 alternatives.

### ◈ Real-time network visualisation
Watch activations propagate layer by layer with animated scan lines, node glow proportional to activation strength, and a full backpropagation sweep when training. Hover any node for its exact activation value — hover a hidden-layer neuron to see the 28×28 weight heatmap showing which input pixels it responds to.

### ✦ Dream a digit
Click any digit 0–9 in the *Dream* row to watch the network render its own mental image of that digit. It uses gradient ascent seeded from the MNIST class mean — the canvas shows the AI's learned representation forming in real time.

### ◎ Personalised training
Click *Wrong? Teach it*, pick the correct label, and the model fine-tunes itself on your handwriting in ~2 seconds. A live loss curve tracks convergence. Reset to the original weights at any time.

### ⟳ Prediction trail
A fading history of recent predictions appears as you draw, showing how the model's confidence evolves stroke by stroke.

---

## How it works

The network is a standard feedforward classifier:

```
784 inputs  →  128 neurons  →  64 neurons  →  10 outputs
  (pixels)      (ReLU)          (ReLU)        (Softmax)
```

- **784 inputs** — each pixel in the 28×28 drawing canvas
- **Hidden layers** — ReLU activation, He-initialised weights
- **Output** — Softmax over 10 classes; the highest score wins
- **Training** — mini-batch SGD, cross-entropy loss, backprop by hand (no ML library)
- **Fine-tuning** — 25 epochs at LR 0.001; low rate prevents catastrophic forgetting
- **Dream** — Adam gradient ascent with TV regularisation, anchor loss, and BFS connected-component filtering to keep the output clean

Pre-trained weights ship at **95.13% accuracy** on the MNIST test set.

---

## Tech stack

| Layer | Tool |
|---|---|
| UI framework | Vue 3 + Vite |
| Neural net | Vanilla JS — no ML library |
| Visualisation | D3 + SVG |
| Training thread | Web Worker (non-blocking) |
| Offline trainer | Node.js CLI |
| Deploy | Vercel |

---

## Running locally

```bash
git clone https://github.com/your-username/neuron
cd neuron
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Scripts

### Retrain the model

```bash
npm run train
# custom settings:
npm run train -- --samples 30000 --epochs 20 --lr 0.01
```

Downloads MNIST on first run (~12 MB, cached in `trainer/.mnist-cache/`). Outputs `public/weights.json`.

| Flag | Default | Description |
|---|---|---|
| `--samples` | 10000 | Training samples |
| `--epochs` | 30 | Passes over the data |
| `--lr` | 0.01 | Learning rate |
| `--batch` | 64 | Mini-batch size |
| `--hidden` | 128,64 | Hidden layer sizes |

### Recompute class means (for Dream)

```bash
npm run means
```

Computes per-class pixel averages from all 60 000 MNIST training images and writes `public/class_means.json`. Run once after cloning (or after retraining with a different dataset). The Dream feature seeds gradient ascent from these means so results look like actual digits rather than adversarial noise.

---

## Project structure

```
src/
  App.vue              — layout, worker lifecycle, all state
  network.js           — pure forward / backward / step / inputGradient
  worker.js            — Web Worker: INIT / RECOGNIZE / TRAIN / DREAM
  components/
    DrawCanvas.vue     — 28×28 pixel canvas, brush, dream pixel renderer
    NetDiagram.vue     — D3 SVG network, activation animation, weight heatmap tooltip
    LossChart.vue      — D3 live loss curve
    LearnMore.vue      — theory modal (architecture, backprop explainer)
config.js              — single source of truth for all constants
public/
  weights.json         — pre-trained weights (2.2 MB, 109k params)
  class_means.json     — per-class MNIST pixel means for Dream seeding
trainer/
  train.js             — offline training CLI
  compute_means.js     — generates class_means.json from MNIST
  mnist-loader.js      — IDX binary parser, auto-downloads MNIST
```

---

## License

MIT
