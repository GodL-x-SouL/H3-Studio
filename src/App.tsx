import { useCallback, useEffect, useState } from "react";
import ConsoleLog from "./components/ConsoleLog";
import LeftPanel from "./components/LeftPanel";
import PreviewCard from "./components/PreviewCard";
import Rail from "./components/Rail";
import RightPanel from "./components/RightPanel";
import TopBar from "./components/TopBar";
import { api, type BackendStatus, type Job } from "./api";
import { defaultConfig, LORA_CHOICES, type RunConfig, type Section } from "./types";

type Theme = "light" | "amoled";

function readTheme(): Theme {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("theme") === "amoled") return "amoled";
    return localStorage.getItem("h3-theme") === "amoled" ? "amoled" : "light";
  } catch {
    return "light";
  }
}

export default function App() {
  const [section, setSection] = useState<Section>("run");
  const [config, setConfig] = useState<RunConfig>(defaultConfig);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loraNames, setLoraNames] = useState<string[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "amoled");
    try {
      localStorage.setItem("h3-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [nextStatus, nextJobs] = await Promise.all([api.status(), api.jobs()]);
        if (cancelled) return;
        setOnline(true);
        setStatus(nextStatus);
        setJobs(nextJobs.jobs);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    void tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const refreshLoras = useCallback(async () => {
    try {
      const { loras } = await api.loras();
      setLoraNames(loras);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    if (online) void refreshLoras();
  }, [online, refreshLoras]);

  const patch = (partial: Partial<RunConfig>) =>
    setConfig((current) => ({ ...current, ...partial }));

  const generate = async () => {
    const { id } = await api.generate(config);
    try {
      const { jobs: next } = await api.jobs();
      setJobs(next);
    } catch {
      /* polling will catch up */
    }
    return id;
  };

  const addLora = async (url: string) => {
    const { name } = await api.addLora(url);
    await refreshLoras();
    return name;
  };

  const loras = loraNames.length > 0 ? loraNames : LORA_CHOICES;

  return (
    <div className="h-screen w-screen bg-canvas p-4 font-sans text-ink">
      <div className="mx-auto flex h-full max-w-[1440px] flex-col overflow-hidden rounded-[24px] border border-line bg-shell shadow-[0_1px_2px_rgba(20,20,19,0.04),0_30px_60px_-45px_rgba(20,20,19,0.35)]">
        <TopBar
          theme={theme}
          online={online}
          onToggleTheme={() => setTheme((value) => (value === "amoled" ? "light" : "amoled"))}
        />
        <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
          <div className="flex shrink-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <Rail section={section} onChange={setSection} />
            <div className="my-3 w-px shrink-0 bg-line" />
            <LeftPanel
              section={section}
              config={config}
              patch={patch}
              jobs={jobs}
              online={online}
            />
          </div>
          <main className="flex min-w-0 flex-1 flex-col gap-3">
            <PreviewCard config={config} jobs={jobs} />
            <ConsoleLog online={online} status={status} />
          </main>
          <RightPanel
            config={config}
            patch={patch}
            loras={loras}
            onAddLora={addLora}
            online={online}
            onGenerate={generate}
          />
        </div>
      </div>
    </div>
  );
}
