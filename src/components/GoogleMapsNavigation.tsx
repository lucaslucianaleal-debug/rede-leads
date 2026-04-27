import { useEffect, useRef, useState } from "react";

interface GoogleMapsNavigationProps {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  containerHeight?: string;
  onRouteCalculated?: (distance: string, duration: string) => void;
}

export function GoogleMapsNavigation({
  origin,
  destination,
  containerHeight = "100%",
  onRouteCalculated,
}: GoogleMapsNavigationProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        zoom: 15,
        center: origin,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
      });

      directionsServiceRef.current = new google.maps.DirectionsService();
      directionsRendererRef.current = new google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        polylineOptions: {
          strokeColor: "#3b82f6",
          strokeOpacity: 0.85,
          strokeWeight: 5,
        },
        markerOptions: {
          origin: new google.maps.MarkerImage(
            "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png"
          ),
          destination: new google.maps.MarkerImage(
            "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png"
          ),
        },
      });
    }

    // Request directions
    if (directionsServiceRef.current && directionsRendererRef.current) {
      directionsServiceRef.current.route(
        {
          origin: origin,
          destination: destination,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            directionsRendererRef.current!.setDirections(result);
            const leg = result.routes[0].legs[0];
            if (onRouteCalculated && leg) {
              onRouteCalculated(
                leg.distance?.text || "N/A",
                leg.duration?.text || "N/A"
              );
            }
          }
        }
      );
    }
  }, [origin, destination, onRouteCalculated]);

  return <div ref={mapRef} style={{ width: "100%", height: containerHeight }} />;
}
