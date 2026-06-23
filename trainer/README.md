# Neuron Trainer

Standalone Node.js script to train the digit recognition model offline and output `weights.json` for the browser app.

## Requirements

Node.js 18+ (uses `fetch` and `import.meta.dirname`)

## Usage

```bash
# Default: 30 epochs, lr=0.01, arch from config.js
npm run train

# Custom options
npm run train -- --epochs 50 --lr 0.005 --hidden 256,128 --output ./my-weights.json
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--epochs` | `30` | Training epochs over full dataset |
| `--lr` | `0.01` | Learning rate |
| `--hidden` | `128,64` | Comma-separated hidden layer sizes |
| `--output` | `src/assets/weights.json` | Output path for weights file |

## Output

Writes `weights.json` — an array of `{ w, b }` layer objects — directly into `src/assets/` so the browser app can load it on mount. Drop it in and reload.

## MNIST Data

Downloaded automatically on first run and cached in `trainer/.mnist-cache/`. Not committed to the repo.

## Architecture

Uses the same `network.js` and `config.js` as the browser app — the training and inference code is identical. If you change the architecture in `config.js`, re-run the trainer to get matching weights.
