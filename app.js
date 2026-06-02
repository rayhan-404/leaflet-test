// ===== NO SEED DATA — starts empty, synced from Supabase =====

// ===== LIVE DATA (synced with Supabase in real-time) =====
let hotspotsData = [];
let reportsData = [];

// SVG icons per cause (no emojis)
const CAUSE_ICONS = {
  jam:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  auto:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  road:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20M6 20l4-16h4l4 16"/><line x1="12" y1="8" x2="12" y2="8.01"/><line x1="12" y1="12" x2="12" y2="12.01"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>`,
  accident: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  parking:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>`,
};

// Cause key → name mapping (for display)
const CAUSE_MAP = {
  'যানজট':          { key:'jam',      name:'যানজট' },
  'অটোরিকশা':       { key:'auto',     name:'অটোরিকশা' },
  'রাস্তার কাজ':    { key:'road',     name:'রাস্তার কাজ' },
  'দুর্ঘটনা':       { key:'accident', name:'দুর্ঘটনা' },
  'অবৈধ পার্কিং':   { key:'parking',  name:'পার্কিং' },
  'অটোরিকশা ব্লক':  { key:'auto',     name:'অটোরিকশা' },
};

const CAUSES = [
  { key:'jam',      name:'যানজট',        desc:'ভারী ট্রাফিক' },
  { key:'auto',     name:'অটোরিকশা ব্লক', desc:'রাস্তা বন্ধ' },
  { key:'road',     name:'রাস্তার কাজ',  desc:'নির্মাণ চলছে' },
  { key:'accident', name:'দুর্ঘটনা',     desc:'গাড়ি দুর্ঘটনা' },
  { key:'parking',  name:'অবৈধ পার্কিং', desc:'রাস্তায় গাড়ি' },
];

const SEV_COLORS  = { high:'#EF4444', med:'#F59E0B', low:'#10B981' };
const SEV_BG      = { high:'rgba(239,68,68,.1)', med:'rgba(245,158,11,.1)', low:'rgba(16,185,129,.1)' };
const JAM_EXPIRY  = 2 * 60 * 60 * 1000;
const SUGGESTIONS = ['বয়রা মোড়','সোনাডাঙ্গা বাস স্ট্যান্ড','রূপসা ঘাট','KDA এভিনিউ','শিব বাড়ি মোড়','কাজীর দেউড়ি','খালিশপুর মোড়','ডাকবাংলো মোড়','আসাদগঞ্জ','হালিশহর','দৌলতপুর'];
const upvoteState = {};

// ===== USER ID: Google Auth or Random =====
const ADMIN_EMAILS = ['rayhan6355@gmail.com'];

let currentUser = null;
let MY_USER_ID = 'User1';

function getMyUserId() {
  if (currentUser && currentUser.displayName) {
    return currentUser.displayName;
  }
  let userId = localStorage.getItem('kp_user_id');
  if (!userId) {
    userId = 'User' + (Math.floor(Math.random() * 9000) + 1000);
    localStorage.setItem('kp_user_id', userId);
  }
  return userId;
}

// ===== SUPABASE INTEGRATION =====
let supabaseReady = false;
let nextId = 1;

function parseTimestamp(val) {
  if (val === null || val === undefined) return Date.now();
  return typeof val === 'string' ? parseInt(val, 10) : Number(val);
}

function getMinsAgo(createdAt) {
  const ts = parseTimestamp(createdAt);
  return Math.floor((Date.now() - ts) / 60000);
}

async function initSupabase() {
  if (supabaseReady) return;
  if (typeof supabaseClient === 'undefined') {
    console.warn('Supabase not loaded — using local data');
    return;
  }

  try {
    // Fetch active (non-deleted) reports for map markers
    const { data: hotspots, error: hErr } = await supabaseClient
      .from('reports')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false });
    
    if (hErr) {
      console.error('Supabase fetch hotspots error:', hErr.message);
    } else if (hotspots && hotspots.length > 0) {
      hotspotsData = hotspots.map(d => ({ ...d, minsAgo: getMinsAgo(d.created_at) }));
      try { if (map) addMarkers(); } catch (mapErr) { console.warn('Map markers error:', mapErr.message); }
      renderSheetContent();
      console.log('Loaded', hotspotsData.length, 'hotspots from Supabase');
    } else {
      console.log('No hotspots in Supabase yet (empty table)');
    }

    // Fetch ALL reports for admin panel
    const { data: allReports, error: aErr } = await supabaseClient
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (aErr) {
      console.error('Supabase fetch all reports error:', aErr.message);
    } else if (allReports) {
      reportsData = allReports.map(d => ({ ...d, minsAgo: getMinsAgo(d.created_at) }));
      if (adminLoggedIn) renderAdminDashboard();
    }

    // Get max ID for local nextId counter
    const { data: maxRow, error: mErr } = await supabaseClient
      .from('reports')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .single();
    if (mErr) {
      console.log('No rows yet (empty table), starting nextId from 1');
    } else if (maxRow) {
      nextId = maxRow.id + 1;
    }

    // Set up polling for real-time sync (every 15 seconds)
    setInterval(async () => {
      if (!supabaseReady) return;
      try {
        const { data: hs } = await supabaseClient
          .from('reports')
          .select('*')
          .eq('deleted', false)
          .order('created_at', { ascending: false });
        if (hs) {
          hotspotsData = hs.map(d => ({ ...d, minsAgo: getMinsAgo(d.created_at) }));
          try { if (map) addMarkers(); } catch(me) { console.warn('Polling markers error:', me.message); }
          renderSheetContent();
        }
        const { data: rs } = await supabaseClient
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false });
        if (rs) {
          reportsData = rs.map(d => ({ ...d, minsAgo: getMinsAgo(d.created_at) }));
          if (adminLoggedIn) renderAdminDashboard();
        }
      } catch (e) {
        // Silent fail for polling
      }
    }, 15000);

    supabaseReady = true;
    console.log('Supabase sync active! Polling every 15s.');
  } catch (err) {
    console.error('Supabase init error (non-fatal):', err);
  }

  // ALWAYS set ready — data fetch worked, even if map had issues
  supabaseReady = true;
}

setInterval(() => {
  hotspotsData.forEach(h => h.minsAgo = getMinsAgo(h.created_at));
  reportsData.forEach(r => r.minsAgo = getMinsAgo(r.created_at));
  if (['map','hotspot','latest'].includes(currentPage)) renderSheetContent();
}, 30000);

// ===== SUPABASE WRITE FUNCTIONS =====
async function saveReportToSupabase(data) {
  // Always add to local arrays first for instant UI feedback
  const item = { ...data, flagged: false, deleted: false };
  hotspotsData.unshift({ ...item, minsAgo: 0 });
  reportsData.unshift({ ...item, minsAgo: 0 });

  // Refresh the map markers and sheet content immediately
  try { if (map) addMarkers(); } catch(me) { console.warn('Save markers error:', me.message); }
  renderSheetContent();

  if (typeof supabaseClient === 'undefined') {
    console.warn('Supabase not available, data saved locally only');
    return;
  }

  try {
    const { id, ...rest } = data;
    // Add 8-second timeout to prevent hanging
    const result = await Promise.race([
      supabaseClient.from('reports').insert(rest),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase timeout (8s)')), 8000))
    ]);
    
    if (result.error) {
      console.error('Supabase insert error:', result.error.message, result.error.code);
      showToast('রিপোর্ট সেভ করতে সমস্যা: ' + (result.error.message || 'Unknown error'));
    } else {
      console.log('Report saved to Supabase successfully!');
    }
  } catch (err) {
    console.error('Save network error:', err.message);
    showToast('রিপোর্ট সেভ করতে সমস্যা (timeout)');
  }
}

async function upvoteInSupabase(id) {
  if (typeof supabaseClient === 'undefined') return;
  try {
    const { error } = await supabaseClient.rpc('increment_upvotes', { report_id: id });
    if (error) console.error('Upvote error:', error.message);
  } catch (err) {
    console.error('Upvote failed:', err);
  }
}

async function toggleFlagInSupabase(id, flagged) {
  if (typeof supabaseClient === 'undefined') return;
  try {
    const { error } = await supabaseClient.from('reports').update({ flagged }).eq('id', id);
    if (error) console.error('Flag error:', error.message);
  } catch (err) {
    console.error('Flag failed:', err);
  }
}

async function deleteReportInSupabase(id) {
  if (typeof supabaseClient === 'undefined') return;
  try {
    const { error } = await supabaseClient.from('reports').update({ deleted: true }).eq('id', id);
    if (error) console.error('Delete error:', error.message);
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

// ===== HELPERS =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function causeIcon(causeStr) {
  const entry = CAUSE_MAP[causeStr];
  const key = entry ? entry.key : 'jam';
  return CAUSE_ICONS[key] || CAUSE_ICONS['jam'];
}

function causeSvgForKey(key) {
  return CAUSE_ICONS[key] || CAUSE_ICONS['jam'];
}

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

function countdownText(createdAt) {
  const rem = JAM_EXPIRY - (Date.now() - createdAt);
  if (rem <= 0) return { text:'মেয়াদোত্তীর্ণ', cls:'expired', pct:0 };
  const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
  const cls = rem < JAM_EXPIRY * .25 ? 'urgent' : '';
  return { text:`${m}মি ${s}সে`, cls, pct: Math.max(0, (rem / JAM_EXPIRY) * 100) };
}

function sevColor(s) { return SEV_COLORS[s] || '#94A3B8'; }
function sevBg(s)    { return SEV_BG[s] || 'rgba(148,163,184,.1)'; }
function sevLabel(s) { return { high:'উচ্চ', med:'মধ্যম', low:'নিম্ন' }[s] || s; }

// ===== CLOCK =====
function updateClock() {
  const el = $('#clock');
  if (el) el.textContent = new Date().toLocaleTimeString('bn-BD', { hour:'2-digit', minute:'2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ===== PAGE ROUTING =====
let currentPage = 'map';

function goPage(page) {
  currentPage = page;
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.bnav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'map' || page === 'hotspot' || page === 'latest') {
    $(`#page-home`).classList.add('active');
    initMap();
    const sheet = $('#bottom-sheet');
    if (page === 'map') {
      sheet.style.height = '0px'; sheet.style.display = 'none';
    } else {
      sheet.style.display = 'flex';
      sheetTab = (page === 'hotspot') ? 'now' : 'reports';
      renderSheetContent();
      setTimeout(() => setSheetH(420), 50);
    }
  }
  if (page === 'report') { $(`#page-report`).classList.add('active'); initReport(); }
  if (page === 'admin')  { $(`#page-admin`).classList.add('active'); renderAdmin(); }
}

$$('#bottom-nav .bnav-item').forEach(b =>
  b.addEventListener('click', () => goPage(b.dataset.page))
);

// ===== DARK MODE =====
let darkMode = false;
$('#btn-theme').addEventListener('click', () => {
  darkMode = !darkMode;
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '');
  const svg = $('#theme-svg');
  if (svg) {
    svg.innerHTML = darkMode
      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  showToast(darkMode ? 'ডার্ক মোড চালু' : 'লাইট মোড চালু');
  if (map && map._tileLayers) {
    map.removeLayer(map._tileLayers[currentTileLayer]);
    if (darkMode) {
      map.addLayer(map._tileLayers.satellite);
      currentTileLayer = 'satellite';
    } else {
      map.addLayer(map._tileLayers.streets);
      currentTileLayer = 'streets';
    }
  }
});

// ===== LEAFLET MAP VARIABLES =====
let currentTileLayer = 'streets';

// ===== SVG PATHS =====
function getSvgPaths(key) {
  const p = {
    jam:      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    auto:     '<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    road:     '<path d="M2 20h20M6 20l4-16h4l4 16"/><line x1="12" y1="8" x2="12" y2="8.01"/>',
    accident: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    parking:  '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  };
  return p[key] || p.jam;
}

// ===== CUSTOM MARKER SVG GENERATOR =====
function createMarkerSVG(sev, causeKey) {
  const c = sevColor(sev);
  const svgPaths = getSvgPaths(causeKey);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="52" height="68" viewBox="0 0 52 68">
    <defs>
      <filter id="shadow-${sev}" x="-20%" y="-10%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${c}" flood-opacity="0.4"/>
      </filter>
      <linearGradient id="markerGrad-${sev}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${c};stop-opacity:1"/>
        <stop offset="100%" style="stop-color:${c};stop-opacity:0.85"/>
      </linearGradient>
    </defs>
    <path d="M26 2C13.85 2 4 11.63 4 23.5c0 9.38 14.67 28.5 22 38.5 7.33-10 22-29.12 22-38.5C48 11.63 38.15 2 26 2z"
      fill="url(#markerGrad-${sev})" filter="url(#shadow-${sev})" stroke="#fff" stroke-width="2"/>
    <circle cx="26" cy="22" r="14" fill="#fff" opacity="0.95"/>
    <g transform="translate(14,10)" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${svgPaths}
    </g>
    <circle cx="26" cy="22" r="18" fill="none" stroke="${c}" stroke-width="2" opacity="0.3">
      <animate attributeName="r" from="18" to="36" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.3" to="0" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>`;
}

// ===== CUSTOM INFO WINDOW HTML =====
function createInfoWindowHTML(h) {
  const c = sevColor(h.sev);
  const bg = sevBg(h.sev);
  const cd = countdownText(h.created_at);
  const caKey = (CAUSE_MAP[h.cause] || {}).key || 'jam';
  const svgPaths = getSvgPaths(caKey);

  return `
  <div class="gm-info-window" style="font-family:'Baloo Da 2',sans-serif">
    <div class="iw-sev-bar" style="background:${c}"></div>
    <div class="iw-header" style="background:linear-gradient(135deg, ${c}18, ${c}08)">
      <div class="iw-icon-wrap" style="background:${c}15;color:${c}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          ${svgPaths}
        </svg>
      </div>
      <div class="iw-title-area">
        <div class="iw-title">${h.place}</div>
        <div class="iw-subtitle">${h.cause} · ${h.minsAgo} মি আগে</div>
      </div>
      <button class="iw-close-btn" onclick="this.closest('.leaflet-popup')?.querySelector('.leaflet-popup-close-button')?.click(); return false;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="iw-body">
      <div class="iw-stats">
        <div class="iw-stat-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
          </svg>
          <span class="iw-stat-val" style="color:${c}">${h.upvotes}</span>
          <span class="iw-stat-lbl">নিশ্চিত</span>
        </div>
        <div class="iw-sev-badge" style="background:${bg};color:${c}">
          <span style="width:6px;height:6px;border-radius:50%;background:${c};display:inline-block"></span>
          ${sevLabel(h.sev)}
        </div>
      </div>
      <div class="iw-countdown ${cd.cls}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        ${cd.text} বাকি
      </div>
      <div class="iw-progress-bar">
        <div class="iw-progress-fill" style="background:${c};width:${cd.pct}%"></div>
      </div>
    </div>
    <div class="iw-footer">
      <button class="iw-action-btn iw-vote-btn" style="border-color:${c}30" onclick="doUpvote(${h.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
        </svg>
        নিশ্চিত করুন
      </button>
      <button class="iw-action-btn iw-nav-btn" style="border-color:var(--pri,#00B894)30" onclick="focusJam(${h.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pri,#00B894)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11"/>
        </svg>
        দেখুন
      </button>
    </div>
  </div>`;
}

// ===== NOMINATIM SEARCH (OpenStreetMap — free, no API key) =====
let nominatimController = null;

async function searchNominatim(query, limit = 5) {
  // Abort previous request if still pending
  if (nominatimController) { try { nominatimController.abort(); } catch(e) {} }
  nominatimController = new AbortController();

  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Khulna')}&format=json&addressdetails=1&limit=${limit + 5}&accept-language=bn,en&viewbox=89.20,22.75,89.65,23.05&bounded=0&countrycodes=bd`,
      { signal: nominatimController.signal, headers: { 'User-Agent': 'TrafficJamApp/1.0' } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    // Only keep results within Khulna city area
    const KHULNA_BOUNDS = { minLat: 22.75, maxLat: 23.05, minLng: 89.20, maxLng: 89.65 };
    return data
      .filter(d => {
        const lat = parseFloat(d.lat), lng = parseFloat(d.lon);
        return lat >= KHULNA_BOUNDS.minLat && lat <= KHULNA_BOUNDS.maxLat &&
               lng >= KHULNA_BOUNDS.minLng && lng <= KHULNA_BOUNDS.maxLng;
      })
      .slice(0, limit)
      .map(d => ({
        text: (d.display_name || '').split(',').slice(0, 2).join(',').trim(),
        sub: (d.display_name || '').split(',').slice(2, 4).join(',').trim(),
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        type: d.type || 'place',
        nominatim: true
      }));
  } catch (e) {
    if (e.name === 'AbortError') return [];
    console.warn('[Search] Nominatim error:', e.message);
    return [];
  }
}

// ===== PLACES SEARCH (Nominatim only — no Google Places) =====

// Known places with approximate coordinates for Khulna (MUST be before ALL_SEARCHABLE)
const KNOWN_PLACES = {
  'বয়রা মোড়': { lat: 22.8456, lng: 89.5403 },
  'সোনাডাঙ্গা বাস স্ট্যান্ড': { lat: 22.8400, lng: 89.5310 },
  'রূপসা ঘাট': { lat: 22.8200, lng: 89.5600 },
  'KDA এভিনিউ': { lat: 22.8450, lng: 89.5380 },
  'শিব বাড়ি মোড়': { lat: 22.8470, lng: 89.5370 },
  'কাজীর দেউড়ি': { lat: 22.8430, lng: 89.5350 },
  'খালিশপুর মোড়': { lat: 22.8500, lng: 89.5450 },
  'ডাকবাংলো মোড়': { lat: 22.8480, lng: 89.5320 },
  'আসাদগঞ্জ': { lat: 22.8300, lng: 89.5500 },
  'হালিশহর': { lat: 22.8550, lng: 89.5250 },
  'দৌলতপুর': { lat: 22.8600, lng: 89.5200 },
};

// ===== SEARCH AUTOCOMPLETE =====

// All searchable places (Bengali + English aliases for broader search coverage)
const ALL_SEARCHABLE = [
  ...Object.keys(KNOWN_PLACES),
  'Boyra More', 'Sonadanga Bus Stand', 'Rupsha Ghat', 'KDA Avenue',
  'Shib Bari More', 'Kazir Dewri', 'Khalishpur More', 'Dakbanglo More',
  'Asadganj', 'Halishahar', 'Daulatpur',
  'Khulna University', 'KU', 'BL College', 'Khulna Medical College',
  'Khulna Railway Station', 'Khulna Launch Terminal', 'Khulna City',
  'Jhenaidah Road', 'Jessore Road', 'Satkhira Road', 'Bagerhat Road',
  'Nawapara Industrial Area', 'Eastern Housing', 'Shantinagar',
  'Gollamari', 'Moylapota', 'Ghona Bazar', 'New Market', 'Aparupa Market',
  'City Bypass Road', 'BISMILLAH Shopping Complex', 'Khulna Divisional Stadium',
];

const searchInput    = $('#search-input');
const searchDropdown = $('#search-dropdown');
const searchClear    = $('#search-clear');
let searchDebounce   = null;

function renderSearchResults(results) {
  if (!results.length) { searchDropdown.classList.remove('show'); return; }

  searchDropdown.innerHTML = results.map(r => `
    <div class="sd-item">
      <div class="sd-dot" style="${r.live ? 'background:var(--sev-l)' : r.nominatim ? 'background:#6366f1' : r.place ? 'background:var(--pri)' : ''}"></div>
      <div style="flex:1;min-width:0">
        <div class="sd-name">${r.text}</div>
        ${r.sub ? `<div class="sd-sub">${r.sub}</div>` : ''}
      </div>
      ${r.live ? '<span class="sd-badge">LIVE</span>' : ''}
      ${r.nominatim ? '<span class="sd-badge" style="background:#eef2ff;color:#6366f1">SEARCH</span>' : ''}
    </div>`).join('');

  searchDropdown.classList.add('show');
  searchDropdown.querySelectorAll('.sd-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const r = results[i];
      searchInput.value = r.text;
      searchDropdown.classList.remove('show');
      searchClear.style.display = 'block';

      // Make sure map is initialized before navigating
      initMap();

      if (r.live) {
        const h = hotspotsData.find(x => x.place === r.text);
        if (h) { setTimeout(() => smoothZoomToLocation(h.lat, h.lng, 18), 300); }
        showToast('অবস্থান: ' + r.text);
      } else if (r.lat && r.lng) {
        setTimeout(() => smoothZoomToLocation(r.lat, r.lng, 17), 300);
        showToast('অবস্থান: ' + r.text);
      } else {
        showToast('অবস্থান: ' + r.text);
      }
    });
  });
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    const q = searchInput.value.trim().toLowerCase();
    searchClear.style.display = q ? 'block' : 'none';
    if (!q) { searchDropdown.classList.remove('show'); return; }

    // Local results (known places + suggestions + live hotspots)
    const localResults = [
      ...ALL_SEARCHABLE
        .filter(s => s.toLowerCase().includes(q))
        .map(s => {
          const p = KNOWN_PLACES[s];
          return { text: s, sub: '', live: false, lat: p?.lat, lng: p?.lng };
        }),
      ...SUGGESTIONS
        .filter(s => !ALL_SEARCHABLE.includes(s) && s.toLowerCase().includes(q))
        .map(s => ({
          text:s, sub:'', live:false,
          ...(KNOWN_PLACES[s] || {})
        })),
      ...hotspotsData
        .filter(h => h.place.toLowerCase().includes(q) || h.cause.toLowerCase().includes(q))
        .map(h => ({ text:h.place, sub:h.cause, live:true })),
    ];

    // Show local results immediately
    if (localResults.length > 0) {
      renderSearchResults(localResults.slice(0, 6));
    }

    // Search Nominatim for ANY place in the world
    const nomResults = await searchNominatim(searchInput.value.trim(), 5);

    // Merge: local first, then Nominatim (deduplicate by text)
    const merged = [];
    const seen = new Set();
    localResults.forEach(r => { if (!seen.has(r.text)) { merged.push(r); seen.add(r.text); } });
    nomResults.forEach(r => { if (!seen.has(r.text)) { merged.push(r); seen.add(r.text); } });

    if (merged.length > 0) {
      renderSearchResults(merged.slice(0, 8));
    } else {
      searchDropdown.classList.remove('show');
    }
  }, 300);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  searchDropdown.classList.remove('show');
  searchInput.focus();
});
document.addEventListener('click', e => {
  if (!e.target.closest('.search-box')) searchDropdown.classList.remove('show');
});

// ===== USER LOCATION SVG =====
function createUserLocationSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
    <defs>
      <filter id="userShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00B894" flood-opacity="0.45"/>
      </filter>
      <radialGradient id="userPulse" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#00B894;stop-opacity:0.35"/>
        <stop offset="100%" style="stop-color:#00B894;stop-opacity:0"/>
      </radialGradient>
      <linearGradient id="userGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#00D2A0;stop-opacity:1"/>
        <stop offset="100%" style="stop-color:#00B894;stop-opacity:1"/>
      </linearGradient>
    </defs>
    <circle cx="28" cy="28" r="24" fill="url(#userPulse)">
      <animate attributeName="r" from="18" to="27" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.7" to="0" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="28" cy="28" r="18" fill="none" stroke="#00B894" stroke-width="1.5" opacity="0.3">
      <animate attributeName="r" from="18" to="27" dur="2s" begin="1s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.3" to="0" dur="2s" begin="1s" repeatCount="indefinite"/>
    </circle>
    <circle cx="28" cy="28" r="16" fill="#fff" filter="url(#userShadow)"/>
    <circle cx="28" cy="28" r="13" fill="url(#userGrad)"/>
    <circle cx="25" cy="25" r="5" fill="#33D6B0" opacity="0.3"/>
    <circle cx="28" cy="22" r="5" fill="#fff"/>
    <path d="M18 38 C18 31 22 28 28 28 C34 28 38 31 38 38" fill="#fff"/>
  </svg>`;
}

function placeUserMarker(lat, lng, accuracy) {
  if (!map) return;
  if (userLocationMarker) map.removeLayer(userLocationMarker);
  if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

  // Accuracy circle
  userAccuracyCircle = L.circle([lat, lng], {
    radius: accuracy || 30,
    color: '#00B894',
    fillColor: '#00B894',
    fillOpacity: 0.07,
    weight: 1.5,
    opacity: 0.2,
  }).addTo(map);

  // Custom user marker
  const userIcon = L.divIcon({
    html: createUserLocationSVG(),
    className: 'user-div-icon',
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });

  userLocationMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(L.popup({ offset: 0 })
      .setContent(`<div style="font-family:'Baloo Da 2',sans-serif;padding:6px;text-align:center;min-width:140px">
        <div style="font-size:13px;font-weight:700;color:#00B894;margin-bottom:3px">আপনার অবস্থান</div>
        <div style="font-size:10px;color:#2d6b5f">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        ${accuracy ? `<div style="font-size:9px;color:#567870;margin-top:2px">নির্ভুলতা: ±${Math.round(accuracy)}মি</div>` : ''}
      </div>`));
}

// ===== GPS =====
$('#btn-gps').addEventListener('click', () => {
  if (!navigator.geolocation) { showToast('GPS সাপোর্ট নেই'); return; }
  showToast('অবস্থান খোঁজা হচ্ছে...');
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  navigator.geolocation.getCurrentPosition(
    p => { placeUserMarker(p.coords.latitude, p.coords.longitude, p.coords.accuracy); smoothZoomToLocation(p.coords.latitude, p.coords.longitude, 17); showToast('অবস্থান পাওয়া গেছে'); },
    () => showToast('GPS পাওয়া যায়নি'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
  watchId = navigator.geolocation.watchPosition(
    p => placeUserMarker(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
    () => {},
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
});

// ===== FILTER SHEET =====
let activeSevFilter = 'সব';
const filterChips = ['সব', 'High', 'Medium', 'Low'];

function renderFilterChips() {
  $('#filter-chips').innerHTML = filterChips.map(c => `
    <button class="fs-chip ${activeSevFilter === c ? 'active' : ''}">${c}</button>`
  ).join('');
  $$('#filter-chips .fs-chip').forEach(b => {
    b.addEventListener('click', () => {
      activeSevFilter = b.textContent;
      renderFilterChips();
      closeFilter();
      renderSheetContent();
      showToast('ফিল্টার: ' + activeSevFilter);
    });
  });
}
renderFilterChips();

function openFilter()  { $('#filter-sheet').classList.add('show');    $('#filter-backdrop').classList.add('show'); }
function closeFilter() { $('#filter-sheet').classList.remove('show'); $('#filter-backdrop').classList.remove('show'); }
$('#btn-filter').addEventListener('click', openFilter);
$('#filter-close').addEventListener('click', closeFilter);
$('#filter-backdrop').addEventListener('click', closeFilter);

// ===== LEAFLET MAP =====
let map = null;
let markers = [];
let userLocationMarker = null;
let userAccuracyCircle = null;
let watchId = null;

function initMap() {
  if (map) { map.invalidateSize(); return; }
  const el = $('#map');
  if (!el || !window.L) return;

  // ===== GOOGLE MAPS ACTUAL TILES (exact Google Maps look) =====
  const GM_KEY = 'AIzaSyAeMW2Ko4SqaY42gKNMAMYSFgnEuuFSeDQ';
  const tileLayers = {
    streets: L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=' + GM_KEY, {
      subdomains: '0123',
      attribution: '&copy; Google Maps',
      maxZoom: 22,
    }),
    satellite: L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=' + GM_KEY, {
      subdomains: '0123',
      attribution: '&copy; Google Maps',
      maxZoom: 22,
    }),
    terrain: L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=' + GM_KEY, {
      subdomains: '0123',
      attribution: '&copy; Google Maps',
      maxZoom: 22,
    }),
    hybrid: L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=' + GM_KEY, {
      subdomains: '0123',
      attribution: '&copy; Google Maps',
      maxZoom: 22,
    }),
  };

  currentTileLayer = 'streets';
  map = L.map(el, {
    center: [22.8456, 89.5403],
    zoom: 14,
    minZoom: 10,
    maxZoom: 21,
    zoomControl: false,
    attributionControl: false,
    layers: [tileLayers.streets],
  });

  // Store tile layers for switching
  map._tileLayers = tileLayers;

  // Zoom control on top-left
  L.control.zoom({ position: 'topleft' }).addTo(map);

  // Attribution on bottom-right
  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

  // Map type toggle (same as before, using the existing .gm-custom-map-type class)
  const mapTypeDiv = document.createElement('div');
  mapTypeDiv.className = 'gm-custom-map-type';
  mapTypeDiv.innerHTML = `<button class="gm-type-btn active" data-style="streets">ম্যাপ</button><button class="gm-type-btn" data-style="satellite">স্যাটেলাইট</button><button class="gm-type-btn" data-style="terrain">টেরেইন</button><button class="gm-type-btn" data-style="hybrid">হাইব্রিড</button>`;
  mapTypeDiv.style.marginTop = '44px';
  mapTypeDiv.querySelectorAll('.gm-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      map.removeLayer(map._tileLayers[currentTileLayer]);
      map.addLayer(map._tileLayers[style]);
      currentTileLayer = style;
      mapTypeDiv.querySelectorAll('.gm-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  el.appendChild(mapTypeDiv);

  // Map loaded
  el.classList.add('gm-loaded');
  addMarkers();
}

function addMarkers() {
  if (!map) return;
  // Remove existing markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  hotspotsData.forEach((h, idx) => {
    const caKey = (CAUSE_MAP[h.cause] || {}).key || 'jam';
    const c = sevColor(h.sev);
    const svgPaths = getSvgPaths(caKey);

    // Custom Leaflet divIcon marker
    const markerHtml = `
      <div class="custom-marker">
        <div class="marker-pin" style="--marker-color: ${c}">
          <div class="marker-pulse"></div>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${svgPaths}</svg>
        </div>
      </div>`;

    const icon = L.divIcon({
      html: markerHtml,
      className: 'custom-div-icon',
      iconSize: [36, 48],
      iconAnchor: [18, 48],
      popupAnchor: [0, -48],
    });

    const popup = L.popup({ offset: [0, -48], maxWidth: 280, closeButton: true })
      .setContent(createInfoWindowHTML(h));

    const marker = L.marker([h.lat, h.lng], { icon })
      .addTo(map)
      .bindPopup(popup);

    markers.push(marker);
  });
}

// ===== REFRESH BUTTON =====
$('#btn-refresh').addEventListener('click', async () => {
  const btn = $('#btn-refresh');
  const svg = $('#refresh-svg');
  if (!svg) return;

  // Spin animation
  btn.disabled = true;
  svg.style.transition = 'transform 0.6s ease';
  svg.style.transform = 'rotate(360deg)';
  showToast('ডেটা রিফ্রেশ হচ্ছে...');

  // Force re-fetch from Supabase
  supabaseReady = false; // Reset to allow re-init

  try {
    if (typeof supabaseClient === 'undefined') {
      showToast('সুপাবেস কনেক্ট নেই');
      btn.disabled = false;
      svg.style.transform = 'rotate(0deg)';
      return;
    }

    const { data: hotspots, error: hErr } = await supabaseClient
      .from('reports')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false });

    if (hErr) {
      showToast('রিফ্রেশ ব্যর্থ: ' + hErr.message);
    } else if (hotspots) {
      hotspotsData = hotspots.map(d => ({ ...d, minsAgo: getMinsAgo(d.created_at) }));
      try { if (map) addMarkers(); } catch(me) { console.warn('Refresh markers error:', me.message); }
      renderSheetContent();
      console.log('Refreshed', hotspotsData.length, 'hotspots');
    }

    const { data: allReports, error: aErr } = await supabaseClient
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (!aErr && allReports) {
      reportsData = allReports.map(d => ({ ...d, minsAgo: getMinsAgo(d.created_at) }));
      if (adminLoggedIn) renderAdminDashboard();
    }

    supabaseReady = true;
    showToast('ডেটা রিফ্রেশ সম্পন্ন! (' + hotspotsData.length + ' রিপোর্ট)');
  } catch (err) {
    console.error('Refresh error:', err);
    showToast('রিফ্রেশ ব্যর্থ');
    supabaseReady = true;
  }

  // Reset button
  setTimeout(() => {
    svg.style.transition = 'none';
    svg.style.transform = 'rotate(0deg)';
    btn.disabled = false;
  }, 300);
});

// ===== BOTTOM SHEET SWIPE =====
let sheetH = 180, dragging = false, dragY0 = 0, dragH0 = 0;
const sheetEl = $('#bottom-sheet');
function setSheetH(h) { h = Math.max(180, Math.min(520, h)); sheetH = h; sheetEl.style.height = h + 'px'; }
// Sheet hidden by default (map is the initial page)
sheetEl.style.display = 'none';
sheetEl.style.height = '0px';

$('#sheet-handle').addEventListener('touchstart', e => { dragging = true; dragY0 = e.touches[0].clientY; dragH0 = sheetH; sheetEl.style.transition = 'none'; }, { passive:true });
$('#sheet-handle').addEventListener('touchmove', e => { if (!dragging) return; setSheetH(dragH0 + (dragY0 - e.touches[0].clientY)); }, { passive:true });
$('#sheet-handle').addEventListener('touchend', () => { dragging = false; snapSheet(); });
$('#sheet-handle').addEventListener('mousedown', e => {
  e.preventDefault(); dragging = true; dragY0 = e.clientY; dragH0 = sheetH; sheetEl.style.transition = 'none';
  const onM = ev => setSheetH(dragH0 + (dragY0 - ev.clientY));
  const onU = () => { dragging = false; snapSheet(); window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU); };
  window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU);
});

function snapSheet() {
  let snap;
  if (sheetH < 265) snap = 180;
  else if (sheetH < 435) snap = 350;
  else snap = 520;
  sheetEl.style.transition = 'height .35s cubic-bezier(.4,0,.2,1)';
  setSheetH(snap);
  setTimeout(() => sheetEl.style.transition = '', 400);
}

// ===== SHEET CONTENT =====
let sheetTab = 'now';

function showSkeleton() {
  const c = $('#sheet-content');
  c.innerHTML = `
    <div class="sec-label">যানজট হটস্পট</div>
    <div class="hscroll-wrap"><div class="hscroll">
      ${[1,2,3].map(() => `<div class="jam-card skel-jam" style="pointer-events:none">
        <div class="skel-box" style="width:28px;height:28px;border-radius:50%;margin-bottom:8px"></div>
        <div class="skel-box" style="width:80%;height:10px;margin-bottom:6px"></div>
        <div class="skel-box" style="width:55%;height:9px;margin-bottom:4px"></div>
        <div class="skel-box" style="width:40%;height:8px"></div>
      </div>`).join('')}
    </div></div>
    <div class="sec-label">কাছাকাছি</div>
    <div class="nearby-list">
      ${[1,2].map(() => `<div class="nb-card skel-card">
        <div class="skel-box" style="width:42px;height:42px;border-radius:12px;flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <div class="skel-box" style="width:60%;height:10px"></div>
          <div class="skel-box" style="width:40%;height:8px"></div>
        </div>
      </div>`).join('')}
    </div>`;
}

// ===== UPVOTE + SHARE =====
function upvoteHTML(id, count) {
  const voted = upvoteState[id];
  const displayed = voted ? count + 1 : count;
  const svgCheck = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const svgThumb = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  return `<button class="upvote-btn ${voted ? 'voted' : ''}" onclick="doUpvote(${id})">${voted ? svgCheck : svgThumb} ${displayed}</button>`;
}

window.doUpvote = function(id) {
  if (upvoteState[id]) return;
  upvoteState[id] = true;
  const btn = document.querySelector(`.upvote-btn[onclick="doUpvote(${id})"]`);
  if (btn) btn.classList.add('pop');
  upvoteInSupabase(id);
  const h = hotspotsData.find(x => x.id === id);
  if (h) h.upvotes++;
  setTimeout(() => renderSheetContent(), 350);
  showToast('নিশ্চিত করা হয়েছে!');
};

function shareHTML(h) {
  const svgShare = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
  return `<button class="share-btn" onclick="doShare('${h.place.replace(/'/g,"\\'")}',${h.id})" title="শেয়ার">${svgShare}</button>`;
}

window.doShare = function(place, id) {
  const text = `Traffic Alert: ${place} — ${window.location.origin}?report=${id}`;
  if (navigator.share) navigator.share({ title:'Traffic Alert', text, url:window.location.href }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast('লিংক কপি হয়েছে!'));
};

function sevBadge(sev) {
  const cls = { high:'sev-high', med:'sev-med', low:'sev-low' }[sev] || 'sev-low';
  const lbl = { high:'উচ্চ', med:'মধ্যম', low:'নিম্ন' }[sev] || sev;
  const dot = `<span style="width:6px;height:6px;border-radius:50%;background:${sevColor(sev)};display:inline-block"></span>`;
  return `<span class="sev-pill ${cls}">${dot} ${lbl}</span>`;
}

// ===== SHEET CONTENT =====
function renderSheetContent() {
  const c = $('#sheet-content');
  if (!c || !c.parentElement || c.parentElement.style.display === 'none') return;
  if (sheetTab === 'now') renderNowTab(c);
  else renderReportsTab(c);
}

function getFiltered() {
  if (activeSevFilter === 'সব') return hotspotsData;
  const m = { High:'high', Medium:'med', Low:'low' };
  return hotspotsData.filter(h => h.sev === m[activeSevFilter]);
}

function getCauseKey(h) { return (CAUSE_MAP[h.cause] || {}).key || 'jam'; }

/* ---- NOW TAB ---- */
function renderNowTab(c) {
  const f = getFiltered();
  c.innerHTML = `
    <div class="sec-label">যানজট হটস্পট</div>
    <div class="hscroll-wrap"><div class="hscroll">
      ${f.map(h => {
        const cd = countdownText(h.created_at);
        const col = sevColor(h.sev);
        const caKey = getCauseKey(h);
        const voted = upvoteState[h.id];
        return `<div class="jam-card" onclick="focusJam(${h.id})" style="border-top: 3px solid ${col}">
          <div class="sev-dot" style="background:${col}"></div>
          <div class="j-icon" style="color:${col};width:28px;height:28px;background:${sevBg(h.sev)};border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:7px">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${getSvgPaths(caKey)}</svg>
          </div>
          <div class="j-name">${h.place}</div>
          <div class="j-meta">${voted ? h.upvotes+1 : h.upvotes} নিশ্চিত</div>
          <div class="j-countdown ${cd.cls}">${cd.text}</div>
        </div>`;
      }).join('')}
    </div></div>
    <div class="sec-label">কাছাকাছি</div>
    <div class="nearby-list">
      ${f.slice(0, 4).map(h => {
        const cd = countdownText(h.created_at);
        const col = sevColor(h.sev);
        const caKey = getCauseKey(h);
        return `<div class="nb-card">
          <div class="nb-icon" style="background:${sevBg(h.sev)};color:${col}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${getSvgPaths(caKey)}</svg>
          </div>
          <div class="nb-info">
            <div class="nb-name">${h.place}</div>
            <div class="nb-meta">${h.cause} · ${h.minsAgo} মি আগে</div>
            <div class="nb-countdown ${cd.cls}">${cd.text} বাকি</div>
          </div>
          <div class="nb-actions">
            ${upvoteHTML(h.id, h.upvotes)}${shareHTML(h)}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ===== SMOOTH ZOOM =====
function smoothZoomToLocation(lat, lng, zoom, callback) {
  if (!map) return;
  map.flyTo([lat, lng], zoom || 17, { duration: 1.2 });
  if (callback) setTimeout(callback, 1300);
}

function focusJam(id) {
  const h = hotspotsData.find(x => x.id === id);
  if (!h || !map) return;
  goPage('map');
  map.flyTo([h.lat, h.lng], 18, { duration: 1.2 });
  // Find marker and open popup
  const idx = hotspotsData.indexOf(h);
  if (idx >= 0 && markers[idx]) {
    setTimeout(() => markers[idx].openPopup(), 500);
  }
}
window.focusJam = focusJam;

/* ---- ROUTE TAB ---- */
function renderRouteTab(c) {
  c.innerHTML = `<div class="route-body">
    <div class="route-field"><div class="route-dot green"></div><input id="route-from" placeholder="শুরুর স্থান..." /></div>
    <div class="route-field"><div class="route-dot red"></div><input id="route-to" placeholder="গন্তব্য..." /></div>
    <button class="app-btn primary full" onclick="searchRoute()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      রুট খুঁজুন
    </button>
    <div id="route-result"></div>
  </div>`;
}

window.searchRoute = function() {
  const from = $('#route-from').value;
  const to = $('#route-to').value;
  if (!from || !to) { showToast('উভয় ঠিকানা দিন'); return; }
  $('#route-result').innerHTML = `<div class="route-result">
    <h4>সেরা রুট পাওয়া গেছে</h4>
    <div class="r-step">${from} → KDA এভিনিউ দিয়ে যান</div>
    <div class="r-step">বয়রা মোড় এড়িয়ে শিব বাড়ি দিয়ে যান</div>
    <div class="r-step">${to} তে পৌঁছান (~12 মিনিট)</div>
    <div class="route-warn">সোনাডাঙ্গায় এখন ভারী যানজট</div>
  </div>`;
};

/* ---- REPORTS TAB ---- */
function renderReportsTab(c) {
  const f = getFiltered();
  const sevW = { high:'85%', med:'52%', low:'22%' };
  c.innerHTML = `<div class="rpt-list">
    ${f.map(h => {
      const cd = countdownText(h.created_at);
      const col = sevColor(h.sev);
      const caKey = getCauseKey(h);
      return `<div class="rpt-card">
        <div class="rc-sev" style="background:${col}"></div>
        <div class="rc-icon" style="color:${col}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${getSvgPaths(caKey)}</svg>
        </div>
        <div class="rc-info">
          <div class="rc-name">${h.place}</div>
          <div class="rc-meta">${h.cause} · ${h.minsAgo} মি আগে</div>
          <div class="rc-countdown ${cd.cls}">${cd.text} বাকি</div>
          <div class="mini-bar"><div class="mini-fill" style="background:${col};width:${sevW[h.sev] || '22%'}"></div></div>
        </div>
        <div class="rc-actions">
          ${upvoteHTML(h.id, h.upvotes)}${shareHTML(h)}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// Initial skeleton — rendered when hotspot/latest tab is opened
// showSkeleton(); setTimeout(renderSheetContent, 900);

// ===== REPORT WIZARD =====
const WIZARD_STEPS = ['ধরন', 'অবস্থান', 'বিবরণ'];
let wizStep = 0, wizCause = 'jam', wizSev = 'med', wizName = '';
let miniMap = null, miniPin = null;
let locText = 'অবস্থান detect করা হচ্ছে...', locStatus = '';

function initReport() { wizStep = 0; renderWizard(); }

function renderWizard() {
  $('#wizard-steps').innerHTML = WIZARD_STEPS.map((s, i) => `
    <div class="wz-step ${i === wizStep ? 'active' : i < wizStep ? 'done' : ''}">
      <div class="wz-dot">${i < wizStep
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : i + 1}</div>
      <div class="wz-lbl">${s}</div>
      ${i < 2 ? `<div class="wz-line ${i < wizStep ? 'filled' : ''}"></div>` : ''}
    </div>`).join('');
  const wc = $('#wizard-content');
  if      (wizStep === 0) renderWizStep0(wc);
  else if (wizStep === 1) renderWizStep1(wc);
  else                    renderWizStep2(wc);
}

function renderWizStep0(wc) {
  wc.innerHTML = `<div class="wz-content">
    <div class="step-title">সমস্যার ধরন বেছে নিন</div>
    <div class="cause-grid">
      ${CAUSES.map(c => `
        <div class="cause-card ${wizCause === c.key ? 'sel' : ''}" onclick="setCause('${c.key}')">
          <div class="c-icon" style="color:${wizCause===c.key ? 'var(--pri)' : 'var(--tx3)'}">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${getSvgPaths(c.key)}</svg>
          </div>
          <div class="c-name">${c.name}</div>
          <div class="c-desc">${c.desc}</div>
          ${wizCause === c.key ? `<div class="c-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>` : ''}
        </div>`).join('')}
    </div>
    <div class="wz-footer">
      <button class="app-btn primary full" onclick="wizNext()">পরবর্তী ধাপ <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
    </div>
  </div>`;
}

window.setCause = function(k) { wizCause = k; renderWizard(); };
window.wizNext  = function()  { if (wizStep < 2) { wizStep++; renderWizard(); } };
window.wizPrev  = function()  { if (wizStep > 0) { wizStep--; renderWizard(); } };

function renderWizStep1(wc) {
  wc.innerHTML = `<div class="wz-content">
    <div class="step-title">অবস্থান নির্বাচন করুন</div>
    <div class="report-search-box">
      <div class="report-search-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="report-search-input" placeholder="Search location / জায়গা খুঁজুন..." autocomplete="off" />
        <button class="report-search-clear" id="report-search-clear" style="display:none">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="report-search-dropdown" id="report-search-dropdown"></div>
    </div>
    <div class="loc-card">
      <div id="mini-map" style="height:320px"></div>
      <div class="loc-bar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span class="lb-text" id="loc-text">${locText}</span>
        <span class="lb-badge" id="loc-badge">${locStatus}</span>
      </div>
    </div>
    <div class="wz-footer">
      <button class="app-btn ghost" onclick="wizPrev()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> আগের ধাপ</button>
      <button class="app-btn primary" onclick="wizNext()">পরবর্তী ধাপ <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
    </div>
  </div>`;
  setTimeout(() => { initMiniMap(); initReportSearch(); }, 150);
}

function renderWizStep2(wc) {
  const opts = [
    { key:'low',  col:'var(--sev-l)', label:'একটু slow',  desc:'হালকা যানজট' },
    { key:'med',  col:'var(--sev-m)', label:'অনেক slow',  desc:'মাঝারি ব্লক' },
    { key:'high', col:'var(--sev-h)', label:'পুরো বন্ধ',  desc:'চলাচল অসম্ভব' },
  ];
  wc.innerHTML = `<div class="wz-content">
    <div class="step-title">রাস্তা কতটা blocked?</div>
    <div class="sev-list">
      ${opts.map(s => `
        <div class="sev-opt ${wizSev === s.key ? 'a-' + s.key : ''}" onclick="setSev('${s.key}')">
          <div class="s-icon" style="width:28px;height:28px;border-radius:8px;background:${wizSev===s.key ? s.col+'22' : 'var(--srf3)'};display:flex;align-items:center;justify-content:center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${s.col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              ${s.key==='low'  ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>' : ''}
              ${s.key==='med'  ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' : ''}
              ${s.key==='high' ? '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>' : ''}
            </svg>
          </div>
          <div class="s-text"><div class="s-label">${s.label}</div><div class="s-desc">${s.desc}</div></div>
          ${wizSev === s.key ? `<div class="s-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>` : ''}
        </div>`).join('')}
    </div>
    <div class="step-title">আপনার নাম <span class="opt-tag">ঐচ্ছিক</span></div>
    <div id="user-sign-in-area" style="margin-bottom:10px"></div>
    <div class="input-field">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <input id="wiz-name" value="${currentUser ? (currentUser.displayName || '') : wizName}" placeholder="যেমন: রাহিম, Prapty..." />
    </div>
    <div class="wz-footer">
      <button class="app-btn ghost" onclick="wizPrev()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> আগের ধাপ</button>
      <button class="app-btn danger" onclick="submitReport()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> জমা দিন</button>
    </div>
  </div>`;
}

window.setSev = function(k) { wizSev = k; renderWizard(); };
window.submitReport = function() {
  try {
    wizName = $('#wiz-name')?.value || '';
    const causeInfo = CAUSES.find(c => c.key === wizCause);
    const reportData = {
      id: nextId++,
      place: locText || 'খুলনা',
      lat: miniPin ? miniPin.getPosition().lat() : 22.8456,
      lng: miniPin ? miniPin.getPosition().lng() : 89.5403,
      cause: causeInfo ? causeInfo.name : wizCause,
      sev: wizSev,
      reporter: wizName || MY_USER_ID,
      upvotes: 0,
      flagged: false,
      deleted: false,
      created_at: Date.now(),
    };
    // Save to Supabase in background (don't block UI)
    saveReportToSupabase(reportData);
    // Show success UI immediately
    fireConfetti();
    showSuccessOverlay();
  } catch (err) {
    console.error('Submit error:', err);
    showToast('রিপোর্ট জমা দিতে সমস্যা হয়েছে');
  }
};

// ===== REPORT LOCATION SEARCH =====
let reportSearchDebounce = null;

function initReportSearch() {
  const input    = $('#report-search-input');
  const dropdown = $('#report-search-dropdown');
  const clearBtn = $('#report-search-clear');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    clearTimeout(reportSearchDebounce);
    reportSearchDebounce = setTimeout(async () => {
      const q = input.value.trim().toLowerCase();
      clearBtn.style.display = q ? 'flex' : 'none';
      if (!q) { dropdown.classList.remove('show'); return; }

      // Local results
      const localResults = [
        ...ALL_SEARCHABLE
          .filter(s => s.toLowerCase().includes(q))
          .map(s => {
            const p = KNOWN_PLACES[s];
            return { text: s, sub: '', lat: p ? p.lat : null, lng: p ? p.lng : null };
          }),
        ...SUGGESTIONS
          .filter(s => !ALL_SEARCHABLE.includes(s) && s.toLowerCase().includes(q))
          .map(s => ({
            text: s, sub: '', lat: null, lng: null,
            ...(KNOWN_PLACES[s] || {})
          })),
      ];

      // Show local results immediately
      if (localResults.length > 0) {
        renderReportSearchResults(dropdown, localResults.slice(0, 6));
      }

      // Search Nominatim for any place
      const nomResults = await searchNominatim(input.value.trim(), 5);

      // Merge: local first, then Nominatim
      const merged = [];
      const seen = new Set();
      localResults.forEach(r => { if (!seen.has(r.text)) { merged.push(r); seen.add(r.text); } });
      nomResults.forEach(r => { if (!seen.has(r.text)) { merged.push(r); seen.add(r.text); } });

      if (merged.length > 0) {
        renderReportSearchResults(dropdown, merged.slice(0, 8));
      } else {
        dropdown.classList.remove('show');
      }
    }, 300);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    dropdown.classList.remove('show');
    input.focus();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.report-search-box')) dropdown.classList.remove('show');
  });
}

function renderReportSearchResults(dropdown, results) {
  if (!results.length) { dropdown.classList.remove('show'); return; }

  dropdown.innerHTML = results.map(r => `
    <div class="report-sd-item">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${r.nominatim ? '#6366f1' : 'var(--pri)'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <div style="flex:1;min-width:0">
        <div class="report-sd-name">${r.text}</div>
        ${r.sub ? `<div class="report-sd-sub">${r.sub}</div>` : ''}
      </div>
      ${r.nominatim ? '<span class="report-sd-badge">SEARCH</span>' : ''}
    </div>`).join('');

  dropdown.classList.add('show');
  dropdown.querySelectorAll('.report-sd-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const r = results[i];
      const input = $('#report-search-input');
      const clearBtn = $('#report-search-clear');
      if (input) input.value = r.text;
      if (clearBtn) clearBtn.style.display = 'flex';
      dropdown.classList.remove('show');

      // Navigate mini map to the location
      if (miniMap && r.lat && r.lng) {
        miniMap.setCenter({ lat: r.lat, lng: r.lng });
        miniMap.setZoom(17);
        if (miniPin) miniPin.setMap(null);
        miniPin = new google.maps.Marker({
          position: { lat: r.lat, lng: r.lng }, map: miniMap,
          icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 2C8.37 2 3 7.27 3 13.75c0 5.62 8.8 17.1 13.2 23.1 4.4-6 13.2-17.48 13.2-23.1C29.4 7.27 24.03 2 17.4 2H15z" fill="#00B894" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="6" fill="#fff"/></svg>`),
            scaledSize: new google.maps.Size(30, 40), anchor: new google.maps.Point(15, 40) },
          animation: google.maps.Animation.DROP,
        });
        locText = r.text;
        locStatus = 'পাওয়া গেছে';
        if ($('#loc-text'))  $('#loc-text').textContent  = locText;
        if ($('#loc-badge')) $('#loc-badge').textContent = locStatus;
        showToast('অবস্থান: ' + r.text);
      } else {
        showToast('এই জায়গার কোনো লোকেশন পাওয়া যায়নি');
      }
    });
  });
}

// ===== REVERSE GEOCODING =====
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=bn&zoom=18`, { headers:{ 'User-Agent':'TrafficJamApp/1.0' } });
    const d = await r.json();
    return d?.display_name?.split(',').slice(0, 3).join(',').trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

function initMiniMap() {
  const el = $('#mini-map');
  if (!el || !window.google || !google.maps || miniMap) return;
  miniMap = new google.maps.Map(el, {
    center: { lat: 22.8456, lng: 89.5403 }, zoom: 14, styles: tealMapStyle,
    disableDefaultUI: true, zoomControl: false, gestureHandling: 'greedy',
    backgroundColor: '#E8F8F5', clickableIcons: false,
  });
  miniMap.addListener('click', async (e) => {
    const { lat, lng } = e.latLng.toJSON();
    if (miniPin) miniPin.setMap(null);
    miniPin = new google.maps.Marker({
      position: { lat, lng }, map: miniMap,
      icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 2C8.37 2 3 7.27 3 13.75c0 5.62 8.8 17.1 13.2 23.1 4.4-6 13.2-17.48 13.2-23.1C29.4 7.27 24.03 2 17.4 2H15z" fill="#00B894" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="6" fill="#fff"/></svg>`),
        scaledSize: new google.maps.Size(30, 40), anchor: new google.maps.Point(15, 40) },
      animation: google.maps.Animation.DROP,
    });
    locText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    locStatus = 'ঠিকানা খোঁজা হচ্ছে...';
    if ($('#loc-text'))  $('#loc-text').textContent  = locText;
    if ($('#loc-badge')) $('#loc-badge').textContent = locStatus;
    const addr = await reverseGeocode(lat, lng);
    locText = addr || locText;
    locStatus = 'পাওয়া গেছে';
    if ($('#loc-text'))  $('#loc-text').textContent  = locText;
    if ($('#loc-badge')) $('#loc-badge').textContent = locStatus;
  });
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async p => {
      const { latitude:lat, longitude:lng } = p.coords;
      miniMap.setCenter({ lat, lng }); miniMap.setZoom(15);
      if (miniPin) miniPin.setMap(null);
      miniPin = new google.maps.Marker({ position: { lat, lng }, map: miniMap, animation: google.maps.Animation.DROP });
      locText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      locStatus = 'GPS';
      const addr = await reverseGeocode(lat, lng);
      locText = addr || locText;
      locStatus = 'GPS detected';
    }, () => { locText = 'Map এ ট্যাপ করে অবস্থান বেছে নিন'; locStatus = ''; });
  }
}

// ===== CONFETTI =====
function fireConfetti() {
  const canvas = $('#confetti-canvas'), ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const particles = [];
  const colors = ['#00B894','#FDCB6E','#EF4444','#3B82F6','#8B5CF6','#F59E0B','#10B981','#06B6D4'];
  for (let i = 0; i < 160; i++) {
    const angle = Math.random() * Math.PI * 2, vel = Math.random() * 14 + 4;
    particles.push({ x: canvas.width/2, y: canvas.height/2, vx: Math.cos(angle)*vel, vy: Math.sin(angle)*vel-6,
      size: Math.random()*7+3, color: colors[Math.floor(Math.random()*colors.length)],
      life:1, decay: Math.random()*.012+.005, rot: Math.random()*360, rotV: (Math.random()-.5)*12,
      shape: Math.random()>.5?'rect':'circle' });
  }
  function animate() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.life<=0) return; alive = true;
      p.x+=p.vx; p.y+=p.vy; p.vy+=.28; p.vx*=.99; p.life-=p.decay; p.rot+=p.rotV;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180); ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color;
      if(p.shape==='circle'){ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}
      else ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.6);
      ctx.restore();
    });
    if(alive)requestAnimationFrame(animate);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  animate();
}

// ===== SUCCESS OVERLAY =====
function showSuccessOverlay() {
  const cause = CAUSES.find(c => c.key === wizCause);
  const sevLbl = { high:'পুরো বন্ধ', med:'অনেক slow', low:'একটু slow' };
  let overlay = document.querySelector('.success-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.className = 'success-overlay'; document.getElementById('app').appendChild(overlay); }
  overlay.innerHTML = `<div class="success-card">
    <div class="sc-icon"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
    <div class="sc-title">রিপোর্ট জমা হয়েছে!</div>
    <div class="sc-msg">ধন্যবাদ! আপনার রিপোর্ট live map এ যোগ হয়েছে।</div>
    <div class="sc-summary">
      <div class="sc-sitem">${cause?.name}</div>
      <div class="sc-sitem">${sevLbl[wizSev]}</div>
    </div>
    <button class="app-btn primary full" onclick="closeSuccess()">ম্যাপে ফিরে যান</button>
  </div>`;
  setTimeout(() => overlay.classList.add('show'), 50);
}

window.closeSuccess = function() {
  const overlay = document.querySelector('.success-overlay');
  if (overlay) overlay.classList.remove('show');
  goPage('home');
};

// ===== ADMIN (Google Auth via Supabase) =====
let adminLoggedIn = false;

// Check for existing session on load (from OAuth callback)
(function checkExistingSession() {
  try {
    const raw = localStorage.getItem('kp_supabase_session');
    if (raw) {
      const session = JSON.parse(raw);
      const user = session?.user || session;
      if (user && user.email) {
        currentUser = { displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email, email: user.email, photoURL: user.user_metadata?.avatar_url };
        MY_USER_ID = getMyUserId();
        updateUserSignInUI(currentUser);
        if (ADMIN_EMAILS.includes(user.email)) {
          adminLoggedIn = true;
          // Will show dashboard when renderAdmin is called
        }
      }
    }
  } catch (e) {
    console.error('Session check error:', e);
  }
})();

function renderAdmin() {
  // Check if already logged in from session
  if (adminLoggedIn && currentUser && ADMIN_EMAILS.includes(currentUser.email)) {
    $('#admin-login').style.display = 'none';
    $('#admin-dashboard').style.display = 'flex';
    const avatar = $('#admin-avatar');
    const nameEl = $('#admin-name');
    if (avatar && currentUser.photoURL) { avatar.src = currentUser.photoURL; avatar.style.display = 'block'; }
    if (nameEl) { nameEl.textContent = currentUser.displayName; nameEl.style.display = 'block'; }
    renderAdminDashboard();
    return;
  }
  // Try to get session from storage
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    const user = session?.user;
    if (user && ADMIN_EMAILS.includes(user.email)) {
      adminLoggedIn = true;
      $('#admin-login').style.display = 'none';
      $('#admin-dashboard').style.display = 'flex';
      currentUser = { displayName: user.user_metadata?.full_name || user.email, email: user.email, photoURL: user.user_metadata?.avatar_url };
      const avatar = $('#admin-avatar');
      const nameEl = $('#admin-name');
      if (avatar && currentUser.photoURL) { avatar.src = currentUser.photoURL; avatar.style.display = 'block'; }
      if (nameEl) { nameEl.textContent = currentUser.displayName; nameEl.style.display = 'block'; }
      renderAdminDashboard();
    }
  });
}

$('#btn-google-login').addEventListener('click', async () => {
  const loginBtn = $('#btn-google-login');
  const errorEl = $('#login-error');
  loginBtn.innerHTML = 'Logging in...';
  loginBtn.disabled = true;
  errorEl.classList.remove('show');
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
  } catch (err) {
    console.error('Google login failed:', err);
    errorEl.textContent = 'লগইন ব্যর্থ: ' + (err.message || 'Unknown error');
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 4000);
  } finally {
    loginBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Sign in with Google';
    loginBtn.disabled = false;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  try { await supabaseClient.auth.signOut(); } catch(e) {}
  adminLoggedIn = false; currentUser = null;
  $('#admin-login').style.display = 'flex';
  $('#admin-dashboard').style.display = 'none';
  const avatar = $('#admin-avatar');
  const nameEl = $('#admin-name');
  if (avatar) avatar.style.display = 'none';
  if (nameEl) nameEl.style.display = 'none';
  showToast('লগআউট সফল');
});

// ===== USER GOOGLE SIGN-IN (optional, for report page) =====
window.signInUserGoogle = async function() {
  try {
    await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
  } catch (err) { showToast('সাইন ইন ব্যর্থ'); }
};

window.signOutUserGoogle = async function() {
  try { await supabaseClient.auth.signOut(); } catch(e) {}
  MY_USER_ID = getMyUserId();
  showToast('সাইন আউট সফল');
};

function updateUserSignInUI(user) {
  const el = $('#user-sign-in-area');
  if (!el) return;
  if (user) {
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;width:100%">
      ${user.photoURL ? `<img src="${user.photoURL}" style="width:24px;height:24px;border-radius:50%;border:2px solid var(--pri)" />` : ''}
      <span style="font-size:12px;font-weight:700;color:var(--pri);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${user.displayName || user.email}</span>
      <button onclick="signOutUserGoogle()" style="font-size:10px;padding:4px 10px;border-radius:var(--r-full);background:var(--srf3);color:var(--tx3);border:1px solid var(--brd);cursor:pointer">Sign Out</button>
    </div>`;
  } else {
    el.innerHTML = `<button onclick="signInUserGoogle()" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 14px;border-radius:var(--r-md);background:var(--srf3);border:1px solid var(--brd);cursor:pointer;font-size:12px;font-weight:700;color:var(--tx3)">
      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      Google দিয়ে সাইন ইন করুন (ঐচ্ছিক)
    </button>`;
  }
}

let adminTab = 'all';

function renderAdminDashboard() {
  const body = $('#admin-body');
  const activeCount = reportsData.filter(r => !r.deleted && !r.flagged).length;
  const flaggedCount = reportsData.filter(r => !r.deleted && r.flagged).length;
  const highCount = reportsData.filter(r => !r.deleted && r.sev === 'high').length;
  const uniqueReporters = new Set(reportsData.filter(r => !r.deleted).map(r => r.reporter));
  const totalUsers = uniqueReporters.size;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayTs = todayStart.getTime();
  const activeToday = reportsData.filter(r => !r.deleted && parseTimestamp(r.created_at) >= todayTs).length;
  const totalReports = reportsData.filter(r => !r.deleted).length;
  const totalUpvotes = reportsData.filter(r => !r.deleted).reduce((sum, r) => sum + (r.upvotes || 0), 0);

  body.innerHTML = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-val" style="color:var(--pri)">${totalUsers}</div><div class="stat-lbl">মোট ইউজার</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--sev-l)">${totalReports}</div><div class="stat-lbl">মোট রিপোর্ট</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--sev-m)">${activeToday}</div><div class="stat-lbl">আজকের রিপোর্ট</div></div>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-val" style="color:var(--sev-h)">${highCount}</div><div class="stat-lbl">উচ্চ তীব্রতা</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--sev-m)">${flaggedCount}</div><div class="stat-lbl">ফ্ল্যাগড</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--info)">${totalUpvotes}</div><div class="stat-lbl">মোট আপভোট</div></div>
    </div>

    <div class="chart-section">
      <div style="padding:12px 14px 4px">
        <div style="font-size:12px;font-weight:800;color:var(--tx);display:flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          সক্রিয় ইউজার (${totalUsers})
        </div>
      </div>
      <div style="padding:4px 14px 14px;display:flex;flex-wrap:wrap;gap:6px">
        ${[...uniqueReporters].map(u => {
          const userReports = reportsData.filter(r => !r.deleted && r.reporter === u).length;
          const isMe = u === MY_USER_ID;
          return `<span style="font-size:10px;font-weight:700;padding:5px 12px;border-radius:var(--r-full);background:${isMe ? 'var(--pri-lt)' : 'var(--srf3)'};color:${isMe ? 'var(--pri)' : 'var(--tx3)'};border:1.5px solid ${isMe ? 'rgba(var(--pri-rgb),.3)' : 'var(--brd)'}">
            ${u} <span style="opacity:.6">(${userReports})</span>
          </span>`;
        }).join('')}
      </div>
    </div>

    <div class="chart-section">
      <div class="chart-tabs">
        <button class="chart-tab active" data-chart="bar">বার</button>
        <button class="chart-tab" data-chart="line">লাইন</button>
        <button class="chart-tab" data-chart="doughnut">ডোনাট</button>
      </div>
      <canvas id="admin-chart"></canvas>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between">
      <div class="filter-pills">
        <button class="filter-pill ${adminTab==='all'?'active':''}" onclick="setAdminTab('all')">সব</button>
        <button class="filter-pill ${adminTab==='flagged'?'active':''}" onclick="setAdminTab('flagged')">ফ্ল্যাগড</button>
      </div>
      <span class="filter-count">${reportsData.filter(r=>!r.deleted).length} রিপোর্ট</span>
    </div>

    <div class="admin-list">
      ${reportsData.filter(r => !r.deleted && (adminTab==='all' || (adminTab==='flagged' && r.flagged))).map(r => {
        const col = sevColor(r.sev);
        const caKey = (CAUSE_MAP[r.cause] || {}).key || 'jam';
        return `<div class="arc-card ${r.flagged ? 'flagged' : ''}">
          <div class="arc-icon" style="color:${col}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${getSvgPaths(caKey)}</svg>
          </div>
          <div class="arc-info">
            <div class="arc-place">${r.place}</div>
            <div class="arc-reporter">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${r.reporter}
            </div>
            <div class="arc-meta"><span>${r.cause}</span><span>${r.minsAgo}মি আগে</span></div>
          </div>
          <div class="arc-right">
            <span class="st-pill ${r.flagged?'flg':'act'}">${r.flagged?'ফ্ল্যাগড':'সক্রিয়'}</span>
            <button class="arc-act ${r.flagged?'unflag':'flag'}" onclick="toggleFlag(${r.id})" title="${r.flagged?'আনফ্ল্যাগ':'ফ্ল্যাগ'}">
              ${r.flagged
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'}
            </button>
            <button class="arc-act flag" onclick="deleteReport(${r.id})" title="ডিলিট" style="color:#EF4444;border-color:#EF444430">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  initAdminChart('bar');
}

window.setAdminTab = function(tab) { adminTab = tab; renderAdminDashboard(); };

window.toggleFlag = function(id) {
  const r = reportsData.find(x => x.id === id);
  if (r) { r.flagged = !r.flagged; toggleFlagInSupabase(id, r.flagged); renderAdminDashboard(); showToast(r.flagged ? 'রিপোর্ট ফ্ল্যাগ করা হয়েছে' : 'ফ্ল্যাগ সরানো হয়েছে'); }
};

window.deleteReport = function(id) {
  if (!confirm('এই রিপোর্টটি ডিলিট করতে চান?')) return;
  const r = reportsData.find(x => x.id === id);
  if (r) { r.deleted = true; deleteReportInSupabase(id); renderAdminDashboard(); showToast('রিপোর্ট ডিলিট হয়েছে'); }
};

function initAdminChart(type) {
  const ctx = document.getElementById('admin-chart');
  if (!ctx) { console.warn('[Admin] Chart canvas not found'); return; }
  if (window._adminChart) { try { window._adminChart.destroy(); } catch(e) {} }
  const labels = ['যানজট','অটোরিকশা','রাস্তার কাজ','দুর্ঘটনা','পার্কিং'];
  const data = labels.map(l => reportsData.filter(r => !r.deleted && r.cause === l).length);
  const colors = ['#EF4444','#F59E0B','#3B82F6','#8B5CF6','#10B981'];
  const configs = {
    bar: { type:'bar', data:{ labels, datasets:[{ label:'রিপোর্ট', data, backgroundColor: colors.map(c => c+'33'), borderColor: colors, borderWidth:2, borderRadius:8 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true, ticks:{stepSize:1}} } } },
    line: { type:'line', data:{ labels, datasets:[{ label:'রিপোর্ট', data, borderColor:'#00B894', backgroundColor:'rgba(0,184,148,0.1)', fill:true, tension:.4, pointRadius:6, pointBackgroundColor:'#00B894' }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true, ticks:{stepSize:1}} } } },
    doughnut: { type:'doughnut', data:{ labels, datasets:[{ data, backgroundColor: colors.map(c => c+'88'), borderColor:'#fff', borderWidth:3 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ padding:12, font:{ family:"'Baloo Da 2'", size:11 } } } } } },
  };
  try {
    window._adminChart = new Chart(ctx, configs[type] || configs.bar);
  } catch(e) {
    console.warn('[Admin] Chart render error:', e.message);
  }
  document.querySelectorAll('.chart-tab').forEach(t => {
    t.onclick = () => { document.querySelectorAll('.chart-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); initAdminChart(t.dataset.chart); };
  });
}

// ===== INIT =====
// Start Supabase IMMEDIATELY — don't wait for map
initSupabase();

// Start Leaflet map loading
if (window.L) {
  initMap();
} else {
  function waitForLeaflet() {
    if (window.L) {
      initMap();
    } else {
      setTimeout(waitForLeaflet, 100);
    }
  }
  waitForLeaflet();
}
