import { useEffect, useState } from "react";
import { MapPin, TreePine, Compass, Mountain } from "lucide-react";

const loadingSteps = [
  { icon: MapPin, text: "Searching your area..." },
  { icon: TreePine, text: "Finding natural beauty..." },
  { icon: Compass, text: "Matching your preferences..." },
  { icon: Mountain, text: "Preparing recommendations..." },
];

export function LoadingScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) =>
        prev < loadingSteps.length - 1 ? prev + 1 : prev
      );
    }, 800);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 2, 100));
    }, 60);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <section className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center">
      <div className="relative z-10 text-center px-6 max-w-md">
        {/* Animated icon */}
        <div className="relative w-24 h-24 mx-auto mb-10">
          <div className="absolute inset-0 rounded-full bg-foreground/5 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-foreground/10 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            {loadingSteps.map(({ icon: Icon }, index) => (
              <Icon
                key={index}
                className={`absolute w-10 h-10 transition-all duration-500 ${
                  index === currentStep
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-75"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Loading text */}
        <div className="relative h-8 mb-8">
          {loadingSteps.map(({ text }, index) => (
            <p
              key={index}
              className={`text-xl font-display absolute left-0 right-0 transition-all duration-500 ${
                index === currentStep
                  ? "opacity-100 translate-y-0"
                  : index < currentStep
                  ? "opacity-0 -translate-y-4"
                  : "opacity-0 translate-y-4"
              }`}
            >
              {text}
            </p>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs mx-auto">
          <div className="h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-4 font-mono">
            {progress}% complete
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex justify-center gap-2 mt-8">
          {loadingSteps.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index <= currentStep ? "bg-foreground" : "bg-foreground/20"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
