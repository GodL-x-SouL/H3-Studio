# H3 + LTX Studio

Web UI for the MiniMax H3 + LTX-2.5 Colab lab (named for the two model families it
serves, not for H3 alone): a Vite + React + Tailwind frontend that
talks to ComfyUI on the Colab VM through a small Python backend, designed to be exposed
with a single cloudflared tunnel from the notebook.

Both models share one ComfyUI install (0.33.0), one backend and one tunnel. The model
switch in the top bar swaps the whole settings surface: H3 jobs use the FL2VA / Ref2VA
GGUF stacks with the H3-only method nodes, LTX-2.5 jobs use its 22B distilled DiT,
gemma4 text encoder, dual VAEs and x2 latent upscaler. ComfyUI restarts automatically
when a job switches model family, because H3 runs with `--force-fp16` and LTX does not.

## Layout

```
dist/                  built WebUI (the notebook rebuilds it on Colab; committed so a
                       fresh checkout runs without Node)
server/h3_backend.py   aiohttp server: static dist + ComfyUI reverse proxy (HTTP/WS)
                       + /h3/* API (jobs, loras, setup, uploads, log)
src/                   frontend source (React + TS + Tailwind v4)
notebook/              h3_ltx_t4_lab.ipynb — setup, models and Studio in four cells
```

## Modes

| model    | Text | Image | Reference / First+Last        |
| -------- | ---- | ----- | ----------------------------- |
| H3       | T2VA | I2V / FL2VA (first + last) | R2V on the separate Ref2VA GGUF, up to 4 reference images (`<Picture n>` tags) |
| LTX-2.5  | two-phase T2V (base → x2 → refine) | first-frame guide, single stage | First+Last guides, single stage |

LTX has no reference mode in this stack (no IC-LoRA model is downloaded).

## How it runs in Colab

`notebook/h3_ltx_t4_lab.ipynb` (also copied to the workspace root):

1. `00` — environment check and shared helpers (ComfyUI paths, process control, graph
   validation, log parsing).
2. `01` — pins ComfyUI 0.33.0, ComfyUI-GGUF, the H3 Turbo nodes and patches the GGUF
   loader for both `minimax_h3` and LTX-2.5 (`gemma4` arch, ltxv fp32 tensors, gemma4
   tokenizer bytes, fp16 embedding dequant). Writes the H3Lab + LTX25Lab control nodes.
3. `02` — downloads the selected model sets (`MODEL_SET=both|h3|ltx`): H3 FL2VA and
   Ref2VA GGUF, H3 text encoder + VAEs + turbo LoRA; LTX DiT + gemma4 TE + VAEs + x2
   upscaler. Resumable, size-checked.
4. `03` — starts ComfyUI, clones the `testing` branch to `/content/h3lab/H3-Studio`,
   builds the UI there (`npm ci && npm run build`, with a local Node 22 because Vite 8
   needs >= 20.19), starts the backend on `127.0.0.1:8000`, opens the cloudflared tunnel
   and shows the URL inside the cell's output box. It keeps running; stopping it tears
   everything down and frees the ports.

The cell's `STUDIO_BRANCH` constant is the single place to point the notebook at another
branch; the checkout is hard-reset to it on every run, so what the tunnel serves always
matches that branch.

The backend serves the UI and proxies ComfyUI, so the single tunnel URL is all the
browser needs. The `/h3` API drives jobs (encode → sample → decode for H3, staged base →
upscale → refine for LTX), LoRA downloads, frame uploads, setup actions and log tailing.

## VRAM preflight

Peak VRAM on the T4 lab runs put both stacks on one line — resident weights plus about
0.10 GiB per megapixel-frame:

| run | geometry | measured |
| --- | --- | --- |
| H3 Q3_K_M, safe fp16 | 864x480 · 124 f | 13.81 GiB peak on a 15 GiB T4 |
| LTX 22B UD-Q2_K_XL | 640x384 final (320x192 base) · 121 f | ~12.4 GiB free before the refine pass |

Before a job starts (and before ComfyUI restarts or the prompt is encoded), the
notebook's `build_cfg` (H3) and `build_ltx_cfg` (LTX) estimate the working set and refuse
a run that cannot fit, e.g. *"H3 2560x1440 at 124 frames needs about 54.6 GiB… Tesla T4
has 15.0 GiB"*. The UI runs the same arithmetic from `/h3/status` and disables **Generate**
for that geometry, naming the largest preset that still fits. On a T4 that is Draft or
Preview; 1080p and 2K need a bigger GPU. Estimator constants live in `src/types.ts`
(`vramNeedGiB`) and in the notebook's preflight block — keep the two in sync.

## Local development

```bash
npm install --legacy-peer-deps
npm run dev          # vite dev server (UI only; backend endpoints 404 → "offline")
npm run build        # tsc + vite build → dist/
```

Backend dev mode (serves a built dist with stub hooks, no GPU needed):

```bash
python3 server/h3_backend.py --dist dist --port 8000
```

## API sketch

| endpoint                | purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `GET  /h3/status`       | backend/comfy state, running + queued jobs, VRAM     |
| `GET  /h3/jobs`         | job list (model, stage, progress, meta, video, errors) |
| `POST /h3/generate`     | queue a run from the UI config (`model: h3|ltx`)     |
| `POST /h3/cancel`       | cancel queued/running job (interrupts ComfyUI)       |
| `GET  /h3/loras`        | LoRA files in ComfyUI/models/loras (H3 + LTX stacks) |
| `POST /h3/lora`         | download a `.safetensors` LoRA (HF or direct URL)    |
| `POST /h3/upload`       | stage a first/last/reference frame image             |
| `GET  /h3/media?file=`  | serve a staged upload (Frames tab thumbnail)         |
| `GET  /h3/output?file=` | serve a produced video from ComfyUI/output           |
| `GET  /h3/log`          | ComfyUI log tail                                     |
| `GET/POST /h3/setup`    | H3 method toggles (fp16 fix, FP16Safe, Spectrum, …)  |
| `POST /h3/setup/sage`   | install the prebuilt SageAttention wheel             |
| everything else         | reverse-proxied to ComfyUI (HTTP + WebSocket)        |
