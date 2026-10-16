import { lazy, Suspense } from "react";
import { ControlApp } from "@/control/ControlApp";
import { DisplayApp } from "@/display/DisplayApp";

/**
 * One app, two pages (pathname routing, no router dependency):
 *   /            -> /control (redirect)
 *   /display     -> read-only stage; ?canvasId= pins a canvas
 *   /control     -> input, canvas manager, data actions (sole writer)
 *   /playground  -> dev builds only: Card Playground with sample data
 *   (unknown)    -> /control
 */
const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isDisplay = rawPath === "/display";
const isPlayground = import.meta.env.DEV && rawPath === "/playground";
// Production builds drop the playground chunk entirely.
const CardPlayground = import.meta.env.DEV ? lazy(() => import("@/dev/CardPlayground").then(module => ({ default: module.CardPlayground }))) : null;

if (rawPath !== "/display" && rawPath !== "/control" && !isPlayground) {
  window.location.replace(`/control${window.location.search}`);
}

function App() {
  if (isPlayground && CardPlayground) return <Suspense fallback={null}><CardPlayground /></Suspense>;
  return isDisplay ? <DisplayApp /> : <ControlApp />;
}

export default App;
