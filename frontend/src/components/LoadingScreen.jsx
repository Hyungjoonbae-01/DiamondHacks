import { useEffect, useState } from "react";
import { MapPin, TreePine, Compass, Mountain } from "lucide-react";
import { browserUseIframeSrc } from "@/lib/browser-use-embed";
import { LOADING_DURATION_MS as LOADING_MS } from "@/lib/loading-duration";

const loadingSteps = [
  { icon: MapPin, text: "Searching your area..." },
  { icon: TreePine, text: "Finding natural beauty..." },
  { icon: Compass, text: "Matching your preferences..." },
  { icon: Mountain, text: "Preparing recommendations..." },
];

const agentPanels = [
  { id: "topo", label: "Topo / map" },
  { id: "land", label: "Land rules" },
  { id: "community", label: "Community intel" },
];

function AgentVideoCard({ label, liveUrl, className = "" }) {
  const embedSrc = browserUseIframeSrc(liveUrl);
  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border/70 bg-card/95 p-2.5 shadow-lg ring-1 ring-foreground/[0.06] backdrop-blur-sm sm:p-3">
        <p className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground/80 sm:text-[11px]">
          {label}
        </p>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black shadow-inner ring-1 ring-black/20">
          {embedSrc ? (
            <iframe
              key={embedSrc}
              title={label}
              src={embedSrc}
              className="absolute inset-0 block h-full w-full border-0"
              allow="autoplay; fullscreen; clipboard-read; clipboard-write"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex h-full min-h-[96px] items-center justify-center px-2 text-center text-[11px] leading-snug text-muted-foreground">
              Live view when this agent starts…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen({
  agentLiveUrls = [null, null, null],
  agentApiError = null,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / LOADING_MS) * 100);
      setProgress(p);
      const stepSpan = LOADING_MS / loadingSteps.length;
      const idx = Math.min(
        loadingSteps.length - 1,
        Math.floor(elapsed / stepSpan)
      );
      setCurrentStep(idx);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="fixed inset-0 z-50 flex h-dvh max-h-dvh flex-col bg-background md:flex-row">
      {/* Left: live agents — fills full height, shares horizontal space on md+ */}
      <aside className="flex min-h-0 w-full flex-[1.15] flex-col gap-2 border-border bg-muted/15 p-3 sm:gap-3 sm:p-4 md:w-[min(52vw,820px)] md:flex-none md:shrink-0 md:border-r md:py-4">
        <p className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Live agents
        </p>
        {/* Grid avoids flex bugs where the middle row collapses with absolute iframes */}
        <div
          className="grid min-h-0 flex-1 gap-2 sm:gap-3"
          style={{
            gridTemplateRows: "repeat(3, minmax(7rem, 1fr))",
          }}
        >
          {agentPanels.map((agent, i) => (
            <AgentVideoCard
              key={agent.id}
              label={agent.label}
              liveUrl={agentLiveUrls[i] ?? null}
            />
          ))}
        </div>
      </aside>

      {/* Right: branding + loading (no overlap with videos) */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 justify-end border-b border-border/50 bg-background/80 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-3.5">
          <div className="flex max-w-[min(100%,280px)] items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-3 py-2 shadow-md ring-1 ring-foreground/[0.06] backdrop-blur-md">
            <img
              src="/branding-logo.png"
              alt=""
              className="h-9 w-auto shrink-0 object-contain sm:h-10"
            />
            <p className="text-left text-[11px] leading-snug text-muted-foreground sm:text-xs">
              Powered by{" "}
              <span className="font-medium text-foreground">Browser Use</span>
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-6 sm:px-8">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border/40 bg-background/80 px-5 py-7 text-center shadow-lg ring-1 ring-foreground/[0.04] backdrop-blur-md sm:px-6 sm:py-8">
            {agentApiError && (
              <p
                role="alert"
                className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive"
              >
                {agentApiError}
              </p>
            )}
            <div className="relative mx-auto mb-10 h-24 w-24">
              <div className="absolute inset-0 animate-ping rounded-full bg-foreground/5" />
              <div className="absolute inset-2 animate-pulse rounded-full bg-foreground/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                {loadingSteps.map(({ icon: Icon }, index) => (
                  <Icon
                    key={index}
                    className={`absolute h-10 w-10 transition-all duration-500 ${
                      index === currentStep
                        ? "scale-100 opacity-100"
                        : "scale-75 opacity-0"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="relative mb-8 h-8">
              {loadingSteps.map(({ text }, index) => (
                <p
                  key={index}
                  className={`font-display absolute left-0 right-0 text-xl transition-all duration-500 ${
                    index === currentStep
                      ? "translate-y-0 opacity-100"
                      : index < currentStep
                        ? "-translate-y-4 opacity-0"
                        : "translate-y-4 opacity-0"
                  }`}
                >
                  {text}
                </p>
              ))}
            </div>

            <div className="mx-auto w-full max-w-xs">
              <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-4 font-mono text-sm text-muted-foreground">
                {`${Math.round(progress)}% complete · ~${Math.round(LOADING_MS / 60_000)} min`}
              </p>
            </div>

            <div className="mt-8 flex justify-center gap-2">
              {loadingSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${
                    index <= currentStep ? "bg-foreground" : "bg-foreground/20"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
