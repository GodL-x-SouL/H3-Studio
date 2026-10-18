import { Clapperboard, Maximize2, Play } from "lucide-react";
import { IconBtn } from "./controls";
import { dimsFor, type RunConfig } from "../types";
import type { Job } from "../api";

function fmtDur(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

export default function PreviewCard({
  config,
  jobs,
}: {
  config: RunConfig;
  jobs: Job[];
}) {
  const job =
    jobs.find((item) => item.status === "running" || item.status === "queued") ??
    jobs.find((item) => item.status === "done") ??
    jobs[0] ??
    null;
  const active = job !== null && (job.status === "running" || job.status === "queued");
  const video = job && job.status === "done" ? job.video : null;
  const failed = job !== null && job.status === "failed";
  const dims = job?.dims ?? dimsFor(config);
  const frames = job?.frames ?? config.frames;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-surface p-3">
      <header className="flex shrink-0 items-center gap-2 px-1 pb-3">
        <Clapperboard size={14} className="text-faint" />
        <span className="text-[12px] font-medium text-soft">Preview</span>
        <span className="ml-auto rounded-full bg-chip px-2.5 py-1 text-[11px] font-medium text-soft tabular-nums">
          {dims} · {frames}f
        </span>
      </header>

      <div className="stage relative grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl">
        {video ? (
          <video
            key={video}
            src={video}
            controls
            autoPlay
            loop
            playsInline
            className="h-full w-full object-contain"
          />
        ) : failed ? (
          <div className="max-w-md px-8 text-center">
            <p className="text-[12px] font-medium text-red-500 dark:text-red-400">
              Render failed
            </p>
            <p className="pt-1.5 text-[11px] leading-relaxed text-faint">{job?.error}</p>
          </div>
        ) : active && job ? (
          <div className="w-full max-w-sm px-8">
            <div className="flex items-center justify-between pb-2 text-[11px]">
              <span className="font-medium text-ink capitalize">{job.stage}</span>
              <span className="text-faint tabular-nums">
                {job.progress != null ? `${Math.round(job.progress * 100)}%` : "working"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-chip">
              <div
                className={`h-full rounded-full bg-accent transition-all duration-500 ${
                  job.progress == null
                    ? "w-1/3 animate-pulse"
                    : ""
                }`}
                style={job.progress != null ? { width: `${Math.max(3, job.progress * 100)}%` } : undefined}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-faint">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/80 text-[#141413] shadow-[0_2px_10px_rgba(20,20,19,0.1)]">
              <Play size={18} className="translate-x-[1px]" />
            </span>
            <span className="text-[11.5px] font-medium">No render yet — press Generate</span>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between px-1 pt-3">
        <span className="truncate text-[12px] font-medium text-soft tabular-nums">
          {job
            ? `${job.label} · ${job.stage} · ${fmtDur(job.elapsed_s ?? job.queued_s)}`
            : "idle"}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {job && job.warnings.length > 0 ? (
            <span className="pr-2 text-[10.5px] text-amber-600 dark:text-amber-400">
              {job.warnings.length} warning{job.warnings.length > 1 ? "s" : ""}
            </span>
          ) : null}
          <IconBtn label="Fullscreen" icon={<Maximize2 size={14} />} />
        </div>
      </footer>
    </section>
  );
}
