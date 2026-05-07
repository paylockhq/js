const SDK_VERSION = "1.0.2";
const DEFAULT_BASE_URL = "https://api.paylock.ng/";
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
        const errorBody = await response.text();
        throw createError(
          `API request failed (${response.status}): ${errorBody}`,
        );
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

function handleInvalidLicense(error, reason = "invalid") {
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

  const mode = currentConfig.invalidBehavior;
  if (mode === "modal") {
    showPaylockModal(currentConfig.modalText);
  } else if (mode === "redirect") {
    if (isBrowser())
      window.location.href =
        currentConfig.redirectUrl || "https://paylock.ng/upgrade";
  }
}

function showPaylockModal(text) {
  if (!isBrowser() || !document.body) return;

  const modalId = "paylock-modal";
  if (document.getElementById(modalId)) {
    return; // Prevent duplicate modals
  }

  const theme = currentConfig.modalTheme || {};
  const primary = theme.primary || "#ff4d4d";
  const background = theme.background || "#1e1e1e";
  const textColor = theme.text || "#ffffff";
  const borderColor = theme.border || primary;
  const glowEnabled = theme.glow !== false;

  const message =
    text ||
    "Access denied. This application cannot run without a valid Paylock integration.";

  const modal = document.createElement("div");
  modal.id = modalId;
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,0.85)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "999999";
  modal.innerHTML = `
    <div style="max-width: 640px; width: 90%; padding: 24px; background: ${background}; border: 2px solid ${borderColor}; border-radius: 18px; color: ${textColor}; font-family: system-ui, sans-serif; text-align: center; box-shadow: ${glowEnabled ? `0 0 40px ${primary}44` : "none"};">
      <h1 style="margin: 0 0 16px; font-size: 2rem;">Paylock Protection</h1>
      <p style="margin: 0 0 24px; line-height: 1.6;">${message}</p>
      <button style="padding: 12px 24px; border: none; background: ${primary}; color: #000; font-weight: 700; border-radius: 10px; cursor: pointer;">Contact your administrator</button>
    </div>
  `;

  const button = modal.querySelector("button");
  if (button) {
    button.addEventListener("click", () => {
      if (currentConfig.invalidBehavior === "redirect") {
        window.location.href = currentConfig.redirectUrl;
      }
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

    const reason = data.reason === "expired" ? "expired" : "invalid";
    emit("error", {
      code: "PROJECT_UNPAID",
      message: "Project payment validation failed",
    });
    handleInvalidLicense(
      new Error("Project payment validation failed."),
      reason,
    );
    return data;
  } catch (error) {
    emit("error", { code: "INIT_FAILED", message: error.message, error });
    logDebug("SDK initialization failed:", error.message);
    handleInvalidLicense(error, "error");
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
