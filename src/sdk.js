const SDK_VERSION = "1.0.0";
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

// Simple EventEmitter implementation for SDK events
const eventListeners = new Map();

function on(eventName, callback) {
  if (typeof callback !== "function") {
    throw createError("Event callback must be a function");
  }
  if (!eventListeners.has(eventName)) {
    eventListeners.set(eventName, []);
  }
  eventListeners.get(eventName).push(callback);

  // Return unsubscribe function
  return () => {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
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
          `[Paylockr] Event callback error for '${eventName}':`,
          err,
        );
      }
    });
  }
}

function isBrowser() {
  return typeof window !== "undefined";
}

function getStorageKey(key) {
  return `${STORAGE_KEY_PREFIX}${key}`;
}

function normalizeUrl(value) {
  if (!value) return DEFAULT_BASE_URL;
  return value.endsWith("/") ? value : `${value}/`;
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

  const textColor = "white";

  div.textContent = text;
  div.style.cssText = `
    position: fixed;
    ${messageDefaults.position === "top-right" ? "top: 20px; right: 20px;" : "top: 20px; left: 20px;"}
    background-color: ${bgColor};
    color: ${textColor};
    ${Object.entries(messageDefaults.styles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${v};`)
      .join("")}
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  `;

  if (!document.getElementById("paylock-style")) {
    const style = document.createElement("style");
    style.id = "paylock-style";
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  return div;
}

function showMessage(text, type = "info", duration = messageDefaults.duration) {
  if (!isBrowser() || !document.body) return;

  const el = createMessageElement(text, type);
  if (!el) return;

  document.body.appendChild(el);

  if (duration > 0) {
    setTimeout(() => el.remove(), duration);
  }

  return () => el.remove();
}

function logDebug(...args) {
  if (currentConfig?.debug) {
    console.log("[Paylockr]", ...args);
  }
}

function createError(message) {
  return new Error(`[Paylockr] ${message}`);
}

function getGlobalConfig() {
  if (!isBrowser()) return null;
  const keys = Object.keys(window);
  for (const key of keys) {
    try {
      const obj = window[key];
      if (obj && typeof obj === "object") {
        const hasApiKey =
          typeof obj.apiKey === "string" ||
          typeof obj.pk === "string";
        const hasLicenseKey = 
          typeof obj.licenseKey === "string" ||
          typeof obj.license === "string" ||
          typeof obj.lk === "string";
        if (hasApiKey || hasLicenseKey) {
          return obj;
        }
      }
    } catch (_) {
      // ignore cross-origin globals or frozen objects
    }
  }
  return null;
}

function resolveConfig(userConfig) {
  const config = userConfig || getGlobalConfig();
  if (!config || typeof config !== "object") {
    throw createError(
      "No SDK configuration provided. Pass an object to Paylockr.init().",
    );
  }

  const apiKey = config.apiKey || config.pk;
  const licenseKey = config.licenseKey || config.license || config.lk;
  const projectId = config.projectId;

  if (!apiKey) {
    throw createError("apiKey (Project API Key) is required.");
  }
  if (!licenseKey) {
    throw createError("licenseKey is required.");
  }

  let deviceId = isBrowser() ? localStorage.getItem('paylock_device_id') : null;
  if (!deviceId && isBrowser()) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('paylock_device_id', deviceId);
  }

  return {
    apiKey: apiKey.trim(),
    licenseKey: licenseKey.trim(),
    projectId: projectId ? projectId.trim() : "unknown",
    deviceId: deviceId || 'server_device',
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
    invalidBehavior: config.invalidBehavior || "modal",
    redirectUrl: config.redirectUrl || "https://paylock.ng/upgrade",
    modalText:
      config.modalText || "Access denied. Payment is required or license is invalid.",
    modalTheme: config.modalTheme || {},
    onReady: typeof config.onReady === "function" ? config.onReady : undefined,
    onError: typeof config.onError === "function" ? config.onError : undefined,
    onMessage:
      typeof config.onMessage === "function" ? config.onMessage : undefined,
    injectables: config.injectables === true,
    injectablesEndpoint:
      typeof config.injectablesEndpoint === "string"
        ? config.injectablesEndpoint
        : undefined,
  };
}

async function apiRequest(
  path,
  body,
  method = "POST",
  headers = {},
  retries = 3,
) {
  const url = new URL(path, currentConfig.baseUrl).toString();
  const defaultHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  logDebug(
    `API Request: ${method} ${path}`,
    `ProjectId: ${currentConfig.projectId}`,
  );

  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method,
        headers: { ...defaultHeaders, ...headers },
        body: method !== "GET" ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const errorMsg = `API request failed (${response.status}): ${errorBody}`;
        logDebug(`API Error [attempt ${i + 1}]:`, errorMsg);
        throw createError(errorMsg);
      }

      const data = await response.json();
      logDebug(`API Response [${method} ${path}]:`, data);
      return data;
    } catch (error) {
      lastError = error;
      if (currentConfig?.debug) {
        console.warn(
          `[Paylockr] API attempt ${i + 1}/${retries} failed:`,
          error.message,
        );
      }
      // Wait before retry (exponential backoff)
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  throw lastError;
}

function handleInvalidLicense(error) {
  if (currentConfig?.debug) {
    console.error("[Paylockr] license validation failed", error);
  }

  const mode = currentConfig?.invalidBehavior || "redirect";
  if (mode === "modal") {
    showPaylockrModal(currentConfig.modalText);
    return;
  }

  if (typeof currentConfig?.onError === "function") {
    currentConfig.onError(error);
  }

  window.location.href =
    currentConfig?.redirectUrl || "https://paylock.ng/upgrade";
}

function showPaylockrModal(text) {
  if (!isBrowser()) return;

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
      window.location.href =
        currentConfig?.redirectUrl || "https://paylock.ng/upgrade";
    });
  }

  document.body.appendChild(modal);
}

async function checkProjectStatus() {
  const url = new URL("project/has-paid", currentConfig.baseUrl);

  // Add query parameters
  url.searchParams.set("projectId", currentConfig.projectId);
  url.searchParams.set("action", "check_project");
  if (currentConfig.injectables) {
    url.searchParams.set("include", "injectables");
  }

  const headers = {
    "X-LICENSE-KEY": currentConfig.licenseKey || currentConfig.apiKey,
  };

  if (currentConfig.domain) {
    headers["X-Paylock-Domain"] = currentConfig.domain;
  }

  logDebug("Checking project status with:", {
    projectId: currentConfig.projectId,
    domain: currentConfig.domain,
  });

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "Paylockr-SDK",
      ...headers,
    },
    body: "{}",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw createError(
      `Payment check failed (${response.status}): ${errorBody}`,
    );
  }

  return response.json();
}

async function registerSdkConnection(projectId) {
  try {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store connection metadata
    if (isBrowser() && window.sessionStorage) {
      sessionStorage.setItem(getStorageKey("projectId"), projectId);
      sessionStorage.setItem(getStorageKey("connectionId"), connectionId);
      sessionStorage.setItem(
        getStorageKey("initTime"),
        new Date().toISOString(),
      );
    }

    currentState.connectionId = connectionId;
    currentState.boundProjectId = projectId;

    logDebug("SDK connection registered:", {
      connectionId,
      projectId,
    });

    return connectionId;
  } catch (err) {
    console.warn("[Paylockr] Failed to register SDK connection:", err);
    return null;
  }
}

async function init(config) {
  emit("init_start", { timestamp: new Date() });

  try {
    currentConfig = resolveConfig(config);
    currentState.lastInit = new Date();

    logDebug("SDK initializing with config:", {
      projectId: currentConfig.projectId,
      environment: currentConfig.environment,
      appName: currentConfig.appName,
      debug: currentConfig.debug,
    });

    if (currentConfig.onMessage) {
      showMessage = (text, type, duration) =>
        currentConfig.onMessage({
          text,
          type,
          duration,
        });
    }

    // Show connection start message
    if (currentConfig.debug) {
      logDebug("Checking if project has paid...");
    }

    const result = await checkProjectStatus();
    const data = result.data || {};

    // Validate response contains expected project
    if (!data.projectId) {
      throw createError("Invalid response: missing projectId in response data");
    }

    // Verify the returned projectId matches our request
    if (data.projectId !== currentConfig.projectId) {
      throw createError(
        `Project mismatch! Requested: ${currentConfig.projectId}, Got: ${data.projectId}. This indicates a multi-tenant isolation issue.`,
      );
    }

    currentState.initialized = true;
    currentState.projectStatus = data.has_paid ? "ACTIVE" : "INACTIVE";
    currentState.entitlements = Array.isArray(data.entitlements)
      ? data.entitlements
      : [];

    // Register the connection
    await registerSdkConnection(currentConfig.projectId);

    if (data.has_paid === true) {
      if (currentConfig.injectables && Array.isArray(data.injectables)) {
        // Forward injectables to backend if endpoint is configured
        if (currentConfig.injectablesEndpoint) {
          try {
            await forwardInjectables({ injectables: data.injectables });
          } catch (err) {
            console.warn("[Paylockr] Failed to forward injectables:", err);
          }
        }
      }

      emit("connected", {
        projectId: currentConfig.projectId,
        status: "ACTIVE",
        entitlements: currentState.entitlements,
      });

      logDebug("SDK connected successfully", {
        projectId: currentConfig.projectId,
        entitlements: currentState.entitlements,
      });

      if (typeof currentConfig.onReady === "function") {
        currentConfig.onReady(data);
      }

      emit("init_success", {
        projectId: currentConfig.projectId,
        status: "ACTIVE",
      });

      return data;
    }

    // Project not paid
    emit("error", {
      code: "PROJECT_UNPAID",
      message: "Project payment validation failed",
      projectId: currentConfig.projectId,
    });

    handleInvalidLicense(new Error("Project payment validation failed."));
    return data;
  } catch (error) {
    emit("error", {
      code: "INIT_FAILED",
      message: error.message,
      error,
    });

    logDebug("SDK initialization failed:", error.message);

    handleInvalidLicense(error);
    throw error;
  }
}

async function forwardInjectables(payload) {
  if (!currentConfig.injectablesEndpoint) {
    return;
  }

  try {
    const response = await fetch(currentConfig.injectablesEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "Paylockr-SDK",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Injectables forward failed (${response.status})`);
    }

    if (currentConfig.debug) {
      console.log("[Paylockr] Injectables forwarded successfully");
    }
  } catch (error) {
    console.error("[Paylockr] Failed to forward injectables:", error);
  }
}

async function track(eventName, payload = {}) {
  if (!currentState.initialized) {
    throw createError("Paylockr.init() must be called before track().");
  }

  if (!eventName || typeof eventName !== "string") {
    throw createError("track(eventName) requires a string event name.");
  }

  try {
    const trackPayload = {
      projectId: currentConfig.projectId,
      eventName,
      payload,
      appName: currentConfig.appName,
      environment: currentConfig.environment,
      sdkVersion: currentConfig.sdkVersion,
      connectionId: currentState.connectionId,
    };

    const response = await apiRequest("sdk/track", trackPayload, "POST", {
      "X-LICENSE-KEY": currentConfig.license,
      "X-Paylockr-Domain": currentConfig.domain,
    });

    logDebug("Event tracked successfully:", eventName, response);
    emit("event_tracked", { eventName, eventId: response?.data?.eventId });
    return response;
  } catch (error) {
    logDebug("Event tracking failed:", error);
    emit("error", {
      code: "TRACK_FAILED",
      message: `Failed to track event: ${eventName}`,
      error,
    });
    // Don't throw to avoid crashing the app on telemetry failure
  }
}

// Public API for UI feedback
function showSuccess(message) {
  showMessage(message, "success");
  emit("message_shown", { type: "success", message });
}

function showError(message) {
  showMessage(message, "error");
  emit("message_shown", { type: "error", message });
}

function showWarning(message) {
  showMessage(message, "warning");
  emit("message_shown", { type: "warning", message });
}

function showInfo(message) {
  showMessage(message, "info");
  emit("message_shown", { type: "info", message });
}

function getConfig() {
  return currentConfig;
}

function getState() {
  return { ...currentState };
}

const Paylockr = {
  init,
  track,
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
  window.Paylockr = window.Paylockr || Paylockr;

  const defaultConfig = getGlobalConfig();
  if (defaultConfig) {
    Paylockr.init(defaultConfig).catch((error) => {
      if (defaultConfig.debug) {
        console.error("[Paylockr] Automatic init failed:", error);
      }
    });
  }
}

export { Paylockr };
