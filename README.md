# H3 Studio

Web UI for the MiniMax H3 Colab lab: a Vite + React + Tailwind frontend that talks to
ComfyUI on the Colab VM through a small Python backend, designed to be exposed with a
single cloudflared tunnel from the notebook.

## Layout

```
dist/                  built WebUI (committed; the notebook serves this directly)
server/h3_backend.py   aiohttp server: static dist + ComfyUI reverse proxy (HTTP/WS)
                       + /h3/* API (jobs, loras, setup, uploads, log)
src/                   frontend source (React + TS + Tailwind v4)
notebook/              the Colab notebook that wires everything together
```

## How it runs in Colab

Cell 03 of the notebook:

1. starts ComfyUI on `127.0.0.1:8188`
2. clones this repo to `/content/h3lab/H3-Studio` and starts `server/h3_backend.py` on
   `127.0.0.1:8000` with hooks into the notebook's workflow pipeline
3. opens a cloudflared quick tunnel to port 8000 and prints the `trycloudflare.com` URL
4. keeps running; stopping the cell tears down the tunnel, the backend, ComfyUI and
   frees the ports

The backend serves the UI and proxies ComfyUI, so the single tunnel URL is all the
browser needs. The `/h3` API drives jobs (encode → sample → decode), LoRA downloads,
frame uploads, setup actions and log tailing.

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
| `GET  /h3/jobs`         | job list (stage, progress, meta, video URL, errors)  |
| `POST /h3/generate`     | queue a run from the UI config                       |
| `POST /h3/cancel`       | cancel queued/running job (interrupts ComfyUI)       |
| `GET  /h3/loras`        | loras present in ComfyUI/models/loras                |
| `POST /h3/lora`         | download a `.safetensors` LoRA (HF or direct URL)    |
| `POST /h3/upload`       | stage a first/last frame image                       |
| `GET  /h3/output?file=` | serve a produced video from ComfyUI/output           |
| `GET  /h3/log`          | ComfyUI log tail                                     |
| `GET/POST /h3/setup`    | method toggles (fp16 fix, FP16Safe, Spectrum, …)     |
| `POST /h3/setup/sage`   | install the prebuilt SageAttention wheel             |
| everything else         | reverse-proxied to ComfyUI (HTTP + WebSocket)        |
