import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Load Google Maps API
const gmapsKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;
if (gmapsKey) {
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${gmapsKey}&libraries=directions,marker`;
  script.async = true;
  document.head.appendChild(script);
}

createRoot(document.getElementById("root")!).render(<App />);
