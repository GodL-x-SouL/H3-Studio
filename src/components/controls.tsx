import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, Info } from "lucide-react";

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150 ${
        checked ? "bg-(--c-switch-on)" : "bg-(--c-switch-off)"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-150 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      className="h3-range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  display: (value: number) => string;
}) {
  return (
    <div className="space-y-2.5">
      <span className="text-[12px] font-medium text-soft">{label}</span>
      <div className="flex items-center gap-3">
        <Slider value={value} min={min} max={max} step={step} onChange={onChange} />
        <span className="w-14 shrink-0 rounded-lg border border-line bg-chip px-2 py-1 text-center text-[11px] font-medium text-ink tabular-nums">
          {display(value)}
        </span>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  size?: "md" | "sm";
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-chip p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-w-0 flex-1 truncate rounded-full font-medium transition-colors ${
            size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]"
          } ${
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

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-chip/60 px-2.5 py-1.5 text-left text-[12px] text-ink outline-none transition-colors hover:bg-chip focus:border-edge"
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-faint transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="absolute right-0 left-0 z-50 mt-1.5 max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-elev p-1 shadow-[0_16px_40px_-16px_rgba(20,20,19,0.35)]">
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-chip ${
                  selected ? "font-medium text-ink" : "text-soft"
                }`}
              >
                <span className="truncate">{option}</span>
                {selected ? <Check size={13} className="shrink-0 text-ink" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Section({
  title,
  open,
  onToggle,
  info,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  info?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-line pb-4 last:border-none last:pb-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 py-0.5 text-left"
      >
        <ChevronDown
          size={14}
          className={`text-faint transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        {info ? <Info size={13} className="text-faint" /> : null}
      </button>
      {open ? <div className="mt-3.5 space-y-4 pl-5">{children}</div> : null}
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-medium text-soft">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

export function IconBtn({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-soft transition-colors hover:bg-chip hover:text-ink"
    >
      {icon}
    </button>
  );
}
