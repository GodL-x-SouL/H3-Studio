import { Clapperboard, Image as ImageIcon, SlidersHorizontal, Terminal } from "lucide-react";
import type { Section } from "../types";

const ITEMS: { id: Section; label: string; icon: typeof Clapperboard }[] = [
  { id: "run", label: "Run", icon: Clapperboard },
  { id: "frames", label: "Frames", icon: ImageIcon },
  { id: "setup", label: "Setup", icon: SlidersHorizontal },
  { id: "console", label: "Console", icon: Terminal },
];

export default function Rail({
  section,
  onChange,
}: {
  section: Section;
  onChange: (section: Section) => void;
}) {
  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 py-4">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = id === section;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`flex w-[64px] flex-col items-center gap-1.5 rounded-2xl px-2 py-3 transition-colors ${
              active ? "bg-chip text-ink" : "text-faint hover:text-soft"
            }`}
          >
            <Icon size={17} strokeWidth={active ? 2.1 : 1.8} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
