import { useEffect, useState } from "react";
import { MapPin, TreePine, Compass, Mountain, LayoutDashboard, X } from "lucide-react";
import { browserUseIframeSrc } from "@/lib/browser-use-embed";

import tile1 from "@/assets/tile1.gif";
import tile2 from "@/assets/tile2.gif";
import tile3 from "@/assets/tile3.gif";

const LOADING_MS = 60_000;

const loadingSteps = [
  { icon: MapPin, text: "Searching your area..." },
  { icon: TreePine, text: "Finding natural beauty..." },
  { icon: Compass, text: "Matching your preferences..." },
  { icon: Mountain, text: "Preparing recommendations..." },
];

function AgentTile({ label, liveUrl, children, aspectFit = false }) {
  const embedSrc = browserUseIframeSrc(liveUrl);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {children ? (
        <div className="flex h-full items-center justify-center">{children}</div>
      ) : embedSrc ? (
        <iframe
          title={label}
          src={embedSrc}
          className={`absolute inset-y-0 h-full border-0 ${
            aspectFit ? "inset-x-0 w-full" : "left-1/2 w-[450%] -translate-x-1/2"
          }`}
          allow="autoplay; fullscreen; clipboard-read; clipboard-write"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div
          className="flex h-full items-center justify-center p-6 text-center text-xs text-white/70"
          style={{ background: "linear-gradient(to bottom, #8aa5bf, #20232c)" }}>
          {label} stream initializing...
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-10 rounded-md bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-md">
        {label}
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
  const [showLiveViews, setShowLiveViews] = useState(false);
  const [tiles, setTiles] = useState([
    { id: 0, label: "Searching for Clearings...", urlIndex: 0 },
    {
      id: 1,
      label: "Scouting the Views...",
      content: (
        <img src={tile2} alt="" className="h-full w-full object-cover" />
      ),
    },
    { id: 2, label: "Checking Local Regulations...", urlIndex: 1 },
    {
      id: 3,
      label: "Keeping Your Attention ;)...",
      content: (
        <img src={tile1} alt="" className="h-full w-full object-cover" />
      ),
    },
    { id: 4, label: "Consulting Other Campers...", urlIndex: 2 },
    {
      id: 5,
      label: "Analyzing Topography...",
      content: (
        <img src={tile3} alt="" className="h-full w-full object-cover" />
      ),
    },
  ]);

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
    <section className="fixed inset-0 z-50 overflow-hidden bg-background">
      <style>
        {`
          @keyframes continuous-linear-scroll {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}
      </style>

      {/* Agent Tiling Background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-y-0 flex w-[400%]"
          style={{
            left: "-16.666%",
            animation: "continuous-linear-scroll 21.6s linear infinite",
          }}
        >
          {[...tiles, ...tiles].map((tile, idx) => (
            <div
              key={`${tile.id}-${idx}`}
              className="relative h-full w-[8.3333%] border-r border-white/10"
            >
              <AgentTile
                label={tile.label}
                liveUrl={tile.urlIndex !== undefined ? agentLiveUrls[tile.urlIndex] : null}
              >
                {tile.content}
              </AgentTile>
            </div>
          ))}
        </div>
        {/* Global semi-transparent cover over the entire background */}
        <div className="absolute inset-0 z-10 bg-black/40" />
      </div>
      
      {/* Logo + attribution — card */}
      <div className="fixed right-4 top-4 z-[36] flex items-center gap-2">
        <div className="flex max-w-[min(calc(100vw-2rem),280px)] items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-xl ring-1 ring-foreground/[0.06] backdrop-blur-md">
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
        <button
          onClick={() => setShowLiveViews(true)}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card/95 shadow-xl ring-1 ring-foreground/[0.06] backdrop-blur-md transition-all hover:bg-muted active:scale-95"
          title="Open Live Views"
        >
          <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Live View Overlay */}
      {showLiveViews && (
        <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-[320px] flex-col md:top-25 md:right-4">
          <div className="relative flex flex-col overflow-hidden rounded-[1.5rem] border border-border/50 bg-card/80 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Live Browser Streams</h3>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Research</p>
              </div>
              <button
                onClick={() => setShowLiveViews(false)}
                className="group flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 transition-colors hover:bg-muted"
              >
                <X className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-1">
              <div className="relative aspect-[2/1]">
                <AgentTile label="Topo / Map" liveUrl={agentLiveUrls[0]} aspectFit />
              </div>
              <div className="relative aspect-[2/1]">
                <AgentTile label="Land Rules" liveUrl={agentLiveUrls[1]} aspectFit />
              </div>
              <div className="relative aspect-[2/1]">
                <AgentTile label="Community Intel" liveUrl={agentLiveUrls[2]} aspectFit />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loader sits below video layer so corners stay visible; narrow column only */}
      <div className="pointer-events-none relative z-10 flex min-h-full flex-col items-center justify-center px-6 py-20">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border/40 bg-background/80 px-6 py-8 text-center shadow-lg ring-1 ring-foreground/[0.04] backdrop-blur-md">
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
