import { useEffect, useState } from "react";
import { MapPin, TreePine, Compass, Mountain } from "lucide-react";
import { browserUseIframeSrc } from "@/lib/browser-use-embed";

const LOADING_MS = 60_000;

const loadingSteps = [
  { icon: MapPin, text: "Searching your area..." },
  { icon: TreePine, text: "Finding natural beauty..." },
  { icon: Compass, text: "Matching your preferences..." },
  { icon: Mountain, text: "Preparing recommendations..." },
];

const agentPanels = [
  { id: "topo", label: "Topo / map", position: "top-left" },
  { id: "land", label: "Land rules", position: "bottom-left" },
  { id: "community", label: "Community intel", position: "bottom-right" },
];

function AgentVideoCard({ label, liveUrl, positionClass }) {
  const embedSrc = browserUseIframeSrc(liveUrl);
  return (
    <div
      className={`fixed z-[32] w-[min(92vw,17.5rem)] sm:w-80 md:w-[22rem] lg:w-96 ${positionClass}`}
    >
      <div className="rounded-2xl border border-border/70 bg-card/95 p-3 shadow-xl ring-1 ring-foreground/[0.06] backdrop-blur-md">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
          {label}
        </p>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-inner ring-1 ring-black/20">
          {embedSrc ? (
            <iframe
              title={label}
              src={embedSrc}
              className="absolute inset-0 block h-full w-full border-0"
              allow="autoplay; fullscreen; clipboard-read; clipboard-write"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex h-full min-h-[100px] items-center justify-center px-3 text-center text-xs leading-snug text-muted-foreground">
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

  /*
   * md+: anchor from 50vw so cards sit in screen wings with ~8rem gap to center loader.
   * sm: corner insets; cards are smaller on narrow viewports to reduce overlap.
   */
  const positions = [
    "left-3 top-[5.75rem] sm:left-4 sm:top-24 md:left-[max(1rem,calc(50vw-32rem))] md:top-28 lg:top-[7.5rem]",
    "left-3 bottom-6 sm:left-4 sm:bottom-8 md:left-[max(1rem,calc(50vw-32rem))] md:bottom-12 lg:bottom-14",
    "right-3 bottom-6 sm:right-4 sm:bottom-8 md:left-[min(calc(50vw+8rem),calc(100vw-26rem))] md:right-auto md:bottom-12 lg:bottom-14",
  ];

  return (
    <section className="fixed inset-0 z-50 bg-background">
      {agentPanels.map((agent, i) => (
        <AgentVideoCard
          key={agent.id}
          label={agent.label}
          liveUrl={agentLiveUrls[i] ?? null}
          positionClass={`${positions[i]} pointer-events-auto`}
        />
      ))}

      {/* Logo + attribution — card */}
      <div className="fixed right-4 top-4 z-[36] flex max-w-[min(calc(100vw-2rem),280px)] items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-xl ring-1 ring-foreground/[0.06] backdrop-blur-md">
        <img
          src="/branding-logo.png"
          alt=""
          className="h-10 w-auto shrink-0 object-contain"
        />
        <p className="text-left text-xs leading-snug text-muted-foreground">
          Powered by{" "}
          <span className="font-medium text-foreground">Browser Use</span>
        </p>
      </div>

      {/* Loader sits below video layer so corners stay visible; narrow column only */}
      <div className="pointer-events-none relative z-[28] flex min-h-full flex-col items-center justify-center px-6 py-20">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border/40 bg-background/70 px-6 py-8 text-center shadow-lg ring-1 ring-foreground/[0.04] backdrop-blur-md">
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
              {Math.round(progress)}% complete · ~1 min
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
    </section>
  );
}
