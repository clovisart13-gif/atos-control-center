import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Registra Service Worker para PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[Atos] Service Worker registrado:", reg.scope);
      })
      .catch((err) => {
        console.log("[Atos] Service Worker falhou:", err);
      });
  });
}
