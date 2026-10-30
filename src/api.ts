import type { H3Config, LTXConfig, ModelId } from "./types";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Job {
  id: string;
  status: JobStatus;
  stage: string;
  progress: number | null;
  label: string;
  model?: ModelId;
  seed?: number;
  steps?: number;
  frames?: number;
  dims?: string;
  warnings: string[];
  error: string | null;
  video: string | null;
  log_tail: string;
  queued_s: number;
  elapsed_s?: number;
}

export interface BackendStatus {
  backend: boolean;
  comfy: boolean;
  running: string | null;
  running_model?: ModelId | null;
  queued: number;
  version?: string;
  vram_free_mib?: number;
  vram_total_mib?: number;
  device?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(data.error || `HTTP ${response.status}`));
  }
  return data as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function h3Payload(config: H3Config) {
  const references =
    config.mode === "reference" ? config.references.filter((item): item is string => !!item) : [];
  return {
    model: "h3",
    mode: config.mode,
    prompt: config.prompt,
    steps: config.steps,
    seed: config.seed,
    ratio: config.ratio,
    frames: config.frames,
    scale: config.scale,
    lora: config.lora,
    strength: config.strength,
    dtype: config.dtype,
    triton: config.triton,
    speed: config.speed,
    budget: config.budget,
    sage: config.sage,
    dit_choice: config.ditChoice,
    first_frame: config.mode === "image" ? config.firstFrame ?? "" : "",
    last_frame: config.mode === "image" ? config.lastFrame ?? "" : "",
    references,
    ref_choice: config.refChoice,
    ref_image_size: config.refImageSize,
  };
}

function ltxPayload(config: LTXConfig) {
  return {
    model: "ltx",
    mode: config.mode,
    prompt: config.prompt,
    negative: config.negative,
    width: config.width,
    height: config.height,
    frames: config.frames,
    fps: config.fps,
    steps: config.stepsBase + (config.mode === "text" ? config.stepsRefine : 0),
    steps_base: config.stepsBase,
    steps_refine: config.stepsRefine,
    sampler: config.sampler,
    video_cfg: config.videoCfg,
    audio_cfg: config.audioCfg,
    seed: config.seed,
    budget: config.budget,
    first_frame: config.mode === "text" ? "" : config.firstFrame ?? "",
    last_frame: config.mode === "firstlast" ? config.lastFrame ?? "" : "",
  };
}

export function payloadFor(model: ModelId, h3: H3Config, ltx: LTXConfig) {
  return model === "ltx" ? ltxPayload(ltx) : h3Payload(h3);
}

export const api = {
  status: () => request<BackendStatus>("/h3/status"),
  jobs: () => request<{ jobs: Job[] }>("/h3/jobs"),
  generate: (model: ModelId, h3: H3Config, ltx: LTXConfig) =>
    request<{ id: string }>("/h3/generate", post(payloadFor(model, h3, ltx))),
  loras: () => request<{ loras: string[] }>("/h3/loras"),
  addLora: (url: string) => request<{ name: string }>("/h3/lora", post({ url })),
  log: () => request<{ text: string }>("/h3/log"),
  setupState: () => request<{ state: Record<string, boolean> }>("/h3/setup"),
  applySetup: (flags: Record<string, boolean>) =>
    request<{ rows: [string, string][] }>("/h3/setup", post(flags)),
  installSage: () => request<{ rows: [string, string][] }>("/h3/setup/sage", post({})),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ value: string }>("/h3/upload", { method: "POST", body: form });
  },
};
