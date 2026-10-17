import { lazy, Suspense } from "react";
import { ControlApp } from "@/control/ControlApp";
import { DisplayApp } from "@/display/DisplayApp";

/**
 * One app, three pages (pathname routing, no router dependency):
 *   /            -> user page: text/voice input; cards the user drags in
 *   /control     -> settings (same owner window as `/`, switched in place)
 *   /display     -> read-only stage; ?canvasId= pins a canvas
 *   /playground  -> dev builds only: Card Playground with sample data
 *   /landing/    -> beta landing (landing/index.html -> src/landing/, separate entry); its signup opens /
 *   (unknown)    -> /
 */
const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isDisplay = rawPath === "/display";
const isPlayground = import.meta.env.DEV && rawPath === "/playground";
// Production builds drop the playground chunk entirely.
const CardPlayground = import.meta.env.DEV ? lazy(() => import("@/dev/CardPlayground").then(module => ({ default: module.CardPlayground }))) : null;

if (/^\/landing(?:\/|$)/.test(window.location.pathname) && window.location.pathname !== "/landing/") {
  // The landing is its own HTML entry; only /landing/ resolves to it. Any other
  // path under it (/landing, or a pasted link with trailing punctuation) lands there too.
  window.location.replace(`/landing/${window.location.search}${window.location.hash}`);
} else if (rawPath !== "/display" && rawPath !== "/control" && rawPath !== "/" && !isPlayground) {
  window.location.replace(`/${window.location.search}`);
}

function App() {
  if (isPlayground && CardPlayground) return <Suspense fallback={null}><CardPlayground /></Suspense>;
  return isDisplay ? <DisplayApp /> : <ControlApp />;
}

export default App;
