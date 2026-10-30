import { useEffect, useState } from "react";
import { ImagePlus, Sparkles } from "lucide-react";
import { Section, Segmented, Select, SliderRow, ToggleRow } from "./controls";
import {
  H3_DIT_CHOICES,
  H3_REF_CHOICES,
  H3_REF_IMAGE_SIZES,
  LTX_HEIGHTS,
  LTX_SAMPLERS,
  LTX_WIDTHS,
  type DType,
  type H3Config,
  type LTXConfig,
  type LTXSampler,
  type ModelId,
  type Ratio,
  type Speed,
} from "../types";

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
  onGenerate: () => Promise<string>;
}) {
  const isH3 = model === "h3";
  const tabs = isH3 ? H3_TABS : LTX_TABS;
  const [tab, setTab] = useState<Tab>("Video");
  const [open, setOpen] = useState<Record<string, boolean>>({
    sampling: true,
    geometry: true,
    seed: true,
    model: false,
    precision: true,
    accel: true,
    budget: false,
    keyframes: true,
  });
  const [loraUrl, setLoraUrl] = useState("");
  const [loraBusy, setLoraBusy] = useState(false);
  const [loraNote, setLoraNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genNote, setGenNote] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (id: string) => setOpen((state) => ({ ...state, [id]: !state[id] }));

  useEffect(() => {
    setTab("Video");
  }, [model]);

  const downloadLora = async () => {
    const url = loraUrl.trim();
    if (!url) return;
    setLoraBusy(true);
    setLoraNote(null);
    try {
      const name = await onAddLora(url);
      patchH3({ lora: name });
      setLoraUrl("");
      setLoraNote({ ok: true, text: `${name} added — selected in the dropdown` });
    } catch (exc) {
      setLoraNote({ ok: false, text: exc instanceof Error ? exc.message : String(exc) });
    } finally {
      setLoraBusy(false);
    }
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
                  <Segmented
                    options={RATIOS}
                    value={h3.ratio}
                    onChange={(value) => patchH3({ ratio: value })}
                    size="sm"
                  />
                  <SliderRow
                    label="Frames"
                    value={h3.frames}
                    min={22}
                    max={124}
                    step={17}
                    onChange={(value) => patchH3({ frames: value })}
                    display={(value) => `${value}f`}
                  />
                  <SliderRow
                    label="Scale"
                    value={h3.scale}
                    min={50}
                    max={100}
                    onChange={(value) => patchH3({ scale: value })}
                    display={(value) => `${value}%`}
                  />
                </Section>
                <Section title="Model" open={!!open.model} onToggle={() => toggle("model")}>
                  <div className="space-y-2">
                    <span className="text-[12px] font-medium text-soft">DiT (GGUF)</span>
                    <Select
                      value={h3.ditChoice}
                      options={[...H3_DIT_CHOICES]}
                      onChange={(value) => patchH3({ ditChoice: value })}
                    />
                  </div>
                  {h3.mode === "reference" ? (
                    <>
                      <div className="space-y-2">
                        <span className="text-[12px] font-medium text-soft">Ref2VA (GGUF)</span>
                        <Select
                          value={h3.refChoice}
                          options={[...H3_REF_CHOICES]}
                          onChange={(value) => patchH3({ refChoice: value })}
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
                      clips.
                    </p>
                  )}
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
                      Reference mode runs the separate Ref2VA GGUF with res_multistep and no
                      turbo LoRA. 12–24 steps are recommended.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <span className="text-[12px] font-medium text-soft">Turbo LoRA</span>
                        <Select
                          value={h3.lora}
                          options={loras}
                          onChange={(value) => patchH3({ lora: value })}
                          placeholder="off"
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-[12px] font-medium text-soft">Custom LoRA</span>
                        <div className="flex items-center gap-2">
                          <input
                            value={loraUrl}
                            onChange={(event) => setLoraUrl(event.target.value)}
                            placeholder="huggingface.co/…/name.safetensors"
                            spellCheck={false}
                            className="min-w-0 flex-1 rounded-lg border border-line bg-chip/60 px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-edge"
                          />
                          <button
                            type="button"
                            disabled={!online || loraBusy}
                            onClick={() => void downloadLora()}
                            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-ink transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {loraBusy ? "…" : "Add"}
                          </button>
                        </div>
                        {loraNote ? (
                          <p
                            className={`text-[11px] leading-relaxed ${
                              loraNote.ok
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-500 dark:text-red-400"
                            }`}
                          >
                            {loraNote.text}
                          </p>
                        ) : (
                          <p className="text-[11px] leading-relaxed text-faint">
                            Downloads into ComfyUI/models/loras on the Colab VM and lands in
                            the dropdown above.
                          </p>
                        )}
                      </div>
                      <SliderRow
                        label="Strength"
                        value={h3.strength}
                        min={0}
                        max={2}
                        step={0.05}
                        onChange={(value) => patchH3({ strength: value })}
                        display={(value) => value.toFixed(2)}
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <span className="text-[12px] font-medium text-soft">Width</span>
                      <Select
                        value={String(ltx.width)}
                        options={LTX_WIDTHS.map(String)}
                        onChange={(value) => patchLTX({ width: Number(value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[12px] font-medium text-soft">Height</span>
                      <Select
                        value={String(ltx.height)}
                        options={LTX_HEIGHTS.map(String)}
                        onChange={(value) => patchLTX({ height: Number(value) })}
                      />
                    </div>
                  </div>
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
                  <p className="text-[11px] leading-relaxed text-faint">
                    Width and height must be multiples of 64. 640×384 is the tested T4 default.
                  </p>
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
        disabled={!online || genBusy}
        onClick={() => void generate()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[13px] font-medium text-primary-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Sparkles size={14} />
        {genBusy ? "Queueing…" : online ? "Generate" : "Backend offline"}
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
