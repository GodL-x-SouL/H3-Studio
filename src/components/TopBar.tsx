import { Download, Moon, Sparkles, Sun } from "lucide-react";

export default function TopBar({
  theme,
  online,
  onToggleTheme,
}: {
  theme: "light" | "amoled";
  online: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center px-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-primary-ink">
          <Sparkles size={15} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink">H3 Studio</span>
      </div>
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] font-medium text-soft">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              online ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {online ? "backend live" : "offline"}
        </span>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[13px] font-medium text-primary-ink transition-opacity hover:opacity-90"
        >
          <Download size={15} />
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
