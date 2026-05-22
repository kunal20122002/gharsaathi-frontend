// ============================================================
//  GharSaathi — Frontend API Client
//  Include this before closing </body> in index.html
// ============================================================

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api'
  : '/api'; // Same-origin in production

// ── TOKEN MANAGEMENT ───────────────────────────────────────
const Auth = {
  getToken:    ()     => localStorage.getItem('gs_token'),
  setToken:    (t)    => localStorage.setItem('gs_token', t),
  getRefresh:  ()     => localStorage.getItem('gs_refresh'),
  setRefresh:  (t)    => localStorage.setItem('gs_refresh', t),
  getUser:     ()     => { try { return JSON.parse(localStorage.getItem('gs_user')); } catch { return null; } },
  setUser:     (u)    => localStorage.setItem('gs_user', JSON.stringify(u)),
  clear:       ()     => { localStorage.removeItem('gs_token'); localStorage.removeItem('gs_refresh'); localStorage.removeItem('gs_user'); },
  isLoggedIn:  ()     => !!localStorage.getItem('gs_token')
};

// ── BASE FETCH WRAPPER ──────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  // Auto-refresh on 401
  if (res.status === 401 && Auth.getRefresh()) {
    const rRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: Auth.getRefresh() })
    });
    if (rRes.ok) {
      const { access_token } = await rRes.json();
      Auth.setToken(access_token);
      headers['Authorization'] = `Bearer ${access_token}`;
      res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    } else {
      Auth.clear();
      showAuthModal();
      return;
    }
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── API METHODS ─────────────────────────────────────────────
const GS = {
  // Auth
  register: (d)   => apiFetch('/auth/register', { method:'POST', body:JSON.stringify(d) }),
  login:    (d)   => apiFetch('/auth/login', { method:'POST', body:JSON.stringify(d) }),
  logout:   ()    => apiFetch('/auth/logout', { method:'POST', body:JSON.stringify({ refresh_token: Auth.getRefresh() }) }),
  verifyOTP:(otp) => apiFetch('/auth/verify-otp', { method:'POST', body:JSON.stringify({ otp }) }),
  resendOTP:()    => apiFetch('/auth/resend-otp', { method:'POST' }),

  // Listings
  getListings: (params={}) => apiFetch('/listings?' + new URLSearchParams(params)),
  getListing:  (id)        => apiFetch(`/listings/${id}`),
  createListing:(d)        => apiFetch('/listings', { method:'POST', body:JSON.stringify(d) }),
  updateListing:(id,d)     => apiFetch(`/listings/${id}`, { method:'PATCH', body:JSON.stringify(d) }),
  deleteListing:(id)       => apiFetch(`/listings/${id}`, { method:'DELETE' }),

  // Search
  search: (q, params={}) => apiFetch('/search?' + new URLSearchParams({ q, ...params })),

  // Matches
  expressInterest: (listingId, msg) => apiFetch(`/matches/${listingId}/interest`, { method:'POST', body:JSON.stringify({ message:msg }) }),
  respondMatch:    (matchId, d)     => apiFetch(`/matches/${matchId}/respond`, { method:'PATCH', body:JSON.stringify(d) }),
  getMyMatches:    (type='all')     => apiFetch(`/matches/my?type=${type}`),

  // Messages
  getMessages: (matchId)          => apiFetch(`/messages/${matchId}`),
  sendMessage: (matchId, content) => apiFetch(`/messages/${matchId}`, { method:'POST', body:JSON.stringify({ content }) }),

  // User
  getMe:        ()    => apiFetch('/users/me'),
  updateMe:     (d)   => apiFetch('/users/me', { method:'PATCH', body:JSON.stringify(d) }),
  getUser:      (id)  => apiFetch(`/users/${id}/public`),
  saveListing:  (id)  => apiFetch(`/users/saved/${id}`, { method:'POST' }),
  unsaveListing:(id)  => apiFetch(`/users/saved/${id}`, { method:'DELETE' }),
  getSaved:     ()    => apiFetch('/users/saved'),

  // Reviews
  submitReview: (d) => apiFetch('/reviews', { method:'POST', body:JSON.stringify(d) }),
  getUserReviews:(id)=> apiFetch(`/reviews/user/${id}`)
};

// ── UI INTEGRATION ──────────────────────────────────────────

// Load real listings on page load
async function loadListings(params = {}) {
  const grid = document.getElementById('listingsGrid') || document.querySelector('.grid-3');
  if (!grid) return;
  try {
    const { listings } = await GS.getListings(params);
    if (!listings?.length) { grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dust);grid-column:1/-1">No listings found 😢 Try a different city!</div>'; return; }
    grid.innerHTML = listings.map(renderCard).join('');
    // Re-attach 3D tilt
    document.querySelectorAll('.lcard').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
        card.style.cssText+=`transform:translateY(-8px) scale(1.014) rotateX(${-y*5}deg) rotateY(${x*5}deg);transform-style:preserve-3d;`;
      });
      card.addEventListener('mouseleave', ()=>{ card.style.transform=''; });
    });
  } catch (e) { console.error('Failed to load listings:', e); }
}

function renderCard(l) {
  const imgs = ['ci-a','ci-b','ci-c','ci-d','ci-e','ci-f'];
  const emojis = ['🏠','🌿','🏙️','☀️','🌺','🏋️'];
  const idx = Math.abs(l.city?.charCodeAt(0) || 0) % 6;
  const note = l.flatmate_note ? `
    <div class="fnote">
      <div class="fnote-label">💬 From outgoing flatmate</div>
      <p>"<b>${escHtml(l.flatmate_note.substring(0,120))}${l.flatmate_note.length>120?'...':''}</b>" — <b>${escHtml(l.note_author||'Flatmate')}</b></p>
    </div>` : '';
  return `
    <div class="lcard reveal" onclick="openListingDetail('${l.id}')">
      <div class="card-img ${l.primary_photo ? '' : imgs[idx]}">
        ${l.primary_photo ? `<img src="${l.primary_photo}" style="width:100%;height:100%;object-fit:cover">` : `<span class="big-emoji">${emojis[idx]}</span>`}
        <div class="card-badges">
          ${l.lister_verified?'<span class="badge b-verified">✓ Verified</span>':''}
          ${l.is_urgent?'<span class="badge b-urgent">⚡ Urgent</span>':''}
        </div>
        <button class="heart-btn" onclick="event.stopPropagation();toggleSave(this,'${l.id}')">♡</button>
        <div class="card-cta"><button onclick="event.stopPropagation();openInterest('${escHtml(l.lister_name)}','${l.id}')">Show Interest 💌</button></div>
      </div>
      <div class="card-body">
        <div class="card-top">
          <div class="card-price">₹${l.monthly_rent.toLocaleString('en-IN')} <small>/month</small></div>
          <div class="card-type">${l.flat_type.toUpperCase()}</div>
        </div>
        <div class="card-title">${escHtml(l.title)}</div>
        <div class="card-loc">📍 ${escHtml(l.locality)}, ${escHtml(l.city)}</div>
        <div class="card-feats">${renderAmenities(l.amenities)}</div>
        ${note}
        <div class="card-divider"></div>
        <div class="card-footer">
          <div class="poster-info">
            <div class="avatar av-fire">${l.lister_name?.charAt(0)||'?'}</div>
            <div>
              <div class="poster-name">${escHtml(l.lister_name)}</div>
              <div class="poster-days">${timeAgo(l.created_at)} · ${l.lister_verified?'ID ✓':''} ${l.linkedin_url?'· LinkedIn ✓':''} · <span class="compat">${l.trust_score||0}% trust</span></div>
            </div>
          </div>
          <button class="btn-interest" onclick="event.stopPropagation();openInterest('${escHtml(l.lister_name)}','${l.id}')">Interest 💌</button>
        </div>
      </div>
    </div>`;
}

function renderAmenities(a) {
  if (!a) return '';
  const map = { wifi:'📶 WiFi', ac:'❄️ AC', gym:'💪 Gym', pool:'🏊 Pool', washing_machine:'🫧 Washer', parking:'🚗 Parking', pet_friendly:'🐾 Pet OK', furnished:'🛋️ Furnished' };
  return Object.entries(a).filter(([,v])=>v).slice(0,4).map(([k])=>`<div class="feat">${map[k]||k}</div>`).join('');
}

async function openListingDetail(id) {
  try {
    const l = await GS.getListing(id);
    // Use existing openDetail function with real data
    openDetail(
      l.primary_photo ? '📸' : '🏠',
      l.title, `📍 ${l.locality}, ${l.city}`,
      `₹${l.monthly_rent.toLocaleString('en-IN')}`,
      `${l.flat_type.toUpperCase()} · ${l.rooms_available} room(s) available`,
      l.address_line || l.locality,
      `${l.rooms_available} room(s)`,
      `${l.existing_flatmates} flatmate(s)`,
      l.lister_name,
      l.flatmate_notes?.[0]?.note_text || 'No note yet from outgoing flatmate.',
      l.flatmate_notes?.[0]?.author_name || 'Outgoing Flatmate',
      'ci-a'
    );
    document.getElementById('dInterestBtn').onclick = () => {
      document.getElementById('detailModal').classList.remove('open');
      document.body.style.overflow = '';
      openInterestForListing(l.lister_name, id);
    };
  } catch (e) { toast2('Failed to load listing 😢'); }
}

// Override doSearch to use API
window.doSearch = async function() {
  const city = document.getElementById('sLoc')?.value.trim() || '';
  toast2(city ? `🔍 Searching in ${city}...` : '🔍 Showing all rooms!');
  await loadListings({ city });
  setTimeout(() => document.getElementById('browse')?.scrollIntoView({ behavior:'smooth' }), 400);
};

// ── AUTH MODAL ──────────────────────────────────────────────
function showAuthModal(mode = 'login') {
  const existing = document.getElementById('authModal');
  if (existing) existing.remove();

  const html = `
    <div class="overlay open" id="authModal">
      <div class="modal" style="max-width:440px">
        <button class="modal-close" onclick="document.getElementById('authModal').remove();document.body.style.overflow=''">✕</button>
        <div class="modal-title">${mode==='login'?'Welcome back 👋':'Join GharSaathi 🏠'}</div>
        <div class="modal-sub">${mode==='login'?'Log in to your account':'Create your free account'}</div>
        <div class="modal-tab-bar" style="margin-bottom:20px">
          <button class="modal-tab ${mode==='login'?'on':''}" onclick="showAuthModal('login')">Log In</button>
          <button class="modal-tab ${mode==='register'?'on':''}" onclick="showAuthModal('register')">Sign Up</button>
        </div>
        <div id="authError" style="color:var(--fire);font-size:13px;margin-bottom:12px;display:none"></div>
        ${mode==='register'?`
          <div class="fg" style="margin-bottom:12px"><label>Full Name</label><input id="aName" type="text" placeholder="Priya Sharma"></div>
          <div class="fg" style="margin-bottom:12px"><label>Phone (+91XXXXXXXXXX)</label><input id="aPhone" type="text" placeholder="+919876543210"></div>
          <div class="fg" style="margin-bottom:12px"><label>Occupation</label><input id="aOccupation" type="text" placeholder="Software Engineer"></div>
        `:''}
        <div class="fg" style="margin-bottom:12px"><label>Email</label><input id="aEmail" type="email" placeholder="you@example.com"></div>
        <div class="fg" style="margin-bottom:20px"><label>Password</label><input id="aPass" type="password" placeholder="${mode==='register'?'Min. 8 characters':'Your password'}"></div>
        <button class="btn-modal-sub" style="width:100%" onclick="handleAuth('${mode}')">
          ${mode==='login'?'Log In →':'Create Account →'}
        </button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';
}

async function handleAuth(mode) {
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';
  const email = document.getElementById('aEmail')?.value.trim();
  const password = document.getElementById('aPass')?.value;

  try {
    let data;
    if (mode === 'login') {
      data = await GS.login({ email, password });
    } else {
      const full_name  = document.getElementById('aName')?.value.trim();
      const phone      = document.getElementById('aPhone')?.value.trim();
      const occupation = document.getElementById('aOccupation')?.value.trim();
      data = await GS.register({ email, password, full_name, phone, occupation });
    }
    Auth.setToken(data.access_token);
    Auth.setRefresh(data.refresh_token);
    Auth.setUser(data.user);
    document.getElementById('authModal')?.remove();
    document.body.style.overflow = '';
    updateNavForUser(data.user);
    confetti();
    toast2(`🎉 ${mode==='login'?'Welcome back':'Welcome to GharSaathi'}, ${data.user.full_name.split(' ')[0]}!`);
    if (mode === 'register') toast2('📱 Please verify your phone with the OTP sent!');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

function updateNavForUser(user) {
  const cta = document.querySelector('.nav-cta');
  if (!cta || !user) return;
  cta.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--mink)">👋 ${user.full_name.split(' ')[0]}</div>
    <button class="btn-ghost" onclick="handleLogout()">Log Out</button>
    <button class="btn-fire" onclick="openList()">+ List My Room</button>
  `;
}

async function handleLogout() {
  try { await GS.logout(); } catch {}
  Auth.clear();
  toast2('👋 Logged out. See you soon!');
  setTimeout(() => window.location.reload(), 1000);
}

// Override nav Login button
document.addEventListener('DOMContentLoaded', () => {
  // Load real listings
  loadListings({ limit: 12 });

  // Check if logged in
  const user = Auth.getUser();
  if (user) updateNavForUser(user);

  // Hook nav Login button
  const loginBtn = document.querySelector('.btn-ghost');
  if (loginBtn && loginBtn.textContent.includes('Log In')) {
    loginBtn.onclick = () => showAuthModal('login');
  }
});

// ── Override openList to check auth ────────────────────────
const _origOpenList = window.openList;
window.openList = function() {
  if (!Auth.isLoggedIn()) { showAuthModal('register'); return; }
  _origOpenList?.();
};

// ── Override openInterest to check auth ────────────────────
const _origOpenInterest = window.openInterest;
window.openInterest = function(name, listingId) {
  if (!Auth.isLoggedIn()) { showAuthModal('register'); return; }
  window._currentInterestListingId = listingId;
  _origOpenInterest?.(name);
};
window.openInterestForListing = window.openInterest;

// ── Override submitInt to call API ──────────────────────────
window.submitInt = async function() {
  const listingId = window._currentInterestListingId;
  const msg = document.querySelector('#intModal textarea')?.value || '';
  try {
    await GS.expressInterest(listingId, msg);
    closeInt();
    confetti();
    setTimeout(() => toast2('💌 Interest sent! You\'ll hear back when they respond.'), 400);
  } catch (e) {
    toast2('❌ ' + (e.message || 'Failed to send interest'));
  }
};

// ── Override submitList to call API ─────────────────────────
window.submitList = async function() {
  try {
    const data = {
      title:           document.querySelector('#lPanel input[placeholder*="Locality"]')?.value ? 
                       `${document.querySelector('#lPanel input[placeholder*="Locality"]')?.value} Flat` : 'Flat Available',
      city:            document.querySelector('#lPanel input[placeholder*="Bengaluru"]')?.value || '',
      locality:        document.querySelector('#lPanel input[placeholder*="Koramangala"]')?.value || '',
      flat_type:       document.querySelector('#lPanel select')?.value || '2bhk',
      monthly_rent:    parseInt(document.querySelector('#lPanel input[type=number]')?.value) || 0,
      security_deposit:parseInt(document.querySelectorAll('#lPanel input[type=number]')?.[1]?.value) || 0,
    };
    if (!data.city || !data.monthly_rent) { toast2('⚠️ Please fill city and rent'); return; }
    await GS.createListing(data);
    closeList();
    confetti();
    setTimeout(() => toast2('🎉 Room listed! Verified & published within 24 hrs.'), 400);
    await loadListings();
  } catch (e) {
    toast2('❌ ' + (e.message || 'Failed to list'));
  }
};

// ── Override toggleSave ──────────────────────────────────────
window.toggleSave = async function(btn, listingId) {
  if (!Auth.isLoggedIn()) { showAuthModal('register'); return; }
  const on = btn.classList.toggle('loved');
  btn.textContent = on ? '♥' : '♡';
  try {
    if (on) { await GS.saveListing(listingId); miniConf(btn); toast2('❤️ Saved to favourites!'); }
    else    { await GS.unsaveListing(listingId); toast2('Removed from favourites'); }
  } catch { btn.classList.toggle('loved'); btn.textContent = on ? '♡' : '♥'; }
};

// ── UTILS ───────────────────────────────────────────────────
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function timeAgo(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ── SOCKET.IO for real-time (load from CDN) ────────────────
function initSocket() {
  const token = Auth.getToken();
  if (!token || !window.io) return;
  const socket = window.io(window.location.origin, { auth: { token } });
  socket.on('mutual_match', ({ matchId }) => {
    confetti();
    toast2('🎉 It\'s a mutual match! Contact unlocked.');
  });
  socket.on('new_interest', ({ seekerId }) => {
    toast2('💌 Someone expressed interest in your room!');
  });
  socket.on('new_message', (msg) => {
    // Update chat UI if open
    const chatContainer = document.getElementById(`chat-${msg.match_id}`);
    if (chatContainer) appendMessage(chatContainer, msg);
  });
  window._gs_socket = socket;
}

// Load socket.io from CDN then init
const sScript = document.createElement('script');
sScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.2/socket.io.min.js';
sScript.onload = initSocket;
document.head.appendChild(sScript);
