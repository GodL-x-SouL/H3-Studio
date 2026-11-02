import { useEffect, useRef, useState } from "react";
import {
  ArrowUpDown,
  ImagePlus,
  MoreHorizontal,
  Plus,
  Wand2,
  X,
} from "lucide-react";
import { Switch } from "./controls";
import { api, mediaUrl, type Job } from "../api";
import {
  type H3Config,
  type H3Mode,
  type LTXConfig,
  type LTXMode,
  type ModelId,
  type Section,
} from "../types";

const SETUP_ROWS = [
  { id: "fp16fix", label: "fp16 NaN fix", desc: "required by safe_fp16" },
  { id: "fp16safe", label: "FP16Safe node", desc: "guarded fp16 cast sites" },
  { id: "spectrum", label: "Spectrum", desc: "attention sampling" },
];

const H3_MODES = ["Text", "Image", "Reference"] as const;
const LTX_MODES = ["Text", "Image", "First+Last"] as const;

const H3_MODE_BY_LABEL: Record<(typeof H3_MODES)[number], H3Mode> = {
  Text: "text",
  Image: "image",
  Reference: "reference",
};
const H3_LABEL_BY_MODE: Record<H3Mode, (typeof H3_MODES)[number]> = {
  text: "Text",
  image: "Image",
  reference: "Reference",
};
const LTX_MODE_BY_LABEL: Record<(typeof LTX_MODES)[number], LTXMode> = {
  Text: "text",
  Image: "image",
  "First+Last": "firstlast",
};
const LTX_LABEL_BY_MODE: Record<LTXMode, (typeof LTX_MODES)[number]> = {
  text: "Text",
  image: "Image",
  firstlast: "First+Last",
};

const H3_HINTS: Record<H3Mode, string> = {
  text: "Text-to-video with synchronized audio.",
  image: "Image-to-video; a second (last) frame interpolates between both.",
  reference: "Reference-to-video with <Picture n> tags on the separate Ref2VA model.",
};

const LTX_HINTS: Record<LTXMode, string> = {
  text: "Two-phase text-to-video: half-res base, x2 upsample, full-res refine.",
  image: "First-frame guide at full resolution, single stage.",
  firstlast: "First + last guides at full resolution, single stage.",
};

const DOT: Record<Job["status"], string> = {
  queued: "bg-faint",
  running: "animate-pulse bg-blue-500",
  done: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-amber-500",
};

function PanelHeader({ action, icon }: { action: string; icon: typeof Plus }) {
  const Icon = icon;
  return (
    <div className="flex items-center justify-between pb-3">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-chip2"
      >
        <Icon size={13} />
        {action}
      </button>
      <button
        type="button"
        className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-chip hover:text-ink"
      >
        <ArrowUpDown size={13} />
      </button>
    </div>
  );
}

function DropCard({
  label,
  value,
  onValue,
  online,
  height = "h-24",
}: {
  label: string;
  value: string | null;
  onValue: (value: string | null) => void;
  online: boolean;
  height?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [value]);

  const change = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { value: staged } = await api.upload(file);
      onValue(staged);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setBusy(false);
    }
  };

  const name = value ? value.split("/").pop() : null;
  const preview = mediaUrl(value);

  return (
    <div className="rounded-xl border border-line p-1.5">
      <input ref={input} type="file" accept="image/*" hidden onChange={change} />
      <button
        type="button"
        disabled={busy || (!online && !value)}
        onClick={() => (value ? onValue(null) : input.current?.click())}
        className={`relative grid w-full place-items-center rounded-lg transition-colors ${height} ${
          value ? "thumb" : "border border-dashed border-edge bg-chip/40 hover:bg-chip"
        } ${busy ? "opacity-60" : ""}`}
      >
        {value ? null : (
          <span className="flex flex-col items-center gap-1.5 text-faint">
            <ImagePlus size={16} />
            <span className="text-[11px] font-medium">{busy ? "uploading…" : label}</span>
          </span>
        )}
        {preview && !broken ? (
          <img
            src={preview}
            alt={label}
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full rounded-lg object-cover"
          />
        ) : null}
        {value && broken ? (
          <span className="flex flex-col items-center gap-1.5 px-2 text-faint">
            <ImagePlus size={16} />
            <span className="line-clamp-2 text-[10px] font-medium break-all">
              {name ?? label}
            </span>
          </span>
        ) : null}
        {value ? (
          <span className="absolute right-1.5 bottom-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary/80 text-primary-ink">
            <X size={11} />
          </span>
        ) : null}
      </button>
      <div className="flex items-center justify-between gap-2 px-1 pt-1.5">
        <span className={`truncate text-[11px] font-medium ${error ? "text-red-500" : "text-soft"}`}>
          {error || name || `no ${label.toLowerCase()}`}
        </span>
        <MoreHorizontal size={13} className="shrink-0 text-faint" />
      </div>
    </div>
  );
}

function fmtDur(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

export default function LeftPanel({
  section,
  model,
  h3,
  ltx,
  patchH3,
  patchLTX,
  jobs,
  online,
}: {
  section: Section;
  model: ModelId;
  h3: H3Config;
  ltx: LTXConfig;
  patchH3: (partial: Partial<H3Config>) => void;
  patchLTX: (partial: Partial<LTXConfig>) => void;
  jobs: Job[];
  online: boolean;
}) {
  const [setup, setSetup] = useState<Record<string, boolean>>({
    fp16fix: true,
    fp16safe: true,
    spectrum: false,
  });
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupNote, setSetupNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!online) return;
    api
      .setupState()
      .then(({ state }) => {
        setSetup((current) => {
          const next = { ...current };
          for (const key of Object.keys(next)) {
            if (typeof state[key] === "boolean") next[key] = state[key];
          }
          return next;
        });
      })
      .catch(() => {});
  }, [online]);

  const runSetup = async (fn: () => Promise<{ rows: [string, string][] }>) => {
    setSetupBusy(true);
    setSetupNote(null);
    try {
      const { rows } = await fn();
      setSetupNote({ ok: true, text: rows.map(([k, v]) => `${k}: ${v}`).join(" · ") });
    } catch (exc) {
      setSetupNote({ ok: false, text: exc instanceof Error ? exc.message : String(exc) });
    } finally {
      setSetupBusy(false);
    }
  };

  const active = jobs.find((job) => job.status === "running") ?? null;
  const running = active ? 1 : 0;
  const isH3 = model === "h3";

  const setReference = (index: number, value: string | null) => {
    patchH3({
      references: h3.references.map((current, slot) => (slot === index ? value : current)),
    });
  };

  return (
    <div className="flex w-[262px] min-w-0 flex-col p-3">
      {section === "run" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <PanelHeader action="New render" icon={Plus} />
          {isH3 ? (
            <>
              <label className="pb-1.5 text-[11px] font-medium text-faint">Mode</label>
              <div className="pb-3">
                <ModeSwitch
                  options={H3_MODES}
                  value={H3_LABEL_BY_MODE[h3.mode]}
                  onChange={(label) => patchH3({ mode: H3_MODE_BY_LABEL[label] })}
                />
                <p className="pt-2 text-[10.5px] leading-relaxed text-faint">
                  {H3_HINTS[h3.mode]}
                </p>
              </div>
            </>
          ) : (
            <>
              <label className="pb-1.5 text-[11px] font-medium text-faint">Mode</label>
              <div className="pb-3">
                <ModeSwitch
                  options={LTX_MODES}
                  value={LTX_LABEL_BY_MODE[ltx.mode]}
                  onChange={(label) => patchLTX({ mode: LTX_MODE_BY_LABEL[label] })}
                />
                <p className="pt-2 text-[10.5px] leading-relaxed text-faint">
                  {LTX_HINTS[ltx.mode]}
                </p>
              </div>
            </>
          )}
          <label className="pb-1.5 text-[11px] font-medium text-faint">Prompt</label>
          <textarea
            value={isH3 ? h3.prompt : ltx.prompt}
            onChange={(event) =>
              isH3 ? patchH3({ prompt: event.target.value }) : patchLTX({ prompt: event.target.value })
            }
            rows={7}
            spellCheck={false}
            className="w-full resize-none rounded-xl border border-line bg-chip/60 p-2.5 text-[12px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-edge"
          />
          {!isH3 && ltx.mode !== "text" ? (
            <p className="pt-2 text-[10.5px] leading-relaxed text-faint">
              Guide frames are uploaded in the Frames tab.
            </p>
          ) : null}
          <div className="flex items-center justify-between pt-4 pb-2">
            <span className="text-[11px] font-medium text-faint">Queue</span>
            <span className="text-[11px] text-faint">
              {running} running · {jobs.length} total
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
            {jobs.length === 0 ? (
              <p className="pt-2 text-[11px] leading-relaxed text-faint">
                Nothing queued yet — configure the run and press Generate.
              </p>
            ) : null}
            {jobs.map((job) => (
              <div
                key={job.id}
                className={`rounded-xl border p-1.5 ${
                  job.status === "running" ? "border-ink/20 bg-chip/40" : "border-line"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="thumb h-12 w-16 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[12px] font-medium text-ink">
                        {job.label}
                      </span>
                      {job.model ? (
                        <span className="shrink-0 rounded-full bg-chip px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-soft uppercase">
                          {job.model === "ltx" ? "LTX" : "H3"}
                        </span>
                      ) : (
                        <MoreHorizontal size={13} className="shrink-0 text-faint" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[job.status]}`} />
                      <span className="truncate text-[10.5px] text-faint">
                        {job.stage}
                        {job.progress != null && job.status === "running"
                          ? ` ${Math.round(job.progress * 100)}%`
                          : ""}
                        {" · "}
                        {fmtDur(job.elapsed_s ?? job.queued_s)}
                        {job.dims ? ` · ${job.dims}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {section === "frames" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <PanelHeader action="Import" icon={Plus} />
          {isH3 ? (
            h3.mode === "reference" ? (
              <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                <span className="pb-2 text-[11px] font-medium text-faint">
                  Reference images · up to 4
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {h3.references.map((value, index) => (
                    <DropCard
                      key={index}
                      label={`Ref ${index + 1}`}
                      value={value}
                      onValue={(next) => setReference(index, next)}
                      online={online}
                      height="h-20"
                    />
                  ))}
                </div>
                <p className="pt-3 text-[11px] leading-relaxed text-faint">
                  Reference mode runs the separate Ref2VA model. Refer to images in the prompt as{" "}
                  <span className="font-medium text-soft">&lt;Picture 1&gt;</span>,{" "}
                  <span className="font-medium text-soft">&lt;Picture 2&gt;</span>, … in upload
                  order. Turbo LoRAs are ignored in this mode.
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                <div className="space-y-2">
                  <DropCard
                    label="First frame"
                    value={h3.firstFrame}
                    onValue={(value) => patchH3({ firstFrame: value })}
                    online={online}
                  />
                  <DropCard
                    label="Last frame"
                    value={h3.lastFrame}
                    onValue={(value) => patchH3({ lastFrame: value })}
                    online={online}
                  />
                </div>
                <p className="pt-3 text-[11px] leading-relaxed text-faint">
                  {h3.mode === "image"
                    ? "A single frame runs image-to-video; both frames switch to FL2VA interpolation. Frames are conditioned once and cached by hash."
                    : "Frames are only used in Image mode — switch the mode in the Run tab after staging them here."}
                </p>
              </div>
            )
          ) : ltx.mode === "text" ? (
            <p className="text-[11px] leading-relaxed text-faint">
              LTX Text mode uses no frames. Switch to Image or First+Last to stage guide images.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              <div className="space-y-2">
                <DropCard
                  label="First frame"
                  value={ltx.firstFrame}
                  onValue={(value) => patchLTX({ firstFrame: value })}
                  online={online}
                />
                {ltx.mode === "firstlast" ? (
                  <DropCard
                    label="Last frame"
                    value={ltx.lastFrame}
                    onValue={(value) => patchLTX({ lastFrame: value })}
                    online={online}
                  />
                ) : null}
              </div>
              <p className="pt-3 text-[11px] leading-relaxed text-faint">
                {ltx.mode === "firstlast"
                  ? "Both guides use the official LTXVAddGuide graph at full resolution, single stage."
                  : "The first frame guides the full-resolution single-stage graph. Use First+Last for two guides."}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {section === "setup" ? (
        isH3 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <span className="pb-2 text-[11px] font-medium text-faint">Methods</span>
            <div className="space-y-0.5">
              {SETUP_ROWS.map(({ id, label, desc }) => (
                <div key={id} className="flex items-center justify-between gap-3 rounded-xl px-1 py-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-ink">{label}</div>
                    <div className="text-[10.5px] text-faint">{desc}</div>
                  </div>
                  <Switch
                    checked={setup[id]}
                    onChange={(value) => setSetup((state) => ({ ...state, [id]: value }))}
                  />
                </div>
              ))}
              <button
                type="button"
                disabled={!online || setupBusy}
                onClick={() => void runSetup(() => api.installSage())}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-[12px] font-medium text-soft transition-colors hover:text-ink disabled:opacity-50"
              >
                <Wand2 size={13} />
                Install SageAttention wheel
              </button>
            </div>
            <button
              type="button"
              disabled={!online || setupBusy}
              onClick={() => void runSetup(() => api.applySetup(setup))}
              className="mt-3 w-full rounded-xl bg-primary py-2.5 text-[12.5px] font-medium text-primary-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {setupBusy ? "Applying…" : "Apply setup"}
            </button>
            {setupNote ? (
              <p
                className={`pt-3 text-[11px] leading-relaxed ${
                  setupNote.ok ? "text-soft" : "text-red-500 dark:text-red-400"
                }`}
              >
                {setupNote.text}
              </p>
            ) : (
              <p className="pt-3 text-[11px] leading-relaxed text-faint">
                Repos are pinned and wheels target this runtime only. Nothing is compiled
                locally.
              </p>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <span className="pb-2 text-[11px] font-medium text-faint">LTX-2.5 methods</span>
            <p className="text-[11px] leading-relaxed text-faint">
              LTX-2.5 runs unforced on the same ComfyUI install and needs no fp16 patch,
              FP16Safe node or attention add-ons. The 22B distilled DiT, gemma4 text encoder,
              both VAEs and the x2 upscaler come from notebook cell 02 — rerun it with
              MODEL_SET=both or ltx if any are missing.
            </p>
            <p className="pt-3 text-[11px] leading-relaxed text-faint">
              Switching models between jobs restarts ComfyUI only once: H3 needs{" "}
              <span className="font-medium text-soft">--force-fp16</span>, LTX runs without it.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}

function ModeSwitch<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-chip p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-w-0 flex-1 truncate rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
            value === option
              ? "bg-elev text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              : "text-soft hover:text-ink"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
