import { lazy, Suspense } from "react";
import { ControlApp } from "@/control/ControlApp";
import { DisplayApp } from "@/display/DisplayApp";

/**
 * One app, three pages (pathname routing, no router dependency):
 *   /            -> user page: conversation + text/voice input
 *   /control     -> settings (same owner window as `/`, switched in place)
 *   /display     -> read-only stage; ?canvasId= pins a canvas
<<<<<<< HEAD
 *   (unknown)    -> /
=======
 *   /control     -> input, canvas manager, data actions (sole writer)
 *   /playground  -> dev builds only: Card Playground with sample data
 *   (unknown)    -> /control
>>>>>>> 300deb5 (feat(cards): scene registry and 20 scene card components)
 */
const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isDisplay = rawPath === "/display";
const isPlayground = import.meta.env.DEV && rawPath === "/playground";
const CardPlayground = lazy(() => import("@/dev/CardPlayground").then(module => ({ default: module.CardPlayground })));

<<<<<<< HEAD
if (rawPath !== "/display" && rawPath !== "/control" && rawPath !== "/") {
  window.location.replace(`/${window.location.search}`);
=======
if (rawPath !== "/display" && rawPath !== "/control" && !isPlayground) {
  window.location.replace(`/control${window.location.search}`);
>>>>>>> 300deb5 (feat(cards): scene registry and 20 scene card components)
}

function App() {
  if (isPlayground) return <Suspense fallback={null}><CardPlayground /></Suspense>;
  return isDisplay ? <DisplayApp /> : <ControlApp />;
}

export default App;
