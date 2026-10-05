/* ================================================================
   app.js  —  Aaradhya Seeds Catalogue Studio
   All page rendering + interactions
   ================================================================ */

// ── State ──────────────────────────────────────────────────────
// These entries used shared/mismatched package shots in earlier versions.
// Keep a customer-selected image untouched, but move the old fallback to the
// matching crop photograph downloaded from Aaradhya Seeds' own website.
const staleProductImages = {
  'GOLD-KRANTI': 'images/priya-gold.jpg.jpeg',
  'ADITI-AP-007': 'images/ap-raja-nandini.png',
  'AP-1010': 'images/ap-1010.jpg.jpeg',
  'SWARNA-PADDY': 'images/common.png',
  'MTU-1010': 'images/ap-1010.jpg.jpeg',
  'JB-206': 'images/common.png',
  'JB-64': 'images/paddy.jpg',
  'BH-725': 'images/mustard.jpg',
  'BPM-11': 'images/mustard.jpg',
  'GIRIRAJ': 'images/mustard.jpg',
  'AARADHYA-URD-AARYA': 'images/pdm-139.png',
  'PJMH-1': 'images/maize.jpg',
  'PJMH-2': 'images/maize.jpg',
  'DMRH-1308': 'images/maize.jpg',
  'AARADHYA-KANAK': 'images/common-wheat.png'
};

function mergeSeedWithCurrentSource(seed) {
  const defaultSeed = AARADHYA_SEEDS_DB.find(db => db.id === seed.id);
  if (!defaultSeed) return seed;
  const shouldRefreshImage = !seed.image || seed.image === staleProductImages[seed.id];
  return { ...defaultSeed, ...seed, image: shouldRefreshImage ? defaultSeed.image : seed.image };
}

let initialSeeds = JSON.parse(localStorage.getItem('as_seeds') || 'null');
if (initialSeeds) {
  initialSeeds = initialSeeds.map(mergeSeedWithCurrentSource);
} else {
  initialSeeds = AARADHYA_SEEDS_DB;
}

let state = {
  seeds:        initialSeeds,
  catalogue:    JSON.parse(localStorage.getItem('as_catalogue') || 'null') || AARADHYA_SEEDS_DB.map(s => s.id),
  artworks:     JSON.parse(localStorage.getItem('as_artworks') || 'null') || { cover: null, farmer: null, company: null },
  currentPage:  'overview',
  editingId:    null,
  filterCat:    '',
  filterStatus: '',
  searchQuery:  '',
  builderSearch:'',
};

function isCatalogueEligible(seed) {
  return seed?.status === 'PUBLISHED';
}

// Earlier releases saved a new product in Seed Master only. Repair those
// legacy additions once, without re-adding products a user has deliberately
// removed through Catalogue Builder.
function includeLegacyPublishedAdditions() {
  const included = new Set(state.catalogue);
  let added = false;
  state.seeds.forEach(seed => {
    if (seed.id.startsWith('SEED-') && isCatalogueEligible(seed) && !included.has(seed.id)) {
      state.catalogue.push(seed.id);
      included.add(seed.id);
      added = true;
    }
  });
  return added;
}

// The product catalogue is public business content. Its workspace is isolated
// in its own Supabase table and does not read or modify Bhoodhan records.
const supabaseClient = window.supabase && window.SUPABASE_CONFIG
  ? window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.publishableKey)
  : null;
let remoteSyncTimer;

function cataloguePayload() {
  return {
    seeds: state.seeds,
    catalogue: state.catalogue,
    artworks: state.artworks
  };
}

function scheduleRemoteSync() {
  if (!supabaseClient) return;
  clearTimeout(remoteSyncTimer);
  remoteSyncTimer = setTimeout(async () => {
    const { error } = await supabaseClient
      .from('aaradhya_catalogue_workspace')
      .upsert({ id: 'default', payload: cataloguePayload(), updated_at: new Date().toISOString() });
    if (error) {
      console.warn('Supabase catalogue sync is waiting for its database schema:', error.message);
      showToast('Saved locally - Supabase sync needs attention', 'error');
      return;
    }
    showToast('Saved to Supabase', 'success');
  }, 600);
}

async function hydrateFromSupabase() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from('aaradhya_catalogue_workspace')
    .select('payload')
    .eq('id', 'default')
    .maybeSingle();

  if (error || !data?.payload?.seeds) {
    if (error) console.warn('Supabase catalogue load is waiting for its database schema:', error.message);
    return;
  }

  state.seeds = data.payload.seeds.map(mergeSeedWithCurrentSource);
  state.catalogue = data.payload.catalogue || state.catalogue;
  state.artworks = data.payload.artworks || state.artworks;
  const repairedLegacyProducts = includeLegacyPublishedAdditions();
  localStorage.setItem('as_seeds', JSON.stringify(state.seeds));
  localStorage.setItem('as_catalogue', JSON.stringify(state.catalogue));
  localStorage.setItem('as_artworks', JSON.stringify(state.artworks));
  render();
  showToast(repairedLegacyProducts ? 'New products added to catalogue preview' : 'Catalogue loaded from Supabase', 'success');
  scheduleRemoteSync();
}

function saveState() {
  localStorage.setItem('as_seeds',      JSON.stringify(state.seeds));
  localStorage.setItem('as_catalogue',  JSON.stringify(state.catalogue));
  localStorage.setItem('as_artworks',   JSON.stringify(state.artworks));
  scheduleRemoteSync();
}

// ── Routing ────────────────────────────────────────────────────
function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  render();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(el.dataset.page);
  });
});

document.querySelector('.btn-logout').addEventListener('click', () => {
  if (confirm('Are you sure you want to log out?')) {
    showToast('Logged out successfully', 'success');
  }
});

// ── Render dispatcher ─────────────────────────────────────────
function render() {
  const container = document.getElementById('page-container');
  container.innerHTML = '';
  container.className = 'page-enter';
  switch (state.currentPage) {
    case 'overview':          container.innerHTML = renderOverview();          break;
    case 'seed-master':       container.innerHTML = renderSeedMaster();        break;
    case 'catalogue-builder': container.innerHTML = renderCatalogueBuilder();  break;
    case 'page-artwork':      container.innerHTML = renderPageArtwork();       break;
    case 'preview':           container.innerHTML = renderPreview();           break;
    case 'generate':          container.innerHTML = renderGenerate();          break;
  }
  bindPageEvents();
}

// ──────────────────────────────────────────────────────────────
// PAGE: OVERVIEW
// ──────────────────────────────────────────────────────────────
function renderOverview() {
  const total     = state.seeds.length;
  const published = state.seeds.filter(s => s.status === 'PUBLISHED').length;
  const inCat     = state.catalogue.length;
  const categories= [...new Set(state.seeds.map(s => s.category))].length;
  const now       = new Date();
  const month     = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return `
  <div class="page-topbar">
    <div class="topbar-crumbs">
      <a href="#">Overview</a>
    </div>
    <div class="topbar-right">
      <span class="topbar-date">${month}</span>
    </div>
  </div>
  <div class="page-body">
    <div class="page-eyebrow">AARADHYA SEEDS</div>
    <div class="page-title">Catalogue command centre</div>
    <p class="page-subtitle">Manage seeds, build print editions, and keep every version under control.</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total seeds</div>
        <div class="stat-value">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Published seeds</div>
        <div class="stat-value">${published}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active catalogues</div>
        <div class="stat-value">1</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Seed categories</div>
        <div class="stat-value">${categories}</div>
      </div>
    </div>

    <div class="overview-bottom">
      <div class="edition-card">
        <div class="edition-tag">CURRENT EDITION</div>
        <div class="edition-title">${CURRENT_EDITION.name}</div>
        <div class="edition-desc">${CURRENT_EDITION.desc} ${published} published seed varieties are synchronized with product imagery and specifications.</div>
        <div class="edition-actions">
          <button class="btn-white-solid" onclick="navigateTo('catalogue-builder')">Open builder</button>
          <button class="btn-white" onclick="navigateTo('preview')">Preview PDF</button>
        </div>
      </div>

      <div class="quick-actions-card">
        <div class="card-title">Quick actions</div>
        <div class="quick-action-item" onclick="navigateTo('seed-master'); setTimeout(()=>openAddModal(),200)">
          <span class="qa-label">Add a seed</span>
          <span class="qa-arrow">→</span>
        </div>
        <div class="quick-action-item" onclick="navigateTo('seed-master')">
          <span class="qa-label">Review seed master</span>
          <span class="qa-arrow">—</span>
        </div>
        <div class="quick-action-item" onclick="navigateTo('catalogue-builder')">
          <span class="qa-label">Update catalogue order</span>
          <span class="qa-arrow">→</span>
        </div>
      </div>
    </div>
  </div>`;
}

// ──────────────────────────────────────────────────────────────
// PAGE: SEED MASTER
// ──────────────────────────────────────────────────────────────
function renderSeedMaster() {
  const categories = ['', ...new Set(state.seeds.map(s => s.category))].sort();
  const statuses   = ['', 'PUBLISHED', 'DRAFT', 'ARCHIVED'];

  let seeds = state.seeds.filter(s => {
    const q = state.searchQuery.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.description||'').toLowerCase().includes(q);
    const matchCat    = !state.filterCat    || s.category === state.filterCat;
    const matchStatus = !state.filterStatus || s.status   === state.filterStatus;
    return matchSearch && matchCat && matchStatus;
  });

  const catOptions = categories.map(c =>
    `<option value="${c}" ${c === state.filterCat ? 'selected' : ''}>${c || 'All categories'}</option>`
  ).join('');

  const statusOptions = statuses.map(s =>
    `<option value="${s}" ${s === state.filterStatus ? 'selected' : ''}>${s || 'All statuses'}</option>`
  ).join('');

  const rows = seeds.map((s, i) => {
    const meta = CATEGORY_META[s.category] || { icon: '🌱', cssClass: 'cat-moong' };
    const thumbHtml = s.image
      ? `<img src="${s.image}" class="seed-thumb-img" alt="${s.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="seed-thumb" style="display:none;">${s.icon || meta.icon}</div>`
      : `<div class="seed-thumb">${s.icon || meta.icon}</div>`;
    return `
    <tr>
      <td>
        <div class="seed-name-cell">
          ${thumbHtml}
          <div>
            <div class="seed-name">${s.name}</div>
            <div class="seed-code">${s.code}</div>
          </div>
        </div>
      </td>
      <td><span style="font-family:monospace;font-size:12.5px;color:#6b7c70;">${s.code}</span></td>
      <td style="max-width:260px;font-size:12.5px;color:#6b7c70;line-height:1.5;">${(s.description||'').slice(0,90)}${s.description&&s.description.length>90?'…':''}</td>
      <td><span class="category-tag ${meta.cssClass}">${s.category}</span></td>
      <td><span class="status-badge status-${s.status}">${s.status}</span></td>
      <td><span class="layout-badge">${s.layout}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn-action btn-edit" onclick="openEditModal('${s.id}')">Edit</button>
          <button class="btn-action btn-archive" onclick="archiveSeed('${s.id}')">Archive</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="page-topbar">
    <div class="topbar-crumbs">
      <a href="#" onclick="navigateTo('overview')">Dashboard</a>
      <span class="crumb-sep">›</span>
      <span>Product management</span>
    </div>
    <div class="topbar-right">
      <span>Catalogue builder</span>
      <span>→</span>
    </div>
  </div>
  <div class="page-body">
    <div class="page-eyebrow">SEEDS</div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px;">
      <div>
        <div class="page-title">Seed Master</div>
        <p class="page-subtitle">Manage seed varieties, application details, and print layouts.</p>
      </div>
      <button class="btn-primary" onclick="openAddModal()">+ Add Seed</button>
    </div>

    <div class="table-toolbar">
      <div class="table-filters">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
          <input type="text" id="sm-search" placeholder="Search name, code or description" value="${state.searchQuery}" oninput="handleSeedSearch(this.value)" />
        </div>
        <select class="filter-select" id="sm-cat" onchange="handleCatFilter(this.value)">${catOptions}</select>
        <select class="filter-select" id="sm-status" onchange="handleStatusFilter(this.value)">${statusOptions}</select>
      </div>
      <div class="table-count">${seeds.length} of ${state.seeds.length} seeds</div>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>SEED / VARIETY</th>
            <th>CODE</th>
            <th>DESCRIPTION</th>
            <th>CATEGORY</th>
            <th>STATUS</th>
            <th>LAYOUT</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🌱</div><h3>No seeds found</h3><p>Try adjusting your filters.</p></div></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function handleSeedSearch(val)   { state.searchQuery = val;   render(); }
function handleCatFilter(val)    { state.filterCat   = val;   render(); }
function handleStatusFilter(val) { state.filterStatus = val;  render(); }

// ──────────────────────────────────────────────────────────────
// PAGE: CATALOGUE BUILDER
// ──────────────────────────────────────────────────────────────
function renderCatalogueBuilder() {
  // Ensure catalogue list is in sync with existing seeds
  const validIds = new Set(state.seeds.filter(isCatalogueEligible).map(s => s.id));
  state.catalogue = state.catalogue.filter(id => validIds.has(id));

  const catSeeds = state.catalogue.map(id => state.seeds.find(s => s.id === id)).filter(Boolean);
  const nonCatSeeds = state.seeds.filter(s => isCatalogueEligible(s) && !state.catalogue.includes(s.id));

  const q = state.builderSearch.toLowerCase();
  const filtered = q
    ? catSeeds.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    : catSeeds;

  const replaceOptions = ['<option>Replace from Seed Master...</option>',
    ...nonCatSeeds.map(s => `<option value="${s.id}">${s.name} (${s.category})</option>`)
  ].join('');

  const slots = filtered.map((s, i) => {
    const realIdx = state.catalogue.indexOf(s.id);
    const meta = CATEGORY_META[s.category] || { cssClass: 'cat-moong' };
    const thumbHtml = s.image
      ? `<img src="${s.image}" class="slot-thumb-img" alt="${s.name}" onerror="this.style.display='none';" />`
      : '';
    return `
    <div class="slot-item" data-id="${s.id}">
      <span class="slot-num">#${realIdx + 1}</span>
      <input class="slot-check" type="checkbox" checked onchange="toggleSlot('${s.id}', this.checked)" />
      ${thumbHtml}
      <div class="slot-info">
        <div class="slot-name">${s.name}</div>
        <div class="slot-meta">
          <span class="category-tag ${meta.cssClass}" style="font-size:11px;padding:2px 7px;">${s.category}</span>
          <span class="dot"></span>
          <span>Seed Master slot</span>
        </div>
      </div>
      <div class="slot-replace">
        <select class="slot-select" onchange="replaceSeedInSlot('${s.id}', this.value)">
          ${replaceOptions}
        </select>
        <div class="slot-arrows">
          <button class="arrow-btn" onclick="moveSeedUp(${realIdx})" title="Move up">↑</button>
          <button class="arrow-btn" onclick="moveSeedDown(${realIdx})" title="Move down">↓</button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="page-topbar">
    <div class="topbar-crumbs">
      <a href="#" onclick="navigateTo('overview')">Dashboard</a>
      <span class="crumb-sep">›</span>
      <span>Catalogue builder</span>
    </div>
    <div class="topbar-right">
      <a href="#" onclick="navigateTo('preview')">Preview →</a>
    </div>
  </div>
  <div class="page-body">
    <div class="page-eyebrow">CATALOGUES</div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px;">
      <div>
        <div class="page-title">${CURRENT_EDITION.name}</div>
        <p class="page-subtitle">Replace any seed slot from <a href="#" onclick="navigateTo('seed-master')">Seed Master</a>. Seeds already in this catalogue swap positions to prevent duplicates.</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary" onclick="undoLastCatalogueChange()">Undo last change</button>
        <button class="btn-primary" onclick="saveCatalogue()">Save catalogue</button>
      </div>
    </div>

    <div class="builder-toolbar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="text" id="builder-search" placeholder="Search product slots" value="${state.builderSearch}" oninput="handleBuilderSearch(this.value)" />
      </div>
      <span class="slot-count">${filtered.length} included</span>
    </div>

    <div class="builder-list">
      ${slots || '<div class="empty-state" style="padding:40px"><div class="empty-state-icon">📋</div><h3>No seeds in catalogue</h3><p>Add seeds from Seed Master.</p></div>'}
    </div>
  </div>`;
}

function handleBuilderSearch(val) { state.builderSearch = val; render(); }

function toggleSlot(id, checked) {
  if (!checked) {
    state.catalogue = state.catalogue.filter(c => c !== id);
  } else {
    if (!state.catalogue.includes(id)) state.catalogue.push(id);
  }
  saveState();
  showToast(checked ? 'Seed added to catalogue' : 'Seed removed from catalogue', 'success');
  render();
}

let _cataloguePrev = null;
function saveCatalogue() {
  _cataloguePrev = [...state.catalogue];
  saveState();
  showToast('Catalogue saved successfully!', 'success');
}

function undoLastCatalogueChange() {
  if (_cataloguePrev) {
    state.catalogue = [..._cataloguePrev];
    saveState();
    showToast('Last change undone', '');
    render();
  } else {
    showToast('Nothing to undo', '');
  }
}

function moveSeedUp(idx) {
  if (idx === 0) return;
  [state.catalogue[idx - 1], state.catalogue[idx]] = [state.catalogue[idx], state.catalogue[idx - 1]];
  saveState(); render();
}

function moveSeedDown(idx) {
  if (idx >= state.catalogue.length - 1) return;
  [state.catalogue[idx], state.catalogue[idx + 1]] = [state.catalogue[idx + 1], state.catalogue[idx]];
  saveState(); render();
}

function replaceSeedInSlot(oldId, newId) {
  if (!newId || newId.startsWith('Replace')) return;
  const idx = state.catalogue.indexOf(oldId);
  if (idx !== -1) state.catalogue[idx] = newId;
  saveState();
  showToast('Slot replaced!', 'success');
  render();
}

// ──────────────────────────────────────────────────────────────
// PAGE: PAGE ARTWORK
// ──────────────────────────────────────────────────────────────
function renderPageArtwork() {
  const pages = [
    {
      key:        'cover',
      label:      'Page 1 · Original Cover Spread',
      name:       'Full Original Catalogue Cover',
      defaultImg: 'images/aaradhya-original-page-1.png'
    },
    {
      key:        'farmer',
      label:      'Page 2 · Original Field Gallery',
      name:       'Full Original Farmer & Product Spread',
      defaultImg: 'images/aaradhya-original-page-2.png'
    },
    {
      key:        'company',
      label:      'Page 3 · Original Company Profile',
      name:       'Full Original R&D & About Us Spread',
      defaultImg: 'images/aaradhya-original-page-3.png'
    }
  ];

  const cards = pages.map(p => {
    const customArtwork = state.artworks[p.key];
    const displayImg = customArtwork || p.defaultImg;

    return `
    <div class="artwork-card">
      <div class="artwork-preview artwork-full-page-preview">
        <img src="${displayImg}" alt="${p.name}" />
      </div>
      <div class="artwork-info">
        <div class="artwork-page-label">${p.label}</div>
        <div class="artwork-page-name">${p.name}</div>
        <div class="artwork-upload">
          <label class="file-input-label" for="file-${p.key}">📁 Choose File</label>
          <input class="file-input-hidden" type="file" id="file-${p.key}" accept="image/*" onchange="handleArtworkUpload('${p.key}', this)" />
          <span class="file-name-label" id="fname-${p.key}">${customArtwork ? '✓ Custom image set' : 'Standard image active'}</span>
        </div>
        <button class="btn-choose-update" onclick="document.getElementById('file-${p.key}').click()">
          Upload Custom Image &amp; Update
        </button>
        ${customArtwork ? `<button class="btn-secondary btn-sm" style="width:100%;margin-top:6px;" onclick="clearArtwork('${p.key}')">Reset to Standard Image</button>` : ''}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="page-topbar">
    <div class="topbar-crumbs">
      <a href="#" onclick="navigateTo('catalogue-builder')">Catalogue Builder</a>
      <span class="crumb-sep">›</span>
      <span>Page Artwork</span>
    </div>
    <div class="topbar-right">
      <a href="#" onclick="navigateTo('preview')">Preview Catalogue →</a>
    </div>
  </div>
  <div class="page-body">
    <div class="page-eyebrow">CATALOGUE DESIGN</div>
    <div class="page-title">Fixed Page Artworks</div>
    <p class="page-subtitle">These are the complete first three original catalogue spreads. Upload a replacement spread here and it will automatically appear in the PDF export.</p>

    <div class="artwork-grid">${cards}</div>
  </div>`;
}

function handleArtworkUpload(key, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.artworks[key] = e.target.result;
    saveState();
    showToast('Artwork updated!', 'success');
    render();
  };
  reader.readAsDataURL(file);
}

function clearArtwork(key) {
  state.artworks[key] = null;
  saveState();
  render();
}

// ──────────────────────────────────────────────────────────────
// Category Hindi Header Mapping (matching original PDF catalogue)
const CATEGORY_HINDI_MAP = {
  "Hybrid Paddy":       "संकर धान बीज (Hy. Paddy Seeds)",
  "Improved Paddy":     "उन्नतिशील धान बीज (Imp. Paddy Seeds)",
  "Other Paddy":        "अन्य धान बीज (Other Paddy Seeds)",
  "TL/Certified Paddy": "प्रमाणित धान बीज (Certified Paddy Seeds)",
  "Maize":              "मक्का बीज (Maize Seeds)",
  "Wheat":              "गेहूं बीज (Wheat Seeds)",
  "Moong":              "मूंग बीज (Moong Seeds)",
  "Mustard":            "सरसों बीज (Mustard Seed)",
  "Urad":               "उड़द बीज (Urad Seeds)",
  "Arhar":              "अरहर बीज (Arhar Seeds)",
  "Vegetable Crops":    "सब्जी बीज (Vegetable Seeds)",
  "Forage Crops":       "चारा बीज (Forage Seeds)"
};

function generateIntroSheetsHTML() {
  const pages = [
    state.artworks.cover || 'images/aaradhya-original-page-1.png',
    state.artworks.farmer || 'images/aaradhya-original-page-2.png',
    state.artworks.company || 'images/aaradhya-original-page-3.png'
  ];
  return pages.map((image, index) => `
    <section class="pdf-source-page">
      <img src="${image}" alt="Aaradhya Seeds catalogue page ${index + 1}" />
    </section>`).join('');
}

function generateCatalogueSheetsHTML(includeIntro = true) {
  const catSeeds = state.catalogue.map(id => state.seeds.find(s => s.id === id)).filter(isCatalogueEligible);
  const byCategory = {};
  catSeeds.forEach(s => {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  });

  // The reference catalogue is built as two facing pages per spread. Keep each
  // category together, split long groups into four-product facing-page panels.
  const panels = Object.entries(byCategory).flatMap(([category, seeds]) =>
    Array.from({ length: Math.ceil(seeds.length / 4) }, (_, index) => ({
      category,
      continuation: index > 0,
      seeds: seeds.slice(index * 4, index * 4 + 4)
    }))
  );

  const renderPanel = (panel, pageNumber) => {
    if (!panel) {
      return `<section class="pdf-catalogue-panel pdf-empty-panel">
        <img class="pdf-panel-logo" src="images/aaradhya-seeds-logo.png" alt="Aaradhya Seeds" />
        <div class="pdf-empty-copy">Quality seeds for every season</div>
        <div class="pdf-panel-footer"><span>www.aaradhyaseeds.com</span><b>${String(pageNumber).padStart(2, '0')}</b></div>
      </section>`;
    }
    const title = `${CATEGORY_HINDI_MAP[panel.category] || panel.category}${panel.continuation ? ' - जारी' : ''}`;
    const cards = panel.seeds.map(seed => `
      <article class="pdf-reference-product">
        <div class="pdf-reference-image">
          ${seed.image
            ? `<img src="${seed.image}" alt="${seed.name}" onerror="this.parentElement.innerHTML='<span>🌱</span>'" />`
            : '<span>🌱</span>'}
        </div>
        <div class="pdf-reference-copy">
          <h3>${seed.name.toUpperCase()}</h3>
          <div><b>अवधि:</b> ${seed.duration || '-'}</div>
          <div><b>दाना:</b> ${seed.grain || '-'}</div>
          <div><b>जमीन:</b> ${seed.soil || '-'}</div>
          ${seed.description ? `<p><b>विशेषता:</b> ${seed.description}</p>` : ''}
        </div>
      </article>`).join('');
    return `<section class="pdf-catalogue-panel">
      <img class="pdf-panel-logo" src="images/aaradhya-seeds-logo.png" alt="Aaradhya Seeds" />
      <div class="pdf-reference-ribbon">${title}</div>
      <div class="pdf-reference-products">${cards}</div>
      <div class="pdf-panel-footer"><span>swornagritechpvtltd@gmail.com | www.aaradhyaseeds.com</span><b>${String(pageNumber).padStart(2, '0')}</b></div>
    </section>`;
  };

  let pageCounter = includeIntro ? 3 : 0;
  const spreads = Array.from({ length: Math.ceil(panels.length / 2) }, (_, index) => {
    const leftPage = ++pageCounter;
    const rightPage = ++pageCounter;
    return `<section class="pdf-catalogue-spread">
      ${renderPanel(panels[index * 2], leftPage)}
      ${renderPanel(panels[index * 2 + 1], rightPage)}
    </section>`;
  }).join('');

  return `${includeIntro ? generateIntroSheetsHTML() : ''}${spreads}`;
}

// ──────────────────────────────────────────────────────────────
// PAGE: PREVIEW
// ──────────────────────────────────────────────────────────────
function renderPreview() {
  const sheetsHTML = generateCatalogueSheetsHTML(true);

  return `
  <div class="page-topbar">
    <div class="topbar-crumbs">
      <a href="#" onclick="navigateTo('catalogue-builder')">← Catalogue Builder</a>
      <span class="crumb-sep">›</span>
      <span>Reference-style Catalogue Preview</span>
    </div>
    <div class="topbar-right">
      <button class="btn-primary btn-sm" onclick="navigateTo('generate')">Generate PDF →</button>
    </div>
  </div>
  <div class="page-body">
    <div class="page-eyebrow">AARADHYA SEEDS CATALOGUE PDF</div>
    <div class="page-title">Reference-style Catalogue Sheets</div>
    <p class="page-subtitle">Two-page product spreads based on the supplied Aaradhya Seeds catalogue structure.</p>

    <div class="preview-wrap">
      ${sheetsHTML}
    </div>
  </div>`;
}

// ──────────────────────────────────────────────────────────────
// PAGE: GENERATE PDF
// ──────────────────────────────────────────────────────────────
function renderGenerate() {
  return `
  <div class="page-topbar">
    <div class="topbar-crumbs">
      <a href="#" onclick="navigateTo('preview')">← Preview Catalogue</a>
    </div>
    <div class="topbar-right"></div>
  </div>
  <div class="page-body">
    <div class="page-eyebrow">OUTPUT</div>
    <div class="page-title">Generate PDF</div>
    <p class="page-subtitle">Download a print-ready PDF of the Aaradhya Seeds catalogue.</p>

    <div class="generate-wrap">
      <div class="generate-card">
        <h3>📄 Export Options</h3>
        <p>Choose your preferred export format before generating the catalogue PDF.</p>

        <div class="generate-options">
          <label class="generate-option selected" id="opt-full">
            <input type="radio" name="export-type" value="full" checked onchange="selectOpt(this)" />
            <div>
              <div class="option-label">Full Catalogue</div>
              <div class="option-desc">Cover, story and company pages plus all ${state.catalogue.length} selected products</div>
            </div>
          </label>
          <label class="generate-option" id="opt-half">
            <input type="radio" name="export-type" value="category" onchange="selectOpt(this)" />
            <div>
              <div class="option-label">By Category</div>
              <div class="option-desc">Product section pages only - ideal for a compact category handout</div>
            </div>
          </label>
        </div>

        <button class="btn-primary" style="width:100%;justify-content:center;padding:13px;" onclick="startGenerate()">
          🖨 Open Print Preview &amp; Save PDF
        </button>

        <div class="progress-bar-wrap" id="progress-wrap">
          <div class="progress-bar-fill" id="progress-bar"></div>
        </div>
        <div id="generate-status" style="margin-top:10px;font-size:13px;color:#6b7c70;text-align:center;display:none;"></div>
      </div>

      <div class="generate-card">
        <h3>📊 Catalogue Summary</h3>
        <p>Current catalogue contains <strong>${state.catalogue.length} seeds</strong> across <strong>${[...new Set(state.catalogue.map(id => {const s = state.seeds.find(x=>x.id===id); return s?s.category:'';}).filter(Boolean))].length} categories</strong>.</p>
      </div>
    </div>
  </div>`;
}

function selectOpt(input) {
  document.querySelectorAll('.generate-option').forEach(el => el.classList.remove('selected'));
  input.closest('.generate-option').classList.add('selected');
}

function startGenerate() {
  const wrap = document.getElementById('progress-wrap');
  const bar  = document.getElementById('progress-bar');
  const stat = document.getElementById('generate-status');
  if (!wrap) return;
  wrap.style.display = 'block';
  stat.style.display = 'block';
  stat.textContent   = 'Preparing PDF catalogue data…';
  
  // Inject exact PDF sheets into hidden #print-area container
  const printArea = document.getElementById('print-area');
  const exportType = document.querySelector('input[name="export-type"]:checked')?.value || 'full';
  const sheetsHTML = generateCatalogueSheetsHTML(exportType === 'full');
  if (printArea) {
    printArea.innerHTML = `<div id="html2pdf-container" style="background:#ffffff;padding:10px;">${sheetsHTML}</div>`;
  }

  let p = 0;
  const interval = setInterval(() => {
    p += Math.random() * 25;
    if (p >= 100) { 
      p = 100; 
      clearInterval(interval);
      bar.style.width = '100%';
      stat.textContent = '⏳ Rendering PDF file, download will start shortly…';
      showToast('Generating PDF file…', 'success');

      // Use the browser's native print engine for every export. This is the
      // same engine used by Print Preview, so its PDF matches it exactly.
      const prevStyle = printArea.getAttribute('style') || '';
      const preparePrintArea = () => {
        printArea.style.position = 'fixed';
        printArea.style.left = '0';
        printArea.style.top = '0';
        printArea.style.width = '860px';
        printArea.style.zIndex = '999999';
        printArea.style.opacity = '1';
        printArea.style.background = '#ffffff';
        printArea.style.pointerEvents = 'none';
      };
      const usePrintFallback = () => {
        preparePrintArea();
        stat.textContent = 'In the print dialog: choose “Save as PDF”, select Landscape, then turn off “Headers and footers”.';
        showToast('Save as PDF · Landscape · Headers and footers off', 'success');
        window.addEventListener('afterprint', () => printArea.setAttribute('style', prevStyle), { once: true });
        window.print();
      };

      usePrintFallback();
    } else {
      bar.style.width = Math.min(p, 99) + '%';
      if (p < 40)  stat.textContent = 'Building catalogue pages…';
      else if (p < 80)  stat.textContent = 'Formatting A4 PDF sheets…';
    }
  }, 120);
}

// ──────────────────────────────────────────────────────────────
// MODAL: ADD / EDIT SEED
// ──────────────────────────────────────────────────────────────
function openAddModal() {
  state.editingId = null;
  document.getElementById('modal-title').textContent = 'Add New Seed';
  clearModalForm();
  document.getElementById('seed-modal').style.display = 'flex';
}

function openEditModal(id) {
  state.editingId = id;
  const seed = state.seeds.find(s => s.id === id);
  if (!seed) return;
  document.getElementById('modal-title').textContent = 'Edit Seed';
  document.getElementById('f-name').value     = seed.name     || '';
  document.getElementById('f-code').value     = seed.code     || '';
  document.getElementById('f-category').value = seed.category || '';
  document.getElementById('f-duration').value = seed.duration || '';
  document.getElementById('f-grain').value    = seed.grain    || '';
  document.getElementById('f-soil').value     = seed.soil     || '';
  document.getElementById('f-desc').value     = seed.description || '';
  document.getElementById('f-image').value    = seed.image    || '';
  updateProductImagePreview(seed.image || '');
  document.getElementById('f-layout').value   = seed.layout   || 'AUTO';
  document.getElementById('f-status').value   = seed.status   || 'PUBLISHED';
  document.getElementById('seed-modal').style.display = 'flex';
}

function clearModalForm() {
  ['f-name','f-code','f-duration','f-grain','f-soil','f-desc','f-image'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('f-category').value = '';
  document.getElementById('f-layout').value   = 'AUTO';
  document.getElementById('f-status').value   = 'PUBLISHED';
  const imageFile = document.getElementById('f-image-file');
  if (imageFile) imageFile.value = '';
  updateProductImagePreview('');
}

function updateProductImagePreview(imageSrc) {
  const preview = document.getElementById('f-image-preview');
  const fileName = document.getElementById('f-image-file-name');
  if (!preview) return;
  preview.innerHTML = imageSrc
    ? `<img src="${imageSrc}" alt="Selected product image" onerror="this.parentElement.innerHTML='<span>🌱</span>'" />`
    : '<span>🌱</span>';
  if (fileName && !imageSrc) fileName.textContent = 'No image selected';
}

function handleProductImageUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('f-image').value = e.target.result;
    document.getElementById('f-image-file-name').textContent = file.name;
    updateProductImagePreview(e.target.result);
  };
  reader.readAsDataURL(file);
}

function closeModal() {
  document.getElementById('seed-modal').style.display = 'none';
  state.editingId = null;
}

function saveSeedFromModal() {
  const name     = document.getElementById('f-name').value.trim();
  const category = document.getElementById('f-category').value;
  if (!name)     { showToast('Please enter a seed name', 'error'); return; }
  if (!category) { showToast('Please select a category', 'error'); return; }

  const catMeta = CATEGORY_META[category] || { icon: '🌱' };

  const seedData = {
    name,
    code:        document.getElementById('f-code').value.trim() || name.replace(/\s+/g,'-').toUpperCase(),
    category,
    duration:    document.getElementById('f-duration').value.trim(),
    grain:       document.getElementById('f-grain').value.trim(),
    soil:        document.getElementById('f-soil').value.trim(),
    description: document.getElementById('f-desc').value.trim(),
    image:       document.getElementById('f-image').value.trim(),
    layout:      document.getElementById('f-layout').value,
    status:      document.getElementById('f-status').value,
    icon:        catMeta.icon,
  };

  if (state.editingId) {
    const idx = state.seeds.findIndex(s => s.id === state.editingId);
    if (idx !== -1) {
      state.seeds[idx] = { ...state.seeds[idx], ...seedData };
      showToast('Seed updated!', 'success');
    }
  } else {
    const newSeed = { id: 'SEED-' + Date.now(), ...seedData };
    state.seeds.push(newSeed);
    if (isCatalogueEligible(newSeed)) state.catalogue.push(newSeed.id);
    showToast(isCatalogueEligible(newSeed) ? 'New seed added to catalogue!' : 'New seed saved as draft!', 'success');
  }

  saveState();
  closeModal();
  render();
}

function archiveSeed(id) {
  if (!confirm('Archive this seed? It will be hidden from the catalogue.')) return;
  const seed = state.seeds.find(s => s.id === id);
  if (seed) {
    seed.status = 'ARCHIVED';
    state.catalogue = state.catalogue.filter(catalogueId => catalogueId !== id);
    saveState();
    showToast('Seed archived', '');
    render();
  }
}

// Modal close events
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
document.getElementById('modal-save-btn').addEventListener('click', saveSeedFromModal);
document.getElementById('seed-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// ── Bind dynamic events (called after each render) ─────────────
function bindPageEvents() {
  // Already handled via inline onclick + delegated listeners
}

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── Init ──────────────────────────────────────────────────────
render();
hydrateFromSupabase();
