// ============================================================
// SUPABASE CONFIGURATION — KHULNA PULSE
// Uses direct REST API (fetch) — no CDN client dependency
// ============================================================

const SUPABASE_URL = 'https://jubxlyqbtssflpzzyzug.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_buD22GJyI9D-EI--xZCFsw_ARAIrSfV';
const SUPABASE_REST = SUPABASE_URL + '/rest/v1';

// ===== LOW-LEVEL API =====
const API_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function sbFetch(method, path, body) {
  const url = SUPABASE_REST + path;
  const opts = {
    method,
    headers: { ...API_HEADERS },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    if (method === 'POST') opts.headers['Prefer'] = 'return=representation';
    else if (method === 'PATCH' || method === 'PUT') opts.headers['Prefer'] = 'return=minimal';
  }
  console.log('[SB]', method, path);
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    console.log('[SB] Response:', res.status, text.substring(0, 200));
    if (!res.ok) {
      let errMsg = 'HTTP ' + res.status;
      try { const d = JSON.parse(text); errMsg = d.message || d.msg || errMsg; } catch(e) {}
      return { data: null, error: { message: errMsg, status: res.status } };
    }
    const data = text ? JSON.parse(text) : null;
    return { data, error: null };
  } catch (e) {
    console.error('[SB] Network error:', e);
    return { data: null, error: { message: e.message } };
  }
}

// ===== SUPABASE CLIENT (drop-in replacement) =====
const supabaseClient = {
  from(table) {
    return new SupabaseQueryBuilder(table);
  },
  rpc(fn, params) {
    return sbFetch('POST', '/rpc/' + fn, params);
  },
  auth: {
    getSession: () => {
      try {
        const raw = localStorage.getItem('kp_supabase_session');
        const session = raw ? JSON.parse(raw) : null;
        return Promise.resolve({ data: { session }, error: null });
      } catch(e) {
        return Promise.resolve({ data: { session: null }, error: null });
      }
    },
    signInWithOAuth: (opts) => {
      const redirectUrl = (opts && opts.options && opts.options.redirectTo) || window.location.href;
      // Use implicit flow to get tokens directly in URL hash (no PKCE exchange needed)
      window.location.href = SUPABASE_URL + '/auth/v1/authorize?provider=' + opts.provider + '&redirect_to=' + encodeURIComponent(redirectUrl);
      return Promise.resolve({ data: null, error: null });
    },
    getUser: () => {
      try {
        const raw = localStorage.getItem('kp_supabase_session');
        const session = raw ? JSON.parse(raw) : null;
        if (session && session.access_token) {
          // Fetch user info from Supabase /auth/v1/user endpoint
          return fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: { 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPABASE_ANON_KEY }
          }).then(r => r.json()).then(data => {
            return { data: { user: data }, error: data.error || null };
          }).catch(() => ({ data: { user: null }, error: { message: 'Failed to fetch user' } }));
        }
        return Promise.resolve({ data: { user: null }, error: null });
      } catch(e) {
        return Promise.resolve({ data: { user: null }, error: null });
      }
    },
    signOut: () => {
      try { localStorage.removeItem('kp_supabase_session'); } catch(e) {}
      return Promise.resolve({ data: null, error: null });
    },
  }
};

// ===== CHAINABLE QUERY BUILDER =====
class SupabaseQueryBuilder {
  constructor(table) {
    this._table = table;
    this._select = '*';
    this._filters = [];
    this._order = null;
    this._limit = null;
    this._single = false;
  }

  select(cols) { this._select = cols || '*'; return this; }
  eq(col, val) { this._filters.push(col + '=eq.' + encodeURIComponent(String(val))); return this; }
  order(col, opts) { this._order = col + '.' + ((opts && opts.ascending) ? 'asc' : 'desc'); return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this._exec(); }

  _buildUrl() {
    let url = '/' + this._table + '?select=' + this._select;
    this._filters.forEach(f => { url += '&' + f; });
    if (this._order) url += '&order=' + this._order;
    if (this._limit) url += '&limit=' + this._limit;
    return url;
  }

  _exec() {
    return sbFetch('GET', this._buildUrl()).then(result => {
      if (this._single) {
        if (result.data && result.data.length > 0) result.data = result.data[0];
        else result.data = null;
      }
      return result;
    });
  }

  // Make it awaitable (thenable)
  then(resolve, reject) {
    this._exec().then(resolve, reject);
  }
  catch(reject) {
    this._exec().catch(reject);
  }

  insert(row) {
    return sbFetch('POST', '/' + this._table, row);
  }
  update(row) {
    // update must call .eq() after, so we store row
    this._updateBody = row;
    return this;
  }
}

// Override the returned object's then/catch to handle update chain
const origProto = SupabaseQueryBuilder.prototype;
const origThen = origProto.then.bind;
origProto.then = function(resolve, reject) {
  if (this._updateBody) {
    // This is an update chain: .update(row).eq(col, val)
    const url = '/' + this._table + '?' + this._filters.join('&');
    sbFetch('PATCH', url, this._updateBody).then(resolve, reject);
  } else {
    this._exec().then(resolve, reject);
  }
};
origProto.catch = function(reject) {
  if (this._updateBody) {
    const url = '/' + this._table + '?' + this._filters.join('&');
    sbFetch('PATCH', url, this._updateBody).catch(reject);
  } else {
    this._exec().catch(reject);
  }
};

// ===== REAL-TIME POLLING HELPER =====
supabaseClient.channel = function(name) {
  return {
    on: function(evt, opts, cb) {
      return {
        subscribe: function(statusCb) {
          console.log('[SB] Channel ' + name + ' subscribed (polling mode)');
          if (statusCb) statusCb('SUBSCRIBED');
          return { unsubscribe: function() {} };
        }
      };
    }
  };
};

// Parse OAuth callback to extract session (handles both hash fragment & query params)
(function parseAuthCallback() {
  try {
    const hash = window.location.hash;
    const search = window.location.search;
    const hasHashToken = hash && hash.indexOf('access_token') !== -1;
    const hasQueryToken = search && search.indexOf('access_token') !== -1;
    const hasError = (hash && hash.indexOf('error') !== -1) || (search && search.indexOf('error') !== -1);

    // Handle auth errors
    if (hasError) {
      const errParams = new URLSearchParams((hasError && hash.indexOf('error') !== -1 ? hash.substring(1) : search.substring(1)));
      console.error('[SB] Auth error:', errParams.get('error'), errParams.get('error_description'));
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check hash fragment first (#access_token=...), then query params (?access_token=...)
    let tokenSource = hasHashToken ? hash.substring(1) : hasQueryToken ? search.substring(1) : null;
    if (!tokenSource) return;

    const params = new URLSearchParams(tokenSource);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token) return;

    // Build session object
    const session = { access_token, refresh_token, user: {}, email: '', user_metadata: {} };

    // Try to parse user from callback params (implicit flow)
    try { session.user = JSON.parse(params.get('user') || '{}'); } catch(e) {}
    session.email = session.user.email || '';
    session.user_metadata = session.user.user_metadata || {};
    session.user_metadata.avatar_url = session.user_metadata.avatar_url || '';
    session.user_metadata.full_name = session.user_metadata.full_name || '';

    localStorage.setItem('kp_supabase_session', JSON.stringify(session));
    // Clean URL (remove tokens)
    window.history.replaceState({}, document.title, window.location.pathname);
    console.log('[SB] Auth session saved, email:', session.email);

    // Fetch full user info from Supabase to ensure we have all metadata
    fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + access_token, 'apikey': SUPABASE_ANON_KEY }
    }).then(r => r.json()).then(userData => {
      if (userData && userData.email && !userData.error) {
        session.user = userData;
        session.email = userData.email;
        session.user_metadata = userData.user_metadata || userData.raw_user_meta_data || {};
        session.user_metadata.avatar_url = session.user_metadata.avatar_url || userData.avatar_url || '';
        session.user_metadata.full_name = session.user_metadata.full_name || userData.full_name || userData.user_name || '';
        localStorage.setItem('kp_supabase_session', JSON.stringify(session));
        console.log('[SB] User info updated:', userData.email);
      }
    }).catch(() => {});

  } catch (e) {
    console.error('[SB] Auth callback parse error:', e);
  }
})();

console.log('[SB] Supabase REST client ready — Khulna Pulse');
