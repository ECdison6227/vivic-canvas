import { useEffect, useRef } from "react";
import Grainient from "@/components/Grainient";
import { GRAINIENT_PRESETS } from "@/motion/motionDirector";
import { useDisplayPreferences } from "@/state/canvasStore";

/** Real Grainient stays outside the React Flow transform. Its existing quiet
 * tint also covers WebGL unavailability/loss without a React state callback
 * from the graphics driver (Firefox may dispatch that during another render). */
export const BackgroundLayer = ({ theme }: { theme: "light" | "dark" }) => {
  const preferences = useDisplayPreferences();
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current, canvas = host?.querySelector("canvas");
    if (!host || !canvas) return;
    const onLost = (event: Event) => {
      event.preventDefault();
      canvas.style.visibility = "hidden";
      host.dataset.vivicGlLost = "true";
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, []);
  const preset = GRAINIENT_PRESETS[theme];
  return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden="true" data-vivic-layer="background"
    style={{ background: theme === "dark"
      ? "radial-gradient(circle at 50% 40%, #2a2d3d 0%, #11131f 75%)"
      : "radial-gradient(circle at 50% 40%, #f3ecff 0%, #eef3fd 75%)" }}>
    {/* Strong flow reads as drifting smoke; mirrored bands only in dark, light stays one soft wash. */}
    <Grainient colors={[...preset.colors]} lightMode={preset.lightMode} speed={preferences.reducedMotion ? 0 : 2.2}
      grainAnimated={!preferences.reducedMotion} angle={12} bands={theme === "dark" ? 3 : 1} flow={1.5} scale={0.65} softness={1} silk={0.15} grainAmount={0.035}
      interactive={false} clickSwirl={false} intro={false} dpr={1.75} />
  </div>;
};
