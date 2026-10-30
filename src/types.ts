export type Section = "run" | "frames" | "setup";

export type ModelId = "h3" | "ltx";

export type Ratio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export type DType = "safe_fp16" | "fp16_raw" | "bf16" | "fp16safe_node";

export type Speed = "none" | "4-step" | "Spectrum";

export type H3Mode = "text" | "image" | "reference";

export type LTXMode = "text" | "image" | "firstlast";

export type LTXSampler = "euler_ancestral" | "euler" | "res_multistep" | "dpmpp_2m";

export interface H3Config {
  prompt: string;
  mode: H3Mode;
  ratio: Ratio;
  scale: number;
  frames: number;
  steps: number;
  seed: number;
  ditChoice: string;
  lora: string;
  strength: number;
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
  width: number;
  height: number;
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
  firstFrame: string | null;
  lastFrame: string | null;
}

export const defaultH3Config: H3Config = {
  prompt:
    "A locked-off medium shot of a red rubber ball bouncing three times on a wooden floor in a quiet empty room. Each impact produces a clear synchronized rubber thump. Natural daylight, simple background, no camera movement, no dialogue.",
  mode: "text",
  ratio: "16:9",
  scale: 100,
  frames: 124,
  steps: 6,
  seed: 42,
  ditChoice: "abiray_Q3_K_M",
  lora: "minimax_h3_turbo_v4_step600_ema",
  strength: 1,
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
  width: 640,
  height: 384,
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
export const LTX_WIDTHS = [512, 576, 640, 704, 768, 832, 896, 960, 1024];
export const LTX_HEIGHTS = [256, 320, 384, 448, 512];

const BASE_DIMS: Record<Ratio, [number, number]> = {
  "16:9": [864, 480],
  "9:16": [480, 864],
  "1:1": [640, 640],
  "4:3": [736, 544],
  "3:4": [544, 736],
};

export function dimsFor(config: H3Config): string {
  const [width, height] = BASE_DIMS[config.ratio];
  const scale = config.scale / 100;
  const w = Math.max(256, Math.round((width * scale) / 32) * 32);
  const h = Math.max(256, Math.round((height * scale) / 32) * 32);
  return `${w}×${h}`;
}

export function ltxDimsFor(config: LTXConfig): string {
  return `${config.width}×${config.height}`;
}

export function modeLabel(model: ModelId, mode: H3Mode | LTXMode): string {
  if (mode === "firstlast") return "First+Last";
  if (mode === "reference") return "Reference";
  return mode === "image" ? "Image" : "Text";
}
