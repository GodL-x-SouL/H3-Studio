export type Section = "run" | "frames" | "setup";

export type ModelId = "h3" | "ltx";

export type Ratio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export type DType = "safe_fp16" | "fp16_raw" | "bf16" | "fp16safe_node";

export type Speed = "none" | "4-step" | "Spectrum";

export type H3Mode = "text" | "image" | "reference";

export type LTXMode = "text" | "image" | "firstlast";

export type LTXSampler = "euler_ancestral" | "euler" | "res_multistep" | "dpmpp_2m";

export interface LoraEntry {
  name: string;
  strength: number;
}

export interface ResolutionPreset {
  id: string;
  label: string;
  /** 16:9 anchor; other ratios keep this pixel area. */
  width: number;
  height: number;
}

export interface H3Config {
  prompt: string;
  mode: H3Mode;
  ratio: Ratio;
  resolution: string;
  frames: number;
  steps: number;
  seed: number;
  ditChoice: string;
  loras: LoraEntry[];
  dtype: DType;
  sage: boolean;
  triton: boolean;
  speed: Speed;
  budget: number;
  firstFrame: string | null;
  lastFrame: string | null;
  references: (string | null)[];
  refChoice: string;
  refImageSize: "match" | "max";
}

export interface LTXConfig {
  prompt: string;
  mode: LTXMode;
  ratio: Ratio;
  resolution: string;
  frames: number;
  fps: number;
  stepsBase: number;
  stepsRefine: number;
  sampler: LTXSampler;
  videoCfg: number;
  audioCfg: number;
  negative: string;
  seed: number;
  budget: number;
  loras: LoraEntry[];
  firstFrame: string | null;
  lastFrame: string | null;
}

export const defaultH3Config: H3Config = {
  prompt:
    "A locked-off medium shot of a red rubber ball bouncing three times on a wooden floor in a quiet empty room. Each impact produces a clear synchronized rubber thump. Natural daylight, simple background, no camera movement, no dialogue.",
  mode: "text",
  ratio: "16:9",
  resolution: "preview",
  frames: 124,
  steps: 6,
  seed: 42,
  ditChoice: "abiray_Q3_K_M",
  loras: [{ name: "minimax_h3_turbo_v4_step600_ema", strength: 1 }],
  dtype: "safe_fp16",
  sage: true,
  triton: true,
  speed: "4-step",
  budget: 75,
  firstFrame: null,
  lastFrame: null,
  references: [null, null, null, null],
  refChoice: "Q3_K_M",
  refImageSize: "match",
};

export const defaultLTXConfig: LTXConfig = {
  prompt:
    "A red fox trots through a snowy pine forest at golden hour, warm sunlight filtering between the trees, visible breath in the cold air, light snow falling, the camera tracks alongside at eye level, cinematic depth of field, natural colors.",
  mode: "text",
  ratio: "16:9",
  resolution: "preview",
  frames: 121,
  fps: 24,
  stepsBase: 8,
  stepsRefine: 3,
  sampler: "euler_ancestral",
  videoCfg: 1,
  audioCfg: 1,
  negative: "",
  seed: 42,
  budget: 20,
  loras: [],
  firstFrame: null,
  lastFrame: null,
};

export const LORA_CHOICES = [
  "off",
  "minimax_h3_turbo_v4_step600_ema",
  "minimax_h3_turbo_4step_ema_ckpt850",
];

export const H3_DIT_CHOICES = ["abiray_Q3_K_M", "abiray_Q4_K_M"];
export const H3_REF_CHOICES = ["Q3_K_M", "Q4_K_M"];
export const H3_REF_IMAGE_SIZES = ["match", "max"] as const;
export const LTX_SAMPLERS: readonly LTXSampler[] = [
  "euler_ancestral",
  "euler",
  "res_multistep",
  "dpmpp_2m",
];
// Both models share one ladder (Draft → 2K) so the selector reads the same; the pixel
// sizes stay model-true. MiniMax H3 renders natively at the picked size, sits on a 32 px
// grid, and its official quality ladder tops out at 2K (2560x1440). Anchors are 16:9;
// other ratios keep the same pixel area and are rounded to 32.
export const H3_RESOLUTIONS: ResolutionPreset[] = [
  { id: "draft", label: "Draft", width: 672, height: 384 },
  { id: "preview", label: "Preview", width: 864, height: 480 },
  { id: "balanced", label: "Balanced", width: 1024, height: 576 },
  { id: "hd", label: "HD", width: 1344, height: 768 },
  { id: "1080p", label: "1080p", width: 1920, height: 1088 },
  { id: "2k", label: "2K", width: 2560, height: 1440 },
];

// LTX-2 renders a half-resolution base and x2-refines, so these are final sizes and must
// stay 64-aligned in this stack. Same labels as H3; LTX tops out at DCI 2K (2048x1152).
export const LTX_RESOLUTIONS: ResolutionPreset[] = [
  { id: "draft", label: "Draft", width: 576, height: 320 },
  { id: "preview", label: "Preview", width: 640, height: 384 },
  { id: "balanced", label: "Balanced", width: 896, height: 512 },
  { id: "hd", label: "HD", width: 1152, height: 640 },
  { id: "1080p", label: "1080p", width: 1920, height: 1088 },
  { id: "2k", label: "2K", width: 2048, height: 1152 },
];

const RATIO_FACTORS: Record<Ratio, [number, number]> = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:3": [4, 3],
  "3:4": [3, 4],
};

export function dimsForResolution(
  preset: ResolutionPreset,
  ratio: Ratio,
  align: number,
): [number, number] {
  if (ratio === "16:9") return [preset.width, preset.height];
  const [rw, rh] = RATIO_FACTORS[ratio];
  const area = preset.width * preset.height;
  const width = Math.max(align, Math.round(Math.sqrt((area * rw) / rh) / align) * align);
  const height = Math.max(align, Math.round(Math.sqrt((area * rh) / rw) / align) * align);
  return [width, height];
}

export function h3Size(config: H3Config): [number, number] {
  const preset =
    H3_RESOLUTIONS.find((item) => item.id === config.resolution) ?? H3_RESOLUTIONS[1];
  return dimsForResolution(preset, config.ratio, 32);
}

export function ltxSize(config: LTXConfig): [number, number] {
  const preset =
    LTX_RESOLUTIONS.find((item) => item.id === config.resolution) ?? LTX_RESOLUTIONS[1];
  return dimsForResolution(preset, config.ratio, 64);
}

export function dimsFor(config: H3Config): string {
  const [width, height] = h3Size(config);
  return `${width}×${height}`;
}

export function ltxDimsFor(config: LTXConfig): string {
  const [width, height] = ltxSize(config);
  return `${width}×${height}`;
}

export function modeLabel(model: ModelId, mode: H3Mode | LTXMode): string {
  if (mode === "firstlast") return "First+Last";
  if (mode === "reference") return "Reference";
  return mode === "image" ? "Image" : "Text";
}

// VRAM preflight. The lab runs on a 15 GiB T4 put both stacks on one line: resident
// weights + ~0.10 GiB per megapixel-frame of activations. Anchors: H3 Q3_K_M at
// 864x480/124f peaked at 13.8 GiB; the LTX 22B UD-Q2_K_XL refine pass at 640x384/121f
// used ~12.4 GiB. The notebook applies the same model server-side before a job starts.
export const VRAM_GIB_PER_MP_FRAME = 0.1;
export const VRAM_RESERVE_GIB = 0.4;

export const H3_WEIGHTS_GIB: Record<string, number> = {
  abiray_Q3_K_M: 8.85,
  abiray_Q4_K_M: 11.33,
  Q3_K_M: 8.85,
  Q4_K_M: 11.33,
};

export const LTX_WEIGHTS_GIB = 9.33;

export function vramNeedGiB(
  weights: number,
  width: number,
  height: number,
  frames: number,
): number {
  return weights + VRAM_GIB_PER_MP_FRAME * ((width * height) / 1_000_000) * Math.max(1, frames);
}
