import { useEffect, useState } from "react";
import {
  animate,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  motion,
} from "motion/react";
import { canvasStore, useVivicState, useDisplayPreferences } from "@/state/canvasStore";

const REVEAL_DURATION_S = 0.78;
const REVEAL_DELAY_S = 0.12;
export const AWAKENING_TOTAL_MS = (REVEAL_DURATION_S + REVEAL_DELAY_S + 0.06) * 1000;

/**
 * Opaque black layer for STANDBY. On `stage.awaken`, a circular mask expands
 * from the orb (screen centre) until the atmosphere underneath fills the
 * screen — the orb is never hidden first, the surface just opens out of it.
 * Reduced motion: plain cross-fade.
 */
export const BlackVeil = () => {
  const stage = useVivicState((s) => s.stage);
  const preferences = useDisplayPreferences();
  const reduceMotion = useReducedMotion() || preferences.reducedMotion;
  const [revealing, setRevealing] = useState(false);
  const radius = useMotionValue(0);
  const mask = useMotionTemplate`radial-gradient(circle at 50% 50%, transparent ${radius}vmax, black calc(${radius}vmax + 8vmax))`;

  useEffect(() => {
    if (stage !== "AWAKENING" || reduceMotion) return;
    setRevealing(true);
    const controls = animate(radius, 172, {
      delay: REVEAL_DELAY_S,
      duration: REVEAL_DURATION_S,
      ease: [0.32, 0, 0.12, 1],
      onComplete: () =>
        canvasStore.internal({ type: "stage.awakening.complete" }),
    });
    return () => controls.stop();
  }, [stage, reduceMotion, radius]);

  // Reduced motion: quick fade, then confirm the same transition.
  useEffect(() => {
    if (stage !== "AWAKENING" || !reduceMotion) return;
    const timer = setTimeout(
      () => canvasStore.internal({ type: "stage.awakening.complete" }),
      400,
    );
    return () => clearTimeout(timer);
  }, [stage, reduceMotion]);

  if (stage === "WORKSPACE") return null;

  return (
    <motion.div
      className="absolute inset-0 z-20 bg-black"
      data-vivic-layer="veil"
      data-awaken-reveal={revealing || undefined}
      aria-hidden="true"
      style={reduceMotion ? undefined : { maskImage: mask, WebkitMaskImage: mask }}
      animate={reduceMotion ? { opacity: stage === "AWAKENING" ? 0 : 1 } : undefined}
      transition={{ duration: 0.4 }}
    />
  );
};
