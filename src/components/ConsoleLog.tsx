import { useEffect, useState } from "react";
import { RefreshCw, Terminal } from "lucide-react";
import { api, type BackendStatus } from "../api";

export default function ConsoleLog({
  online,
  status,
}: {
  online: boolean;
  status: BackendStatus | null;
}) {
  const [logText, setLogText] = useState("");

  useEffect(() => {
    if (!online) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { text } = await api.log();
        if (!stopped) setLogText(text);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [online]);

  return (
    <section className="flex h-[216px] shrink-0 flex-col rounded-2xl border border-line bg-surface p-3">
      <header className="flex shrink-0 items-center gap-2 px-1 pb-2">
        <Terminal size={14} className="text-faint" />
        <span className="text-[12px] font-medium text-soft">Console</span>
        <span className="rounded-full bg-chip px-2.5 py-1 text-[11px] font-medium text-soft">
          comfy.log
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-faint">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status?.comfy ? "bg-emerald-500" : "bg-faint"
            }`}
          />
          ComfyUI :8188
          <span className="text-faint/80">
            {!online
              ? "offline"
              : status?.comfy
                ? `v${status.version} · ${status.vram_free_mib ?? 0} MiB free`
                : "stopped"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void api.log().then(({ text }) => setLogText(text)).catch(() => {})}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-faint transition-colors hover:bg-chip hover:text-ink"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl border border-line bg-chip/40 p-2">
        {logText ? (
          logText
            .split("\n")
            .slice(-200)
            .map((line, index) => (
              <div key={index} className="font-mono text-[10.5px] leading-relaxed text-soft">
                {line}
              </div>
            ))
        ) : (
          <p className="text-[11px] text-faint">
            {online ? "no log yet" : "backend offline — run cell 03"}
          </p>
        )}
      </div>
    </section>
  );
}
