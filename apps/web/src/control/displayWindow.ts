/**
 * The Display opens as one named window: the settings button and the
 * 「打开展示页」 command reuse it instead of stacking tabs. A voice result
 * arrives outside the user's click, so the browser may block the popup;
 * the caller then offers a one-tap retry.
 */
export type DisplayWindowResult = "opened" | "focused" | "blocked";

const DISPLAY_WINDOW_NAME = "vivic-display";
let current: { window: Window; canvasId: string } | null = null;

export const openDisplayWindow = (canvasId: string): DisplayWindowResult => {
  if (current && !current.window.closed && current.canvasId === canvasId) {
    current.window.focus();
    return "focused";
  }
  const opened = window.open(`/display?canvasId=${encodeURIComponent(canvasId)}`, DISPLAY_WINDOW_NAME);
  current = opened ? { window: opened, canvasId } : null;
  return opened ? "opened" : "blocked";
};
