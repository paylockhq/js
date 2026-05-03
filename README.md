# Paylock JS SDK 🛡️

The easiest way to protect your SaaS or web application. Verify licenses, manage payments, and secure your code with just a few lines of JavaScript.

---

## ✨ Features
- 🚀 **Zero-effort Integration**: Works automatically by detecting global configs.
- 🎨 **Beautiful Modals**: Built-in, fully customizable licensing UI.
- 🔀 **Flexible Behavior**: Show a modal or redirect unauthorized users.
- 🔐 **Secure Injectables**: Load premium features only for valid users.
- 🧠 **Smart Caching**: Saves license status locally for lightning-fast loads.

---

## 🔧 Installation

You can either include the SDK directly in your HTML, or install it via `npm`/`yarn` for Node.js/ESM/CommonJS use.

### ➤ Browser (via CDN or direct file)

```html
<script src="https://cdn.jsdelivr.net/npm/@paylock/js@latest/dist/paylock-frontend.js"></script>
```

### ➤ Node.js / Build Tools

```bash
npm install @paylock/js
```

```js
// ESM
import "@paylock/js";

// CommonJS
require("@paylock/js");
```

---

## 🚀 Usage

Before the SDK initializes, you must define a global config object in the browser’s `window` scope. This object allows the paylock SDK to read your license, configure behavior, and optionally handle secure injectables.

#### ✅ Basic Usage

```html
<script>
  window.myapp = {
    license: "YOUR_LICENSE_KEY", // Required
    onReady: function () {
      console.log("✅ License verified.");
    },
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@paylock/js@latest/dist/paylock-frontend.js"></script>
```

#### 💻 Minimal Modal with Default Text

```html
<script>
  window.myapp = {
    license: "LICENSE_ABC123",
    invalidBehavior: "modal",
    debug: false,
  };
</script>
```

> This shows the default paylock modal with fallback messaging when license is invalid or expired.

#### 🏗️ Full Project Configuration

If you prefer to specify project details individually:

```html
<script>
  window.paylock = {
    apiKey: "pk_live_your_project_public_key",
    projectId: "69dbbbff80c3c7d88f330fbe",
    environment: "production",
    appName: "My SaaS App",
    sdkVersion: "1.0.0",
    onReady: function (data) {
      console.log("paylock initialized", data);
    },
    onError: function (err) {
      console.error("paylock failed to initialize", err);
    },
  };
</script>
```

---

## 🎨 Customizing the Experience

### Custom Modal Theme
Make the licensing modal match your brand perfectly.

```js
window.paylock = {
  license: "YOUR_LICENSE_KEY",
  invalidBehavior: "modal",
  modalText: "🚫 This application is not licensed. Please contact support.",
  modalTheme: {
    primary: "#6366f1",     // Indigo
    background: "#0f172a",  // Dark Slate
    text: "#f8fafc",
    border: "#6366f1",
    glow: true              // Adds a subtle outer glow
  }
};
```

### Automatic Redirection
Don't want a modal? Redirect unauthorized users to your pricing page instead.

```js
window.paylock = {
  license: "YOUR_LICENSE_KEY",
  invalidBehavior: "redirect",
  redirectUrl: "https://yourapp.com/pricing"
};
```

### Persistent License (No Daily Recheck)
This skips license verification after the first success, unless storage is cleared.

```js
window.paylock = {
  license: "YOUR_LICENSE_KEY",
  recheck: false,
  onReady: () => console.log("🔓 Cached license still valid.")
};
```

### Injectables Support (Advanced)
Load secure features or data only after a successful license check.

```js
window.paylock = {
  license: "YOUR_LICENSE_KEY",
  injectables: true,
  injectablesEndpoint: "https://yourapp.com/sdk/receive",
  onReady: () => console.log("🔐 License validated, injectables loading...")
};
```

### Using Custom Config Names
You can name your config object anything — Paylock will find it as long as it has a `license` or `lk` key.

```html
<script>
  window._devSettings = {
    lk: "YOUR_LICENSE_KEY",
    debug: true,
    onReady: () => console.log("🔐 _devSettings verified")
  };
</script>
```

---

## 📦 Framework Integration (ESM / CommonJS)

### ESM (Vite, Nuxt, React, etc.)
```js
import "@paylock/js";

window.paylock = {
  license: "YOUR_LICENSE_KEY",
  onReady: () => console.log("✅ Verified")
};
```

### CommonJS (Webpack, Next.js)
```js
require("@paylock/js");

global.paylock = {
  license: "YOUR_LICENSE_KEY",
  injectables: true,
  injectablesEndpoint: "https://yourapp.com/sdk/receive"
};
```

---

## ⚙️ Configuration API

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `license` | `string` | **Required** | Your project license key (or use `lk`). |
| `apiKey` | `string` | `undefined` | Your project public API key. |
| `projectId` | `string` | `undefined` | Your unique project ID. |
| `environment` | `string` | `'production'` | Options: `'production'`, `'sandbox'`. |
| `appName` | `string` | `undefined` | Name of your application. |
| `sdkVersion` | `string` | `'1.0.0'` | Version of the SDK being used. |
| `invalidBehavior` | `string` | `'modal'` | Options: `'modal'`, `'redirect'`, or `'none'`. |
| `modalText` | `string` | `...` | Custom message shown in the invalid modal. |
| `modalTheme` | `object` | `...` | Colors for `primary`, `background`, `text`, `border`. |
| `redirectUrl` | `string` | `undefined` | URL to redirect to if `invalidBehavior` is `'redirect'`. |
| `recheck` | `boolean` | `true` | If `false`, successful licenses are cached forever. |
| `injectables` | `boolean` | `false` | Enable secure injectable loading. |
| `injectablesEndpoint` | `string` | `undefined` | Where to send retrieved injectables. |
| `debug` | `boolean` | `false` | Enables verbose logging in the console. |

---

## 📞 Support
- 🌐 **Website**: [paylock.ng](https://paylock.ng)
- 📧 **Email**: [support@paylock.ng](mailto:support@paylock.ng)
- 📖 **Documentation**: [docs.paylock.ng](https://docs.paylock.ng)

---
*Made with ❤️ by the Paylock Team.*
