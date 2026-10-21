import { createRoot } from "react-dom/client";
import "../../index.css";
import { MobileConsole } from "./MobileConsole";

// This separate entry deliberately never imports App or the desktop owner runtime.
createRoot(document.getElementById("root")!).render(<MobileConsole />);
