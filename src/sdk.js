const SDK_VERSION = "1.0.5";
const DEFAULT_BASE_URL = "https://api.paylock.ng/api/v1/";
const STORAGE_KEY_PREFIX = "paylock_";

let currentConfig = null;
let currentState = {
  initialized: false,
  projectStatus: null,
  entitlements: [],
  lastInit: null,
  boundProjectId: null,
  connectionId: null,
};

// Save any pre-existing window.Paylock config before esbuild overwrites it
const preConfig =
  typeof window !== "undefined" &&
  window.Paylock &&
  typeof window.Paylock === "object" &&
  !window.Paylock.bootstrap
    ? window.Paylock
    : null;

// Simple EventEmitter implementation for SDK events
const eventListeners = new Map();

function on(eventName, callback) {
  if (typeof callback !== "function")
    throw createError("Event callback must be a function");
  if (!eventListeners.has(eventName)) eventListeners.set(eventName, []);
  eventListeners.get(eventName).push(callback);

  return () => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }
  };
}

function emit(eventName, data) {
  logDebug(`Event: ${eventName}`, data);
  if (eventListeners.has(eventName)) {
    eventListeners.get(eventName).forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error(
          `[Paylock] Event callback error for '${eventName}':`,
          err,
        );
      }
    });
  }
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getStorageKey(key) {
  return `${STORAGE_KEY_PREFIX}${key}`;
}

function normalizeUrl(value) {
  if (!value) return DEFAULT_BASE_URL;
  return value.endsWith("/") ? value : `${value}/`;
}

function generateDeviceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return (
    "dev_" +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 15)
  );
}

// UI Message Display System
const messageDefaults = {
  position: "top-right",
  duration: 4000,
  styles: {
    fontSize: "14px",
    padding: "12px 16px",
    borderRadius: "4px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    zIndex: "999999",
  },
};

function createMessageElement(text, type = "info") {
  if (!isBrowser()) return null;
  const div = document.createElement("div");
  const bgColor =
    {
      info: "#2563eb",
      success: "#16a34a",
      error: "#dc2626",
      warning: "#ea580c",
    }[type] || "#2563eb";

  div.textContent = text;
  div.style.cssText = `
    position: fixed;
    ${messageDefaults.position === "top-right" ? "top: 20px; right: 20px;" : "top: 20px; left: 20px;"}
    background-color: ${bgColor};
    color: white;
    ${Object.entries(messageDefaults.styles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${v};`)
      .join("")}
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  `;

  if (!document.getElementById("paylock-style")) {
    const style = document.createElement("style");
    style.id = "paylock-style";
    style.textContent = `@keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(style);
  }
  return div;
}

let showMessage = function (
  text,
  type = "info",
  duration = messageDefaults.duration,
) {
  if (!isBrowser() || !document.body) return;
  const el = createMessageElement(text, type);
  if (!el) return;
  document.body.appendChild(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
  return () => el.remove();
};

const showSuccess = (msg, duration) => showMessage(msg, "success", duration);
const showError = (msg, duration) => showMessage(msg, "error", duration);
const showWarning = (msg, duration) => showMessage(msg, "warning", duration);
const showInfo = (msg, duration) => showMessage(msg, "info", duration);

function logDebug(...args) {
  if (currentConfig?.debug) console.log("[Paylock]", ...args);
}

function createError(message) {
  return new Error(`[Paylock] ${message}`);
}

function resolveConfig(userConfig) {
  const config = userConfig || preConfig;
  if (!config || typeof config !== "object") {
    throw createError(
      "No SDK configuration provided. Define window.Paylock or pass an object to Paylock.bootstrap().",
    );
  }

  const apiKey = config.apiKey || config.pk;
  const licenseKey = config.licenseKey || config.license || config.lk;

  if (!apiKey && !licenseKey) {
    throw createError(
      "Either apiKey (Project API Key) OR licenseKey (User License) is required.",
    );
  }

  let deviceId = isBrowser() ? localStorage.getItem("paylock_device_id") : null;
  if (!deviceId && isBrowser()) {
    deviceId = generateDeviceId();
    localStorage.setItem("paylock_device_id", deviceId);
  }

  return {
    apiKey: apiKey ? apiKey.trim() : null,
    licenseKey: licenseKey ? licenseKey.trim() : null,
    projectId: config.projectId ? config.projectId.trim() : "unknown",
    deviceId: deviceId || "server_device",
    domain: config.domain || (isBrowser() ? window.location.hostname : null),
    baseUrl: normalizeUrl(config.baseUrl || DEFAULT_BASE_URL),
    environment:
      config.environment ||
      (isBrowser() && window.location.hostname.includes("localhost")
        ? "development"
        : "production"),
    appName:
      config.appName ||
      (isBrowser() ? document.title || "paylock-web" : "paylock-app"),
    sdkVersion: config.sdkVersion || SDK_VERSION,
    debug: config.debug === true,
    auto: config.auto === true,
    invalidBehavior: config.invalidBehavior || "modal",
    redirectUrl: config.redirectUrl || "https://paylock.ng/upgrade",
    modalText:
      config.modalText ||
      "Access denied. Payment is required or license is invalid.",
    modalTheme: config.modalTheme || {},
    cache: {
      enabled: config.cache?.enabled !== false,
      ttl: typeof config.cache?.ttl === "number" ? config.cache.ttl : 3600, // default 1 hour
    },
    network: {
      retries:
        typeof config.network?.retries === "number"
          ? config.network.retries
          : 3,
      timeout:
        typeof config.network?.timeout === "number"
          ? config.network.timeout
          : 8000,
    },
    onReady: typeof config.onReady === "function" ? config.onReady : undefined,
    onError: typeof config.onError === "function" ? config.onError : undefined,
    onInvalid:
      typeof config.onInvalid === "function" ? config.onInvalid : undefined,
    onExpired:
      typeof config.onExpired === "function" ? config.onExpired : undefined,
    onInjectablesLoaded:
      typeof config.onInjectablesLoaded === "function"
        ? config.onInjectablesLoaded
        : undefined,
    injectables: config.injectables === true,
    injectablesEndpoint:
      typeof config.injectablesEndpoint === "string"
        ? config.injectablesEndpoint
        : undefined,
  };
}

async function apiRequest(path, body, method = "POST", additionalHeaders = {}) {
  const url = new URL(path, currentConfig.baseUrl).toString();
  const defaultHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "Paylock-SDK",
    "X-Paylock-SDK-Version": currentConfig.sdkVersion,
  };

  if (currentConfig.domain) {
    defaultHeaders["X-Paylock-Domain"] = currentConfig.domain;
  }

  const headers = { ...defaultHeaders, ...additionalHeaders };
  const retries = currentConfig.network.retries;
  const timeoutMs = currentConfig.network.timeout;

  logDebug(`API Request: ${method} ${path}`);

  let lastError;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body:
          method !== "GET" && body
            ? typeof body === "string"
              ? body
              : JSON.stringify(body)
            : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData = null;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {}

        const err = createError(
          `API request failed (${response.status}): ${errorText}`,
        );
        if (errorData && errorData.data) {
          err.responseData = errorData.data;
        }
        throw err;
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (currentConfig?.debug) {
        const reason = error.name === "AbortError" ? "Timeout" : error.message;
        console.warn(
          `[Paylock] API attempt ${i + 1}/${retries} failed:`,
          reason,
        );
      }
      if (i < retries - 1)
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

function handleInvalidLicense(error, reason = "invalid", backendData = {}) {
  if (currentConfig?.debug)
    console.error(`[Paylock] license validation failed (${reason}):`, error);

  if (reason === "expired" && currentConfig.onExpired) {
    currentConfig.onExpired(error);
  } else if (currentConfig.onInvalid) {
    currentConfig.onInvalid(error);
  }

  if (currentConfig.onError) {
    currentConfig.onError(error);
  }

  const mode = backendData.mode || currentConfig.invalidBehavior;
  
  if (mode === "modal") {
    showPaylockModal(backendData.message || currentConfig.modalText, reason, error?.message || "");
  } else if (mode === "redirect") {
    if (isBrowser())
      window.location.href =
        backendData.redirectUrl || currentConfig.redirectUrl || "https://paylock.ng/upgrade";
  } else if (mode === "log") {
    console.warn("[Paylock] Access denied:", backendData.message || reason);
  } else if (mode === "silent") {
    // Do nothing
  }
}

function showPaylockModal(text, errorCode = "validation_failed", detailMessage = "") {
  if (!isBrowser() || !document.body) return;

  const modalId = "paylock-modal";
  if (document.getElementById(modalId)) {
    return; // Prevent duplicate modals
  }

  const theme = currentConfig.modalTheme || {};
  const primary = theme.primary || "#dc2626";
  const background = theme.background || "#0a0a0a";
  const textColor = theme.text || "#ffffff";
  const borderColor = theme.border || primary;
  const glowEnabled = theme.glow !== false;

  const modal = document.createElement("div");
  modal.id = modalId;
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,0.6)";
  modal.style.backdropFilter = "blur(8px)";
  modal.style.webkitBackdropFilter = "blur(8px)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "999999";

  modal.innerHTML = `
    <div style="max-width: 448px; width: 90%; padding: 32px; background: ${background}; border: 4px solid ${borderColor}; color: ${textColor}; font-family: system-ui, -apple-system, sans-serif; text-align: center; box-shadow: ${glowEnabled ? `0 10px 15px -3px ${primary}33, 0 20px 25px -5px rgba(0, 0, 0, 0.5)` : "0 20px 25px -5px rgba(0,0,0,0.5)"}; animation: paylock-slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
      
      <!-- Glowing Lock Circle Icon -->
      <div style="width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 24px; background: ${primary}1a; border: 1px solid ${primary}33; color: ${primary}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px ${primary}1a;">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; width: 32px; height: 32px; animation: paylock-pulse 2s infinite ease-in-out;">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>

      <!-- App Lockdown Badge -->
      <span style="font-size: 9px; font-weight: 900; color: ${primary}; text-transform: uppercase; letter-spacing: 0.15em; background: ${primary}10; padding: 4px 12px; border: 1px solid ${primary}20; display: inline-block; margin-bottom: 16px; font-family: system-ui, -apple-system, sans-serif;">
        App Lockdown
      </span>

      <!-- Title & Content -->
      <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 900; color: ${textColor}; text-transform: uppercase; letter-spacing: -0.025em; font-family: system-ui, -apple-system, sans-serif; line-height: 1.2;">
        License Activation Required
      </h2>
      <p style="margin: 0 0 24px; font-size: 12px; color: #888888; font-weight: 500; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif; max-width: 380px; margin-left: auto; margin-right: auto;">
        The application host, hardware, or IP address could not be validated. Detailed alert:
        <span style="display: block; margin-top: 10px; padding: 10px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); color: ${primary}; font-family: monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; word-break: break-all; text-align: left; line-height: 1.4;">
          Error Code: ${errorCode.toUpperCase()} — ${text || detailMessage || "Verification failed."}
        </span>
      </p>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        <button id="paylock-primary-btn" style="width: 100%; padding: 16px; border: none; background: ${primary}; color: #ffffff; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; cursor: pointer; transition: all 0.2s ease-in-out; font-family: system-ui, -apple-system, sans-serif; box-shadow: 0 4px 6px ${primary}20;">
          Purchase or Upgrade License
        </button>
        <button id="paylock-secondary-btn" style="width: 100%; padding: 16px; border: 2px solid #2d2d2d; background: transparent; color: #9ca3af; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; cursor: pointer; transition: all 0.2s ease-in-out; font-family: system-ui, -apple-system, sans-serif;">
          Close Overlay
        </button>
      </div>
    </div>
  `;

  if (!document.getElementById("paylock-style")) {
    const style = document.createElement("style");
    style.id = "paylock-style";
    style.textContent = `
      @keyframes paylock-slideIn {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      @keyframes paylock-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.05); opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);
  }

  // Bind Interactions & Hover Animations
  const primaryBtn = modal.querySelector("#paylock-primary-btn");
  if (primaryBtn) {
    primaryBtn.addEventListener("mouseover", () => {
      primaryBtn.style.opacity = "0.9";
      primaryBtn.style.transform = "translateY(-1px)";
    });
    primaryBtn.addEventListener("mouseout", () => {
      primaryBtn.style.opacity = "1";
      primaryBtn.style.transform = "translateY(0)";
    });
    primaryBtn.addEventListener("click", () => {
      window.location.href = currentConfig.redirectUrl || "https://paylock.ng/upgrade";
    });
  }

  const secondaryBtn = modal.querySelector("#paylock-secondary-btn");
  if (secondaryBtn) {
    secondaryBtn.addEventListener("mouseover", () => {
      secondaryBtn.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
      secondaryBtn.style.borderColor = "#4b5563";
      secondaryBtn.style.color = "#ffffff";
    });
    secondaryBtn.addEventListener("mouseout", () => {
      secondaryBtn.style.backgroundColor = "transparent";
      secondaryBtn.style.borderColor = "#2d2d2d";
      secondaryBtn.style.color = "#9ca3af";
    });
    secondaryBtn.addEventListener("click", () => {
      modal.remove();
    });
  }

  document.body.appendChild(modal);
}

function getCache() {
  if (!isBrowser() || !currentConfig.cache.enabled) return null;
  const targetKey = currentConfig.licenseKey || currentConfig.apiKey;
  const cached = localStorage.getItem(getStorageKey(`auth_${targetKey}`));
  if (!cached) return null;
  try {
    const data = JSON.parse(cached);
    const now = Date.now();
    if (now - data.timestamp < currentConfig.cache.ttl * 1000) {
      return data.payload;
    }
  } catch (e) {}
  return null;
}

function setCache(payload) {
  if (!isBrowser() || !currentConfig.cache.enabled) return;
  const targetKey = currentConfig.licenseKey || currentConfig.apiKey;
  localStorage.setItem(
    getStorageKey(`auth_${targetKey}`),
    JSON.stringify({
      timestamp: Date.now(),
      payload,
    }),
  );
}

async function checkProjectStatus() {
  const queryParams = new URLSearchParams({ action: "check_project" });
  if (currentConfig.injectables) {
    queryParams.set("include", "injectables");
  }

  const path = `project/has-paid?${queryParams.toString()}`;

  const headers = {};
  const targetKey = currentConfig.licenseKey || currentConfig.apiKey;
  if (targetKey) {
    headers["X-LICENSE-KEY"] = targetKey;
  }

  logDebug("Checking project status...");
  return await apiRequest(path, "{}", "POST", headers);
}

async function bootstrap(config) {
  emit("init_start", { timestamp: new Date() });

  try {
    currentConfig = resolveConfig(config);
    currentState.lastInit = new Date();

    const cachedData = getCache();
    let data;

    if (cachedData) {
      logDebug("Using cached license validation");
      data = cachedData;
    } else {
      const result = await checkProjectStatus();
      data = result.data || {};

      if (data.has_paid === true) {
        setCache(data);
      }
    }

    currentState.initialized = true;
    currentState.projectStatus = data.has_paid ? "ACTIVE" : "INACTIVE";
    currentState.entitlements = Array.isArray(data.entitlements)
      ? data.entitlements
      : [];

    if (data.has_paid === true) {
      if (currentConfig.injectables && Array.isArray(data.injectables)) {
        if (currentConfig.injectablesEndpoint) {
          try {
            await forwardInjectables({
              injectables: data.injectables,
              signature: data.injectablesSignature,
            });
            if (currentConfig.onInjectablesLoaded)
              currentConfig.onInjectablesLoaded(data.injectables);
          } catch (err) {
            console.warn("[Paylock] Failed to forward injectables:", err);
          }
        }
      }

      emit("connected", {
        status: "ACTIVE",
        entitlements: currentState.entitlements,
      });
      logDebug("SDK connected successfully");
      if (currentConfig.onReady) currentConfig.onReady(data);
      return data;
    }

    const reason = data.error || (data.reason === "expired" ? "expired" : "invalid");
    emit("error", {
      code: "PROJECT_UNPAID",
      message: "Project payment validation failed",
    });
    handleInvalidLicense(
      new Error("Project payment validation failed."),
      reason,
      data
    );
    return data;
  } catch (error) {
    emit("error", { code: "INIT_FAILED", message: error.message, error });
    logDebug("SDK initialization failed:", error.message);
    
    const backendData = error.responseData || {};
    const reason = backendData.error || "error";
    
    handleInvalidLicense(error, reason, backendData);
    throw error;
  }
}

async function forwardInjectables(payload) {
  if (!currentConfig.injectablesEndpoint) return;

  // IMPORTANT: The frontend cannot securely sign payloads.
  // Any "signature" generated here would be spoofable by the client.
  // Real cryptographic signing of injectables must happen on the backend
  // or via an opaque, unforgeable token provided by the Paylock API directly.

  try {
    const retries = currentConfig.network.retries;
    const timeoutMs = currentConfig.network.timeout;

    let lastError;
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(currentConfig.injectablesEndpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "Paylock-SDK",
            "X-Paylock-SDK-Version": currentConfig.sdkVersion,
            "X-Paylock-Signature": payload.signature || "",
          },
          body: JSON.stringify({ injectables: payload.injectables }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (!response.ok)
          throw new Error(`Injectables forward failed (${response.status})`);

        if (currentConfig.debug)
          console.log(
            "[Paylock] Injectables forwarded to backend successfully.",
          );
        return;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;
        if (i < retries - 1)
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw lastError;
  } catch (error) {
    console.error("[Paylock] Failed to forward injectables:", error);
  }
}

function getConfig() {
  return currentConfig;
}
function getState() {
  return { ...currentState };
}

const Paylock = {
  bootstrap,
  getConfig,
  getState,
  on,
  showMessage,
  showSuccess,
  showError,
  showWarning,
  showInfo,
};

if (isBrowser()) {
  if (preConfig && preConfig.auto === true) {
    Paylock.bootstrap(preConfig).catch((err) => {
      if (preConfig.debug)
        console.error("[Paylock] Automatic bootstrap failed:", err);
    });
  }
}

export { Paylock };
