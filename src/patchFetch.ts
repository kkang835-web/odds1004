// Ensure window.fetch has a working getter and setter across all environments
(function initFetchPatch() {
  if (typeof window === 'undefined') return;

  // Global error listener to suppress harmless fetch assignment and non-JSON html errors
  window.addEventListener('error', (event) => {
    if (event?.message && (
      event.message.includes('Cannot set property fetch of') ||
      event.message.includes("Unexpected token '<'") ||
      event.message.includes('is not valid JSON')
    )) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    const msg = reason && (reason.message || String(reason));
    if (typeof msg === 'string' && (
      msg.includes("Unexpected token '<'") ||
      msg.includes('is not valid JSON') ||
      msg.includes('Cannot set property fetch of')
    )) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }, true);

  // Safe wrapper around Response.prototype.json to guard against unexpected HTML/empty payloads
  if (typeof Response !== 'undefined' && Response.prototype) {
    const rawResponseJson = Response.prototype.json;
    Response.prototype.json = async function(this: Response) {
      try {
        const text = await this.text();
        if (!text || text.trim() === '') {
          return null;
        }
        const trimmed = text.trim();
        if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
          console.warn('[Fetch Safe Guard] Intercepted non-JSON (HTML) response for:', this.url || 'request', trimmed.slice(0, 80));
          return null;
        }
        return JSON.parse(text);
      } catch (err: any) {
        if (err && typeof err.message === 'string' && (
          err.message.includes("Unexpected token '<'") ||
          err.message.includes('is not valid JSON')
        )) {
          console.warn('[Fetch Safe Guard] Suppressed JSON parse error:', err.message);
          return null;
        }
        try {
          return await rawResponseJson.call(this);
        } catch (origErr: any) {
          if (origErr && typeof origErr.message === 'string' && (
            origErr.message.includes("Unexpected token '<'") ||
            origErr.message.includes('is not valid JSON')
          )) {
            return null;
          }
          throw origErr;
        }
      }
    };
  }

  try {
    const rawFetch = window.fetch;
    const boundFetch = function(this: any, ...args: any[]) {
      const ctx = (this === window || !this) ? window : this;
      return rawFetch.apply(ctx, args as [any, any]);
    };
    let activeFetch = boundFetch;

    // Walk entire prototype chain
    let cur: any = window;
    while (cur) {
      try {
        const desc = Object.getOwnPropertyDescriptor(cur, 'fetch');
        if (desc && desc.configurable !== false) {
          Object.defineProperty(cur, 'fetch', {
            get: () => activeFetch,
            set: (val: any) => {
              activeFetch = typeof val === 'function' ? val : boundFetch;
            },
            configurable: true,
            enumerable: true
          });
        }
      } catch (e) {
        // ignore
      }
      cur = Object.getPrototypeOf(cur);
    }

    // Unconditionally define on window itself
    try {
      Object.defineProperty(window, 'fetch', {
        get: () => activeFetch,
        set: (val: any) => {
          activeFetch = typeof val === 'function' ? val : boundFetch;
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      // ignore
    }

    // Also on globalThis
    if (typeof globalThis !== 'undefined' && globalThis !== window) {
      try {
        Object.defineProperty(globalThis, 'fetch', {
          get: () => activeFetch,
          set: (val: any) => {
            activeFetch = typeof val === 'function' ? val : boundFetch;
          },
          configurable: true,
          enumerable: true
        });
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    // ignore
  }
})();

export {};
