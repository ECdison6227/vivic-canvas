import { ControlApp } from "@/control/ControlApp";
import { DisplayApp } from "@/display/DisplayApp";

/**
 * One app, three pages (pathname routing, no router dependency):
 *   /            -> user page: conversation + text/voice input
 *   /control     -> settings (same owner window as `/`, switched in place)
 *   /display     -> read-only stage; ?canvasId= pins a canvas
 *   (unknown)    -> /
 */
const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isDisplay = rawPath === "/display";

if (rawPath !== "/display" && rawPath !== "/control" && rawPath !== "/") {
  window.location.replace(`/${window.location.search}`);
}

function App() {
  return isDisplay ? <DisplayApp /> : <ControlApp />;
}

export default App;
