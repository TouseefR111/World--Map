import { useRef, useState } from "react";
import gsap from "gsap";
import MapView from "./MapView";
import {
  Globe2,
  MapPin,
  History,
  Info,
  Volume2,
  VolumeX,
  Sparkles,
  X,
  Sun,
  Moon,
} from "lucide-react";
import "./App.css";

// Temporary sample records. The data shape supports cities, regions and countries.
// The 100 wheel numbers currently map to these five demo records until Firebase is connected.
const destinations = [
  {
    id: "paris",
    number: 0,
    name: "Paris",
    city: "Paris",
    country: "France",
    type: "city",
    lon: 2.3522,
    lat: 48.8566,
    zoom: 8.5,
    image:
      "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=85",
    story:
      "Paris is a historic European capital celebrated for its architecture, art, fashion and cuisine. From the Eiffel Tower and the Louvre to its neighbourhoods and café culture, the city combines centuries of history with modern urban life.",
  },
  {
    id: "tokyo",
    number: 0,
    name: "Tokyo",
    city: "Tokyo",
    country: "Japan",
    type: "city",
    lon: 139.6917,
    lat: 35.6895,
    zoom: 8.5,
    image:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=85",
    story:
      "Tokyo blends ancient Japanese traditions with advanced technology. Its famous districts, historic temples, exceptional food culture and efficient transport make it one of the world's most fascinating metropolitan areas.",
  },
  {
    id: "new-york",
    number: 0,
    name: "New York",
    city: "New York",
    country: "United States",
    type: "city",
    lon: -74.006,
    lat: 40.7128,
    zoom: 8.5,
    image:
      "https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=1200&q=85",
    story:
      "New York is an international centre of finance, culture and creativity. Its iconic skyline, diverse neighbourhoods, Broadway theatres, museums and Central Park give the city a distinctive energy.",
  },
  {
    id: "rio-de-janeiro",
    number: 0,
    name: "Rio de Janeiro",
    city: "Rio de Janeiro",
    country: "Brazil",
    type: "city",
    lon: -43.1729,
    lat: -22.9068,
    zoom: 8.5,
    image:
      "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=1200&q=85",
    story:
      "Rio de Janeiro combines dramatic mountains, tropical beaches and vibrant Brazilian culture. Its famous landmarks include Christ the Redeemer, Sugarloaf Mountain and Copacabana Beach.",
  },
  {
    id: "cape-town",
    number: 0,
    name: "Cape Town",
    city: "Cape Town",
    country: "South Africa",
    type: "city",
    lon: 18.4241,
    lat: -33.9249,
    zoom: 8.5,
    image:
      "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=1200&q=85",
    story:
      "Cape Town is famous for its spectacular coastal scenery, Table Mountain, beaches and cultural diversity. Its history, natural environment and nearby wine regions make it a remarkable destination.",
  },
];

// Wheel geometry.
const SEGMENT_COUNT = 100;
const WHEEL_CENTER = 160;
const OUTER_RADIUS = 153;
const INNER_RADIUS = 70;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

function polarPoint(radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: WHEEL_CENTER + radius * Math.cos(radians),
    y: WHEEL_CENTER + radius * Math.sin(radians),
  };
}

const wheelSegments = Array.from({ length: SEGMENT_COUNT }, (_, index) => {
  const startAngle = index * SEGMENT_ANGLE - 90;
  const endAngle = (index + 1) * SEGMENT_ANGLE - 90;
  const middleAngle = (startAngle + endAngle) / 2;

  const outerStart = polarPoint(OUTER_RADIUS, startAngle);
  const outerEnd = polarPoint(OUTER_RADIUS, endAngle);
  const innerStart = polarPoint(INNER_RADIUS, startAngle);
  const innerEnd = polarPoint(INNER_RADIUS, endAngle);
  const label = polarPoint(130, middleAngle);

  const path = [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");

  return {
    index,
    number: index + 1,
    path,
    labelX: label.x,
    labelY: label.y,
    labelRotation: middleAngle + 90,
  };
});

function getDestinationTitle(destination) {
  return (
    destination?.name ||
    destination?.city ||
    destination?.region ||
    destination?.country ||
    "Unknown destination"
  );
}

function getDestinationDescription(destination) {
  switch (destination?.type) {
    case "country":
      return "COUNTRY DISCOVERY";
    case "region":
      return "REGION DISCOVERY";
    default:
      return "CITY DISCOVERY";
  }
}

function getDestinationSubtitle(destination) {
  switch (destination?.type) {
    case "country":
      return "Country-wide exploration";
    case "region":
      return `Region · ${destination.country || "Unknown country"}`;
    default:
      return destination?.country || "";
  }
}

function getCoordinate(destination, key) {
  if (key === "lat") {
    return Number(
      destination?.lat ?? destination?.coordinates?.latitude ?? destination?.coordinates?.lat
    );
  }
  return Number(
    destination?.lon ?? destination?.coordinates?.longitude ?? destination?.coordinates?.lon
  );
}

function App() {
  const wheelRef = useRef(null);
  const rotationRef = useRef(0);
  const spinTweenRef = useRef(null);

  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState(null);
  const [result, setResult] = useState(null);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [mapTransitioning, setMapTransitioning] = useState(false);
  const [returningToWorld, setReturningToWorld] = useState(false);
  const [history, setHistory] = useState([]);
  const [sound, setSound] = useState(false);
  const [mapMode, setMapMode] = useState("day");

  // Begin the return animation in parallel with the map zoom-out.
  // Keep the destination panel mounted until MapView reports moveend.
  const returnToWorld = () => {
    if (!result || returningToWorld || !discoveryMode || mapTransitioning) return;

    setReturningToWorld(true);
    setMapTransitioning(true);
    setDiscoveryMode(false);
  };

  const handleReturnComplete = () => {
    setResult(null);
    setWinnerIndex(null);
    setDiscoveryMode(false);
    setMapTransitioning(false);
    setReturningToWorld(false);
  };

  // Called at the start of MapLibre's flyTo/fitBounds movement.
  // UI animations therefore run concurrently with the camera movement.
  const handleFocusStart = (destination) => {
    if (!destination || returningToWorld) return;

    if (
      result &&
      result.id === destination.id &&
      result.number === destination.number
    ) {
      setMapTransitioning(true);
      setDiscoveryMode(true);
    }
  };

  // Called on MapLibre moveend. Tiles may continue loading in the background.
  const handleFocusComplete = (destination) => {
    if (!destination || returningToWorld) return;

    if (
      result &&
      result.id === destination.id &&
      result.number === destination.number
    ) {
      setMapTransitioning(false);
    }
  };

  const spinWheel = () => {
    // A new spin is only allowed from the global overview.
    if (
      spinning ||
      returningToWorld ||
      result ||
      !wheelRef.current ||
      spinTweenRef.current
    ) {
      return;
    }

    const outcomeIndex = Math.floor(Math.random() * SEGMENT_COUNT);
    const outcomeNumber = outcomeIndex + 1;

    // Temporary demo mapping: 100 numbers cycle through five locations.
    const destination = destinations[outcomeIndex % destinations.length];
    const selectedDestination = {
      ...destination,
      number: outcomeNumber,
    };

    // Align the centre of the selected segment with the fixed top pointer.
    const centerAngle = (outcomeIndex + 0.5) * SEGMENT_ANGLE;
    const desiredRotation = (360 - centerAngle + 360) % 360;
    const currentRotation = rotationRef.current;
    const currentNormalized = ((currentRotation % 360) + 360) % 360;
    const alignmentRotation =
      (desiredRotation - currentNormalized + 360) % 360;
    const targetRotation = currentRotation + 7 * 360 + alignmentRotation;

    setDiscoveryMode(false);
    setMapTransitioning(false);
    setReturningToWorld(false);
    setWinnerIndex(null);
    setSpinning(true);

    spinTweenRef.current = gsap.to(wheelRef.current, {
      rotation: targetRotation,
      duration: 6,
      ease: "power4.out",
      transformOrigin: "50% 50%",
      onComplete: () => {
        rotationRef.current = targetRotation;
        setWinnerIndex(outcomeIndex);
        setResult(selectedDestination);
        setHistory((previous) => [selectedDestination, ...previous].slice(0, 5));
        setSpinning(false);
        spinTweenRef.current = null;
      },
      onInterrupt: () => {
        spinTweenRef.current = null;
        setSpinning(false);
      },
    });
  };

  const handleWheelSurfaceClick = () => {
    if (discoveryMode && !mapTransitioning) returnToWorld();
  };

  const handleWheelSurfaceKeyDown = (event) => {
    if (!discoveryMode || mapTransitioning) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      returnToWorld();
    }
  };

  const selectedLatitude = result ? getCoordinate(result, "lat") : null;
  const selectedLongitude = result ? getCoordinate(result, "lon") : null;

  return (
    <main
      className={`app ${discoveryMode ? "discovery-mode" : ""} ${
        returningToWorld ? "returning-mode" : ""
      }`}
    >
      {/* Full-screen interactive map background. */}
      <div className="world-map">
        <MapView
          selectedDestination={result}
          onFocusStart={handleFocusStart}
          onFocusComplete={handleFocusComplete}
          returnToOverview={returningToWorld}
          onReturnComplete={handleReturnComplete}
          mapMode={mapMode}
        />
        <div className="map-overlay" />
        <div className="map-vignette" />
        <div className="map-grid" />
      </div>

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Globe2 size={23} />
          </div>
          <div>
            <h1>
              WORLD<span>SPIN</span>
            </h1>
            <p>EXPLORE THE UNEXPECTED</p>
          </div>
        </div>

        <div className="header-right">
          <div className="live-indicator">
            <span />
            GLOBAL EXPERIENCE
          </div>

          <div className="map-mode-toggle" role="group" aria-label="Map appearance">
            <button
              type="button"
              className={mapMode === "day" ? "active" : ""}
              onClick={() => setMapMode("day")}
              aria-pressed={mapMode === "day"}
              title="Daytime satellite map"
            >
              <Sun size={15} />
              DAY
            </button>
            <button
              type="button"
              className={mapMode === "night" ? "active" : ""}
              onClick={() => setMapMode("night")}
              aria-pressed={mapMode === "night"}
              title="Nighttime satellite map"
            >
              <Moon size={15} />
              NIGHT
            </button>
          </div>

          <button
            className="sound-button"
            onClick={() => setSound((value) => !value)}
            aria-label={sound ? "Mute sound" : "Enable sound"}
            aria-pressed={sound}
            type="button"
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
        </div>
      </header>

      <section className="main-content">
        <div className="intro">
          <div className="eyebrow">
            <Sparkles size={14} />
            YOUR NEXT DESTINATION AWAITS
          </div>
          <h2>
            LET THE WORLD
            <br />
            <span>CHOOSE YOU.</span>
          </h2>
          <p>
            One spin. One destination. One unexpected story.
            <br />
            Discover somewhere extraordinary.
          </p>
        </div>

        {/* In discovery mode, clicking anywhere on the compact wheel returns to the world. */}
        <div
          className={`wheel-container ${discoveryMode ? "wheel-return-control" : ""}`}
        >
          <div className="wheel-label">
            <span className="label-line" />
            100 POSSIBLE DESTINATIONS
            <span className="label-line" />
          </div>

          <div className="wheel-pointer" />

          <div className="wheel-outer">
            <div className="wheel-ring" />

            <div
              className="wheel-graphic"
              ref={wheelRef}
              onClick={discoveryMode && !mapTransitioning ? handleWheelSurfaceClick : undefined}
              onKeyDown={discoveryMode && !mapTransitioning ? handleWheelSurfaceKeyDown : undefined}
              role={discoveryMode ? "button" : undefined}
              tabIndex={discoveryMode ? 0 : undefined}
              aria-label={discoveryMode ? "Return to global map" : "Spinning wheel segments"}
            >
              <svg
                viewBox="0 0 320 320"
                role="img"
                aria-label="Wheel containing 100 numbered segments"
              >
                <defs>
                  <radialGradient id="wheelGradient" cx="50%" cy="50%" r="55%">
                    <stop offset="0%" stopColor="#153c39" />
                    <stop offset="100%" stopColor="#061b25" />
                  </radialGradient>
                </defs>

                <circle cx="160" cy="160" r="158" fill="url(#wheelGradient)" />

                {wheelSegments.map((segment) => {
                  const isWinner = winnerIndex === segment.index;
                  const fill = isWinner
                    ? "#70f4b2"
                    : segment.index % 2 === 0
                      ? "#153e3b"
                      : "#102d38";

                  return (
                    <g key={segment.number}>
                      <path
                        d={segment.path}
                        fill={fill}
                        stroke={segment.index % 10 === 0 ? "#65e9ae" : "#577d78"}
                        strokeWidth="0.55"
                      />
                      <text
                        x={segment.labelX}
                        y={segment.labelY}
                        transform={`rotate(${segment.labelRotation} ${segment.labelX} ${segment.labelY})`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="5.5"
                        fontWeight="800"
                        letterSpacing="-0.4"
                        fill={isWinner ? "#052419" : "#d1eddf"}
                      >
                        {segment.number}
                      </text>
                    </g>
                  );
                })}

                <circle cx="160" cy="160" r="153" fill="none" stroke="#8be8bd" strokeWidth="2" />
                <circle cx="160" cy="160" r="70" fill="none" stroke="#63e8ac" strokeWidth="2" />
              </svg>
            </div>

            <div className="wheel-center">
              <div className="center-number">
                {result ? String(result.number).padStart(2, "0") : "100"}
              </div>
              <div className="center-caption">
                {discoveryMode ? "RETURN" : result ? "SELECTED" : "DESTINATIONS"}
              </div>
              <button
                className="spin-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (discoveryMode) {
                    returnToWorld();
                  } else {
                    spinWheel();
                  }
                }}
                disabled={
                  spinning ||
                  returningToWorld ||
                  mapTransitioning ||
                  Boolean(result && !discoveryMode && !returningToWorld)
                }
                aria-label={discoveryMode ? "Zoom out to global map" : "Spin the destination wheel"}
              >
                {returningToWorld ? (
                  "RETURNING..."
                ) : discoveryMode ? (
                  mapTransitioning ? (
                    "ZOOMING..."
                  ) : (
                    <>
                      <Globe2 size={14} />
                      BACK
                    </>
                  )
                ) : spinning ? (
                  "SPINNING..."
                ) : result ? (
                  "ZOOMING..."
                ) : (
                  <>
                    <Sparkles size={16} />
                    SPIN
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="wheel-bottom">
            {spinning
              ? "THE WORLD IS DECIDING..."
              : returningToWorld
                ? "RETURNING TO GLOBAL VIEW..."
                : discoveryMode
                  ? mapTransitioning ? "EXPLORING DESTINATION..." : "RETURN TO GLOBAL VIEW"
                  : result
                  ? "DESTINATION DISCOVERED"
                  : "READY TO DISCOVER?"}
          </div>
        </div>

        {/* This stays inside the map screen; it never becomes a separate page. */}
        {result && (discoveryMode || returningToWorld) && (
          <aside className="destination-panel" aria-label="Selected destination information">
            <button
              className="destination-close"
              type="button"
              onClick={returnToWorld}
              disabled={returningToWorld || mapTransitioning}
              aria-label="Zoom out to global map"
              title="Back to global view"
            >
              <span aria-hidden="true">×</span>
            </button>

            <div className="destination-panel-photo">
              {result.image ? (
                <img
                  src={result.image}
                  alt={getDestinationTitle(result)}
                  loading="eager"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <div className="destination-photo-overlay" />
              <div className="destination-photo-label">
                DESTINATION #{result.number}
              </div>
            </div>

            <div className="destination-panel-content">
              <div className="destination-type">
                <Sparkles size={13} />
                {getDestinationDescription(result)}
              </div>

              <h2>{getDestinationTitle(result)}</h2>

              <div className="destination-country">
                <MapPin size={15} />
                {getDestinationSubtitle(result)}
              </div>

              <div className="destination-divider" />

              <p className="destination-story">{result.story}</p>

              {Number.isFinite(selectedLatitude) && Number.isFinite(selectedLongitude) && (
                <div className="destination-coordinates">
                  <div>
                    <span>LATITUDE</span>
                    <strong>{selectedLatitude.toFixed(4)}°</strong>
                  </div>
                  <div>
                    <span>LONGITUDE</span>
                    <strong>{selectedLongitude.toFixed(4)}°</strong>
                  </div>
                </div>
              )}

              <button
                className="destination-return"
                type="button"
                onClick={returnToWorld}
                disabled={returningToWorld || mapTransitioning}
              >
                <Globe2 size={16} />
                {returningToWorld ? "RETURNING TO WORLD..." : "BACK TO THE WORLD"}
              </button>
            </div>
          </aside>
        )}
      </section>

      <footer className="bottom-bar">
        <div className="footer-item">
          <Globe2 size={17} />
          <span>ONE WORLD</span>
        </div>
        <div className="footer-item">
          <MapPin size={17} />
          <span>100 DESTINATIONS</span>
        </div>
        <div className="footer-item">
          <Info size={17} />
          <span>DISCOVER SOMETHING NEW</span>
        </div>
        <div className="history-area">
          <History size={16} />
          <span>RECENT DISCOVERIES</span>
          {history.length > 0 && (
            <div className="history-list">
              {history.map((item, index) => (
                <span key={`${item.number}-${item.id}-${index}`}>
                  #{item.number}
                </span>
              ))}
            </div>
          )}
        </div>
      </footer>

      <div className="demo-note">
        PROTOTYPE · 100 SEGMENTS · 5 SAMPLE LOCATIONS
      </div>
    </main>
  );
}

export default App;
