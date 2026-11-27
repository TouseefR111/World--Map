import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import MapView from "./MapView";
import {
  Globe2,
  MapPin,
  History,
  Volume2,
  VolumeX,
  Sparkles,
  Sun,
  Moon,
  Clock,
  Share2,
  Maximize2,
  Minimize2,
  Check,
  Sliders,
  Utensils,
  BedDouble,
  Compass,
  ArrowUpRight,
} from "lucide-react";
import {
  playTick,
  playWhoosh,
  playArrivalChime,
  playButtonTap,
} from "./utils/soundEffects";
import defaultDestinations from "./data/destinations";
import { loadDestinations } from "./firebase";
import AdminModal from "./AdminModal";
import "./App.css";

// Wheel geometry
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
      return "GLOBAL LANDMARK";
  }
}

function getDestinationSubtitle(destination) {
  switch (destination?.type) {
    case "country":
      return "Country-wide exploration";
    case "region":
      return `Region · ${destination.country || "Unknown country"}`;
    default:
      return destination?.country ? `${destination.city ? destination.city + ", " : ""}${destination.country}` : "";
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

function getDestinationTime(destination) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: destination?.timezone || "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    return null;
  }
}

function App() {
  const wheelRef = useRef(null);
  const rotationRef = useRef(0);
  const spinTweenRef = useRef(null);

  // Dynamic 100 destinations state (backed by Firebase Firestore & LocalStorage)
  const [destinations, setDestinations] = useState(defaultDestinations);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState(null);
  const [result, setResult] = useState(null);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [mapTransitioning, setMapTransitioning] = useState(false);
  const [returningToWorld, setReturningToWorld] = useState(false);
  const [history, setHistory] = useState([]);
  const [sound, setSound] = useState(false);
  const [mapMode, setMapMode] = useState("day");

  // Interactive HUD state
  const [cardMinimized, setCardMinimized] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const soundRef = useRef(sound);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Load custom / cloud-synced destinations on mount
  useEffect(() => {
    loadDestinations(defaultDestinations).then((loaded) => {
      if (loaded && loaded.length > 0) {
        setDestinations(loaded);
      }
    });
  }, []);

  const returnToWorld = () => {
    if (!result || returningToWorld || !discoveryMode || mapTransitioning) return;

    setReturningToWorld(true);
    setMapTransitioning(true);
    setDiscoveryMode(false);
    setCardMinimized(false);
  };

  const handleReturnComplete = () => {
    setResult(null);
    setWinnerIndex(null);
    setDiscoveryMode(false);
    setMapTransitioning(false);
    setReturningToWorld(false);
    setCardMinimized(false);
  };

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

  const handleFocusComplete = (destination) => {
    if (!destination || returningToWorld) return;

    if (
      result &&
      result.id === destination.id &&
      result.number === destination.number
    ) {
      setMapTransitioning(false);
      if (soundRef.current) {
        playArrivalChime();
      }
    }
  };

  const spinWheel = () => {
    if (
      spinning ||
      returningToWorld ||
      result ||
      !wheelRef.current ||
      spinTweenRef.current
    ) {
      return;
    }

    if (soundRef.current) {
      playButtonTap();
    }

    const outcomeIndex = Math.floor(Math.random() * SEGMENT_COUNT);
    const outcomeNumber = outcomeIndex + 1;

    // Direct 1:1 mapping from 100 wheel segments to the 100 curated destinations
    const matchedDestination =
      destinations.find((d) => d.number === outcomeNumber) ||
      destinations[outcomeIndex % destinations.length];

    const selectedDestination = {
      ...matchedDestination,
      number: outcomeNumber,
    };

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
    setCardMinimized(false);
    setSpinning(true);

    let lastSegmentPassed = -1;

    spinTweenRef.current = gsap.to(wheelRef.current, {
      rotation: targetRotation,
      duration: 6,
      ease: "power4.out",
      transformOrigin: "50% 50%",
      onUpdate: () => {
        const currentRot = gsap.getProperty(wheelRef.current, "rotation") || 0;
        const currentSegment = Math.floor(currentRot / SEGMENT_ANGLE);
        if (currentSegment !== lastSegmentPassed) {
          lastSegmentPassed = currentSegment;
          if (soundRef.current) {
            playTick();
          }
        }
      },
      onComplete: () => {
        rotationRef.current = targetRotation;
        setWinnerIndex(outcomeIndex);
        setResult(selectedDestination);
        setCardMinimized(false);
        setHistory((previous) => [selectedDestination, ...previous].slice(0, 5));
        setSpinning(false);
        spinTweenRef.current = null;
        if (soundRef.current) {
          playWhoosh();
        }
      },
      onInterrupt: () => {
        spinTweenRef.current = null;
        setSpinning(false);
      },
    });
  };

  const handleShare = () => {
    if (!result) return;
    if (soundRef.current) playButtonTap();

    const title = getDestinationTitle(result);
    const text = `Explore Destination #${result.number}: ${title}, ${result.country}!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${text} — Discovered on Flankhub`);
      setToastMessage("LINK COPIED TO CLIPBOARD!");
      setTimeout(() => setToastMessage(""), 2800);
    }
  };

  const toggleSound = () => {
    setSound((prev) => {
      const next = !prev;
      if (next) playButtonTap();
      return next;
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
      {/* Full-screen commercial MapTiler 3D Satellite Map */}
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

      {/* Header */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Globe2 size={23} />
          </div>
          <div>
            <h1>
              Flank<span>hub</span>
            </h1>
            <p>100 CURATED GLOBAL DESTINATIONS</p>
          </div>
        </div>

        <div className="header-right">
          <div className="live-indicator">
            <span />
            Who we following today, Spin it
          </div>

          <div className="map-mode-toggle" role="group" aria-label="Map appearance">
            <button
              type="button"
              className={mapMode === "day" ? "active" : ""}
              onClick={() => {
                if (soundRef.current) playButtonTap();
                setMapMode("day");
              }}
              aria-pressed={mapMode === "day"}
              title="Daytime high-res MapTiler 3D satellite"
            >
              <Sun size={15} />
              DAY
            </button>
            <button
              type="button"
              className={mapMode === "night" ? "active" : ""}
              onClick={() => {
                if (soundRef.current) playButtonTap();
                setMapMode("night");
              }}
              aria-pressed={mapMode === "night"}
              title="Nighttime lights satellite map"
            >
              <Moon size={15} />
              NIGHT
            </button>
          </div>

          <button
            className="sound-button"
            onClick={toggleSound}
            aria-label={sound ? "Mute audio sound effects" : "Enable tactile sound effects"}
            aria-pressed={sound}
            type="button"
            title={sound ? "Sound Enabled" : "Sound Muted"}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Client Admin Panel Toggle */}
          <button
            className="admin-header-btn"
            onClick={() => {
              if (soundRef.current) playButtonTap();
              setIsAdminOpen(true);
            }}
            title="Open Destination Admin Panel"
            type="button"
          >
            <Sliders size={15} />
            <span>ADMIN</span>
          </button>
        </div>
      </header>

      {/* Main interactive area */}
      <section className="main-content">
        {/* Wheel container */}
        <div
          className={`wheel-container ${discoveryMode ? "wheel-return-control" : ""}`}
        >
          <div className="wheel-label">
            <span className="label-line" />
            100 GLOBAL DESTINATIONS
            <span className="label-line" />
          </div>

          {/* Needle flapper with physics bounce while ticking */}
          <div className={`wheel-pointer ${spinning ? "is-ticking" : ""}`} />

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
                    "FLYING..."
                  ) : (
                    <>
                      <Globe2 size={14} />
                      BACK
                    </>
                  )
                ) : spinning ? (
                  "SPINNING..."
                ) : result ? (
                  "FLYING..."
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
                  ? mapTransitioning ? "FLYING TO DESTINATION..." : "CLICK TO RETURN TO WORLD"
                  : result
                  ? "DESTINATION DISCOVERED"
                  : "READY TO DISCOVER?"}
          </div>
        </div>

        {/* Destination Panel or Minimized Live Map HUD */}
        {result && (discoveryMode || returningToWorld) && (
          cardMinimized ? (
            <div className="map-minimized-hud" role="region" aria-label="Minimized destination card">
              <div className="minimized-pill-info">
                <MapPin size={15} style={{ color: result.accent || "#54efa8" }} />
                <span className="minimized-number">#{result.number}</span>
                <span className="minimized-name">{getDestinationTitle(result)}</span>
                <span className="minimized-country">· {result.country}</span>
              </div>
              <div className="minimized-actions">
                <button
                  type="button"
                  className="minimized-btn primary"
                  onClick={() => {
                    if (soundRef.current) playButtonTap();
                    setCardMinimized(false);
                  }}
                  title="Open destination story & details"
                >
                  <Maximize2 size={13} />
                  DETAILS
                </button>
                <button
                  type="button"
                  className="minimized-btn secondary"
                  onClick={() => {
                    if (soundRef.current) playButtonTap();
                    returnToWorld();
                  }}
                  title="Return to global view"
                >
                  <Globe2 size={13} />
                  RETURN
                </button>
              </div>
            </div>
          ) : (
            <aside
              className="destination-panel destination-panel-textonly"
              aria-label="Selected destination information"
              style={{ "--dest-accent": result.accent || "#54efa8" }}
            >
              <div className="destination-panel-header">
                <div className="destination-panel-badges">
                  <span
                    className="destination-num-badge"
                    style={{ background: result.accent || "#54efa8" }}
                  >
                    #{result.number}
                  </span>
                  {result.badge && (
                    <span className="destination-editorial-badge">
                      <Sparkles size={11} />
                      {result.badge}
                    </span>
                  )}
                </div>
                <div className="destination-panel-top-actions">
                  <button
                    className="dest-action-pill"
                    type="button"
                    onClick={() => {
                      if (soundRef.current) playButtonTap();
                      setCardMinimized(true);
                    }}
                    title="Minimize card to explore full 3D MapTiler terrain freely"
                  >
                    <Minimize2 size={13} />
                    <span>ROAM MAP</span>
                  </button>
                  <button
                    className="dest-action-pill"
                    type="button"
                    onClick={handleShare}
                    title="Share this destination"
                  >
                    <Share2 size={13} />
                    <span>SHARE</span>
                  </button>
                  <button
                    className="destination-close"
                    type="button"
                    onClick={() => {
                      if (soundRef.current) playButtonTap();
                      returnToWorld();
                    }}
                    disabled={returningToWorld || mapTransitioning}
                    aria-label="Zoom out to global map"
                    title="Back to global view"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </div>

              <div className="destination-panel-content">
                <div className="destination-type" style={{ color: result.accent || "#54efa8" }}>
                  <Sparkles size={13} />
                  {getDestinationDescription(result)}
                </div>

                <h2>{getDestinationTitle(result)}</h2>

                <div className="destination-country">
                  <MapPin size={15} />
                  {getDestinationSubtitle(result)}
                </div>

                {/* Live Telemetry & Local Time */}
                <div className="destination-telemetry-bar">
                  {getDestinationTime(result) && (
                    <div className="telemetry-pill">
                      <Clock size={12} />
                      <span>LOCAL TIME <strong>{getDestinationTime(result)}</strong></span>
                    </div>
                  )}
                  {result.temp && (
                    <div className="telemetry-pill">
                      <Sun size={12} />
                      <span>{result.temp}</span>
                    </div>
                  )}
                </div>

                <div className="destination-divider" />

                <div className="destination-section-label">LOCATION STORY</div>
                <p className="destination-story">{result.story}</p>

                {/* Curated Field Guide: Where to Eat, Stay & Must Visit */}
                {result.recommendations && (
                  <div className="destination-guide">
                    <div className="destination-section-label">CURATED FIELD GUIDE</div>
                    <div className="destination-guide-list">
                      {[
                        { key: "eat", label: "WHERE TO EAT", Icon: Utensils },
                        { key: "stay", label: "WHERE TO STAY", Icon: BedDouble },
                        { key: "visit", label: "MUST VISIT", Icon: Compass },
                      ].map(({ key, label, Icon }) => {
                        const rec = result.recommendations?.[key];
                        if (!rec?.title && !rec?.note) return null;
                        return (
                          <div key={key} className="guide-card">
                            <div className="guide-card-top">
                              <span className="guide-category">
                                <Icon size={12} />
                                {label}
                              </span>
                              {rec.url && (
                                <a
                                  href={rec.url}
                                  target="_blank"
                                  rel="noopener noreferrer sponsored"
                                  className="guide-affiliate-link"
                                >
                                  <span>EXPLORE</span>
                                  <ArrowUpRight size={12} />
                                </a>
                              )}
                            </div>
                            {rec.title && <div className="guide-title">{rec.title}</div>}
                            {rec.note && <p className="guide-note">{rec.note}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Key Highlights */}
                {result.highlights && result.highlights.length > 0 && (
                  <div className="destination-highlights">
                    <div className="highlights-title">KEY HIGHLIGHTS:</div>
                    <div className="highlights-tags">
                      {result.highlights.map((highlight) => (
                        <span key={highlight} className="highlight-tag">
                          {highlight}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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
                    <div>
                      <span>PERSPECTIVE</span>
                      <strong>3D TERRAIN</strong>
                    </div>
                  </div>
                )}

                <div className="destination-button-group">
                  <button
                    className="destination-return"
                    type="button"
                    onClick={() => {
                      if (soundRef.current) playButtonTap();
                      returnToWorld();
                    }}
                    disabled={returningToWorld || mapTransitioning}
                  >
                    <Globe2 size={16} />
                    {returningToWorld ? "RETURNING TO WORLD..." : "BACK TO GLOBAL MAP"}
                  </button>
                </div>
              </div>
            </aside>
          )
        )}
      </section>

      {/* Bottom Bar */}
      <footer className="bottom-bar">
        <div className="footer-item">
          <Globe2 size={17} />
          <span>FLANKHUB</span>
        </div>
        <div className="footer-item">
          <MapPin size={17} />
          <span>100 DESTINATIONS</span>
        </div>
        <div
          className="footer-item"
          onClick={() => {
            if (soundRef.current) playButtonTap();
            setIsAdminOpen(true);
          }}
          style={{ cursor: "pointer" }}
          title="Open Destination Admin Panel"
        >
          <Sliders size={15} />
          <span>ADMIN DASHBOARD</span>
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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notice" role="status" aria-live="polite">
          <Check size={14} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Destination Admin Panel Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        destinations={destinations}
        onUpdateDestinations={(updatedList) => {
          setDestinations(updatedList);
        }}
        onPreviewDestination={(dest) => {
          setResult(dest);
          setDiscoveryMode(true);
        }}
      />

      <div className="demo-note">
        POWERED BY FLANKHUB · 100 VERIFIED DESTINATIONS ·
      </div>
    </main>
  );
}

export default App;
