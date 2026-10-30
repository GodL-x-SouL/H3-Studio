import { Download, Moon, Sparkles, Sun } from "lucide-react";
import type { ModelId } from "../types";

const MODELS: { id: ModelId; label: string; hint: string }[] = [
  { id: "h3", label: "H3", hint: "MiniMax H3 + audio" },
  { id: "ltx", label: "LTX 2.5", hint: "LTX-2.5 distilled" },
];

export default function TopBar({
  model,
  onModelChange,
  theme,
  online,
  onToggleTheme,
}: {
  model: ModelId;
  onModelChange: (model: ModelId) => void;
  theme: "light" | "amoled";
  online: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-primary-ink">
          <Sparkles size={15} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink">H3 Studio</span>
      </div>
      <div className="h-6 w-px shrink-0 bg-line" />
      <div className="flex shrink-0 items-center gap-1 rounded-full bg-chip p-1">
        {MODELS.map(({ id, label, hint }) => (
          <button
            key={id}
            type="button"
            title={hint}
            onClick={() => onModelChange(id)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
              model === id
                ? "bg-elev text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-8 items-center gap-1.5 rounded-full bg-chip px-3 text-[12px] font-medium text-soft">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              online ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {online ? "backend live" : "offline"}
        </span>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-medium text-primary-ink transition-opacity hover:opacity-90"
        >
          <Download size={14} />
          Export
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === "amoled" ? "Switch to light theme" : "Switch to AMOLED dark theme"}
          className="grid h-8 w-8 place-items-center rounded-full bg-chip text-soft transition-colors hover:text-ink"
        >
          {theme === "amoled" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
