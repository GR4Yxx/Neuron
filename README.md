# Neuron

A browser-based neural network that recognises handwritten digits in real time — and learns from you when it gets one wrong.

Draw a digit. Watch activations propagate layer by layer. Correct a wrong prediction and watch the weights update live. No backend, no API — everything runs in your browser.

---

## What it does

- **Live recognition** — draw any digit 0–9 on the canvas, get a prediction with confidence scores
- **Real-time visualisation** — see activations flow through all 109,000 weights as you draw
- **Personalised training** — click *Wrong? Teach it*, pick the correct label, and the model fine-tunes itself on your handwriting in ~2 seconds
- **Loss chart** — watch cross-entropy loss fall in real time as the model trains

---

## How it works

The network is a standard feedforward classifier:

```
784 inputs  →  128 neurons  →  64 neurons  →  10 outputs
  (pixels)      (ReLU)          (ReLU)        (Softmax)
```

- **784 inputs** — each pixel in the 28×28 drawing canvas
- **Hidden layers** — ReLU activation, He-initialised weights
- **Output** — Softmax over 10 digit classes; the highest score is the prediction
- **Training** — mini-batch SGD with cross-entropy loss, backpropagation by hand (no ML library)
- **Fine-tuning** — 25 epochs at LR 0.001 so teaching one digit doesn't erase general knowledge

The pre-trained weights ship at **95.13% accuracy** on the MNIST test set (trained on 30k samples).

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

## Retraining the model

```bash
npm run train
# or with custom settings:
npm run train -- --samples 30000 --epochs 20 --lr 0.01
```

Downloads MNIST on first run (~12MB, cached in `trainer/.mnist-cache/`). Outputs weights to `public/weights.json`.

Available flags:

| Flag | Default | Description |
|---|---|---|
| `--samples` | 10000 | Training samples to use |
| `--epochs` | 30 | Full passes over the data |
| `--lr` | 0.01 | Learning rate |
| `--batch` | 64 | Mini-batch size |
| `--hidden` | 128,64 | Hidden layer sizes |

---

## Project structure

```
src/
  App.vue              — layout, worker lifecycle, state
  network.js           — pure forward/backward/step functions
  worker.js            — Web Worker: INIT / RECOGNIZE / TRAIN
  components/
    DrawCanvas.vue     — 28×28 drawing grid
    NetDiagram.vue     — D3 live network visualisation
    LossChart.vue      — D3 training loss curve
    LearnMore.vue      — theory modal (architecture, backprop, etc.)
config.js              — single source of truth for all constants
public/weights.json    — pre-trained weights (2.2MB)
trainer/
  train.js             — offline training CLI
  mnist-loader.js      — IDX binary parser, auto-downloads MNIST
```

---

## License

MIT
