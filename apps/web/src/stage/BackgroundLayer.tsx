import { useReducedMotion } from "motion/react";
import { AtmosphereBackground } from "@/components/atmosphere/AtmosphereBackground";
import { paletteFor } from "@/components/atmosphere/palettes";
import { useDisplayPreferences } from "@/state/canvasStore";

/** The 流光以太 atmosphere stays outside the React Flow transform; its static
 * palette wash also covers WebGL unavailability/loss without a React state
 * callback from the graphics driver (Firefox may dispatch that during another render). */
export const BackgroundLayer = ({ theme }: { theme: "light" | "dark" }) => {
  const preferences = useDisplayPreferences();
  const reduced = useReducedMotion() || preferences.reducedMotion;
  return <AtmosphereBackground theme={theme} palette={paletteFor(theme, preferences)} paused={reduced} layer="background" />;
};
