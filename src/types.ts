export type Section = "run" | "frames" | "setup";

export type Ratio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

export type DType = "safe_fp16" | "fp16_raw" | "bf16" | "fp16safe_node";

export type Speed = "none" | "4-step" | "Spectrum";

export interface RunConfig {
  prompt: string;
  ratio: Ratio;
  scale: number;
  frames: number;
  steps: number;
  seed: number;
  lora: string;
  strength: number;
  dtype: DType;
  sage: boolean;
  triton: boolean;
  speed: Speed;
  budget: number;
  firstFrame: string | null;
  lastFrame: string | null;
}

export const defaultConfig: RunConfig = {
  prompt:
    "A locked-off medium shot of a red rubber ball bouncing three times on a wooden floor in a quiet empty room. Each impact produces a clear synchronized rubber thump. Natural daylight, simple background, no camera movement, no dialogue.",
  ratio: "16:9",
  scale: 100,
  frames: 124,
  steps: 6,
  seed: 42,
  lora: "minimax_h3_turbo_v4_step600_ema",
  strength: 1,
  dtype: "safe_fp16",
  sage: true,
  triton: true,
  speed: "4-step",
  budget: 75,
  firstFrame: null,
  lastFrame: null,
};

export const LORA_CHOICES = [
  "off",
  "minimax_h3_turbo_v4_step600_ema",
  "minimax_h3_turbo_4step_ema_ckpt850",
];

const BASE_DIMS: Record<Ratio, [number, number]> = {
  "16:9": [864, 480],
  "9:16": [480, 864],
  "1:1": [640, 640],
  "4:3": [736, 544],
  "3:4": [544, 736],
};

export function dimsFor(config: RunConfig): string {
  const [width, height] = BASE_DIMS[config.ratio];
  const scale = config.scale / 100;
  const w = Math.max(256, Math.round((width * scale) / 32) * 32);
  const h = Math.max(256, Math.round((height * scale) / 32) * 32);
  return `${w}×${h}`;
}
