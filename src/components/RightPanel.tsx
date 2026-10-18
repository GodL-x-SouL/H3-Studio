import { useState } from "react";
import { ImagePlus, Sparkles } from "lucide-react";
import { Section, Segmented, Select, SliderRow, ToggleRow } from "./controls";
import { type DType, type Ratio, type RunConfig, type Speed } from "../types";

const TABS = ["Video", "Adjustment", "Animation"] as const;
type Tab = (typeof TABS)[number];

const RATIOS: readonly Ratio[] = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const DTYPES = ["safe fp16", "fp16", "bf16", "node"] as const;
const SPEEDS: readonly Speed[] = ["none", "4-step", "TE-Speed", "Spectrum"];

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
  config,
  patch,
  loras,
  onAddLora,
  online,
  onGenerate,
}: {
  config: RunConfig;
  patch: (partial: Partial<RunConfig>) => void;
  loras: string[];
  onAddLora: (url: string) => Promise<string>;
  online: boolean;
  onGenerate: () => Promise<string>;
}) {
  const [tab, setTab] = useState<Tab>("Video");
  const [open, setOpen] = useState<Record<string, boolean>>({
    sampling: true,
    geometry: true,
    seed: true,
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

  const downloadLora = async () => {
    const url = loraUrl.trim();
    if (!url) return;
    setLoraBusy(true);
    setLoraNote(null);
    try {
      const name = await onAddLora(url);
      patch({ lora: name });
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
          {TABS.map((item) => (
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
        {tab === "Video" ? (
          <>
            <Section
              title="Sampling"
              open={!!open.sampling}
              onToggle={() => toggle("sampling")}
            >
              <SliderRow
                label="Steps"
                value={config.steps}
                min={1}
                max={40}
                onChange={(value) => patch({ steps: value })}
                display={(value) => String(value)}
              />
              <ToggleRow
                label="SageAttention"
                checked={config.sage}
                onChange={(value) => patch({ sage: value })}
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
                value={config.ratio}
                onChange={(value) => patch({ ratio: value })}
                size="sm"
              />
              <SliderRow
                label="Frames"
                value={config.frames}
                min={22}
                max={124}
                step={17}
                onChange={(value) => patch({ frames: value })}
                display={(value) => `${value}f`}
              />
              <SliderRow
                label="Scale"
                value={config.scale}
                min={50}
                max={100}
                onChange={(value) => patch({ scale: value })}
                display={(value) => `${value}%`}
              />
            </Section>
            <Section title="Seed & LoRA" open={!!open.seed} onToggle={() => toggle("seed")}>
              <div className="space-y-2">
                <span className="text-[12px] font-medium text-soft">Seed</span>
                <input
                  type="number"
                  value={config.seed}
                  onChange={(event) => patch({ seed: Number(event.target.value) })}
                  className="w-full rounded-lg border border-line bg-chip/60 px-2.5 py-1.5 text-[12px] text-ink tabular-nums outline-none transition-colors focus:border-edge"
                />
              </div>
              <div className="space-y-2">
                <span className="text-[12px] font-medium text-soft">Turbo LoRA</span>
                <Select
                  value={config.lora}
                  options={loras}
                  onChange={(value) => patch({ lora: value })}
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
                    Downloads into ComfyUI/models/loras on the Colab VM and lands in the
                    dropdown above.
                  </p>
                )}
              </div>
              <SliderRow
                label="Strength"
                value={config.strength}
                min={0}
                max={2}
                step={0.05}
                onChange={(value) => patch({ strength: value })}
                display={(value) => value.toFixed(2)}
              />
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
                value={DTYPE_TO_LABEL[config.dtype]}
                onChange={(value) => patch({ dtype: LABEL_TO_DTYPE[value] })}
                size="sm"
              />
              <ToggleRow
                label="Triton attention kernels"
                checked={config.triton}
                onChange={(value) => patch({ triton: value })}
              />
            </Section>
            <Section title="Acceleration" open={!!open.accel} onToggle={() => toggle("accel")}>
              <Segmented
                options={SPEEDS}
                value={config.speed}
                onChange={(value) => patch({ speed: value })}
                size="sm"
              />
              <p className="text-[11px] leading-relaxed text-faint">
                The 4-step profile pairs a turbo LoRA with few steps; TE-Speed and Spectrum
                trade a little quality for another 15–20%.
              </p>
            </Section>
            <Section title="Budget" open={!!open.budget} onToggle={() => toggle("budget")}>
              <SliderRow
                label="Max runtime"
                value={config.budget}
                min={15}
                max={120}
                step={5}
                onChange={(value) => patch({ budget: value })}
                display={(value) => `${value}m`}
              />
            </Section>
          </>
        ) : null}

        {tab === "Animation" ? (
          <>
            <Section
              title="Keyframes"
              open={!!open.keyframes}
              onToggle={() => toggle("keyframes")}
            >
              <div className="grid grid-cols-2 gap-2">
                {(["firstFrame", "lastFrame"] as const).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() =>
                      patch({ [slot]: config[slot] ? null : `${slot}.png` } as Partial<RunConfig>)
                    }
                    className={`grid h-20 place-items-center rounded-xl transition-colors ${
                      config[slot]
                        ? "thumb"
                        : "border border-dashed border-edge bg-chip/40 hover:bg-chip"
                    }`}
                  >
                    {config[slot] ? null : (
                      <span className="flex flex-col items-center gap-1 text-faint">
                        <ImagePlus size={14} />
                        <span className="text-[10px] font-medium">
                          {slot === "firstFrame" ? "First" : "Last"}
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-faint">
                Upload real frames in the Frames tab; the model interpolates between them
                with synchronized audio when both are set.
              </p>
            </Section>
          </>
        ) : null}
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
