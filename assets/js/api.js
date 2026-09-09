/*
 * API layer — a straight port of src/api.ts + the thunks in
 * src/store/documentsSlice.ts, without Redux.
 *
 * Every request carries `Authorization: Bearer <token>` when a token is known.
 * The backend rejects /api/documents and everything below it with 401
 * "Authentication required" otherwise; /api/billing/plans is public.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Configuration
   *
   * Inside October every value comes from the plugin's Settings, injected as
   * `window.AIOPDF_CONFIG`. The defaults below are only what the file falls
   * back to when it is used outside October.
   * ------------------------------------------------------------------ */
  var CONFIG = {
    /** Origin of the AI PDF Remediation backend. Empty keeps requests same-origin. */
    apiBaseUrl: 'https://livepdfapi.skynettechnologies.us',
    /**
     * October's session endpoint. Sign-in is one POST to our own server, which
     * provisions the account if needed and returns just the module JWT — the
     * provisioning key and the account's identity never reach the browser.
     */
    sessionUrl: '',
    /** October CSRF token, required on the POST above. */
    csrfToken: '',
    /**
     * Fingerprint of the account this install signs in as. When it changes, the
     * cached session token is discarded — see reconcileAccount().
     */
    accountKey: '',
    /**
     * Tab to open on load, so the backend side menu and the in-page tabs agree.
     * One of 'upload', 'scan', 'remediated'.
     */
    initialTab: '',
    /**
     * Autologin link for the coverage modal's "Recommended Plan" button.
     * Built server-side from the site's host; empty leaves the button inert
     * with an explanatory toast.
     */
    upgradeUrl: '',
    /**
     * Domain the Website Scan tab crawls. Empty follows the account's first
     * domain, exactly as the React module did when the host passed none.
     */
    activeDomain: '',
    /** localStorage key the module's session token lives under. */
    tokenKey: 'aiopdf_token'
  };

  /**
   * Merges host-supplied settings over the defaults. Anything not supplied
   * keeps its default.
   *
   * Called both at load and again from app.js on boot, because October's
   * addJs() puts these files in <head> while the inline `AIOPDF_CONFIG` script
   * sits in the body — so at load time there may be nothing to read yet.
   */
  function configure(next) {
    if (!next) return CONFIG;
    Object.keys(next).forEach(function (key) {
      if (next[key] !== undefined && next[key] !== null) CONFIG[key] = next[key];
    });
    return CONFIG;
  }

  configure(global.AIOPDF_CONFIG);

  /**
   * Autologin link behind the coverage modal's "Recommended Plan" button.
   * Built server-side in Classes\Config and injected; this accessor exists so
   * app.js reads it the same way in both builds.
   */
  function upgradeUrl() {
    return CONFIG.upgradeUrl;
  }

  /** Absolute URL for a backend endpoint, e.g. apiUrl('/documents'). */
  function apiUrl(path) {
    return CONFIG.apiBaseUrl + '/api' + (path.charAt(0) === '/' ? path : '/' + path);
  }

  /**
   * Storage key for the session token, scoped to the account it belongs to.
   *
   * Scoping matters: the token is what lets the page skip signing in, so a
   * token cached under a shared key would silently keep an old account alive
   * after the site's configured domain changed. With the account folded into
   * the key, a changed account simply finds no token and signs in again — no
   * migration step to run and nothing to remember to clear.
   */
  function storageKey() {
    var account = CONFIG.accountKey || '';
    return account ? CONFIG.tokenKey + '_' + account : CONFIG.tokenKey;
  }

  function token() {
    try {
      return localStorage.getItem(storageKey());
    } catch (e) {
      return null;
    }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(storageKey(), value);
      else localStorage.removeItem(storageKey());
    } catch (e) {
      /* storage unavailable (private mode) — requests simply go unauthenticated */
    }
  }

  /** Authorization header for hand-rolled fetch calls (file downloads). */
  function authHeaders() {
    var t = token();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  /**
   * A token may also arrive as `?token=…` (handy when this page is opened
   * outside the dashboard). It is stored and stripped from the visible URL so
   * it is not left sitting in the address bar or in a copied link.
   */
  function adoptTokenFromQuery() {
    var params = new URLSearchParams(global.location.search);
    var t = params.get('token');
    if (!t) return;
    setToken(t);
    params.delete('token');
    var query = params.toString();
    global.history.replaceState(
      {},
      '',
      global.location.pathname + (query ? '?' + query : '') + global.location.hash
    );
  }

  /* ------------------------------------------------------------------ *
   * Sign-in
   *
   * One POST to October, which calls the service's provision-account endpoint
   * server-side. That call registers the account on first use and returns a
   * session on every use thereafter, so there is no separate registration step
   * here and nothing sensitive passes through the page.
   * ------------------------------------------------------------------ */

  /** Asks October for a session. Resolves true once a token is stored. */
  function serverSession() {
    var headers = { Accept: 'application/json' };
    if (CONFIG.csrfToken) headers['X-CSRF-TOKEN'] = CONFIG.csrfToken;

    return fetch(CONFIG.sessionUrl, {
      method: 'POST',
      headers: headers,
      credentials: 'same-origin'
    })
      .then(function (res) {
        if (!res.ok) return false;
        return res.json().then(function (data) {
          if (!data || !data.token) return false;
          setToken(data.token);
          return true;
        });
      })
      .catch(function () {
        return false;
      });
  }


  /**
   * Clears tokens written by versions before the key was account-scoped.
   *
   * Those live under the bare `tokenKey` and could belong to any account, so
   * they are discarded once rather than trusted.
   */
  function reconcileAccount() {
    if (!(CONFIG.accountKey || '')) return;

    try {
      if (localStorage.getItem(CONFIG.tokenKey)) {
        localStorage.removeItem(CONFIG.tokenKey);
      }
      localStorage.removeItem(CONFIG.tokenKey + '_account');
    } catch (e) {
      /* storage unavailable — nothing to clean up */
    }
  }

  /** Resolves true once a module token is in storage. */
  function signIn() {
    if (!CONFIG.sessionUrl) return Promise.resolve(false);
    return serverSession();
  }

  /**
   * Resolves to true when a usable module session exists — reusing the stored
   * token if there is one, and asking October for a new one otherwise.
   * An expired stored token is caught by the 401 retry in `request` instead of
   * being probed here, which keeps boot to a single round trip.
   */
  function ensureSession() {
    reconcileAccount();
    if (token()) return Promise.resolve(true);
    return signIn();
  }

  function ApiError(status, data) {
    var err = new Error(String((data && data.error) || 'Request failed'));
    err.name = 'ApiError';
    err.status = status;
    err.code = data && data.code;
    err.data = data || {};
    return err;
  }

  function request(path, options, isRetry) {
    options = options || {};
    var headers = {};
    var key;
    if (options.headers) {
      for (key in options.headers) {
        if (Object.prototype.hasOwnProperty.call(options.headers, key)) {
          headers[key] = options.headers[key];
        }
      }
    }
    var t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(apiUrl(path), {
      method: options.method || 'GET',
      body: options.body,
      headers: headers
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {}; /* non-JSON response */
        })
        .then(function (data) {
          if (res.ok) return data;

          // The module session is a short-lived JWT. One silent re-issue keeps
          // a long-open page working instead of failing every later action.
          // `isRetry` bounds it to a single attempt per call.
          if (res.status === 401 && !isRetry) {
            setToken(null);
            return signIn().then(function (ok) {
              if (!ok) throw ApiError(res.status, data);
              return request(path, options, true);
            });
          }
          throw ApiError(res.status, data);
        });
    });
  }

  var api = {
    get: function (path) {
      return request(path);
    },
    post: function (path, body) {
      return request(path, {
        method: 'POST',
        body: body instanceof FormData ? body : JSON.stringify(body || {})
      });
    },
    del: function (path) {
      return request(path, { method: 'DELETE' });
    }
  };

  /* ------------------------------------------------------------------ *
   * Endpoints
   * ------------------------------------------------------------------ */

  /** GET /api/auth/me — the signed-in user (plan, pages remaining, domains). */
  function fetchMe() {
    return api.get('/auth/me').then(function (d) {
      return d.user;
    });
  }

  /** GET /api/billing/plans */
  function fetchPlans() {
    return api.get('/billing/plans').then(function (d) {
      return d.plans || [];
    });
  }

  /**
   * GET /api/documents — the full unpaginated list.
   * Used to work out remediation eligibility across the WHOLE queue rather
   * than just the visible table page.
   */
  function fetchDocuments() {
    return api.get('/documents').then(function (d) {
      return d.documents || [];
    });
  }

  /**
   * GET /api/documents?type=…&page=…&perPage=… — server-side paginated,
   * filtered and searched fetch for a single tab.
   */
  function fetchDocumentsPage(params) {
    var qs = new URLSearchParams();
    qs.set('type', params.type);
    qs.set('page', String(params.page));
    qs.set('perPage', String(params.perPage));
    if (params.search) qs.set('search', params.search);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.domain) qs.set('domain', params.domain);
    if (params.source && params.source !== 'all') qs.set('source', params.source);
    return api.get('/documents?' + qs.toString());
  }

  /** POST /api/documents/upload — multipart, field name `file`. */
  function uploadPdf(file) {
    var form = new FormData();
    form.append('file', file);
    return api.post('/documents/upload', form).then(function (d) {
      return d.document;
    });
  }

  /** POST /api/documents/:id/scan — reads the PDF and fills in its page count. */
  function scanPdfUrl(id) {
    return api.post('/documents/' + id + '/scan').then(function (d) {
      return d.document;
    });
  }

  /** POST /api/documents/crawl — sweeps a domain for linked PDFs. */
  function crawlDomain(domain) {
    return api.post('/documents/crawl', { domain: domain });
  }

  /** DELETE /api/documents/:id */
  function removeDocument(id) {
    return api.del('/documents/' + id).then(function () {
      return id;
    });
  }

  /** GET /api/documents/:id/suggestions */
  function fetchSuggestions(id) {
    return api.get('/documents/' + id + '/suggestions');
  }

  /** POST /api/remediation/start */
  function startRemediation(documentIds, allowPartial) {
    return api.post('/remediation/start', {
      documentIds: documentIds,
      allowPartial: Boolean(allowPartial)
    });
  }

  /** GET /api/remediation/jobs/:id — polled while a job is processing. */
  function pollJob(jobId) {
    return api.get('/remediation/jobs/' + jobId);
  }

  /**
   * GET /api/documents/:id/download — fetched as a blob with the auth token
   * attached, then handed to the browser as a save.
   */
  function downloadRemediated(docId, fileName, isRetry) {
    return fetch(apiUrl('/documents/' + docId + '/download'), { headers: authHeaders() })
      .then(function (res) {
        // Same single silent re-issue as `request` — this path bypasses it.
        if (res.status === 401 && !isRetry) {
          setToken(null);
          return signIn().then(function (ok) {
            return ok ? downloadRemediated(docId, fileName, true) : false;
          });
        }
        if (!res.ok) return false;
        return res.blob().then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return true;
        });
      })
      .catch(function () {
        return false;
      });
  }

  /** Smallest plan that covers `pages` — falls back to the largest one. */
  function recommendPlan(plans, pages) {
    var paid = plans.filter(function (p) {
      return p.price > 0;
    });
    if (!paid.length) return null;
    var sorted = paid.slice().sort(function (a, b) {
      return a.pages - b.pages;
    });
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].pages >= pages) return sorted[i];
    }
    return sorted[sorted.length - 1];
  }

  global.PdfApi = {
    CONFIG: CONFIG,
    configure: configure,
    upgradeUrl: upgradeUrl,
    apiUrl: apiUrl,
    token: token,
    setToken: setToken,
    authHeaders: authHeaders,
    adoptTokenFromQuery: adoptTokenFromQuery,
    raw: api,

    serverSession: serverSession,
    storageKey: storageKey,
    reconcileAccount: reconcileAccount,
    signIn: signIn,
    ensureSession: ensureSession,

    fetchMe: fetchMe,
    fetchPlans: fetchPlans,
    fetchDocuments: fetchDocuments,
    fetchDocumentsPage: fetchDocumentsPage,
    uploadPdf: uploadPdf,
    scanPdfUrl: scanPdfUrl,
    crawlDomain: crawlDomain,
    removeDocument: removeDocument,
    fetchSuggestions: fetchSuggestions,
    startRemediation: startRemediation,
    pollJob: pollJob,
    downloadRemediated: downloadRemediated,
    recommendPlan: recommendPlan
  };
})(window);
