# H3 + LTX Studio

Web UI for the MiniMax H3 + LTX-2.5 Colab lab (named for the two model families it
serves, not for H3 alone): a Vite + React + Tailwind frontend that
talks to ComfyUI on the Colab VM through a small Python backend, designed to be exposed
with a single cloudflared tunnel from the notebook.

Both models share one ComfyUI install (the `COMFY_STACK` selector in cell 01:
`0.33.0 (GGUF)` or `0.43.2 (W4A8)`), one backend and one tunnel. The model switch in the
top bar swaps the whole settings surface: H3 jobs use the FL2VA / Ref2VA GGUF or W4A8
stacks with the H3-only method nodes, LTX-2.5 jobs use its 22B distilled DiT, gemma4 text
encoder, dual VAEs and x2 latent upscaler. ComfyUI restarts automatically when a job
switches model family, because H3 runs with `--force-fp16` and LTX does not.

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
2. `01` — the `COMFY_STACK` selector pins ComfyUI (`0.33.0 (GGUF)` or `0.43.2 (W4A8)`),
   ComfyUI-GGUF, the H3 Turbo nodes, and patches the GGUF loader for both `minimax_h3`
   and LTX-2.5 (`gemma4` arch, ltxv fp32 tensors, gemma4 tokenizer bytes, fp16 embedding
   dequant). It also adapts the GGUF patcher to the `return_weight`/`force_cast`
   `ModelPatcher` API. Writes the H3Lab + LTX25Lab control nodes.
3. `02` — downloads the selected model sets (`MODEL_SET=both|h3|ltx`): H3 FL2VA and
   Ref2VA GGUF (or W4A8), H3 text encoder + VAEs + turbo LoRA; LTX DiT + gemma4 TE +
   VAEs + x2 upscaler. W4A8 choices require the 0.43.2 stack and fail fast on 0.33.0.
   Resumable, size-checked.
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

Native W4A8 is the exception to the 720p advisory rule. Those checkpoints are 11.4-13.0
GiB resident and a T4 only exposes ~13.3 GiB to ComfyUI after its CUDA context, so there
is at most ~1 GiB left for activations. On GPUs with ≤16.5 GiB total, the notebook and the
UI therefore refuse any W4A8 geometry whose activation estimate exceeds 1 GiB, even if it
is below 720p. On a T4 use 640×384 with 22-39 frames: Kijai's 12.5 GB file was measured at
22 frames/2 steps, while the turbo-baked TenStrip file wants 4-6 steps. Preview/long clips
need a ≥24 GB GPU.

## Base-stack selector

Cell 01 starts with a form dropdown that ties the ComfyUI build to the checkpoint format:

```python
# cell 01
COMFY_STACK = "0.33.0 (GGUF)"   # or "0.43.2 (W4A8)"
```

- **0.33.0 (GGUF)** — the tested GGUF stack. Both 0.33.0 and 0.43.2 ship comfy-aimdo and
  enable Dynamic VRAM by default, and that paging path hands back corrupted GGUF weights
  on a T4: an H3 job samples non-finite latents at step 0 (ComfyUI #15262, #17297).
  `CHANNEL_EXTRA_FLAGS` therefore launches every GGUF job with
  `--disable-dynamic-vram`.
- **0.43.2 (W4A8)** — required for native W4A8 safetensors. Cell 03 strips
  `--disable-dynamic-vram` for those jobs and keeps Dynamic VRAM streaming on, which is
  what lets a 12.5 GB model page through the ~13.3 GiB a T4 exposes after its CUDA
  context.

W4A8 choices in cell 02 fail with a pointer to the selector when the stack is still
0.33.0. The backend also restarts ComfyUI when the per-format flags differ, so switching
between GGUF and W4A8 mid-session cannot reuse a server launched with the wrong flags.
Users can still add their own flags in the Studio's extra-flags field.

Measured on a T4 (2026-11-03, same graph that NaNs without the flag): a full
22-frame 864x480 2-step `run_job` renders end to end in 237 s, mp4 attached (that run
included the one-time Q3_K_M download), with no ComfyUI errors.

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

Known risks still to watch: the untouched 2025 Turbo LoRA adapter is older than 0.43's
`ComfyAttention` work, and `--disable-dynamic-vram` gives up the memory system that lets
0.43 hold big models on small cards, so a long GGUF clip at high resolution can OOM where
W4A8 paging would stream. If anything regresses, set `COMFY_STACK = "0.33.0 (GGUF)"` and
rerun cell 01 (it hard-resets the checkout).

### GPU smoke test (T4, 2026-11-02)

All of the CPU checks above reproduce on a real T4 session, and with
`--disable-dynamic-vram` the full H3 pipeline renders: encode → 22-frame 864x480
2-step sample → VAE decode → H.264 file, with finite `video_rms` at every step. Without
the flag the same job samples NaN at step 0 (`H3LatentProbe` rejects it), which is why
`CHANNEL_EXTRA_FLAGS` pins it for GGUF jobs on both pins; 0.33.0 with the flag still
produces the reference clip.

Decode failures in this window were a harness bug, not VRAM: 0.43 makes `SaveVideo.format`
a dynamic combo with a *second* dynamic combo (`codec`) nested under every option, so
`decode_fill` reported "format: dynamic combo has no free option" and every decode died
after a successful sample on either channel. It now prefers `auto`, then any option
without children, and fills nested combos as `format.codec` dotted keys.

### W4A8 checkpoints (0.43.2 stack)

W4A8 is ComfyUI's native `asym_w4a8_int8` format: a plain `.safetensors` where every
quantized module carries a `comfy_quant` JSON sidecar. It is not GGUF and needs no custom
node — `UNETLoader` ("Load Diffusion Model") reads the metadata, and comfy-kitchen
0.2.40 (pinned by 0.43.2) provides the kernels. The CUDA fast path requires SM80+, so a
T4 (SM 7.5) runs comfy-kitchen's eager W4A8 path instead. Set the cell 01 selector to
`0.43.2 (W4A8)` before picking one of these checkpoints.

- cell 02: set `H3_DIT_CHOICE = "kijai_w4a8"` (FL2VA, 12.5 GB) or `REF2VA_CHOICE = "w4a8"`
  (Ref2VA, 11.8 GB); both come from `Kijai/MiniMax-H3-experimental`.
- `tenstrip_turbo_w4a8` / `REF2VA_CHOICE = "tenstrip_w4a8"` load TenStrip's
  `10Eros_Max_h3_TURBO-hybrid_beta5_w4a8_14gb_optimized.safetensors` (14.0 GB, 13.0 GiB
  resident) from `TenStrip/10Eros-Max`. It is a hybrid merge of FL2VA and Ref2VA with a
  turbo delta fused into the weights, so it wants **4-8 steps and no turbo LoRA**. The
  backend now drops a turbo LoRA automatically for turbo-baked checkpoints, and selecting
  the file in the Studio moves the form to Draft 640×384, 39 frames, 4 steps (6 for
  Ref2VA). It is still **not T4-verified**: only the 640×384/22-39-frame streaming case is
  allowed, and larger geometries are refused before encode.
- cell 03 picks the loader from the file: `.gguf` goes through `UnetLoaderGGUF`, anything
  else through `UNETLoader` (`dit_loader_spec`), and the graph validates against whichever
  one the running ComfyUI exposes.
- A 12.5 GB W4A8 DiT cannot sit resident in the ~13.3 GiB a T4 exposes to ComfyUI after
  its CUDA context (torch reports 15.0 GiB total, but only 13,588 MiB is addressable in
  practice). On SM 7.5 comfy-kitchen falls back to its eager W4A8 kernel, and the
  per-layer dequant wants ~1 GB of transient headroom on top of the weights.
  `server_flags()` therefore does the opposite of the GGUF
  fix for native quants: it keeps **DynamicVRAM streaming on** (dropping
  `--disable-dynamic-vram`) and adds `--vram-headroom 0.5 --disable-pinned-memory
  --disable-comfy-compiler`. Verified on a T4: 640x384, 22 frames, 2 steps samples a
  finite latent in about three minutes with those flags.
- Measured end-to-end on a T4 (22 frames, 2 steps, no LoRA): 640x384 renders in 208 s and
  864x480 in 209 s, each a valid H.264 mp4 (encode + sample ~165 s, decode ~42 s). That is
  within ~10% of the Q3_K_M GGUF on the same geometry, at far better fidelity.
- A turbo LoRA on a W4A8 base goes through ComfyUI's quantized LoRA path, which dequantizes
  patched layers per forward (slower than the GGUF bypass path). Validate a short clip
  before trusting a longer render.

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
