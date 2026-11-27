import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";

import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapView.css";

// ========================================
// MAPTILER COMMERCIAL CONFIGURATION
// ========================================

const MAPTILER_KEY = "1xw9vK1MiCEMMyxmr2IT";

// Two full MapTiler styles — no overlay hacks, no NASA VIIRS
const DAY_STYLE   = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;
const NIGHT_STYLE = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

// MapTiler Terrain-RGB v2 — same source for both styles
const TERRAIN_SOURCE_URL = `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`;

const INITIAL_CENTER  = [-25, 18];
const INITIAL_ZOOM    = 1.35;
const INITIAL_PITCH   = 0;
const INITIAL_BEARING = 0;

// Camera timing — snappier than 6 s / 5 s previous values
const FOCUS_DURATION  = 4800;
const RETURN_DURATION = 4000;

setWorkerUrl(workerUrl);

// ========================================
// HELPERS
// ========================================

function getDestinationZoom(destination) {
  if (Number.isFinite(destination?.zoom))      return destination.zoom;
  if (Number.isFinite(destination?.zoomLevel)) return destination.zoomLevel;

  switch (destination?.type) {
    case "country": return 5.5;
    case "region":  return 8.5;
    case "city":
    default:        return 12.2;
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
    !Number.isFinite(latitude)  ||
    Math.abs(longitude) > 180   ||
    Math.abs(latitude)  > 90
  ) {
    return null;
  }
  return [longitude, latitude];
}

function getDestinationName(destination) {
  return (
    destination?.name    ||
    destination?.city    ||
    destination?.region  ||
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
        corner.every((v) => Number.isFinite(v))
    )
  );
}

function getSidePanelPadding() {
  if (typeof window === "undefined") return 420;
  if (window.innerWidth <= 600) return Math.round(window.innerWidth * 0.45);
  if (window.innerWidth <= 900) return 360;
  return 420;
}

// ========================================
// GREENLAND PERMANENT MARKER
// ========================================

const GREENLAND_LNG_LAT = [-42.6043, 71.7069]; // Central Greenland ice sheet

function createGreenlandMarker(map) {
  const el = document.createElement("div");
  el.className = "greenland-dot";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", "The Spaceship Perspective — Greenland");

  const popup = document.createElement("div");
  popup.className = "greenland-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "The Spaceship Perspective");
  popup.innerHTML = `
    <div class="greenland-popup-header">
      <div class="greenland-popup-meta">
        <span class="greenland-popup-badge"></span>
        <span class="greenland-popup-coords">GREENLAND · 71.71°N, 42.60°W</span>
      </div>
      <div class="greenland-popup-title-row">
        <h3 class="greenland-popup-title">The Spaceship Perspective</h3>
        <button type="button" class="greenland-popup-close" aria-label="Close popup">&times;</button>
      </div>
    </div>
    <div class="greenland-popup-body">
      <p>Imagine being in a spaceship visiting earth for the first time, searching for the most advanced city on the planet. The only relevant question to ask would be when and where?</p>
      <p>In 1850 that would have been London. The Soviets sending man into space in 1950s would put them at height of &ldquo;civilization&rdquo;. In 2000 New York would be the place to be. In 2030 Shenzhen would have advantages over other cities. In 1030, it would be the city of light where algebra was invented, Baghdad. Prior to that, the Romans and countless other civilizations would have had their turn. Yet, we seem to only focus on an era that puts our modern tribe in a better light as thought we are weaponizing Sun Tsue&rsquo;s famous axiom: Take your enemy where you can defeat them. Yes, advanced cities and civilizations come and go, however our tribal affiliations and infatuations with them linger on compromising our ability to see human experience objectively and holistically.</p>
      <p class="greenland-popup-question">What is the antidote to this modern tribal bias?</p>
      <p class="greenland-popup-answer">Observing things the way they are. When you disembark from your ship be the gray man and remember you are only here to observe.</p>
    </div>
  `;
  document.body.appendChild(popup);

  let hideTimer = null;
  let isPinned = false;
  let isOpen = false;

  const positionPopup = () => {
    const rect = el.getBoundingClientRect();
    const margin = 16;
    const gap = 14;
    const popW = popup.offsetWidth || 380;
    const popH = popup.offsetHeight || 360;

    // Prefer opening to the right of the dot; flip left if near right edge
    let left = rect.right + gap;
    if (left + popW > window.innerWidth - margin) {
      left = rect.left - popW - gap;
    }
    if (left < margin) {
      left = Math.max(margin, (window.innerWidth - popW) / 2);
    }

    // Vertically center on the dot, clamped inside viewport
    let top = rect.top + rect.height / 2 - popH / 2;
    if (top < margin) top = margin;
    if (top + popH > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - popH - margin);
    }

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  };

  const openPopup = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!isOpen) {
      isOpen = true;
      popup.classList.add("is-visible");
    }
    positionPopup();
  };

  const scheduleClose = () => {
    if (isPinned) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      isOpen = false;
      popup.classList.remove("is-visible");
    }, 220);
  };

  const forceClose = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    isPinned = false;
    isOpen = false;
    popup.classList.remove("is-visible");
  };

  const closeBtn = popup.querySelector(".greenland-popup-close");

  const onDotEnter = () => openPopup();
  const onDotLeave = () => scheduleClose();
  const onDotClick = (e) => {
    e.stopPropagation();
    if (isPinned && isOpen) {
      forceClose();
    } else {
      isPinned = true;
      openPopup();
    }
  };
  const onDotKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onDotClick(e);
    }
  };
  const onPopupEnter = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };
  const onPopupLeave = () => scheduleClose();
  const onCloseClick = (e) => {
    e.stopPropagation();
    forceClose();
  };
  const onMapMove = () => {
    if (isOpen) positionPopup();
  };

  el.addEventListener("mouseenter", onDotEnter);
  el.addEventListener("mouseleave", onDotLeave);
  el.addEventListener("click", onDotClick);
  el.addEventListener("keydown", onDotKeyDown);
  popup.addEventListener("mouseenter", onPopupEnter);
  popup.addEventListener("mouseleave", onPopupLeave);
  closeBtn?.addEventListener("click", onCloseClick);
  map.on("move", onMapMove);

  const marker = new Marker({ element: el, anchor: "center" })
    .setLngLat(GREENLAND_LNG_LAT)
    .addTo(map);

  return () => {
    if (hideTimer) clearTimeout(hideTimer);
    el.removeEventListener("mouseenter", onDotEnter);
    el.removeEventListener("mouseleave", onDotLeave);
    el.removeEventListener("click", onDotClick);
    el.removeEventListener("keydown", onDotKeyDown);
    popup.removeEventListener("mouseenter", onPopupEnter);
    popup.removeEventListener("mouseleave", onPopupLeave);
    closeBtn?.removeEventListener("click", onCloseClick);
    map.off("move", onMapMove);
    marker.remove();
    popup.remove();
  };
}

// Re-apply MapTiler terrain after a style switch (setStyle wipes all sources)
function applyTerrain(map) {
  try {
    if (!map.getSource("maptiler-terrain")) {
      map.addSource("maptiler-terrain", {
        type:     "raster-dem",
        url:      TERRAIN_SOURCE_URL,
        tileSize: 512,
        maxzoom:  14,
      });
    }
    map.setTerrain({ source: "maptiler-terrain", exaggeration: 1.2 });
  } catch (err) {
    console.warn("Terrain notice:", err);
  }
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
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const markerRef     = useRef(null);
  const mapLoadedRef  = useRef(false);

  // Stable refs — updated every render, read inside closures
  const destinationRef      = useRef(selectedDestination);
  const focusStartRef       = useRef(onFocusStart);
  const focusCompleteRef    = useRef(onFocusComplete);
  const returnCompleteRef   = useRef(onReturnComplete);
  const returnToOverviewRef = useRef(returnToOverview);
  const mapModeRef          = useRef(mapMode);

  const focusDestinationRef        = useRef(null);
  const returnToOverviewActionRef  = useRef(null);
  const cameraEndHandlerRef        = useRef(null);

  // Keep all prop refs in sync
  useEffect(() => {
    destinationRef.current      = selectedDestination;
    focusStartRef.current       = onFocusStart;
    focusCompleteRef.current    = onFocusComplete;
    returnCompleteRef.current   = onReturnComplete;
    returnToOverviewRef.current = returnToOverview;
    mapModeRef.current          = mapMode;
  }, [
    selectedDestination,
    onFocusStart,
    onFocusComplete,
    onReturnComplete,
    returnToOverview,
    mapMode,
  ]);

  // ── Map initialisation (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const initialStyle = mapModeRef.current === "night" ? NIGHT_STYLE : DAY_STYLE;

    const map = new MapLibreMap({
      container: containerRef.current,
      style:     initialStyle,
      center:    INITIAL_CENTER,
      zoom:      INITIAL_ZOOM,
      pitch:     INITIAL_PITCH,
      bearing:   INITIAL_BEARING,
      minZoom:   1,
      maxZoom:   20,

      // ── PERFORMANCE SETTINGS ──────────────────────────────────────
      // Drop in-flight tile requests as soon as the camera moves, so
      // the queue never backs up during fast zoom gestures.
      cancelPendingTileRequestsWhileZooming: true,
      // Smaller cache = less memory churn; enough to avoid re-fetching
      // tiles at zoom levels just visited.
      maxTileCacheZoomLevels: 6,
      // MapLibre 3-D terrain overdraw optimisation
      optimizeForTerrain: true,
      // ─────────────────────────────────────────────────────────────

      attributionControl: { compact: true },

      // Full interactivity
      dragPan:         true,
      scrollZoom:      true,
      touchZoomRotate: true,
      touchPitch:      true,
      dragRotate:      true,
      pitchWithRotate: true,
      doubleClickZoom: true,
      boxZoom:         true,
      keyboard:        true,
    });

    mapRef.current = map;

    map.addControl(
      new NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }),
      "bottom-right"
    );

    // ── Camera helpers ───────────────────────────────────────────────────────

    const cancelPendingCameraEnd = () => {
      if (cameraEndHandlerRef.current) {
        map.off("moveend", cameraEndHandlerRef.current);
        cameraEndHandlerRef.current = null;
      }
    };

    // ── Marker ───────────────────────────────────────────────────────────────

    const updateMarker = (coordinates, destination) => {
      const name = getDestinationName(destination);

      if (markerRef.current) {
        markerRef.current.setLngLat(coordinates);
        const labelEl = markerRef.current.getElement().querySelector(".marker-label");
        if (labelEl) labelEl.textContent = name;
        markerRef.current.getElement().setAttribute("aria-label", name);
        return;
      }

      const markerElement = document.createElement("div");
      markerElement.className = "map-destination-marker";
      markerElement.setAttribute("role", "img");
      markerElement.setAttribute("aria-label", name);
      markerElement.innerHTML = `
        <div class="marker-beacon"></div>
        <div class="marker-core"></div>
        <div class="marker-label">${name}</div>
      `;

      markerRef.current = new Marker({ element: markerElement, anchor: "center" })
        .setLngLat(coordinates)
        .addTo(map);
    };

    // ── focusDestination ─────────────────────────────────────────────────────

    const focusDestination = (destination) => {
      if (!destination || !mapLoadedRef.current || returnToOverviewRef.current) return;

      const coordinates = getDestinationCoordinates(destination);
      if (!coordinates) {
        console.error("Invalid destination coordinates:", destination);
        return;
      }

      cancelPendingCameraEnd();
      map.stop();

      focusStartRef.current?.(destination);

      const handleFocusMoveEnd = () => {
        if (cameraEndHandlerRef.current !== handleFocusMoveEnd) return;
        cameraEndHandlerRef.current = null;
        if (destinationRef.current !== destination)  return;
        if (returnToOverviewRef.current)             return;
        focusCompleteRef.current?.(destination);
      };
      cameraEndHandlerRef.current = handleFocusMoveEnd;
      map.once("moveend", handleFocusMoveEnd);

      updateMarker(coordinates, destination);

      const padding = {
        top:    50,
        right:  getSidePanelPadding(),
        bottom: 50,
        left:   60,
      };

      const targetZoom    = destination.zoom    || getDestinationZoom(destination);
      const targetPitch   = destination.pitch   ?? 54;
      const targetBearing = destination.bearing ?? 26;

      const animationOptions = {
        duration: FOCUS_DURATION,
        curve:    1.1,       // was 1.32 — softer arc = less roller-coaster feeling
        speed:    0.8,       // cap velocity so tiles can keep up
        easing:   easeInOutCubic,
        pitch:    targetPitch,
        bearing:  targetBearing,
        padding,
        essential: true,
      };

      if (isValidBounds(destination.bounds)) {
        map.fitBounds(destination.bounds, { ...animationOptions, maxZoom: targetZoom });
      } else {
        map.flyTo({ center: coordinates, zoom: targetZoom, ...animationOptions });
      }
    };

    // ── returnToOverview ─────────────────────────────────────────────────────

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
        center:   INITIAL_CENTER,
        zoom:     INITIAL_ZOOM,
        pitch:    INITIAL_PITCH,
        bearing:  INITIAL_BEARING,
        duration: RETURN_DURATION,
        curve:    1.1,       // was 1.25
        easing:   easeInOutCubic,
        padding:  { top: 0, right: 0, bottom: 0, left: 0 },
        essential: true,
      });
    };

    focusDestinationRef.current       = focusDestination;
    returnToOverviewActionRef.current = returnToOverviewAction;

    // ── Map load → terrain ───────────────────────────────────────────────────

    let cleanupGreenland = null;

    const handleMapLoad = () => {
      if (mapRef.current !== map) return;

      applyTerrain(map);
      cleanupGreenland = createGreenlandMarker(map);

      mapLoadedRef.current = true;

      if (returnToOverviewRef.current) {
        returnToOverviewAction();
      } else if (destinationRef.current) {
        focusDestination(destinationRef.current);
      }
    };

    const handleMapError = (event) => {
      console.warn("MapLibre event:", event.error || event);
    };

    map.on("load",  handleMapLoad);
    map.on("error", handleMapError);

    return () => {
      cancelPendingCameraEnd();
      cleanupGreenland?.();
      cleanupGreenland = null;
      map.stop();
      map.off("load",  handleMapLoad);
      map.off("error", handleMapError);

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      mapLoadedRef.current              = false;
      focusDestinationRef.current       = null;
      returnToOverviewActionRef.current = null;

      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Night / Day style switch ─────────────────────────────────────────────
  // Uses map.setStyle() to swap the ENTIRE style (not an overlay).
  // After the style loads, terrain is re-applied because setStyle wipes all
  // user-added sources and layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const targetStyle = mapMode === "night" ? NIGHT_STYLE : DAY_STYLE;

    // Avoid unnecessary reload if already on the right style
    const currentStyleUrl = map.getStyle()?.sprite?.replace("/sprite", "") ?? "";
    const alreadyNight    = currentStyleUrl.includes("streets-v2-dark");
    const alreadyDay      = currentStyleUrl.includes("hybrid");

    if (mapMode === "night" && alreadyNight) return;
    if (mapMode === "day"   && alreadyDay)   return;

    // setStyle replaces everything — re-apply terrain once styledata fires
    map.setStyle(targetStyle);
    map.once("styledata", () => {
      applyTerrain(map);
    });
  }, [mapMode]);

  // ── Destination / return triggers ────────────────────────────────────────
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
      aria-label={`WorldSpin 3D ${mapMode} Map`}
    />
  );
}

export default MapView;
