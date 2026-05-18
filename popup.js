// ── State ──────────────────────────────────────────────────────────────
let allDomains = [];   // processed domain objects
let rawItems = [];     // raw history items from Chrome API
let currentSort = 'visits';
let currentRange = 1;  // days
let searchQuery = '';

// ── Init ───────────────────────────────────────────────────────────────
// REPLACE the existing DOMContentLoaded block:
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bindControls();
  loadPins();       // loads pins then calls renderList internally
  loadHistory();
});

function bindControls() {
  // Search
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    clearBtn.classList.toggle('visible', searchQuery.length > 0);
    renderList();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.classList.remove('visible');
    renderList();
  });

  // Range filter
  document.getElementById('rangeFilter').addEventListener('click', e => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    document.querySelectorAll('#rangeFilter .seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = parseInt(btn.dataset.range);
    loadHistory();
  });

  // Sort filter
  document.getElementById('sortFilter').addEventListener('click', e => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    document.querySelectorAll('#sortFilter .seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    renderList();
  });

  // Drawer close
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

// ── History Loading ────────────────────────────────────────────────────
// function loadHistory() {
//   showLoading(true);

//   // range=90 means "all" (we use 365 days as proxy)
//   const daysBack = currentRange === 90 ? 365 : currentRange;
//   const startTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

//   chrome.history.search(
//     { text: '', startTime, maxResults: 10000 },
//     items => {
//       rawItems = items || [];
//       allDomains = processHistory(rawItems);
//       showLoading(false);
//       renderList();
//     }
//   );
// }
function loadHistory() {
  showLoading(true);

  let startTime;

  if (currentRange === 1) {
    // True calendar today — midnight of current day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startTime = today.getTime();
  } else if (currentRange === 90) {
    // "All" — 365 days back
    startTime = Date.now() - 365 * 24 * 60 * 60 * 1000;
  } else {
    startTime = Date.now() - currentRange * 24 * 60 * 60 * 1000;
  }

  chrome.history.search(
    { text: '', startTime, maxResults: 10000 },
    items => {
      rawItems = items || [];
      allDomains = processHistory(rawItems);
      showLoading(false);
      renderList();
    }
  );
}

// ── History Processing ─────────────────────────────────────────────────
// function processHistory(items) {
//   const domainMap = new Map();

//   for (const item of items) {
//     if (!item.url) continue;

//     let domain;
//     try {
//       domain = new URL(item.url).hostname.replace(/^www\./, '');
//     } catch {
//       continue;
//     }

//     if (!domain) continue;

//     if (!domainMap.has(domain)) {
//       domainMap.set(domain, {
//         domain,
//         visits: 0,
//         lastVisit: 0,
//         items: []
//       });
//     }

//     const entry = domainMap.get(domain);
//     entry.visits += (item.visitCount || 1);
//     if (item.lastVisitTime > entry.lastVisit) {
//       entry.lastVisit = item.lastVisitTime;
//     }
//     entry.items.push(item);
//   }

//   return Array.from(domainMap.values());
// }
// history proccessing by current date
function processHistory(items) {
  const domainMap = new Map();

  for (const item of items) {
    if (!item.url) continue;

    let domain;
    try {
      domain = new URL(item.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }

    if (!domain) continue;

    if (!domainMap.has(domain)) {
      domainMap.set(domain, {
        domain,
        visits: 0,
        lastVisit: 0,
        items: []
      });
    }

    const entry = domainMap.get(domain);
    entry.visits += 1;           // COUNT THE URL ITSELF, not visitCount
    if (item.lastVisitTime > entry.lastVisit) {
      entry.lastVisit = item.lastVisitTime;
    }
    entry.items.push(item);
  }

  return Array.from(domainMap.values());
}

// ── Rendering ─────────────────────────────────────────────────────────
function renderList() {
  const listEl = document.getElementById('domainList');
  const emptyEl = document.getElementById('empty');

  let filtered = allDomains.filter(d =>
    !searchQuery || d.domain.includes(searchQuery)
  );

  // Sort
  if (currentSort === 'visits') {
    filtered.sort((a, b) => b.visits - a.visits);
  } else {
    filtered.sort((a, b) => b.lastVisit - a.lastVisit);
  }

  // Update stats pill
  const total = filtered.reduce((sum, d) => sum + d.visits, 0);
  document.getElementById('totalStats').textContent =
    `${filtered.length} sites · ${total.toLocaleString()} visits`;

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'flex';
    return;
  }

  emptyEl.style.display = 'none';

  const maxVisits = filtered[0]?.visits || 1;

  // listEl.innerHTML = filtered.map((d, i) =>
  //   buildCard(d, i, maxVisits)
  // ).join('');
  // WITH this (pins float to top):
  const pinned = filtered.filter(d => pinnedDomains.has(d.domain));
  const unpinned = filtered.filter(d => !pinnedDomains.has(d.domain));
  const sorted2 = [...pinned, ...unpinned];

  listEl.innerHTML = sorted2.map((d, i) =>
    buildCard(d, i, maxVisits)
  ).join('');

  // Attach click handlers for detail drawer
  // REPLACE the existing click handler block with this:
  listEl.querySelectorAll('.domain-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't open drawer if pin button clicked
      if (e.target.closest('.pin-btn')) return;
      const domain = card.dataset.domain;
      const domainObj = allDomains.find(d => d.domain === domain);
      if (domainObj) openDrawer(domainObj);
    });
  });

  listEl.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(btn.dataset.domain);
    });
  });
}

function buildCard(d, index, maxVisits) {
  const pct = Math.round((d.visits / maxVisits) * 100);
  const lastVisitStr = formatRelative(d.lastVisit);
  const initial = d.domain.charAt(0).toUpperCase();
  const isPinned = pinnedDomains.has(d.domain);

  const rankHtml = isPinned
    ? `<div class="rank pin-badge" title="Pinned">📌</div>`
    : index < 3
      ? `<div class="rank rank-${index + 1}">${index + 1}</div>`
      : '';

  return `
    <div class="domain-card" data-domain="${escapeHtml(d.domain)}">
      <div class="card-main">
        ${rankHtml}
        <div class="favicon">
          <img
            src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(d.domain)}&sz=32"
            onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"
            loading="lazy"
          />
          <div class="favicon-fallback" style="display:none">${initial}</div>
        </div>
        <div class="domain-info">
          <div class="domain-name">${escapeHtml(d.domain)}</div>
          <div class="domain-meta">Last: ${lastVisitStr}</div>
        </div>
        <div class="card-right">
          <div class="card-top-right">
            <div class="visit-badge">${d.visits.toLocaleString()}</div>
            <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-domain="${escapeHtml(d.domain)}" title="${isPinned ? 'Unpin' : 'Pin to top'}">
              ${isPinned ? '📌' : '☆'}
            </button>
          </div>
          <div class="bar-wrap">
            <div class="bar-fill" style="width:${pct}%"></div>
          </div>
          ${buildSparkline(d.items)}
        </div>
      </div>
    </div>
  `;
}

// ── Drawer ─────────────────────────────────────────────────────────────
// REPLACE the existing openDrawer function with this:
function openDrawer(domainObj) {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const title = document.getElementById('drawerTitle');
  const visitsEl = document.getElementById('drawerVisits');

  title.textContent = `${domainObj.domain} — ${domainObj.visits} visits`;

  const sorted = [...domainObj.items].sort((a, b) => b.lastVisitTime - a.lastVisitTime);

  visitsEl.innerHTML = sorted.map(item => {
    const time = formatDateTime(item.lastVisitTime);
    const url = item.url || '';
    const pageTitle = item.title || url;
    return `
      <div class="visit-row" data-url="${escapeHtml(url)}" title="Open in new tab">
        <div class="visit-time">${time}</div>
        <div class="visit-content">
          <div class="visit-title">${escapeHtml(truncate(pageTitle, 60))}</div>
          <div class="visit-url">${escapeHtml(truncate(url, 80))}</div>
        </div>
        <div class="visit-open">↗</div>
      </div>
    `;
  }).join('');

  // Make each row clickable
  visitsEl.querySelectorAll('.visit-row').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url) chrome.tabs.create({ url, active: true });
    });
  });

  overlay.classList.add('open');
  drawer.classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

// ── Helpers ────────────────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
  document.getElementById('domainList').style.display = show ? 'none' : 'flex';
}

function formatRelative(ts) {
  if (!ts) return 'Unknown';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Pin logic ──────────────────────────────────────────────────────────
let pinnedDomains = new Set();

function loadPins() {
  chrome.storage.local.get(['pins'], res => {
    pinnedDomains = new Set(res.pins || []);
    renderList();
  });
}

function togglePin(domain) {
  if (pinnedDomains.has(domain)) {
    pinnedDomains.delete(domain);
  } else {
    pinnedDomains.add(domain);
  }
  chrome.storage.local.set({ pins: [...pinnedDomains] });
  renderList();
}

// ── Sparkline ──────────────────────────────────────────────────────────
function buildSparkline(items) {
  // Count visits per day for last 7 days
  const days = Array(7).fill(0);
  const now = Date.now();
  for (const item of items) {
    const daysAgo = Math.floor((now - item.lastVisitTime) / 86400000);
    if (daysAgo >= 0 && daysAgo < 7) {
      days[6 - daysAgo] += 1;
    }
  }
  const max = Math.max(...days, 1);
  const pts = days.map((v, i) => {
    const x = (i / 6) * 60;
    const y = 14 - (v / max) * 12;
    return `${x},${y}`;
  }).join(' ');

  return `<svg width="62" height="16" viewBox="0 0 62 16" class="sparkline">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.7"/>
    ${days.map((v, i) => {
      const x = (i / 6) * 60;
      const y = 14 - (v / max) * 12;
      return v > 0 ? `<circle cx="${x}" cy="${y}" r="1.5" fill="var(--accent)"/>` : '';
    }).join('')}
  </svg>`;
}

// ── Theme toggle ───────────────────────────────────────────────────────
let isDark = true;

function initTheme() {
  chrome.storage.local.get(['theme'], res => {
    isDark = res.theme !== 'light';
    applyTheme();
  });
}

function applyTheme() {
  document.body.classList.toggle('light', !isDark);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

function toggleTheme() {
  isDark = !isDark;
  chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' });
  applyTheme();
}