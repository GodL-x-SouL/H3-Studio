# H3 + LTX Studio

Web UI for the MiniMax H3 + LTX-2.5 Colab lab (named for the two model families it
serves, not for H3 alone): a Vite + React + Tailwind frontend that
talks to ComfyUI on the Colab VM through a small Python backend, designed to be exposed
with a single cloudflared tunnel from the notebook.

Both models share one ComfyUI install (`COMFY_CHANNEL` in cell 01: `stable` = 0.33.0,
`latest` = 0.43.2), one backend and one tunnel. The model switch in the top bar swaps the
whole settings surface: H3 jobs use the FL2VA / Ref2VA GGUF stacks with the H3-only
method nodes, LTX-2.5 jobs use its 22B distilled DiT, gemma4 text encoder, dual VAEs and
x2 latent upscaler. ComfyUI restarts automatically when a job switches model family,
because H3 runs with `--force-fp16` and LTX does not.

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
2. `01` — pins ComfyUI (`COMFY_CHANNEL`, stable 0.33.0 / latest 0.43.2), ComfyUI-GGUF,
   the H3 Turbo nodes and patches the GGUF loader for both `minimax_h3` and LTX-2.5
   (`gemma4` arch, ltxv fp32 tensors, gemma4 tokenizer bytes, fp16 embedding dequant).
   On 0.43 it also adapts the GGUF patcher to the new `return_weight`/`force_cast`
   `ModelPatcher` API. Writes the H3Lab + LTX25Lab control nodes.
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
notebook's `build_cfg` (H3) and `build_ltx_cfg` (LTX) estimate the working set. Up to
**720p** (1344×768, the HD preset) the estimate is advisory: the job is allowed through
with a warning so the T4 can be pushed past Preview. Above 720p the preflight stays
enforced and refuses the run, e.g. *"H3 2560x1440 at 124 frames needs about 54.6 GiB…
Tesla T4 has 15.0 GiB"*. The UI runs the same arithmetic from `/h3/status`: amber warning
and **Generate anyway** up to 720p, red refusal and a disabled button for 1080p/2K (it
names the largest preset that still fits). Estimator constants live in `src/types.ts`
(`vramNeedGiB`, `VRAM_ADVISORY_AREA`) and in the notebook's preflight block — keep the two
in sync.

## ComfyUI 0.43.2 (channel `latest`)

The 0.33 pin is what every T4 run so far used. 0.43.2 is wired up and structurally
verified on CPU, but a full GPU render has not been observed yet, so it is opt-in:

```python
# cell 01
COMFY_CHANNEL = "latest"   # 0.43.2; use "stable" to return to 0.33.0
```

What was verified against a clean 0.43.2 checkout (CPU, no weights):

- H3Lab, LTX25Lab, ComfyUI-GGUF (patched), H3 Turbo, FP16Safe and Spectrum all import.
- Every node in the H3 encode/sample and LTX encode → base → upscale → refine → decode
  graphs exists with the inputs the notebook sends (`/object_info` + `validate_graph`).
- H3's native `MiniMaxH3ImageToVideo` / `MiniMaxH3ReferenceToVideo` schemas are unchanged;
  `minimax` and `ltxv` are still valid CLIP types; `--force-fp16`, `--bf16-unet`,
  `--enable-triton-backend` and `--use-sage-attention` still exist.
- GGUF's `GGMLOps.Linear` runs H3's fused `linear_input_act(..., "swiglu")` through the
  0.43 eager fallback, and `GGUFModelPatcher` works after the `return_weight`/`force_cast`
  shim (unit-checked on a CPU layer).

Known risks still to watch on the first GPU run: 0.43 needs the new `comfy-kitchen` and
`comfy-aimdo` wheels from `requirements.txt`, the untouched 2025 Turbo LoRA adapter is
older than 0.43's `ComfyAttention` work, and GGUF dequantization itself cannot be
exercised without weights. If anything regresses, set `COMFY_CHANNEL = "stable"` and
rerun cell 01 (it hard-resets the checkout).

### GPU smoke test (T4, 2026-11-01)

All of the CPU checks above reproduce on a real T4 session, and the Studio backend plus
every custom node register on 0.43.2, but a render does **not** work yet: a 22-frame
864x480 Preview job samples NaN latents (`video_rms=nan` at step 0 and every step after,
rejected by `H3LatentProbe`), so no video is written. The identical job on 0.33.0 with
`COMFY_CHANNEL = "stable"` produces a valid 22-frame H.264 clip in about 2.5 minutes.
The encode pass is finite on 0.43.2, which points at GGUF weights going bad through the
`return_weight`/`force_cast` shim or the new DynamicVRAM/aimdo offloading rather than at
the graph. `latest` stays wired for development but is not usable for renders; keep
`stable` as the default until that path is fixed.

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
