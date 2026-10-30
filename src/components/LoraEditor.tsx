import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Select, Slider } from "./controls";
import type { LoraEntry } from "../types";

export default function LoraEditor({
  value,
  options,
  onChange,
  online,
  onAddLora,
  hint,
}: {
  value: LoraEntry[];
  options: string[];
  onChange: (next: LoraEntry[]) => void;
  online: boolean;
  onAddLora: (url: string) => Promise<string>;
  hint: string;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const available = options.filter((name) => name !== "off");
  const used = new Set(value.map((entry) => entry.name));

  const add = () => {
    const next = available.find((name) => !used.has(name)) ?? available[0] ?? "off";
    onChange([...value, { name: next, strength: 1 }]);
  };

  const update = (index: number, patch: Partial<LoraEntry>) =>
    onChange(value.map((entry, slot) => (slot === index ? { ...entry, ...patch } : entry)));

  const remove = (index: number) => onChange(value.filter((_, slot) => slot !== index));

  const download = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setNote(null);
    try {
      const name = await onAddLora(trimmed);
      if (!used.has(name)) onChange([...value, { name, strength: 1 }]);
      setUrl("");
      setNote({ ok: true, text: `${name} added to the stack` });
    } catch (exc) {
      setNote({ ok: false, text: exc instanceof Error ? exc.message : String(exc) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-faint">
          No LoRA applied — add one below.
        </p>
      ) : null}

      {value.map((entry, index) => (
        <div
          key={`${entry.name}-${index}`}
          className="space-y-1.5 rounded-xl border border-line bg-chip/40 p-2"
        >
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <Select
                value={entry.name}
                options={available.length > 0 ? available : ["off"]}
                onChange={(name) => update(index, { name })}
                placeholder="off"
              />
            </div>
            <button
              type="button"
              title="Remove LoRA"
              onClick={() => remove(index)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-chip hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <span className="shrink-0 text-[10.5px] text-faint">strength</span>
            <div className="min-w-0 flex-1">
              <Slider
                value={entry.strength}
                min={0}
                max={5}
                step={0.05}
                onChange={(next) => update(index, { strength: next })}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-[11px] font-medium text-soft tabular-nums">
              {entry.strength.toFixed(2)}
            </span>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-edge py-1.5 text-[11.5px] font-medium text-soft transition-colors hover:text-ink"
      >
        <Plus size={13} /> Add LoRA
      </button>

      <div className="space-y-1.5 pt-1">
        <span className="text-[11px] font-medium text-soft">Download LoRA</span>
        <div className="flex items-center gap-2">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="huggingface.co/…/name.safetensors"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-line bg-chip/60 px-2.5 py-1.5 text-[11.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-edge"
          />
          <button
            type="button"
            disabled={!online || busy}
            onClick={() => void download()}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-medium text-primary-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>
        <p
          className={`text-[10.5px] leading-relaxed ${
            note && !note.ok
              ? "text-red-500 dark:text-red-400"
              : note?.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-faint"
          }`}
        >
          {note ? note.text : hint}
        </p>
      </div>
    </div>
  );
}
