# Paylock JS SDK

The official JavaScript SDK for PaylockHQ. Secure your application by validating project access, enforcing active licensing, and securely loading frontend injectables.

---

## Installation

Install via your package manager or include it directly via CDN.

**npm**
```bash
npm install @paylock/js
```

**CDN (Browser)**
```html
<script src="https://cdn.paylock.ng/paylock-web.js"></script>
```

---

## Initialization

Paylock can be initialized in two ways. **Never expose secret keys on the frontend**. Only use your public `apiKey`.

### 1. Manual Initialization (Recommended)

Call `Paylock.bootstrap()` with your configuration. This is ideal for SPA frameworks (React, Vue, etc.).

```js
import { Paylock } from '@paylock/js';

await Paylock.bootstrap({
  apiKey: 'pk_live_your_public_key',
  licenseKey: 'user_license_abc123',
  onReady: () => console.log('✅ Paylock initialized successfully'),
  onInvalid: () => console.error('🚫 License is invalid'),
});
```

### 2. Auto-Initialization (Browser Global)

Define `window.Paylock` before loading the CDN script. The SDK will detect this object and automatically initialize.

```html
<script>
  window.Paylock = {
    apiKey: 'pk_live_your_public_key',
    licenseKey: 'user_license_abc123',
    invalidBehavior: 'modal'
  };
</script>
<script src="https://cdn.paylock.ng/paylock-web.js"></script>
```

---

## Configuration API

| Option | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `apiKey` | `string` | **Yes*** | Your public project API key (`pk_live_...`). Use this for global project protection. |
| `licenseKey` | `string` | **Yes*** | User-level license key (`LICENSE_...`). Use this for user-level protection. |

*(Note: You only need to provide **one** of `apiKey` OR `licenseKey`, not both.)*
| `invalidBehavior` | `string` | No | How to handle failed validation: `'modal'`, `'redirect'`, or `'none'`. (Default: `'modal'`) |
| `redirectUrl` | `string` | No | The URL to redirect to if `invalidBehavior` is `'redirect'`. |
| `cache.enabled` | `boolean` | No | Whether to cache successful validation locally. (Default: `true`) |
| `cache.ttl` | `number` | No | Time-to-live for the cache in seconds. (Default: `3600`) |
| `injectables` | `boolean` | No | Fetch secure injectables from the Paylock API. |
| `injectablesEndpoint` | `string`| No | Your backend endpoint to securely forward retrieved injectables to via POST. |

---

## Lifecycle Hooks

You can respond to validation states using lifecycle callbacks:

```js
Paylock.bootstrap({
  apiKey: 'pk_live_...',
  licenseKey: '...',
  onReady: (data) => {
    // Fired when license is active and valid
  },
  onExpired: (error) => {
    // Fired specifically when a previously valid license expires
  },
  onInvalid: (error) => {
    // Fired when the license is structurally invalid or missing
  },
  onInjectablesLoaded: (injectables) => {
    // Fired after injectables are successfully forwarded to your backend
  }
});
```

---

## Secure Injectables Protocol

Paylock allows you to securely inject premium features or configurations into an application.

1. Set `injectables: true` and define your `injectablesEndpoint` (e.g., `https://api.yourapp.com/webhooks/paylock`).
2. When validation succeeds, Paylock fetches the injectables.
3. Paylock sends a `POST` request to your endpoint containing the payload.
4. **Security:** The request includes an `x-paylock-signature` header containing an **HMAC Signed JWT** generated strictly by the Paylock Backend using your project's `webhookSecret`.
5. **Your backend must verify this JWT signature** before trusting the injectables payload.

```js
// Frontend Configuration
Paylock.bootstrap({
  apiKey: 'pk_live_...',
  licenseKey: '...',
  injectables: true,
  injectablesEndpoint: 'https://api.yourapp.com/webhooks/paylock'
});
```

---

## Caching Strategy

By default, Paylock caches successful validations for 1 hour (3600 seconds) to ensure your application remains blazing fast and resilient to network hiccups.

```js
Paylock.bootstrap({
  apiKey: 'pk_live_...',
  licenseKey: '...',
  cache: {
    enabled: true,
    ttl: 7200 // Cache for 2 hours
  }
});
```

*(Note: If a user is actively invalidated by the backend, the cache will be bypassed upon the next TTL expiration).*
