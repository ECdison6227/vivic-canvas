import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SiriOrb from "@/components/smoothui/siri-orb";

/** Source-build counterpart of the deployed screensaver's remote event hook. */
export function RemoteScreensaver() {
  const node = useRef<HTMLDialogElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocus = useRef<Element | null>(null);
  const [sleeping, setSleeping] = useState(false), [leaving, setLeaving] = useState(false);
  const wake = useCallback(() => {
    setLeaving(true); if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setSleeping(false); setLeaving(false); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400);
  }, []);
  useEffect(() => {
    const remote = (event: Event) => {
      const desired = (event as CustomEvent<{ sleeping: boolean }>).detail?.sleeping;
      if (desired === true) { returnFocus.current = document.activeElement; setLeaving(false); setSleeping(true); }
      else if (desired === false) wake();
    };
    window.addEventListener("vivic:remote-screen", remote);
    return () => { window.removeEventListener("vivic:remote-screen", remote); if (timer.current) clearTimeout(timer.current); };
  }, [wake]);
  useEffect(() => {
    const dialog = node.current; if (!dialog) return;
    if (sleeping) {
      if (!dialog.open) dialog.showModal(); document.documentElement.setAttribute("data-vivic-screensaver-active", "true");
      window.dispatchEvent(new Event("vivic:screensaver-change"));
    } else if (dialog.open) {
      dialog.close(); document.documentElement.removeAttribute("data-vivic-screensaver-active"); window.dispatchEvent(new Event("vivic:screensaver-change"));
      if (returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) returnFocus.current.focus({ preventScroll: true });
    }
    return () => { document.documentElement.removeAttribute("data-vivic-screensaver-active"); };
  }, [sleeping]);
  return createPortal(<dialog ref={node} aria-label="Vivic 息屏，轻触唤醒" onCancel={event => { event.preventDefault(); wake(); }} onClick={wake}
    onKeyDown={event => { if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) { event.preventDefault(); wake(); } }}
    style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0,
      background: "#000", color: "#fff", opacity: leaving ? 0 : 1, transition: "opacity 400ms ease", overflow: "hidden" }}>
    <div style={{ display: "grid", placeItems: "center", width: "100%", height: "100%" }}><SiriOrb size="220px" state="idle" animationDuration={28} /></div>
  </dialog>, document.body);
}
