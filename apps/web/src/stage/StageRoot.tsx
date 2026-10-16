import { CanvasView } from "@/canvas/CanvasView";
import { useVivicState, useDisplayPreferences } from "@/state/canvasStore";
import { BackgroundLayer } from "./BackgroundLayer";
import { BlackVeil } from "./BlackVeil";
import { OrbLayer } from "./OrbLayer";
import { SubtitleLayer } from "./SubtitleLayer";
import { useResolvedTheme } from "./useResolvedTheme";
import { motion, useReducedMotion, MotionConfig } from "motion/react";

/**
 * Display layering (bottom → top):
 * z-0  流光以太 atmosphere (independent, never transformed with the canvas)
 * z-10 React Flow canvas + cards
 * z-20 standby black veil / wake reveal mask
 * z-30 SmoothUI Siri Orb
 * z-40 transient subtitle
 */
export const StageRoot = () => {
  const stage = useVivicState((s) => s.stage);
  const reminderAlert = useVivicState((s) => s.subtitle?.priority === "reminder");
  const preferences = useDisplayPreferences();
  const reduced = useReducedMotion() || preferences.reducedMotion;
  const resolvedTheme = useResolvedTheme();

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}><div
      className="fixed inset-0 overflow-hidden bg-black"
      data-vivic-stage={stage}
      data-vivic-theme={resolvedTheme}
    >
      <BackgroundLayer theme={resolvedTheme} />
      <motion.div className="vivic-reminder-glow pointer-events-none absolute inset-0 z-[25]"
        aria-hidden="true" data-vivic-reminder-glow={reminderAlert ? "true" : undefined}
        animate={{ opacity: reminderAlert ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.6 }}
      />
      {stage === "WORKSPACE" && <CanvasView resolvedTheme={resolvedTheme} />}
      <BlackVeil />
      <OrbLayer />
      <SubtitleLayer />
    </div></MotionConfig>
  );
};
