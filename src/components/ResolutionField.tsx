import { Select } from "./controls";
import { dimsForResolution, type Ratio, type ResolutionPreset } from "../types";

export default function ResolutionField({
  presets,
  ratio,
  align,
  value,
  onChange,
  hint,
  stage,
}: {
  presets: ResolutionPreset[];
  ratio: Ratio;
  align: number;
  value: string;
  onChange: (id: string) => void;
  hint: string;
  stage?: (width: number, height: number) => string;
}) {
  const options = presets.map((preset) => {
    const [width, height] = dimsForResolution(preset, ratio, align);
    return { id: preset.id, label: `${preset.label} · ${width}×${height}`, width, height };
  });
  const selected = options.find((option) => option.id === value) ?? options[0];
  const megapixels = ((selected.width * selected.height) / 1_000_000).toFixed(2);

  return (
    <div className="space-y-2">
      <span className="text-[12px] font-medium text-soft">Resolution</span>
      <Select
        value={selected.label}
        options={options.map((option) => option.label)}
        onChange={(label) => {
          const next = options.find((option) => option.label === label);
          if (next) onChange(next.id);
        }}
      />
      <div className="flex items-center justify-between text-[10.5px] text-faint">
        <span className="text-soft tabular-nums">
          {selected.width}×{selected.height} · {megapixels} MP
        </span>
        <span className="tabular-nums">{align}px grid</span>
      </div>
      {stage ? (
        <p className="text-[10.5px] text-faint tabular-nums">
          {stage(selected.width, selected.height)}
        </p>
      ) : null}
      <p className="text-[11px] leading-relaxed text-faint">{hint}</p>
    </div>
  );
}
