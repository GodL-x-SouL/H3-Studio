import { useEffect, useRef, useState } from "react";
import { Clapperboard, Maximize2, Play } from "lucide-react";
import { IconBtn } from "./controls";
import { dimsFor, ltxDimsFor, type H3Config, type LTXConfig, type ModelId } from "../types";
import type { Job } from "../api";

function fmtDur(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export default function PreviewCard({
  model,
  h3,
  ltx,
  jobs,
}: {
  model: ModelId;
  h3: H3Config;
  ltx: LTXConfig;
  jobs: Job[];
}) {
  const job =
    jobs.find((item) => item.status === "running" || item.status === "queued") ??
    jobs[0] ??
    null;
  const active = job !== null && (job.status === "running" || job.status === "queued");
  const failed = job !== null && job.status === "failed";
  const video = job !== null && job.status === "done" ? job.video : null;
  const dims = job?.dims ?? (model === "h3" ? dimsFor(h3) : ltxDimsFor(ltx));
  const frames = job?.frames ?? (model === "h3" ? h3.frames : ltx.frames);
  const runningModel = job?.model ?? model;

  // Progress always starts at zero for a new job and only ever moves forward, so a
  // stage change (or a poll with no fresh sample) can never make the bar jump back or
  // park itself somewhere in the middle.
  const tracked = useRef<{ id: string | null; value: number }>({ id: null, value: 0 });
  if (job === null) {
    tracked.current = { id: null, value: 0 };
  } else if (tracked.current.id !== job.id) {
    tracked.current = { id: job.id, value: 0 };
  }
  const reported = job?.status === "done" ? 1 : clamp01(Number(job?.progress ?? 0));
  tracked.current.value = Math.max(tracked.current.value, reported);
  const progress = tracked.current.value;
  const percent = Math.round(progress * 100);
  const known = job !== null && (job.status === "done" || job.progress != null);

  // Hold the finished bar at 100% for a beat before the video takes over, so a render
  // visibly completes instead of disappearing from wherever the bar happened to be.
  const [videoShown, setVideoShown] = useState(false);
  useEffect(() => {
    setVideoShown(false);
    if (!video) return;
    const timer = window.setTimeout(() => setVideoShown(true), 700);
    return () => window.clearTimeout(timer);
  }, [job?.id, video]);

  const videoElement = useRef<HTMLVideoElement | null>(null);
  const [videoError, setVideoError] = useState(false);
  const showVideo = video !== null && videoShown;

  useEffect(() => {
    setVideoError(false);
  }, [video]);

  // Browsers only autoplay muted media; start it explicitly so a finished render is
  // playing when it appears, and let the controls unmute it.
  useEffect(() => {
    const element = videoElement.current;
    if (!element || !showVideo) return;
    element.muted = true;
    const started = element.play();
    if (started) started.catch(() => undefined);
  }, [showVideo, video]);

  const showProgress = job !== null && !failed && (active || video !== null);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-surface p-3">
      <header className="flex shrink-0 items-center gap-2 px-1 pb-3">
        <Clapperboard size={14} className="text-faint" />
        <span className="text-[12px] font-medium text-soft">Preview</span>
        <span className="rounded-full bg-chip px-2.5 py-1 text-[10.5px] font-semibold tracking-wide text-soft uppercase">
          {runningModel === "ltx" ? "LTX 2.5" : "H3"}
        </span>
        <span className="ml-auto rounded-full bg-chip px-2.5 py-1 text-[11px] font-medium text-soft tabular-nums">
          {dims} · {frames}f
        </span>
      </header>

      <div className="stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl">
        {showVideo && video ? (
          <div className="relative h-full w-full">
            <video
              key={video}
              ref={videoElement}
              src={video}
              controls
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onError={() => setVideoError(true)}
              className="h-full w-full object-contain"
            />
            {videoError ? (
              <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center">
                <p className="text-[12px] leading-relaxed text-white">
                  This browser could not play the render inline.{" "}
                  <a
                    href={video}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    Open the video
                  </a>
                </p>
              </div>
            ) : null}
          </div>
        ) : failed ? (
          <div className="max-w-md px-8 text-center">
            <p className="text-[12px] font-medium text-red-500 dark:text-red-400">
              Render failed
            </p>
            <p className="pt-1.5 text-[11px] leading-relaxed text-faint">{job?.error}</p>
          </div>
        ) : showProgress && job ? (
          <div className="w-full max-w-sm px-8">
            <div className="flex items-center justify-between pb-2 text-[11px]">
              <span className="font-medium text-ink capitalize">
                {job.status === "done" ? "finishing" : job.stage}
              </span>
              <span className="text-faint tabular-nums">
                {known ? `${percent}%` : "working"}
              </span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-chip">
              {known ? (
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              ) : (
                <div className="preview-sweep h-full w-1/3 rounded-full bg-accent" />
              )}
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
