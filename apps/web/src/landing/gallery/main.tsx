import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "@/cards/scene/sceneCards.css";
import "@/control/userCardLayer.css";
import "../landing.css";
import "./gallery.css";
import { CardGallery } from "./CardGallery";

createRoot(document.getElementById("gallery-root")!).render(
  <StrictMode>
    <CardGallery />
  </StrictMode>,
);
