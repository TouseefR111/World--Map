import { useState, useMemo, useEffect } from "react";
import {
  X,
  Search,
  Edit2,
  Save,
  RotateCcw,
  ExternalLink,
  CloudUpload,
  Download,
  Check,
  AlertCircle,
  Lock,
  LogOut,
  ShieldCheck,
  Copy,
  KeyRound,
} from "lucide-react";
import {
  saveDestination,
  resetLocalDestinations,
  seedAllDestinationsToCloud,
  subscribeToAuth,
  signInAdmin,
  signOutAdmin,
  checkIsAdmin,
  isConfigured,
} from "./firebase";
import defaultDestinations from "./data/destinations";
import "./AdminModal.css";

const ACCENT_PRESETS = [
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#f59e0b", // Amber/Gold
  "#ef4444", // Red
  "#a855f7", // Violet
  "#ec4899", // Pink
  "#38bdf8", // Sky
];

export default function AdminModal({
  isOpen,
  onClose,
  destinations,
  onUpdateDestinations,
  onPreviewDestination,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(null);
  const [statusMessage, setStatusMessage] = useState({ text: "", type: "" });
  const [isSeeding, setIsSeeding] = useState(false);

  // Firebase Auth & Admin Authorization state
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isConfigured);
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (!isConfigured) return undefined;
    const unsubscribe = subscribeToAuth(async (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user) {
        setCheckingAdmin(true);
        const allowed = await checkIsAdmin(user);
        setIsAdminAuthorized(allowed);
        setCheckingAdmin(false);
      } else {
        setIsAdminAuthorized(false);
        setEditingItem(null);
        setFormData(null);
      }
    });
    return unsubscribe;
  }, []);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return destinations;
    const term = searchTerm.toLowerCase();
    return destinations.filter(
      (d) =>
        String(d.number).includes(term) ||
        (d.name && d.name.toLowerCase().includes(term)) ||
        (d.country && d.country.toLowerCase().includes(term)) ||
        (d.city && d.city.toLowerCase().includes(term))
    );
  }, [destinations, searchTerm]);

  if (!isOpen) return null;

  const showToast = (text, type = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage({ text: "", type: "" }), 3200);
  };

  const startEdit = (item) => {
    const recs = item.recommendations || {};
    setEditingItem(item);
    setFormData({
      ...item,
      lat: String(item.lat),
      lon: String(item.lon),
      zoom: String(item.zoom || 12.2),
      pitch: String(item.pitch || 54),
      bearing: String(item.bearing || 25),
      story: item.story || "",
      badge: item.badge || "GLOBAL LANDMARK",
      accent: item.accent || "#10b981",
      eatTitle: recs.eat?.title || "",
      eatNote: recs.eat?.note || "",
      eatUrl: recs.eat?.url || "",
      stayTitle: recs.stay?.title || "",
      stayNote: recs.stay?.note || "",
      stayUrl: recs.stay?.url || "",
      visitTitle: recs.visit?.title || "",
      visitNote: recs.visit?.note || "",
      visitUrl: recs.visit?.url || "",
    });
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData) return;

    const latNum = parseFloat(formData.lat);
    const lonNum = parseFloat(formData.lon);

    if (isNaN(latNum) || Math.abs(latNum) > 90) {
      showToast("Latitude must be a valid number between -90 and 90", "error");
      return;
    }

    if (isNaN(lonNum) || Math.abs(lonNum) > 180) {
      showToast("Longitude must be a valid number between -180 and 180", "error");
      return;
    }

    const baseItem = { ...editingItem };
    delete baseItem.image;

    const updatedDestination = {
      ...baseItem,
      name: formData.name.trim(),
      city: formData.city.trim(),
      country: formData.country.trim(),
      type: formData.type || "city",
      lat: latNum,
      lon: lonNum,
      zoom: parseFloat(formData.zoom) || 12.2,
      pitch: parseFloat(formData.pitch) || 54,
      bearing: parseFloat(formData.bearing) || 25,
      story: formData.story.trim(),
      badge: formData.badge.trim(),
      accent: formData.accent || "#10b981",
      recommendations: {
        eat: {
          title: formData.eatTitle.trim(),
          note: formData.eatNote.trim(),
          url: formData.eatUrl.trim(),
        },
        stay: {
          title: formData.stayTitle.trim(),
          note: formData.stayNote.trim(),
          url: formData.stayUrl.trim(),
        },
        visit: {
          title: formData.visitTitle.trim(),
          note: formData.visitNote.trim(),
          url: formData.visitUrl.trim(),
        },
      },
    };

    try {
      const nextList = await saveDestination(updatedDestination, destinations);
      onUpdateDestinations(nextList);
      setEditingItem(null);
      setFormData(null);
      showToast(`Saved Destination #${updatedDestination.number} to Firestore!`);
    } catch (err) {
      showToast(err?.message || "Failed to save to Firestore", "error");
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      setLoginLoading(true);
      await signInAdmin(loginEmail, loginPassword);
      setLoginPassword("");
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setLoginError("Invalid email or password.");
      } else if (code === "auth/operation-not-allowed") {
        setLoginError("Email/Password sign-in is not enabled in Firebase Authentication yet.");
      } else if (code === "auth/too-many-requests") {
        setLoginError("Too many failed attempts. Please wait a moment and try again.");
      } else {
        setLoginError(err?.message || "Sign-in failed.");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOutAdmin();
    showToast("Signed out of Admin Panel");
  };

  const copyUid = async () => {
    if (!authUser?.uid) return;
    try {
      await navigator.clipboard.writeText(authUser.uid);
      showToast("Admin UID copied to clipboard");
    } catch {
      showToast("Copy failed — select UID manually", "error");
    }
  };

  const hasCloudAccess = !isConfigured || (Boolean(authUser) && isAdminAuthorized);

  const handleResetDefaults = () => {
    if (window.confirm("Are you sure you want to reset all destinations back to the original client list?")) {
      const defaults = resetLocalDestinations(defaultDestinations);
      onUpdateDestinations(defaults);
      showToast("Reset all destinations to defaults!");
    }
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(destinations, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `flankhub_destinations_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast("Exported destinations JSON!");
  };

  const handleSeedFirebase = async () => {
    try {
      setIsSeeding(true);
      await seedAllDestinationsToCloud(destinations);
      showToast("All 100 destinations synced to Firebase Firestore!");
    } catch (err) {
      showToast(err.message || "Failed to sync to Firebase", "error");
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Destination Admin Control Panel">
      <div className="admin-modal">
        {/* Modal Header */}
        <header className="admin-header">
          <div className="admin-header-title">
            <div className="admin-badge">ADMIN</div>
            <div>
              <h2>DESTINATION CONTROL PANEL</h2>
              <p>Manage and customize all 100 wheel destinations, coordinates, and stories</p>
            </div>
          </div>

          <div className="admin-header-actions">
            {hasCloudAccess && (
              <>
                {isConfigured && authUser && (
                  <span className="admin-user-pill" title={`Signed in as ${authUser.email}`}>
                    <ShieldCheck size={13} />
                    {authUser.email}
                  </span>
                )}
                <button
                  type="button"
                  className="admin-btn secondary"
                  onClick={handleExportJSON}
                  title="Download full dataset as JSON"
                >
                  <Download size={14} />
                  EXPORT JSON
                </button>
                <button
                  type="button"
                  className="admin-btn secondary"
                  onClick={handleSeedFirebase}
                  disabled={isSeeding}
                  title={isConfigured ? "Sync all destinations to Cloud Firestore" : "Firebase config required"}
                >
                  <CloudUpload size={14} />
                  {isSeeding ? "SYNCING..." : "SYNC TO FIREBASE"}
                </button>
                <button
                  type="button"
                  className="admin-btn danger"
                  onClick={handleResetDefaults}
                  title="Reset to original 100 destinations"
                >
                  <RotateCcw size={14} />
                  RESET ALL
                </button>
                {isConfigured && authUser && (
                  <button
                    type="button"
                    className="admin-btn secondary"
                    onClick={handleLogout}
                    title="Sign out of admin session"
                  >
                    <LogOut size={14} />
                    SIGN OUT
                  </button>
                )}
              </>
            )}
            <button type="button" className="admin-close-btn" onClick={onClose} aria-label="Close admin panel">
              <X size={18} />
            </button>
          </div>
        </header>

        {!authReady || checkingAdmin ? (
          <div className="admin-auth-gate">
            <div className="admin-auth-card">
              <div className="admin-auth-icon">
                <KeyRound size={22} />
              </div>
              <h3>VERIFYING ADMIN SESSION</h3>
              <p>Checking Firebase authentication and administrator permissions...</p>
            </div>
          </div>
        ) : isConfigured && !authUser ? (
          <div className="admin-auth-gate">
            <div className="admin-auth-card">
              <div className="admin-auth-icon">
                <Lock size={22} />
              </div>
              <h3>ADMIN SIGN-IN REQUIRED</h3>
              <p>
                Sign in with your authorized Firebase administrator account to edit destinations,
                update affiliate links, and sync to Cloud Firestore.
              </p>
              <form onSubmit={handleLoginSubmit} className="admin-auth-form">
                {loginError && (
                  <div className="admin-auth-error" role="alert">
                    <AlertCircle size={15} />
                    <span>{loginError}</span>
                  </div>
                )}
                <div className="form-group">
                  <label>Admin Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@yourdomain.com"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="admin-btn primary full-width"
                  disabled={loginLoading}
                >
                  <Lock size={14} />
                  {loginLoading ? "SIGNING IN..." : "SIGN IN TO ADMIN"}
                </button>
              </form>
            </div>
          </div>
        ) : isConfigured && !isAdminAuthorized ? (
          <div className="admin-auth-gate">
            <div className="admin-auth-card warning">
              <div className="admin-auth-icon">
                <AlertCircle size={22} />
              </div>
              <h3>ADMIN AUTHORIZATION NEEDED</h3>
              <p>
                Signed in as <strong>{authUser.email}</strong>, but this user is not listed in
                Firestore <code>admins/&#123;uid&#125;</code> yet. Add a document with this UID in
                the <code>admins</code> collection in Firebase Console:
              </p>
              <div className="admin-uid-box">
                <code>{authUser.uid}</code>
                <button type="button" className="admin-btn secondary" onClick={copyUid}>
                  <Copy size={13} />
                  COPY UID
                </button>
              </div>
              <button type="button" className="admin-btn danger full-width" onClick={handleLogout}>
                <LogOut size={14} />
                SIGN OUT
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search Bar */}
        <div className="admin-toolbar">
          <div className="admin-search-wrapper">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by destination name, country, city, or number (e.g. 22 or Tokyo)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" className="admin-search-clear" onClick={() => setSearchTerm("")}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="admin-count-pill">
            SHOWING <strong>{filteredItems.length}</strong> OF {destinations.length} DESTINATIONS
          </div>
        </div>

        {/* Content Area (Table + Edit Drawer) */}
        <div className="admin-body">
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: "65px" }}>#</th>
                  <th>DESTINATION</th>
                  <th>LOCATION</th>
                  <th>COORDINATES</th>
                  <th>PERSPECTIVE</th>
                  <th style={{ textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.number} className={editingItem?.number === item.number ? "active-row" : ""}>
                    <td>
                      <span className="dest-num-tag" style={{ "--tag-accent": item.accent || "#54efa8" }}>
                        #{item.number}
                      </span>
                    </td>
                    <td>
                      <div className="dest-name-cell">
                        <strong>{item.name}</strong>
                        {item.badge && <span className="dest-badge-micro">{item.badge}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="dest-location-cell">
                        <span>{item.city}</span>
                        <small>{item.country}</small>
                      </div>
                    </td>
                    <td>
                      <div className="dest-coords-cell">
                        <code>{Number(item.lat).toFixed(4)}°, {Number(item.lon).toFixed(4)}°</code>
                      </div>
                    </td>
                    <td>
                      <div className="dest-zoom-cell">
                        <span>Zoom {item.zoom || 12}</span>
                        <small>Pitch {item.pitch || 54}°</small>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="dest-row-actions">
                        <button
                          type="button"
                          className="action-icon-btn edit"
                          onClick={() => startEdit(item)}
                          title="Edit this destination"
                        >
                          <Edit2 size={13} />
                          EDIT
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn preview"
                          onClick={() => {
                            onPreviewDestination(item);
                            onClose();
                          }}
                          title="Preview in 3D on the live map"
                        >
                          <ExternalLink size={13} />
                          PREVIEW
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit Drawer (when item selected) */}
          {editingItem && formData && (
            <aside className="admin-edit-drawer">
              <div className="drawer-header">
                <div>
                  <span className="dest-num-tag" style={{ "--tag-accent": formData.accent }}>
                    #{formData.number}
                  </span>
                  <h3>EDIT DESTINATION</h3>
                </div>
                <button type="button" className="drawer-close-btn" onClick={() => setEditingItem(null)}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSave} className="drawer-form">
                <div className="form-group">
                  <label>Destination Title / Landmark</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>City / Region</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Country</label>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Latitude (-90 to 90)</label>
                    <input
                      type="text"
                      name="lat"
                      value={formData.lat}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Longitude (-180 to 180)</label>
                    <input
                      type="text"
                      name="lon"
                      value={formData.lon}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>3D Zoom Level</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="20"
                      name="zoom"
                      value={formData.zoom}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>3D Pitch Angle (°)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="85"
                      name="pitch"
                      value={formData.pitch}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Curated Story / Description</label>
                  <textarea
                    rows={4}
                    name="story"
                    value={formData.story}
                    onChange={handleFormChange}
                    placeholder="Enter engaging travel and historical story..."
                    required
                  />
                </div>

                <div className="drawer-section-box">
                  <div className="drawer-section-title">CURATED FIELD GUIDE &amp; AFFILIATE LINKS</div>
                  {[
                    { key: "eat", heading: "Where to Eat", titleName: "eatTitle", noteName: "eatNote", urlName: "eatUrl" },
                    { key: "stay", heading: "Where to Stay", titleName: "stayTitle", noteName: "stayNote", urlName: "stayUrl" },
                    { key: "visit", heading: "Must Visit", titleName: "visitTitle", noteName: "visitNote", urlName: "visitUrl" },
                  ].map((sec) => (
                    <div key={sec.key} className="drawer-rec-group">
                      <div className="drawer-rec-heading">{sec.heading}</div>
                      <div className="form-group">
                        <label>Spot / Venue Name</label>
                        <input
                          type="text"
                          name={sec.titleName}
                          value={formData[sec.titleName]}
                          onChange={handleFormChange}
                          placeholder={`Recommended ${sec.heading.toLowerCase()}...`}
                        />
                      </div>
                      <div className="form-group">
                        <label>Short Note</label>
                        <input
                          type="text"
                          name={sec.noteName}
                          value={formData[sec.noteName]}
                          onChange={handleFormChange}
                          placeholder="1-line insider description..."
                        />
                      </div>
                      <div className="form-group">
                        <label>Affiliate / Booking Link</label>
                        <input
                          type="url"
                          name={sec.urlName}
                          value={formData[sec.urlName]}
                          onChange={handleFormChange}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label>Badge Label (e.g. CITY OF LIGHT)</label>
                  <input
                    type="text"
                    name="badge"
                    value={formData.badge}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-group">
                  <label>Accent Color Theme</label>
                  <div className="color-palette">
                    {ACCENT_PRESETS.map((color) => (
                      <button
                        type="button"
                        key={color}
                        className={`color-swatch ${formData.accent === color ? "active" : ""}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData((prev) => ({ ...prev, accent: color }))}
                      />
                    ))}
                    <input
                      type="color"
                      name="accent"
                      value={formData.accent}
                      onChange={handleFormChange}
                      title="Custom color picker"
                    />
                  </div>
                </div>

                <div className="drawer-footer">
                  <button type="submit" className="admin-btn primary full-width">
                    <Save size={15} />
                    SAVE CHANGES
                  </button>
                </div>
              </form>
            </aside>
          )}
        </div>
          </>
        )}

        {/* Toast Status */}
        {statusMessage.text && (
          <div className={`admin-toast ${statusMessage.type}`} role="status">
            {statusMessage.type === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}
