// Minimal type shim for leaflet-rotate (no official @types package)
declare module "leaflet-rotate" {
  // Side-effect import: patches L.Map
}

import "leaflet";
declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    touchRotate?: boolean;
    rotateControl?: boolean | { closeOnZeroBearing?: boolean };
    bearing?: number;
  }
  interface Map {
    setBearing(bearing: number): void;
    getBearing(): number;
  }
}
