import { useEffect, useState } from "react";
import { ImagePlus, Sparkles } from "lucide-react";
import LoraEditor from "./LoraEditor";
import ResolutionField from "./ResolutionField";
import { Section, Segmented, Select, SliderRow, ToggleRow } from "./controls";
import type { BackendStatus } from "../api";
import {
  H3_DIT_CHOICES,
  H3_REF_CHOICES,
  H3_REF_IMAGE_SIZES,
  H3_RESOLUTIONS,
  H3_WEIGHTS_GIB,
  LTX_RESOLUTIONS,
  LTX_SAMPLERS,
  LTX_WEIGHTS_GIB,
  VRAM_ADVISORY_AREA,
  VRAM_RESERVE_GIB,
  dimsForResolution,
  h3Size,
  ltxSize,
  vramNeedGiB,
  w4a8T4GeometryBlocked,
  type DType,
  type H3Config,
  type LTXConfig,
  type LTXSampler,
  type ModelId,
  type Ratio,
  type ResolutionPreset,
  type Speed,
} from "../types";

function VramCheck({
  need,
  total,
  largest,
  advisory,
}: {
  need: number;
  total: number | null;
  largest: ResolutionPreset | null;
  advisory: boolean;
}) {
  if (total === null) return null;
  const budget = total - VRAM_RESERVE_GIB;
  const over = need > budget;
  if (!over) {
    return (
      <p className="text-[10.5px] leading-relaxed tabular-nums text-faint">
        ≈{need.toFixed(1)} GiB of the {total.toFixed(1)} GiB this GPU has.
      </p>
    );
  }
  if (advisory) {
    return (
      <p className="text-[10.5px] leading-relaxed tabular-nums text-amber-600 dark:text-amber-400">
        ≈{need.toFixed(1)} GiB estimated at this geometry; this GPU has {total.toFixed(1)} GiB.
        Up to 720p is allowed through — it may spill to system RAM or OOM, so watch the
        Console tab. Preview remains the tested T4 default.
      </p>
    );
  }
  return (
    <p className="text-[10.5px] leading-relaxed tabular-nums text-red-500 dark:text-red-400">
      ≈{need.toFixed(1)} GiB of VRAM needed at this geometry; this GPU has {total.toFixed(1)} GiB.
      The job is refused before it starts
      {largest ? ` — largest preset that fits: ${largest.label}.` : "."}
      {!largest ? " — shorten the clip or use a bigger GPU." : ""}
    </p>
  );
}

const H3_TABS = ["Video", "Adjustment", "Animation"] as const;
const LTX_TABS = ["Video", "Sampling"] as const;
type Tab = (typeof H3_TABS)[number] | (typeof LTX_TABS)[number];

const RATIOS: readonly Ratio[] = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const DTYPES = ["safe fp16", "fp16", "bf16", "node"] as const;
const SPEEDS: readonly Speed[] = ["none", "4-step", "Spectrum"];

const DTYPE_TO_LABEL: Record<DType, (typeof DTYPES)[number]> = {
  safe_fp16: "safe fp16",
  fp16_raw: "fp16",
  bf16: "bf16",
  fp16safe_node: "node",
};
const LABEL_TO_DTYPE: Record<(typeof DTYPES)[number], DType> = {
  "safe fp16": "safe_fp16",
  fp16: "fp16_raw",
  bf16: "bf16",
  node: "fp16safe_node",
};

export default function RightPanel({
  model,
  h3,
  ltx,
  patchH3,
  patchLTX,
  loras,
  onAddLora,
  online,
  status,
  onGenerate,
}: {
  model: ModelId;
  h3: H3Config;
  ltx: LTXConfig;
  patchH3: (partial: Partial<H3Config>) => void;
  patchLTX: (partial: Partial<LTXConfig>) => void;
  loras: string[];
  onAddLora: (url: string) => Promise<string>;
  online: boolean;
  status: BackendStatus | null;
  onGenerate: () => Promise<string>;
}) {
  const isH3 = model === "h3";
  const tabs = isH3 ? H3_TABS : LTX_TABS;
  const [tab, setTab] = useState<Tab>("Video");
  const [open, setOpen] = useState<Record<string, boolean>>({
    sampling: true,
    geometry: true,
    seed: true,
    loras: true,
    model: false,
    precision: true,
    accel: true,
    budget: false,
    keyframes: true,
  });
  const [genBusy, setGenBusy] = useState(false);
  const [genNote, setGenNote] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (id: string) => setOpen((state) => ({ ...state, [id]: !state[id] }));

  // Same preflight the notebook runs server-side, so an impossible geometry is visible
  // (and unclickable) before a job spends minutes loading the model.
  const presets = isH3 ? H3_RESOLUTIONS : LTX_RESOLUTIONS;
  const align = isH3 ? 32 : 64;
  const ratio = isH3 ? h3.ratio : ltx.ratio;
  const frames = isH3 ? h3.frames : ltx.frames;
  const [geomWidth, geomHeight] = isH3 ? h3Size(h3) : ltxSize(ltx);
  const weights = isH3
    ? (H3_WEIGHTS_GIB[h3.mode === "reference" ? h3.refChoice : h3.ditChoice] ?? 8.85)
    : LTX_WEIGHTS_GIB;
  const vramTotal = status?.vram_total_mib ? status.vram_total_mib / 1024 : null;
  const vramNeed = vramNeedGiB(weights, geomWidth, geomHeight, frames);
  let largestFit: ResolutionPreset | null = null;
  if (vramTotal !== null) {
    for (const preset of presets) {
      const [width, height] = dimsForResolution(preset, ratio, align);
      if (vramNeedGiB(weights, width, height, frames) <= vramTotal - VRAM_RESERVE_GIB) {
        largestFit = preset;
      }
    }
  }
  const overBudget =
    vramTotal !== null && vramNeed > vramTotal - VRAM_RESERVE_GIB;
  // 720p and below only warns; above 720p the preflight refuses the job.
  const overBudgetAdvisory = geomWidth * geomHeight <= VRAM_ADVISORY_AREA;
  // Native W4A8 checkpoints only load through the 0.43.2 base stack.
  const selectedH3Model = h3.mode === "reference" ? h3.refChoice : h3.ditChoice;
  const needsW4A8 = isH3 && selectedH3Model.toLowerCase().includes("w4a8");
  const nativeW4A8Blocked =
    needsW4A8 &&
    w4a8T4GeometryBlocked(weights, geomWidth, geomHeight, frames, vramTotal);
  const blocked = (overBudget && !overBudgetAdvisory) || nativeW4A8Blocked;
  const activationNeed = Math.max(0, vramNeed - weights);
  const blockReason = nativeW4A8Blocked
    ? `Native W4A8 on a ${vramTotal?.toFixed(1)} GiB GPU: this checkpoint is ${weights.toFixed(1)} GiB resident and this geometry needs ≈${activationNeed.toFixed(1)} GiB of activations. Use Draft (640×384) with 22–39 frames and LoRA off, or a ≥24 GB GPU.`
    : overBudget
      ? `This geometry needs ≈${vramNeed.toFixed(1)} GiB; the GPU reports ${vramTotal?.toFixed(1)} GiB${overBudgetAdvisory ? " (720p is allowed through; it may OOM)" : ""}`
      : undefined;
  const olderStack =
    needsW4A8 && !!status?.version && !status.version.startsWith("0.43");

  useEffect(() => {
    setTab("Video");
  }, [model]);

  // TenStrip's 14 GB file is turbo-baked and cannot fit Preview's activation
  // budget on a T4. Selecting it moves the form to the smallest geometry that
  // streams, drops the redundant turbo LoRA, and uses the model card's few-step
  // range. The backend repeats both rules so stale clients cannot bypass them.
  const chooseDit = (value: string) => {
    if (value === "tenstrip_turbo_w4a8") {
      patchH3({
        ditChoice: value,
        resolution: "draft",
        frames: 39,
        steps: 4,
        speed: "none",
        loras: h3.loras.filter((entry) => !entry.name.toLowerCase().includes("turbo")),
      });
      return;
    }
    patchH3({ ditChoice: value });
  };

  const chooseRef = (value: string) => {
    if (value === "tenstrip_w4a8") {
      patchH3({
        refChoice: value,
        resolution: "draft",
        frames: 39,
        steps: 6,
        speed: "none",
      });
      return;
    }
    patchH3({ refChoice: value });
  };

  const generate = async () => {
    setGenBusy(true);
    setGenNote(null);
    try {
      const id = await onGenerate();
      setGenNote({ ok: true, text: `queued · ${id}` });
    } catch (exc) {
      setGenNote({ ok: false, text: exc instanceof Error ? exc.message : String(exc) });
    } finally {
      setGenBusy(false);
    }
  };

  return (
    <aside className="flex w-[304px] shrink-0 flex-col rounded-2xl border border-line bg-surface p-3">
      <div className="pb-3">
        <div className="flex items-center gap-1 rounded-full bg-chip p-1">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`min-w-0 flex-1 truncate rounded-full px-2 py-1.5 text-[11.5px] font-medium transition-colors ${
                tab === item
                  ? "bg-elev text-ink shadow-[0_1px_2px_rgba(0,0,0,0.07)]"
                  : "text-soft hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
        {isH3 ? (
          <>
            {tab === "Video" ? (
              <>
                <Section
                  title="Sampling"
                  open={!!open.sampling}
                  onToggle={() => toggle("sampling")}
                >
                  <SliderRow
                    label="Steps"
                    value={h3.steps}
                    min={1}
                    max={40}
                    onChange={(value) => patchH3({ steps: value })}
                    display={(value) => String(value)}
                  />
                  <ToggleRow
                    label="SageAttention"
                    checked={h3.sage}
                    onChange={(value) => patchH3({ sage: value })}
                  />
                </Section>
                <Section
                  title="Geometry"
                  open={!!open.geometry}
                  onToggle={() => toggle("geometry")}
                  info
                >
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">Aspect ratio</span>
                    <Segmented
                      options={RATIOS}
                      value={h3.ratio}
                      onChange={(value) => patchH3({ ratio: value })}
                      size="sm"
                    />
                  </div>
                  <ResolutionField
                    presets={H3_RESOLUTIONS}
                    ratio={h3.ratio}
                    align={32}
                    value={h3.resolution}
                    onChange={(id) => patchH3({ resolution: id })}
                    stage={() => "native single pass — H3 renders at the picked size, no upscale stage"}
                    hint="H3 renders natively and needs multiples of 32. Preview (864×480) is the tested T4 default; up to 720p runs with a warning, 1080p/2K are refused. Native W4A8 on a T4 is limited to Draft because the checkpoint leaves no activation headroom."
                  />
                  <VramCheck
                    need={vramNeed}
                    total={vramTotal}
                    largest={largestFit}
                    advisory={overBudgetAdvisory}
                  />
                  {nativeW4A8Blocked ? (
                    <p className="text-[10.5px] leading-relaxed text-red-500 dark:text-red-400">
                      Native W4A8 is {weights.toFixed(1)} GiB resident and this geometry
                      needs ≈{activationNeed.toFixed(1)} GiB of activations. The T4 has
                      only ~13.3 GiB addressable after ComfyUI's CUDA context, so
                      sampling would be OOM-killed. Pick Draft 640×384 with 22–39 frames
                      and LoRA off, or use a ≥24 GB GPU.
                    </p>
                  ) : null}
                  <SliderRow
                    label="Frames"
                    value={h3.frames}
                    min={22}
                    max={124}
                    step={17}
                    onChange={(value) => patchH3({ frames: value })}
                    display={(value) => `${value}f`}
                  />
                </Section>
                <Section title="Model" open={!!open.model} onToggle={() => toggle("model")}>
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">DiT (GGUF / W4A8)</span>
                    <Select
                      value={h3.ditChoice}
                      options={[...H3_DIT_CHOICES]}
                      onChange={chooseDit}
                    />
                  </div>
                  {h3.mode === "reference" ? (
                    <>
                      <div className="space-y-2">
                        <span className="text-[12px] font-medium text-soft">Ref2VA (GGUF / W4A8)</span>
                        <Select
                          value={h3.refChoice}
                          options={[...H3_REF_CHOICES]}
                          onChange={chooseRef}
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-[12px] font-medium text-soft">Ref image size</span>
                        <Segmented
                          options={H3_REF_IMAGE_SIZES}
                          value={h3.refImageSize}
                          onChange={(value) => patchH3({ refImageSize: value })}
                          size="sm"
                        />
                      </div>
                      <p className="text-[11px] leading-relaxed text-faint">
                        match scales each reference to the generation's pixel area; max keeps
                        the 2048px short edge for stronger identity at a much higher token
                        cost.
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-faint">
                      Q3_K_M fits the 0.4 gear on a T4; Q4_K_M is sharper but OOMs at long
                      clips. kijai_w4a8 is a 12.5 GB native W4A8 safetensors quant: it loads
                      through ComfyUI's own loader and needs the tightest VRAM budget.
                      tenstrip_turbo_w4a8 is a 14 GB W4A8 hybrid with the turbo delta fused
                      in: selecting it moves to Draft 640×384, 39 frames, 4 steps and
                      drops the turbo LoRA. On a T4 the 14 GB checkpoint streams with
                      almost no headroom, so larger geometries are refused before encode;
                      kijai_w4a8 (12.5 GB) is the T4-verified W4A8 choice. W4A8 needs the
                      0.43.2 base stack; GGUF runs on 0.33.0.
                    </p>
                  )}
                  {needsW4A8 ? (
                    <p
                      className={`text-[10.5px] leading-relaxed ${
                        olderStack
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-faint"
                      }`}
                    >
                      W4A8 checkpoints need the 0.43.2 base stack — set{" "}
                      <span className="font-medium text-soft">COMFY_STACK</span> to{" "}
                      <span className="font-medium text-soft">"0.43.2 (W4A8)"</span> in
                      notebook cell 01.
                      {olderStack
                        ? ` This server is running ComfyUI ${status?.version}, so the next job will be refused.`
                        : ""}
                    </p>
                  ) : null}
                </Section>
                <Section title="Seed & LoRA" open={!!open.seed} onToggle={() => toggle("seed")}>
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">Seed</span>
                    <input
                      type="number"
                      value={h3.seed}
                      onChange={(event) => patchH3({ seed: Number(event.target.value) })}
                      className="w-full rounded-lg border border-line bg-chip/60 px-2.5 py-1.5 text-[12px] text-ink tabular-nums outline-none transition-colors focus:border-edge"
                    />
                  </div>
                  {h3.mode === "reference" ? (
                    <p className="text-[11px] leading-relaxed text-faint">
                      Reference mode runs the separate Ref2VA model with res_multistep and no
                      turbo LoRA. 12–24 steps are recommended.
                    </p>
                  ) : (
                    <>
                      <span className="text-[12px] font-medium text-soft">LoRA stack</span>
                      <LoraEditor
                        value={h3.loras}
                        options={loras}
                        onChange={(next) => patchH3({ loras: next })}
                        online={online}
                        onAddLora={onAddLora}
                        hint="Chained in order on the H3 DiT — turbo-format LoRAs use the H3 turbo node, ComfyUI-format ones the standard loader. Turbo LoRAs are dropped automatically on turbo-baked checkpoints."
                      />
                    </>
                  )}
                </Section>
              </>
            ) : null}

            {tab === "Adjustment" ? (
              <>
                <Section
                  title="Precision"
                  open={!!open.precision}
                  onToggle={() => toggle("precision")}
                >
                  <Segmented
                    options={DTYPES}
                    value={DTYPE_TO_LABEL[h3.dtype]}
                    onChange={(value) => patchH3({ dtype: LABEL_TO_DTYPE[value] })}
                    size="sm"
                  />
                  <ToggleRow
                    label="Triton attention kernels"
                    checked={h3.triton}
                    onChange={(value) => patchH3({ triton: value })}
                  />
                </Section>
                <Section
                  title="Acceleration"
                  open={!!open.accel}
                  onToggle={() => toggle("accel")}
                >
                  <Segmented
                    options={SPEEDS}
                    value={h3.speed}
                    onChange={(value) => patchH3({ speed: value })}
                    size="sm"
                  />
                  <p className="text-[11px] leading-relaxed text-faint">
                    The 4-step profile pairs a turbo LoRA with few steps; Spectrum trades a
                    little quality for another 15–20%.
                  </p>
                </Section>
                <Section title="Budget" open={!!open.budget} onToggle={() => toggle("budget")}>
                  <SliderRow
                    label="Max runtime"
                    value={h3.budget}
                    min={15}
                    max={120}
                    step={5}
                    onChange={(value) => patchH3({ budget: value })}
                    display={(value) => `${value}m`}
                  />
                </Section>
              </>
            ) : null}

            {tab === "Animation" ? (
              <Section
                title="Keyframes"
                open={!!open.keyframes}
                onToggle={() => toggle("keyframes")}
              >
                <div className="grid grid-cols-2 gap-2">
                  {(["firstFrame", "lastFrame"] as const).map((slot) => (
                    <div
                      key={slot}
                      className={`grid h-20 place-items-center rounded-xl ${
                        h3[slot] ? "thumb" : "border border-dashed border-edge bg-chip/40"
                      }`}
                    >
                      <span className="flex flex-col items-center gap-1 text-faint">
                        {h3[slot] ? null : <ImagePlus size={14} />}
                        <span className="text-[10px] font-medium">
                          {slot === "firstFrame" ? "First" : "Last"}
                        </span>
                        <span className="max-w-[100px] truncate text-[9.5px]">
                          {h3[slot] ? "staged" : "empty"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-faint">
                  Upload real frames in the Frames tab. Image mode uses the first frame alone
                  or interpolates between both with synchronized audio.
                </p>
              </Section>
            ) : null}
          </>
        ) : (
          <>
            {tab === "Video" ? (
              <>
                <Section
                  title="Geometry"
                  open={!!open.geometry}
                  onToggle={() => toggle("geometry")}
                  info
                >
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">Aspect ratio</span>
                    <Segmented
                      options={RATIOS}
                      value={ltx.ratio}
                      onChange={(value) => patchLTX({ ratio: value })}
                      size="sm"
                    />
                  </div>
                  <ResolutionField
                    presets={LTX_RESOLUTIONS}
                    ratio={ltx.ratio}
                    align={64}
                    value={ltx.resolution}
                    onChange={(id) => patchLTX({ resolution: id })}
                    stage={(width, height) => `base ${width / 2}×${height / 2} → x2 refine`}
                    hint="LTX renders a half-res base then x2-refines, so these are final sizes; it needs multiples of 64. Preview (640×384) is the tested T4 default; up to 720p runs with a warning, 1080p/2K need a bigger GPU."
                  />
                  <VramCheck
                    need={vramNeed}
                    total={vramTotal}
                    largest={largestFit}
                    advisory={overBudgetAdvisory}
                  />
                  <SliderRow
                    label="Frames"
                    value={ltx.frames}
                    min={9}
                    max={361}
                    step={8}
                    onChange={(value) => patchLTX({ frames: value })}
                    display={(value) => `${value}f`}
                  />
                  <SliderRow
                    label="FPS"
                    value={ltx.fps}
                    min={8}
                    max={30}
                    onChange={(value) => patchLTX({ fps: value })}
                    display={(value) => String(value)}
                  />
                </Section>
                <Section title="Seed & Prompt" open={!!open.seed} onToggle={() => toggle("seed")}>
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">Seed</span>
                    <input
                      type="number"
                      value={ltx.seed}
                      onChange={(event) => patchLTX({ seed: Number(event.target.value) })}
                      className="w-full rounded-lg border border-line bg-chip/60 px-2.5 py-1.5 text-[12px] text-ink tabular-nums outline-none transition-colors focus:border-edge"
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">Negative prompt</span>
                    <textarea
                      value={ltx.negative}
                      onChange={(event) => patchLTX({ negative: event.target.value })}
                      rows={3}
                      spellCheck={false}
                      placeholder="empty is fine for the distilled model"
                      className="w-full resize-none rounded-lg border border-line bg-chip/60 p-2.5 text-[12px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-edge"
                    />
                  </div>
                </Section>
                <Section title="LoRA stack" open={!!open.loras} onToggle={() => toggle("loras")}>
                  <LoraEditor
                    value={ltx.loras}
                    options={loras}
                    onChange={(next) => patchLTX({ loras: next })}
                    online={online}
                    onAddLora={onAddLora}
                    hint="Chained on the LTX DiT for base, refine and guide passes; downloads land in ComfyUI/models/loras."
                  />
                </Section>
              </>
            ) : null}

            {tab === "Sampling" ? (
              <>
                <Section
                  title="Schedule"
                  open={!!open.sampling}
                  onToggle={() => toggle("sampling")}
                >
                  <SliderRow
                    label="Base steps"
                    value={ltx.stepsBase}
                    min={2}
                    max={20}
                    onChange={(value) => patchLTX({ stepsBase: value })}
                    display={(value) => String(value)}
                  />
                  <SliderRow
                    label="Refine steps"
                    value={ltx.stepsRefine}
                    min={1}
                    max={12}
                    onChange={(value) => patchLTX({ stepsRefine: value })}
                    display={(value) => String(value)}
                  />
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">Sampler</span>
                    <Select
                      value={ltx.sampler}
                      options={[...LTX_SAMPLERS]}
                      onChange={(value) => patchLTX({ sampler: value as LTXSampler })}
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-faint">
                    The distilled schedule is tuned for 8 base + 3 refine steps. Refine only
                    runs in Text mode (Image and First+Last are single-stage).
                  </p>
                </Section>
                <Section title="Guidance" open={!!open.accel} onToggle={() => toggle("accel")}>
                  <SliderRow
                    label="Video CFG"
                    value={ltx.videoCfg}
                    min={0}
                    max={3}
                    step={0.05}
                    onChange={(value) => patchLTX({ videoCfg: value })}
                    display={(value) => value.toFixed(2)}
                  />
                  <SliderRow
                    label="Audio CFG"
                    value={ltx.audioCfg}
                    min={0}
                    max={3}
                    step={0.05}
                    onChange={(value) => patchLTX({ audioCfg: value })}
                    display={(value) => value.toFixed(2)}
                  />
                  <p className="text-[11px] leading-relaxed text-faint">
                    1.00 / 1.00 matches the official distilled workflow.
                  </p>
                </Section>
                <Section title="Budget" open={!!open.budget} onToggle={() => toggle("budget")}>
                  <SliderRow
                    label="Max runtime"
                    value={ltx.budget}
                    min={15}
                    max={120}
                    step={5}
                    onChange={(value) => patchLTX({ budget: value })}
                    display={(value) => `${value}m`}
                  />
                </Section>
              </>
            ) : null}
          </>
        )}
      </div>

      <button
        type="button"
        disabled={!online || genBusy || blocked}
        title={blockReason}
        onClick={() => void generate()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[13px] font-medium text-primary-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Sparkles size={14} />
        {genBusy
          ? "Queueing…"
          : !online
            ? "Backend offline"
            : nativeW4A8Blocked
              ? "W4A8 won't fit this GPU"
              : blocked
                ? "Doesn't fit this GPU"
                : overBudget
                  ? "Generate anyway"
                  : "Generate"}
      </button>
      {genNote ? (
        <p
          className={`pt-2 text-center text-[11px] ${
            genNote.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-500 dark:text-red-400"
          }`}
        >
          {genNote.text}
        </p>
      ) : null}
    </aside>
  );
}
