import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
} from "maplibre-gl";

import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapView.css";

// ========================================
// GLOBAL MAP CONFIGURATION
// ========================================

const INITIAL_CENTER = [-25, 18];
const INITIAL_ZOOM = 1.35;

const FOCUS_DURATION = 6200;
const RETURN_DURATION = 5200;

const DAY_LAYER_ID = "eox-day-layer";
const NIGHT_LAYER_ID = "nasa-black-marble-layer";

setWorkerUrl(workerUrl);

// ========================================
// DESTINATION HELPERS
// ========================================

function getDestinationZoom(destination) {
  if (Number.isFinite(destination?.zoom)) return destination.zoom;
  if (Number.isFinite(destination?.zoomLevel)) return destination.zoomLevel;

  switch (destination?.type) {
    case "country":
      return 4.2;
    case "region":
      return 6;
    case "city":
    default:
      return 8.5;
  }
}

function getDestinationCoordinates(destination) {
  const longitude = Number(
    destination?.lon ??
      destination?.coordinates?.longitude ??
      destination?.coordinates?.lon
  );

  const latitude = Number(
    destination?.lat ??
      destination?.coordinates?.latitude ??
      destination?.coordinates?.lat
  );

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  ) {
    return null;
  }

  return [longitude, latitude];
}

function getDestinationName(destination) {
  return (
    destination?.name ||
    destination?.city ||
    destination?.region ||
    destination?.country ||
    "Selected destination"
  );
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function isValidBounds(bounds) {
  return (
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    bounds.every(
      (corner) =>
        Array.isArray(corner) &&
        corner.length === 2 &&
        corner.every((value) => Number.isFinite(value))
    )
  );
}

function getSidePanelPadding() {
  if (typeof window === "undefined") return 400;
  if (window.innerWidth <= 600) return Math.round(window.innerWidth * 0.5);
  if (window.innerWidth <= 900) return 350;
  return 400;
}

// ========================================
// MAP COMPONENT
// ========================================

function MapView({
  selectedDestination,
  onFocusStart,
  onFocusComplete,
  returnToOverview = false,
  onReturnComplete,
  mapMode = "day",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapLoadedRef = useRef(false);

  const destinationRef = useRef(selectedDestination);
  const focusStartRef = useRef(onFocusStart);
  const focusCompleteRef = useRef(onFocusComplete);
  const returnCompleteRef = useRef(onReturnComplete);
  const returnToOverviewRef = useRef(returnToOverview);
  const mapModeRef = useRef(mapMode);

  const focusDestinationRef = useRef(null);
  const returnToOverviewActionRef = useRef(null);
  const cameraEndHandlerRef = useRef(null);

  // Keep the latest props available to MapLibre callbacks without rebuilding the map.
  destinationRef.current = selectedDestination;
  focusStartRef.current = onFocusStart;
  focusCompleteRef.current = onFocusComplete;
  returnCompleteRef.current = onReturnComplete;
  returnToOverviewRef.current = returnToOverview;
  mapModeRef.current = mapMode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 1,
      maxZoom: 14,
      maxTileCacheZoomLevels: 8,
      cancelPendingTileRequestsWhileZooming: false,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });

    mapRef.current = map;

    // Remove the previous moveend listener before interrupting a camera move.
    const cancelPendingCameraEnd = () => {
      if (cameraEndHandlerRef.current) {
        map.off("moveend", cameraEndHandlerRef.current);
        cameraEndHandlerRef.current = null;
      }
    };

    // ==================================
    // DAY / NIGHT IMAGERY SOURCES
    // ==================================

    const getImageryInsertionPoint = () => {
      // Keep the imagery above land/water fill layers but below roads and labels.
      const firstOverlayLayer = map
        .getStyle()
        .layers.find((layer) => layer.type === "line" || layer.type === "symbol");

      return firstOverlayLayer?.id;
    };

    const addLayerBelowOverlays = (layer) => {
      const beforeId = getImageryInsertionPoint();

      if (beforeId) {
        map.addLayer(layer, beforeId);
      } else {
        map.addLayer(layer);
      }
    };

    const addImageryLayers = () => {
      // DAY: EOxCloudless Sentinel-2 global mosaic (2016).
      if (!map.getSource("eox-day-source")) {
        map.addSource("eox-day-source", {
          type: "raster",
          tiles: [
            "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
          ],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 13,
          attribution:
            "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)",
        });
      }

      if (!map.getLayer(DAY_LAYER_ID)) {
        addLayerBelowOverlays({
          id: DAY_LAYER_ID,
          type: "raster",
          source: "eox-day-source",
          layout: {
            visibility: mapModeRef.current === "day" ? "visible" : "none",
          },
          paint: {
            "raster-opacity": 1,
            "raster-fade-duration": 250,
          },
        });
      }

      // NIGHT: NASA VIIRS Black Marble nighttime lights (2016 composite).
      if (!map.getSource("nasa-black-marble")) {
        map.addSource("nasa-black-marble", {
          type: "raster",
          tiles: [
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
          ],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 8,
          attribution: "NASA GIBS - VIIRS Black Marble (2016)",
        });
      }

      if (!map.getLayer(NIGHT_LAYER_ID)) {
        addLayerBelowOverlays({
          id: NIGHT_LAYER_ID,
          type: "raster",
          source: "nasa-black-marble",
          layout: {
            visibility: mapModeRef.current === "night" ? "visible" : "none",
          },
          paint: {
            "raster-opacity": 0.9,
            "raster-fade-duration": 250,
          },
        });
      }

      applyMapMode(mapModeRef.current);
    };

    const applyMapMode = (mode) => {
      if (map.getLayer(DAY_LAYER_ID)) {
        map.setLayoutProperty(
          DAY_LAYER_ID,
          "visibility",
          mode === "day" ? "visible" : "none"
        );
      }

      if (map.getLayer(NIGHT_LAYER_ID)) {
        map.setLayoutProperty(
          NIGHT_LAYER_ID,
          "visibility",
          mode === "night" ? "visible" : "none"
        );
      }
    };

    // ==================================
    // LOCATION MARKER
    // ==================================

    const updateMarker = (coordinates, destination) => {
      const name = getDestinationName(destination);

      if (markerRef.current) {
        markerRef.current.setLngLat(coordinates);
        markerRef.current.getElement().setAttribute("aria-label", name);
        return;
      }

      const markerElement = document.createElement("div");
      markerElement.className = "map-destination-marker";
      markerElement.setAttribute("role", "img");
      markerElement.setAttribute("aria-label", name);

      markerRef.current = new Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat(coordinates)
        .addTo(map);
    };

    // ==================================
    // FOCUS ON THE SELECTED DESTINATION
    // ==================================

    const focusDestination = (destination) => {
      if (
        !destination ||
        !mapLoadedRef.current ||
        returnToOverviewRef.current
      ) {
        return;
      }

      const coordinates = getDestinationCoordinates(destination);

      if (!coordinates) {
        console.error("Invalid destination coordinates:", destination);
        return;
      }

      cancelPendingCameraEnd();
      map.stop();

      // Start the wheel, headline and sidebar transitions with the camera animation.
      focusStartRef.current?.(destination);

      const handleFocusMoveEnd = () => {
        if (cameraEndHandlerRef.current !== handleFocusMoveEnd) return;
        cameraEndHandlerRef.current = null;

        // Ignore stale callbacks if another destination/return was requested.
        if (destinationRef.current !== destination) return;
        if (returnToOverviewRef.current) return;

        focusCompleteRef.current?.(destination);
      };

      cameraEndHandlerRef.current = handleFocusMoveEnd;
      map.once("moveend", handleFocusMoveEnd);

      updateMarker(coordinates, destination);

      const padding = {
        top: 42,
        right: getSidePanelPadding(),
        bottom: 42,
        left: 58,
      };

      const animationOptions = {
        duration: FOCUS_DURATION,
        curve: 1.25,
        easing: easeInOutCubic,
        padding,
        essential: true,
      };

      // Regions/countries can provide bounds to frame the whole area.
      if (isValidBounds(destination.bounds)) {
        map.fitBounds(destination.bounds, {
          ...animationOptions,
          maxZoom: getDestinationZoom(destination),
        });
      } else {
        map.flyTo({
          center: coordinates,
          zoom: getDestinationZoom(destination),
          ...animationOptions,
        });
      }
    };

    // ==================================
    // RETURN TO THE GLOBAL VIEW
    // ==================================

    const returnToOverviewAction = () => {
      if (!mapLoadedRef.current) return;

      cancelPendingCameraEnd();
      map.stop();

      const handleReturnMoveEnd = () => {
        if (cameraEndHandlerRef.current !== handleReturnMoveEnd) return;
        cameraEndHandlerRef.current = null;

        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }

        returnCompleteRef.current?.();
      };

      cameraEndHandlerRef.current = handleReturnMoveEnd;
      map.once("moveend", handleReturnMoveEnd);

      map.flyTo({
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        duration: RETURN_DURATION,
        curve: 1.2,
        easing: easeInOutCubic,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        essential: true,
      });
    };

    focusDestinationRef.current = focusDestination;
    returnToOverviewActionRef.current = returnToOverviewAction;

    // ==================================
    // MAP LOAD / ERROR
    // ==================================

    const handleMapLoad = () => {
      if (mapRef.current !== map) return;

      // Satellite providers are independent. Failure of one should not
      // prevent the other mode or the vector map from remaining available.
      try {
        addImageryLayers();
      } catch (error) {
        console.error("Map imagery setup failed:", error);
      }

      mapLoadedRef.current = true;

      // Process any request that arrived while the map was loading.
      if (returnToOverviewRef.current) {
        returnToOverviewAction();
      } else if (destinationRef.current) {
        focusDestination(destinationRef.current);
      }
    };

    const handleMapError = (event) => {
      console.error("MapLibre loading error:", event.error || event);
    };

    map.on("load", handleMapLoad);
    map.on("error", handleMapError);

    // ==================================
    // CLEANUP
    // ==================================

    return () => {
      cancelPendingCameraEnd();
      map.stop();
      map.off("load", handleMapLoad);
      map.off("error", handleMapError);

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      mapLoadedRef.current = false;
      focusDestinationRef.current = null;
      returnToOverviewActionRef.current = null;

      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch only the raster layer visibility; do not recreate the map or move the camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (map.getLayer(DAY_LAYER_ID)) {
      map.setLayoutProperty(
        DAY_LAYER_ID,
        "visibility",
        mapMode === "day" ? "visible" : "none"
      );
    }

    if (map.getLayer(NIGHT_LAYER_ID)) {
      map.setLayoutProperty(
        NIGHT_LAYER_ID,
        "visibility",
        mapMode === "night" ? "visible" : "none"
      );
    }
  }, [mapMode]);

  // React state drives map camera movement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (returnToOverview) {
      returnToOverviewActionRef.current?.();
      return;
    }

    if (selectedDestination) {
      focusDestinationRef.current?.(selectedDestination);
    }
  }, [selectedDestination, returnToOverview]);

  return (
    <div
      ref={containerRef}
      className="maplibre-canvas"
      aria-label={`Interactive ${mapMode} world map`}
    />
  );
}

export default MapView;
