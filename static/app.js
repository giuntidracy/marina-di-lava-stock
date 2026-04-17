/* ═══════════════════════════════════════════════════════════
   Marina di Lava — app.js
   ═══════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────
let currentView = "stock";
let allProducts = [];
let allSuppliers = [];
let allCocktails = [];
let stockSort = { col: null, dir: 1 };
let userRole = null;
let authToken = null;
let userName = "";
let userPhoto = "";
let inactivityTimer = null;

// Onglets accessibles par rôle
const SERVICE_VIEWS = ["inventory","service_alert"];
const MANAGER_VIEWS = ["dashboard","stock","cocktails","alerts","cashpad","delivery","inventory","service_alert","flash","stats","history","suppliers","orders","mapping","events","shrinkage"];

// ── Login ──────────────────────────────────────────────────
async function loginService() {
  const res = await api("/api/auth/service", { method: "POST" });
  authToken = res.token;
  userRole = "service";
  startApp();
}

async function loginManager() {
  const pin = document.getElementById("pin-input").value;
  try {
    const res = await api("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });
    authToken = res.token;
    userRole = "manager";
    userName = res.user_name || "Direction";
    userPhoto = res.user_photo || "";
    startApp();
  } catch(e) {
    const msg = e.message || "Code incorrect";
    document.getElementById("pin-error").textContent = msg;
    document.getElementById("pin-error").classList.remove("hidden");
    document.getElementById("pin-input").value = "";
    document.getElementById("pin-input").focus();
  }
}

function showPinInput() {
  document.getElementById("login-buttons").classList.add("hidden");
  document.getElementById("pin-area").classList.remove("hidden");
  document.getElementById("pin-input").focus();
}

function hidePinInput() {
  document.getElementById("pin-area").classList.add("hidden");
  document.getElementById("login-buttons").classList.remove("hidden");
  document.getElementById("pin-error").classList.add("hidden");
  document.getElementById("pin-input").value = "";
}

function startApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  resetInactivityTimer();
  ["click","touchstart","keydown"].forEach(evt =>
    document.addEventListener(evt, resetOnActivity, { passive: true }));

  const allowedViews = userRole === "manager" ? MANAGER_VIEWS : SERVICE_VIEWS;

  // Show/hide nav items by role
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.style.display = allowedViews.includes(btn.dataset.view) ? "" : "none";
  });
  // Hide empty nav-groups
  document.querySelectorAll(".nav-group").forEach(group => {
    const anyVisible = [...group.querySelectorAll(".nav-item[data-view]")]
      .some(b => b.style.display !== "none");
    group.style.display = anyVisible ? "" : "none";
  });

  // Role badge
  const roleBadge = document.getElementById("sidebar-role");
  if (roleBadge) {
    if (userRole === "manager" && userName) {
      roleBadge.innerHTML = `${userPhoto ? `<img src="${esc(userPhoto)}" class="sidebar-avatar"/>` : ""}<span>${esc(userName)}</span>`;
    } else {
      roleBadge.textContent = userRole === "manager" ? "Direction" : "🍸 Service";
    }
  }

  // Scan button
  const scanFab = document.getElementById("scan-fab");
  if (scanFab) scanFab.classList.remove("hidden");

  // Restore sidebar collapsed state (desktop)
  if (localStorage.getItem("sidebar-collapsed") === "true") {
    document.getElementById("sidebar")?.classList.add("collapsed");
  }

  // Nav item click handlers
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  const defaultView = userRole === "manager" ? "dashboard" : "inventory";
  switchView(defaultView);
  loadAll();
}

function logout() {
  userRole = null;
  authToken = null;
  userName = "";
  userPhoto = "";
  clearTimeout(inactivityTimer);
  location.reload();
}

function flashOpenAvatarUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api("/api/auth/avatar", { method: "POST", body: formData });
      userPhoto = res.photo + "?t=" + Date.now();
      showToast("Photo mise à jour !");
      renderView(currentView);
    } catch(e) {
      showToast("Erreur : " + e.message);
    }
  };
  input.click();
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("app-shell")?.classList.add("hidden");
  // Thème : applique la préférence sauvegardée (sinon clair par défaut)
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");
  applyTheme(theme);
});

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
}

async function loadAll() {
  [allProducts, allSuppliers, allCocktails] = await Promise.all([
    api("/api/produits"),
    api("/api/fournisseurs"),
    api("/api/recettes"),
  ]);
  updateAlertBadge();
  renderView(currentView);
}

const VIEW_TITLES = {
  dashboard:"Tableau de bord",
  stock:"Stock & Marges", cocktails:"Cocktails & Marges", alerts:"Alertes",
  shrinkage:"Démarque Inconnue", cashpad:"Import Cashpad", delivery:"Bon de Livraison",
  inventory:"Sortie Réserve", flash:"Inventaire Flash", service_alert:"Alerte Stock",
  stats:"Statistiques", history:"Historique",
  events:"Événements", suppliers:"Fournisseurs", orders:"Commandes", mapping:"Mapping Cashpad",
};

function switchView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item[data-view]").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view));
  const titleEl = document.getElementById("top-bar-title");
  if (titleEl) titleEl.textContent = VIEW_TITLES[view] || view;
  closeSidebar();
  renderView(view);
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!sidebar) return;
  if (window.innerWidth <= 940) {
    const open = sidebar.classList.toggle("mobile-open");
    overlay?.classList.toggle("active", open);
  } else {
    const collapsed = sidebar.classList.toggle("collapsed");
    const wrapper = document.querySelector(".main-wrapper");
    if (wrapper) wrapper.style.marginLeft = collapsed ? "64px" : "232px";
    localStorage.setItem("sidebar-collapsed", collapsed);
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (window.innerWidth <= 940) {
    sidebar?.classList.remove("mobile-open");
    overlay?.classList.remove("active");
  }
}

function toggleNav() { toggleSidebar(); }

function renderView(view) {
  const app = document.getElementById("app");
  switch (view) {
    case "dashboard":  renderDashboard(app); break;
    case "stock":     renderStock(app); break;
    case "cocktails": renderCocktails(app); break;
    case "alerts":    renderAlerts(app); break;
    case "cashpad":   renderCashpad(app); break;
    case "delivery":  renderDelivery(app); break;
    case "inventory": renderInventory(app); break;
    case "stats":     renderStats(app); break;
    case "history":   renderHistory(app); break;
    case "suppliers": renderSuppliers(app); break;
    case "orders":    renderOrders(app); break;
    case "mapping":   renderMapping(app); break;
    case "events":    renderEvents(app); break;
    case "shrinkage": renderShrinkage(app); break;
    case "flash":     renderFlash(app); break;
    case "service_alert": renderServiceAlert(app); break;
  }
}

// ── API helper ─────────────────────────────────────────────
async function api(url, options = {}) {
  // Ajoute le token d'authentification sur tous les appels /api/
  if (authToken && url.startsWith("/api/")) {
    options.headers = { ...(options.headers || {}), "Authorization": `Bearer ${authToken}` };
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    // Session expirée → retour à l'écran de connexion
    logout();
    throw new Error("Session expirée, veuillez vous reconnecter");
  }
  if (!res.ok) {
    let errText = "";
    try {
      const err = await res.json();
      errText = Array.isArray(err.detail)
        ? err.detail.map(e => e.msg || JSON.stringify(e)).join(", ")
        : (err.detail || "");
    } catch (_) {
      errText = await res.text().catch(() => "");
    }
    // HTTP/2 sur Railway a statusText vide — fallback sur le code HTTP
    throw new Error(errText || `Erreur serveur ${res.status}`);
  }
  resetInactivityTimer();
  return res.json();
}

// ── Déconnexion automatique après 30 min ───────────────────
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    alert("⏱ Session expirée après 30 min d'inactivité. Veuillez vous reconnecter.");
    logout();
  }, 30 * 60 * 1000);
}

function resetOnActivity() {
  if (authToken) resetInactivityTimer();
}

// ── Alert badge ────────────────────────────────────────────
async function updateAlertBadge() {
  try {
    const alerts = await api("/api/alertes");
    const badge = document.getElementById("alert-badge");
    if (alerts.length > 0) {
      badge.textContent = alerts.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch {}
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(html) {
  document.getElementById("modal-content").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

// ── Barcode Scanner ────────────────────────────────────────────────────────
let _html5QrScanner = null;
let _scannerCallback = null;
let _scannerMode = "global"; // "global" | "field"
let _scannerFieldId = null;

function openBarcodeScanner(fieldId) {
  _scannerMode = fieldId ? "field" : "global";
  _scannerFieldId = fieldId || null;
  openModal(`
    <div class="scan-modal-header">📷 Scanner un code-barres</div>
    <div class="scan-modal-sub">${fieldId ? "Pointez la caméra vers le code-barres du produit" : "Pointez la caméra vers un produit pour le retrouver"}</div>
    <div id="scan-reader" class="scan-reader"></div>
    <div id="scan-result" class="scan-result hidden"></div>
    <button class="btn btn-outline" style="margin-top:12px;width:100%" onclick="stopBarcodeScanner()">✕ Annuler</button>
  `);

  setTimeout(() => {
    _html5QrScanner = new Html5Qrcode("scan-reader");
    const config = { fps: 10, qrbox: { width: 280, height: 120 }, aspectRatio: 1.5 };
    _html5QrScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => _onBarcodeScanned(decodedText),
      () => {}
    ).catch(err => {
      document.getElementById("scan-reader").innerHTML =
        `<div style="color:#DC2626;padding:20px;text-align:center">❌ Caméra inaccessible<br><small>${err}</small></div>`;
    });
  }, 200);
}

function openGlobalScanner() {
  openBarcodeScanner(null);
}

async function _onBarcodeScanned(code) {
  stopBarcodeScanner(false);

  if (_scannerMode === "field" && _scannerFieldId) {
    // Mode saisie : remplir le champ barcode dans le formulaire
    closeModal();
    const field = document.getElementById(_scannerFieldId);
    if (field) {
      field.value = code;
      field.style.borderColor = "var(--accent)";
      setTimeout(() => field.style.borderColor = "", 2000);
    }
    showToast(`✅ Code scanné : ${code}`);
    return;
  }

  // Mode global : rechercher le produit
  try {
    const product = await api(`/api/products/by-barcode/${encodeURIComponent(code)}`);
    closeModal();
    // Ouvrir action rapide pour ce produit
    openQuickScanAction(product);
  } catch(e) {
    // Produit non trouvé → proposer de l'assigner
    closeModal();
    openModal(`
      <div class="scan-modal-header">📷 Code scanné</div>
      <div style="font-family:monospace;font-size:13px;background:var(--bg);padding:8px 12px;border-radius:6px;margin:10px 0">${code}</div>
      <div class="kpi-alert-bar">Aucun produit associé à ce code-barres.</div>
      <p style="font-size:13px;color:var(--text-muted);margin-top:12px">Voulez-vous assigner ce code à un produit existant ?</p>
      <div style="margin-top:12px">
        <select id="scan-assign-product" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px">
          <option value="">-- Choisir un produit --</option>
          ${allProducts.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="assignBarcodeToProduct('${code}')">Assigner</button>
      </div>
    `);
  }
}

function openQuickScanAction(product) {
  const stock = product.stock;
  const stockStr = stock % 1 < 0.05 ? Math.round(stock) : parseFloat(stock.toFixed(1));
  const stockColor = stock === 0 ? "#DC2626" : stock <= product.alert_threshold ? "#B45309" : "#15803D";

  openModal(`
    <div class="scan-modal-header">📦 Produit trouvé</div>
    <div style="margin:14px 0">
      <div style="font-size:18px;font-weight:800;color:var(--primary)">${esc(product.name)}</div>
      <div style="font-size:13px;color:var(--text-muted)">${esc(product.category)}</div>
      <div style="margin-top:10px;font-size:28px;font-weight:900;color:${stockColor}">${stockStr} <span style="font-size:14px;font-weight:500">unités</span></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal();openProductForm(${product.id})">✏️ Modifier</button>
      <button class="btn btn-primary" onclick="closeModal();navigateTo('inventory');setTimeout(()=>preselectInventoryProduct(${product.id}),400)">📤 Sortie réserve</button>
    </div>
    <button class="btn btn-outline" style="width:100%;margin-top:8px" onclick="closeModal();openGlobalScanner()">📷 Scanner un autre</button>
  `);
}

async function assignBarcodeToProduct(barcode) {
  const sel = document.getElementById("scan-assign-product");
  if (!sel || !sel.value) { alert("Choisissez un produit"); return; }
  const pid = parseInt(sel.value);
  const product = allProducts.find(p => p.id === pid);
  if (!product) return;

  try {
    await api(`/api/products/${pid}`, {
      method: "PUT",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ ...product, barcode })
    });
    allProducts = await api("/api/products");
    closeModal();
    showToast(`✅ Code-barres assigné à ${product.name}`);
  } catch(e) {
    alert("Erreur : " + e.message);
  }
}

function stopBarcodeScanner(closeModalToo = true) {
  if (_html5QrScanner) {
    _html5QrScanner.stop().catch(() => {});
    _html5QrScanner = null;
  }
  if (closeModalToo) closeModal();
}

function navigateTo(view) {
  const btn = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (btn) btn.click();
}

function preselectInventoryProduct(productId) {
  const sel = document.getElementById("inv-product-select");
  if (sel) {
    sel.value = productId;
    sel.dispatchEvent(new Event("change"));
  }
}

// ── KPI Detail Modals ──────────────────────────────────────

function showValeurDetail() {
  const withVal = allProducts.filter(p => p.valeur_stock !== null && p.valeur_stock > 0)
    .sort((a, b) => b.valeur_stock - a.valeur_stock);
  const totalVal = withVal.reduce((s, p) => s + p.valeur_stock, 0);

  // Par catégorie
  const byCat = {};
  withVal.forEach(p => {
    if (!byCat[p.category]) byCat[p.category] = 0;
    byCat[p.category] += p.valeur_stock;
  });
  const catSorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const catRows = catSorted.map(([cat, val]) => {
    const pct = totalVal > 0 ? (val / totalVal * 100) : 0;
    return `<div class="kpi-detail-catrow">
      <div class="kpi-detail-catname">${cat}</div>
      <div class="kpi-detail-bar-wrap"><div class="kpi-detail-bar" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="kpi-detail-catval">€${val.toFixed(2)}</div>
    </div>`;
  }).join("");

  const top10 = withVal.slice(0, 15);
  const prodRows = top10.map(p => `
    <tr>
      <td>${p.name}</td>
      <td style="color:var(--text-muted)">${p.category}</td>
      <td style="text-align:right">${fmtStock(p)}</td>
      <td style="text-align:right">€${p.cout_unitaire.toFixed(3)}</td>
      <td style="text-align:right;font-weight:700;color:var(--accent)">€${p.valeur_stock.toFixed(2)}</td>
    </tr>`).join("");

  openModal(`
    <div class="kpi-modal-header kpi-gold">💰 Valeur totale du stock</div>
    <div class="kpi-modal-total">€${totalVal.toFixed(2)} <span>sur ${withVal.length} produits</span></div>
    <div class="kpi-modal-section">Répartition par catégorie</div>
    <div class="kpi-detail-cats">${catRows}</div>
    <div class="kpi-modal-section" style="margin-top:20px">Top produits (valeur)</div>
    <div class="kpi-table-wrap">
      <table class="kpi-table">
        <thead><tr><th>Produit</th><th>Catégorie</th><th style="text-align:right">Stock</th><th style="text-align:right">Coût unit.</th><th style="text-align:right">Valeur</th></tr></thead>
        <tbody>${prodRows}</tbody>
      </table>
    </div>
  `);
}

function showProduitsDetail() {
  const total = allProducts.length;
  const enStock = allProducts.filter(p => p.stock > 0).length;
  const ruptures = allProducts.filter(p => p.stock === 0).length;
  const stockBas = allProducts.filter(p => p.stock > 0 && p.stock <= p.alert_threshold).length;

  // Par catégorie
  const byCat = {};
  allProducts.forEach(p => {
    if (!byCat[p.category]) byCat[p.category] = { total: 0, enStock: 0 };
    byCat[p.category].total++;
    if (p.stock > 0) byCat[p.category].enStock++;
  });
  const catSorted = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total);

  const catRows = catSorted.map(([cat, d]) => {
    const pct = d.total > 0 ? (d.enStock / d.total * 100) : 0;
    return `<div class="kpi-detail-catrow">
      <div class="kpi-detail-catname">${cat}</div>
      <div class="kpi-detail-bar-wrap"><div class="kpi-detail-bar kpi-bar-blue" style="width:${pct.toFixed(0)}%"></div></div>
      <div class="kpi-detail-catval">${d.enStock}/${d.total}</div>
    </div>`;
  }).join("");

  // Par fournisseur
  const byFour = {};
  allProducts.forEach(p => {
    const f = p.supplier_name || "Sans fournisseur";
    if (!byFour[f]) byFour[f] = 0;
    byFour[f]++;
  });
  const fourSorted = Object.entries(byFour).sort((a, b) => b[1] - a[1]);
  const fourRows = fourSorted.map(([f, n]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px">${f}</span>
      <span class="badge" style="background:var(--primary-mid);color:white;padding:2px 10px;border-radius:20px;font-size:12px">${n}</span>
    </div>`).join("");

  openModal(`
    <div class="kpi-modal-header kpi-blue">📦 Catalogue produits</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0">
      <div class="kpi-mini-card"><div class="kpi-mini-val">${total}</div><div class="kpi-mini-label">Total</div></div>
      <div class="kpi-mini-card kpi-mini-green"><div class="kpi-mini-val">${enStock}</div><div class="kpi-mini-label">En stock</div></div>
      <div class="kpi-mini-card kpi-mini-red"><div class="kpi-mini-val">${ruptures}</div><div class="kpi-mini-label">Ruptures</div></div>
    </div>
    ${stockBas > 0 ? `<div class="kpi-alert-bar">⚠️ ${stockBas} produit${stockBas > 1 ? 's' : ''} en stock bas (sous le seuil d'alerte)</div>` : ''}
    <div class="kpi-modal-section">En stock par catégorie</div>
    <div class="kpi-detail-cats">${catRows}</div>
    <div class="kpi-modal-section" style="margin-top:20px">Par fournisseur</div>
    <div style="padding:0 4px">${fourRows}</div>
  `);
}

function showRupturesDetail() {
  const ruptures = allProducts.filter(p => p.stock === 0)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const stockBas = allProducts.filter(p => p.stock > 0 && p.stock <= p.alert_threshold)
    .sort((a, b) => a.stock - b.stock);

  const rupRows = ruptures.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px">Aucune rupture 🎉</td></tr>`
    : ruptures.map(p => `
      <tr>
        <td><span style="color:#DC2626;font-weight:600">⬤</span> ${p.name}</td>
        <td style="color:var(--text-muted)">${p.category}</td>
        <td style="color:var(--text-muted);font-size:12px">${p.supplier_name || '—'}</td>
      </tr>`).join("");

  const basRows = stockBas.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">Aucun stock bas</td></tr>`
    : stockBas.map(p => `
      <tr>
        <td><span style="color:#F59E0B;font-weight:600">⬤</span> ${p.name}</td>
        <td style="color:var(--text-muted)">${p.category}</td>
        <td style="text-align:right;color:#B45309;font-weight:600">${fmtStock(p)}</td>
        <td style="text-align:right;color:var(--text-muted)">seuil: ${p.alert_threshold}</td>
      </tr>`).join("");

  openModal(`
    <div class="kpi-modal-header kpi-red">🚨 Ruptures & stocks bas</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0">
      <div class="kpi-mini-card kpi-mini-red"><div class="kpi-mini-val">${ruptures.length}</div><div class="kpi-mini-label">Ruptures (stock = 0)</div></div>
      <div class="kpi-mini-card kpi-mini-orange"><div class="kpi-mini-val">${stockBas.length}</div><div class="kpi-mini-label">Stock bas</div></div>
    </div>
    <div class="kpi-modal-section">Ruptures de stock</div>
    <div class="kpi-table-wrap">
      <table class="kpi-table">
        <thead><tr><th>Produit</th><th>Catégorie</th><th>Fournisseur</th></tr></thead>
        <tbody>${rupRows}</tbody>
      </table>
    </div>
    <div class="kpi-modal-section" style="margin-top:20px">Stock bas (sous le seuil)</div>
    <div class="kpi-table-wrap">
      <table class="kpi-table">
        <thead><tr><th>Produit</th><th>Catégorie</th><th style="text-align:right">Stock</th><th style="text-align:right">Seuil</th></tr></thead>
        <tbody>${basRows}</tbody>
      </table>
    </div>
  `);
}

function showMargeDetail() {
  const valorises = allProducts.filter(p => p.marge !== null && !p.is_estimated)
    .sort((a, b) => b.marge - a.marge);
  const nonVal = allProducts.filter(p => p.marge === null || p.is_estimated);

  const green  = valorises.filter(p => p.marge_color === "green").length;
  const orange = valorises.filter(p => p.marge_color === "orange").length;
  const red    = valorises.filter(p => p.marge_color === "red").length;

  const prodRows = valorises.map(p => {
    const icon = p.marge_color === "green" ? "🟢" : p.marge_color === "orange" ? "🟠" : "🔴";
    const cout = p.cout_unitaire !== null ? `€${p.cout_unitaire.toFixed(3)}` : "—";
    const pv   = p.sale_price_ttc !== null ? `€${p.sale_price_ttc.toFixed(2)}` : "—";
    return `<tr>
      <td>${icon} ${p.name}</td>
      <td style="color:var(--text-muted)">${p.category}</td>
      <td style="text-align:right">${cout}</td>
      <td style="text-align:right">${pv}</td>
      <td style="text-align:right;font-weight:700" class="marge-${p.marge_color}">${p.marge.toFixed(1)}%</td>
    </tr>`;
  }).join("");

  openModal(`
    <div class="kpi-modal-header kpi-green">📈 Analyse des marges</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0">
      <div class="kpi-mini-card kpi-mini-green"><div class="kpi-mini-val">${green}</div><div class="kpi-mini-label">≥ 70% 🟢</div></div>
      <div class="kpi-mini-card kpi-mini-orange"><div class="kpi-mini-val">${orange}</div><div class="kpi-mini-label">50–70% 🟠</div></div>
      <div class="kpi-mini-card kpi-mini-red"><div class="kpi-mini-val">${red}</div><div class="kpi-mini-label">< 50% 🔴</div></div>
    </div>
    ${nonVal.length > 0 ? `<div class="kpi-alert-bar" style="background:rgba(156,163,175,.15);color:var(--text-muted);border-color:var(--border)">ℹ️ ${nonVal.length} produit${nonVal.length > 1 ? 's' : ''} sans prix de vente renseigné</div>` : ''}
    <div class="kpi-modal-section">Tous les produits valorisés</div>
    <div class="kpi-table-wrap">
      <table class="kpi-table">
        <thead><tr><th>Produit</th><th>Catégorie</th><th style="text-align:right">Coût unit.</th><th style="text-align:right">PV TTC</th><th style="text-align:right">Marge HT</th></tr></thead>
        <tbody>${prodRows}</tbody>
      </table>
    </div>
  `);
}

// ── Marge pill ─────────────────────────────────────────────
function margePill(marge, color, estimated) {
  if (estimated) return `<span class="marge-pill marge-gray">~ estimé</span>`;
  if (marge === null || marge === undefined) return `<span class="marge-pill marge-gray">—</span>`;
  return `<span class="marge-pill marge-${color}">${marge.toFixed(1)}%</span>`;
}

function stockClass(stock, threshold) {
  if (stock === 0) return "stock-zero";
  if (stock <= threshold) return "stock-low";
  return "stock-ok";
}

// ══════════════════════════════════════════════════════════
// VIEW: STOCK
// ══════════════════════════════════════════════════════════
function renderStock(el) {
  const categories = [...new Set(allProducts.map(p => p.category))].sort();
  const supplierNames = [...new Set(allProducts.map(p => p.supplier_name).filter(Boolean))].sort();

  // Summary stats (excl. archivés pour les KPI actifs)
  const activeProducts = allProducts.filter(p => !p.archived);
  const withVal = activeProducts.filter(p => p.valeur_stock !== null);
  const totalVal = withVal.reduce((s, p) => s + p.valeur_stock, 0);
  const ruptures = activeProducts.filter(p => p.stock === 0).length;
  const stockBas = activeProducts.filter(p => p.stock > 0 && p.stock <= p.alert_threshold).length;
  const margesOk = activeProducts.filter(p => p.marge_color === "green").length;
  const archivedCount = allProducts.filter(p => p.archived).length;

  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Stock &amp; Marges</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportStockCSV()">⬇ Export CSV</button>
        <button class="btn btn-primary" onclick="openProductForm(null)">+ Nouveau produit</button>
      </div>
    </div>
    <div class="stock-summary">
      <div class="summary-card card-gold kpi-clickable" style="--card-icon:'💰'" onclick="showValeurDetail()">
        <div class="s-label">Valeur totale stock</div>
        <div class="s-value">€${totalVal.toFixed(0)}</div>
        <div class="s-sub">${withVal.length} produits valorisés</div>
        <div class="kpi-hint">Voir détail →</div>
      </div>
      <div class="summary-card kpi-clickable" style="--card-icon:'📦'" onclick="showProduitsDetail()">
        <div class="s-label">Produits</div>
        <div class="s-value">${allProducts.length}</div>
        <div class="s-sub">${allProducts.filter(p => p.stock > 0).length} en stock</div>
        <div class="kpi-hint">Voir détail →</div>
      </div>
      <div class="summary-card ${ruptures > 0 ? 'card-danger' : 'card-success'} kpi-clickable" style="--card-icon:'${ruptures > 0 ? '🚨' : '✅'}'" onclick="showRupturesDetail()">
        <div class="s-label">Ruptures</div>
        <div class="s-value">${ruptures}</div>
        <div class="s-sub">${stockBas > 0 ? `⚠️ ${stockBas} stock bas` : 'Stock sain'}</div>
        <div class="kpi-hint">Voir détail →</div>
      </div>
      <div class="summary-card card-success kpi-clickable" style="--card-icon:'📈'" onclick="showMargeDetail()">
        <div class="s-label">Marge ≥ 70%</div>
        <div class="s-value">${margesOk}</div>
        <div class="s-sub">sur ${activeProducts.filter(p => p.marge !== null).length} valorisés</div>
        <div class="kpi-hint">Voir détail →</div>
      </div>
    </div>
    <div class="filters">
      <select id="f-cat" onchange="filterStock()">
        <option value="">Toutes catégories</option>
        ${categories.map(c => `<option>${c}</option>`).join("")}
      </select>
      <select id="f-sup" onchange="filterStock()">
        <option value="">Tous fournisseurs</option>
        ${supplierNames.map(n => `<option>${n}</option>`).join("")}
      </select>
      <select id="f-marge" onchange="filterStock()">
        <option value="">Toutes marges</option>
        <option value="green">≥ 70%</option>
        <option value="orange">50–70%</option>
        <option value="red">&lt; 50%</option>
        <option value="gray">Non renseigné</option>
      </select>
      <select id="f-alert" onchange="filterStock()">
        <option value="">Tous stocks</option>
        <option value="zero">Rupture</option>
        <option value="low">Stock bas</option>
      </select>
      <select id="f-arch" onchange="filterStock()">
        <option value="active">Actifs (${allProducts.length - archivedCount})</option>
        <option value="archived">Archivés (${archivedCount})</option>
        <option value="all">Tous</option>
      </select>
      <input type="text" id="f-search" placeholder="Rechercher…" oninput="filterStock()"/>
    </div>
    <div id="stock-bulk-toolbar" class="stock-bulk-toolbar hidden">
      <strong><span id="stock-selected-count">0</span> produit(s) sélectionné(s)</strong>
      <button class="btn btn-primary btn-sm" onclick="archiveSelectedStock(true)">📦 Archiver</button>
      <button class="btn btn-outline btn-sm" onclick="archiveSelectedStock(false)">↩️ Désarchiver</button>
      <button class="btn btn-outline btn-sm" onclick="clearStockSelection()">Annuler</button>
    </div>
    <div class="table-wrap">
      <table id="stock-table">
        <thead>
          <tr>
            <th style="width:36px"><input type="checkbox" id="stock-select-all-cb" class="stock-cb" onchange="toggleAllStock(this.checked)"/></th>
            <th class="sortable" onclick="sortStock('name')">Produit</th>
            <th class="sortable" onclick="sortStock('category')">Catégorie</th>
            <th class="sortable" onclick="sortStock('stock')">Stock</th>
            <th class="sortable col-desktop" onclick="sortStock('cout_unitaire')">Coût unit.</th>
            <th class="sortable col-desktop" onclick="sortStock('sale_price_ttc')">PV TTC</th>
            <th class="sortable col-desktop" onclick="sortStock('marge')">Marge HT</th>
            <th class="sortable col-desktop" onclick="sortStock('valeur_stock')">Val. stock</th>
            <th class="sortable" onclick="sortStock('supplier_name')">Fournisseur</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="stock-tbody"></tbody>
      </table>
    </div>`;
  filterStock();
}

function sortStock(col) {
  if (stockSort.col === col) {
    stockSort.dir *= -1;
  } else {
    stockSort.col = col;
    stockSort.dir = 1;
  }
  // update header classes
  document.querySelectorAll("#stock-table th.sortable").forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
  });
  const cols = ["name","category","stock",null,"cout_unitaire","sale_price_ttc","marge","valeur_stock","supplier_name"];
  const idx = cols.indexOf(col);
  if (idx >= 0) {
    const ths = document.querySelectorAll("#stock-table th.sortable");
    const th = [...ths].find(t => t.getAttribute("onclick") === `sortStock('${col}')`);
    if (th) th.classList.add(stockSort.dir === 1 ? "sort-asc" : "sort-desc");
  }
  filterStock();
}

function exportStockCSV() {
  const cat    = document.getElementById("f-cat")?.value    || "";
  const sup    = document.getElementById("f-sup")?.value    || "";
  const marge  = document.getElementById("f-marge")?.value  || "";
  const alert  = document.getElementById("f-alert")?.value  || "";
  const search = (document.getElementById("f-search")?.value || "").toLowerCase();

  let rows = allProducts;
  if (cat)    rows = rows.filter(p => p.category === cat);
  if (sup)    rows = rows.filter(p =>
    p.supplier_name === sup ||
    (p.suppliers && p.suppliers.some(s => s.supplier_name === sup))
  );
  if (marge)  rows = rows.filter(p => p.marge_color === marge);
  if (alert === "zero") rows = rows.filter(p => p.stock === 0);
  if (alert === "low")  rows = rows.filter(p => p.stock > 0 && p.stock <= p.alert_threshold);
  if (search) rows = rows.filter(p => p.name.toLowerCase().includes(search));

  const headers = ["Produit","Catégorie","Fournisseur","Stock","Unité","Seuil","Coût unitaire","PV TTC","TVA %","PV HT","Marge HT %","Valeur stock","Estimé"];
  const csvRows = [headers.join(";")];
  rows.forEach(p => {
    const vat = (p.vat_rate != null ? p.vat_rate : 0.20);
    const pvHT = p.sale_price_ttc ? (p.sale_price_ttc / (1 + vat)).toFixed(4) : "";
    csvRows.push([
      p.name, p.category, p.supplier_name || "", p.stock, p.unit, p.alert_threshold,
      p.cout_unitaire ?? "", p.sale_price_ttc ?? "", (vat * 100).toFixed(0), pvHT,
      p.marge !== null ? p.marge.toFixed(1) : "",
      p.valeur_stock !== null ? p.valeur_stock.toFixed(2) : "",
      p.is_estimated ? "oui" : "non"
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  });

  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `stock_marina_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function filterStock() {
  const cat    = document.getElementById("f-cat")?.value    || "";
  const sup    = document.getElementById("f-sup")?.value    || "";
  const marge  = document.getElementById("f-marge")?.value  || "";
  const alert  = document.getElementById("f-alert")?.value  || "";
  const arch   = document.getElementById("f-arch")?.value   || "active";
  const search = (document.getElementById("f-search")?.value || "").toLowerCase();

  let rows = allProducts;
  if (arch === "active")    rows = rows.filter(p => !p.archived);
  if (arch === "archived")  rows = rows.filter(p => p.archived);
  if (cat)    rows = rows.filter(p => p.category === cat);
  if (sup)    rows = rows.filter(p =>
    p.supplier_name === sup ||
    (p.suppliers && p.suppliers.some(s => s.supplier_name === sup))
  );
  if (marge)  rows = rows.filter(p => p.marge_color === marge);
  if (alert === "zero") rows = rows.filter(p => p.stock === 0);
  if (alert === "low")  rows = rows.filter(p => p.stock > 0 && p.stock <= p.alert_threshold);
  if (search) rows = rows.filter(p => p.name.toLowerCase().includes(search));

  // sort
  if (stockSort.col) {
    rows = [...rows].sort((a, b) => {
      let va = a[stockSort.col], vb = b[stockSort.col];
      if (va === null || va === undefined) va = stockSort.dir > 0 ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = stockSort.dir > 0 ? Infinity : -Infinity;
      if (typeof va === "string") return va.localeCompare(vb) * stockSort.dir;
      return (va - vb) * stockSort.dir;
    });
  }

  const tbody = document.getElementById("stock-tbody");
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:24px">Aucun produit trouvé.</td></tr>`;
    updateStockSelection();
    return;
  }

  tbody.innerHTML = rows.map(p => `
    <tr class="${p.archived ? 'row-archived' : ''}">
      <td><input type="checkbox" class="stock-cb stock-row-cb" data-pid="${p.id}" onchange="updateStockSelection()"/></td>
      <td><strong>${esc(p.name)}</strong>${p.is_estimated ? '<span class="estimated-tag">~</span>' : ''}${p.archived ? '<span class="archived-badge">ARCHIVÉ</span>' : ''}</td>
      <td>${esc(p.category)}</td>
      <td class="${stockClass(p.stock, p.alert_threshold)}">${fmtStock(p)}</td>
      <td class="col-desktop">${p.cout_unitaire !== null ? "€" + p.cout_unitaire.toFixed(3) : "—"}</td>
      <td class="col-desktop">${p.sale_price_ttc !== null ? "€" + p.sale_price_ttc.toFixed(2) + `<span class="vat-tag">${Math.round((p.vat_rate != null ? p.vat_rate : 0.20) * 100)}%</span>` : "—"}</td>
      <td class="col-desktop">${margePill(p.marge, p.marge_color, p.is_estimated)}</td>
      <td class="col-desktop">${p.valeur_stock !== null ? "€" + p.valeur_stock.toFixed(2) : "—"}</td>
      <td>${renderSupplierCell(p)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="openProductForm(${p.id})">✏️</button>
        <button class="btn btn-outline btn-sm" onclick="openAdjustStock(${p.id})">±</button>
        ${p.archived
          ? `<button class="btn btn-outline btn-sm" title="Désarchiver" onclick="toggleArchiveProduct(${p.id}, false)">↩️</button>`
          : `<button class="btn btn-outline btn-sm" title="Archiver" onclick="toggleArchiveProduct(${p.id}, true)">📦</button>`}
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id},'${esc(p.name)}')">🗑</button>
      </td>
    </tr>`).join("");
  updateStockSelection();
}

function toggleAllStock(checked) {
  document.querySelectorAll(".stock-row-cb").forEach(cb => { cb.checked = checked; });
  updateStockSelection();
}

function clearStockSelection() {
  document.querySelectorAll(".stock-row-cb").forEach(cb => { cb.checked = false; });
  const master = document.getElementById("stock-select-all-cb");
  if (master) { master.checked = false; master.indeterminate = false; }
  updateStockSelection();
}

function updateStockSelection() {
  const all = document.querySelectorAll(".stock-row-cb");
  const checked = document.querySelectorAll(".stock-row-cb:checked");
  const toolbar = document.getElementById("stock-bulk-toolbar");
  const cntEl = document.getElementById("stock-selected-count");
  if (cntEl) cntEl.textContent = checked.length;
  if (toolbar) toolbar.classList.toggle("hidden", checked.length === 0);
  const master = document.getElementById("stock-select-all-cb");
  if (master) {
    master.checked = all.length > 0 && checked.length === all.length;
    master.indeterminate = checked.length > 0 && checked.length < all.length;
  }
}

async function toggleArchiveProduct(pid, archive) {
  const action = archive ? "Archiver" : "Désarchiver";
  const p = allProducts.find(x => x.id === pid);
  if (!p) return;
  if (!confirm(`${action} "${p.name}" ?`)) return;
  try {
    await api(`/api/products/${pid}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: archive }),
    });
    allProducts = await api("/api/produits");
    renderStock(document.getElementById("app"));
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

async function archiveSelectedStock(archive) {
  const ids = [...document.querySelectorAll(".stock-row-cb:checked")]
    .map(cb => parseInt(cb.dataset.pid, 10))
    .filter(id => !isNaN(id));
  if (ids.length === 0) return;
  const action = archive ? "Archiver" : "Désarchiver";
  if (!confirm(`${action} ${ids.length} produit${ids.length > 1 ? 's' : ''} ?`)) return;
  try {
    await api(`/api/products/archive-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: archive, product_ids: ids }),
    });
    allProducts = await api("/api/produits");
    renderStock(document.getElementById("app"));
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

function openAdjustStock(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <h3 style="margin-bottom:16px">Ajuster le stock — ${esc(p.name)}</h3>
    <div class="info-box">Stock actuel : <strong>${fmt(p.stock)} ${esc(p.unit)}</strong></div>
    <div class="form-group">
      <label>Quantité à ajouter / retirer (négatif pour retirer)</label>
      <input type="number" id="adj-qty" step="0.01" value="0"/>
    </div>
    <div class="form-group">
      <label>Note (optionnel)</label>
      <input type="text" id="adj-note" placeholder="ex: casse, dégustation…"/>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitAdjust(${id})">Enregistrer</button>
    </div>`);
}

async function submitAdjust(id) {
  const qty  = parseFloat(document.getElementById("adj-qty").value);
  const note = document.getElementById("adj-note").value;
  if (isNaN(qty) || qty === 0) { alert("Entrez une quantité non nulle."); return; }
  try {
    await api("/api/history/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: id, quantity: qty, note }),
    });
    closeModal();
    allProducts = await api("/api/produits");
    filterStock();
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

async function deleteProduct(id, name) {
  if (!confirm(`Supprimer "${name}" ?`)) return;
  try {
    await api(`/api/produits/${id}`, { method: "DELETE" });
    allProducts = await api("/api/produits");
    filterStock();
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

function renderSupplierCell(p) {
  const list = p.suppliers || [];
  if (list.length === 0) return esc(p.supplier_name || "—");
  if (list.length === 1) {
    const s = list[0];
    return `${esc(s.supplier_name)}${s.purchase_price != null
      ? `<br><span style="color:var(--text-muted);font-size:11px">€${s.purchase_price.toFixed(2)}</span>` : ""}`;
  }
  return list.map(s =>
    `<div style="font-size:12px;line-height:1.4">
      ${s.is_primary ? '<span style="color:var(--accent);font-size:10px">★</span> ' : ''}${esc(s.supplier_name)}
      ${s.purchase_price != null ? `<span style="color:var(--text-muted)">€${s.purchase_price.toFixed(2)}</span>` : ""}
    </div>`
  ).join("");
}

function openProductForm(id) {
  const p = id ? allProducts.find(x => x.id === id) : null;
  const title = p ? `Modifier — ${esc(p.name)}` : "Nouveau produit";
  const categories = ["Bières","Vins Blancs","Vins Rosés","Vins Rouges","Champagnes","Anisés","Apéritifs","Rhums","Gins","Whiskies","Vodkas","Cachaça","Tequilas","Digestifs","Eaux","Sodas","Cocktails SA","Autres"];

  openModal(`
    <h3 style="margin-bottom:16px">${title}</h3>
    <form id="product-form" onsubmit="submitProductForm(event,${id || 'null'})">
      <div class="form-row">
        <div class="form-group">
          <label>Nom *</label>
          <input type="text" name="name" required value="${p ? esc(p.name) : ''}"/>
        </div>
        <div class="form-group">
          <label>Catégorie *</label>
          <select name="category" required>
            ${categories.map(c => `<option ${p && p.category===c?"selected":""}>${c}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Unité</label>
          <select name="unit">
            ${["Bouteille","Fût","Carton 6","Carton 12","Carton 24","Bidon"].map(u => `<option ${p && p.unit===u?"selected":""}>${u}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Prix vente TTC</label>
          <input type="number" name="sale_price_ttc" step="0.01" value="${p && p.sale_price_ttc !== null ? p.sale_price_ttc : ''}"/>
        </div>
        <div class="form-group">
          <label>TVA</label>
          <select name="vat_rate">
            <option value="0.20" ${!p || p.vat_rate == null || Math.abs(p.vat_rate - 0.20) < 0.001 ? 'selected' : ''}>20 % (alcool)</option>
            <option value="0.10" ${p && Math.abs((p.vat_rate || 0) - 0.10) < 0.001 ? 'selected' : ''}>10 % (softs, eaux, cocktails SA)</option>
            <option value="0.055" ${p && Math.abs((p.vat_rate || 0) - 0.055) < 0.001 ? 'selected' : ''}>5,5 %</option>
          </select>
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>Stock</label>
          <input type="number" name="stock" step="0.001" value="${p ? p.stock : 0}"/>
        </div>
        <div class="form-group">
          <label>Qté/conditionnement</label>
          <input type="number" name="qty_per_pack" step="1" value="${p ? p.qty_per_pack : 1}"/>
        </div>
        <div class="form-group">
          <label>Volume (cl)</label>
          <input type="number" name="volume_cl" step="0.1" value="${p ? p.volume_cl : 70}"/>
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>Seuil alerte</label>
          <input type="number" name="alert_threshold" step="0.5" value="${p ? p.alert_threshold : 2}"/>
        </div>
        <div class="form-group">
          <label>Prix achat HT principal</label>
          <input type="number" name="purchase_price" step="0.001" value="${p && p.purchase_price !== null ? p.purchase_price : ''}"/>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:12px;padding-top:20px">
            <input type="checkbox" name="is_estimated" ${p && p.is_estimated?"checked":""}/>
            Prix estimé
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Code-barres EAN</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" name="barcode" id="barcode-input" inputmode="numeric" placeholder="ex: 3124480187086" value="${p && p.barcode ? esc(p.barcode) : ''}"/>
          <button type="button" class="btn btn-outline scan-btn" onclick="openBarcodeScanner('barcode-input')">📷 Scanner</button>
        </div>
      </div>
      <div class="form-group" style="margin-top:8px">
        <label>Fournisseurs &amp; Prix par fournisseur</label>
        <div id="suppliers-list" style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
          ${buildSupplierRows(p ? (p.suppliers || []) : [])}
        </div>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px;font-size:12px"
          onclick="addSupplierRow()">+ Ajouter un fournisseur</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
}

// ── Helpers multi-fournisseurs ─────────────────────────────────────────────
function buildSupplierRows(suppliers) {
  if (suppliers.length === 0) return buildOneSupplierRow(0, null, true);
  return suppliers.map((s, i) => buildOneSupplierRow(i, s, s.is_primary)).join('');
}

function buildOneSupplierRow(i, s, isPrimary) {
  const opts = allSuppliers.map(sup =>
    `<option value="${sup.id}" ${s && s.supplier_id === sup.id ? "selected" : ""}>${esc(sup.name)}</option>`
  ).join('');
  return `<div class="supplier-row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    <select class="sup-select" style="flex:2;min-width:120px">
      <option value="">— Fournisseur —</option>${opts}
    </select>
    <input type="number" class="sup-price" step="0.001" placeholder="Prix HT €"
      style="width:90px" value="${s && s.purchase_price != null ? s.purchase_price : ''}"/>
    <label style="font-size:12px;white-space:nowrap;display:flex;align-items:center;gap:4px">
      <input type="radio" name="sup_primary" class="sup-primary" value="${i}" ${isPrimary ? "checked" : ""}/>
      Principal
    </label>
    <button type="button" class="btn btn-danger btn-sm" style="padding:4px 8px"
      onclick="this.closest('.supplier-row').remove()">✕</button>
  </div>`;
}

function addSupplierRow() {
  const list = document.getElementById('suppliers-list');
  const idx = list.querySelectorAll('.supplier-row').length;
  list.insertAdjacentHTML('beforeend', buildOneSupplierRow(idx, null, false));
}

function collectSuppliers() {
  const rows = document.querySelectorAll('#suppliers-list .supplier-row');
  const primaryRadio = document.querySelector('input[name="sup_primary"]:checked');
  const primaryIdx = primaryRadio ? parseInt(primaryRadio.value) : 0;
  const result = [];
  rows.forEach((row, i) => {
    const sid = row.querySelector('.sup-select')?.value;
    const price = row.querySelector('.sup-price')?.value;
    if (sid) result.push({
      supplier_id: parseInt(sid),
      purchase_price: price ? parseFloat(price) : null,
      is_primary: i === primaryIdx,
    });
  });
  return result;
}

async function submitProductForm(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);

  // Collecte les fournisseurs depuis le widget multi-lignes
  const suppliers = collectSuppliers();
  const primary = suppliers.find(s => s.is_primary) || suppliers[0];

  const body = {
    name:            fd.get("name"),
    category:        fd.get("category"),
    supplier_id:     primary?.supplier_id || null,
    stock:           parseFloat(fd.get("stock")) || 0,
    unit:            fd.get("unit"),
    qty_per_pack:    parseFloat(fd.get("qty_per_pack")) || 1,
    volume_cl:       parseFloat(fd.get("volume_cl")) || 70,
    alert_threshold: parseFloat(fd.get("alert_threshold")) || 2,
    purchase_price:  fd.get("purchase_price") ? parseFloat(fd.get("purchase_price")) : (primary?.purchase_price || null),
    sale_price_ttc:  fd.get("sale_price_ttc")  ? parseFloat(fd.get("sale_price_ttc"))  : null,
    is_estimated:    fd.get("is_estimated") === "on",
    barcode:         fd.get("barcode") || "",
    vat_rate:        fd.get("vat_rate") ? parseFloat(fd.get("vat_rate")) : 0.20,
  };
  try {
    let pid = id;
    if (id) {
      await api(`/api/produits/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      const created = await api("/api/produits", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
      pid = created.id;
    }
    // Sauvegarder les fournisseurs multi
    if (pid && suppliers.length > 0) {
      await api(`/api/products/${pid}/suppliers`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(suppliers),
      });
    }
    closeModal();
    allProducts = await api("/api/produits");
    filterStock();
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════
// VIEW: COCKTAILS
// ══════════════════════════════════════════════════════════
function renderCocktails(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Cocktails &amp; Marges</span>
      <button class="btn btn-primary" onclick="openCocktailForm(null)">+ Nouveau cocktail</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Cocktail</th><th>PV TTC</th><th>PV HT</th><th>Coût matière</th><th>Marge HT</th><th>Ingrédients</th><th></th></tr>
        </thead>
        <tbody>
          ${allCocktails.map(c => `
            <tr>
              <td><strong>${esc(c.name)}</strong></td>
              <td>${c.sale_price_ttc !== null ? "€"+c.sale_price_ttc.toFixed(2) : "—"}</td>
              <td>${c.sale_price_ttc !== null ? "€"+(c.sale_price_ttc / (1 + (c.vat_rate != null ? c.vat_rate : 0.20))).toFixed(2) : "—"}</td>
              <td>€${c.cout_matiere.toFixed(3)}</td>
              <td>${margePill(c.marge, c.marge_color, false)}</td>
              <td style="font-size:12px;color:var(--text-muted)">
                ${c.ingredients.map(i => `${esc(i.product_name)} ${i.dose_cl}cl`).join(", ")}
              </td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" onclick="openCocktailForm(${c.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCocktail(${c.id},'${esc(c.name)}')">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function openCocktailForm(id) {
  const c = id ? allCocktails.find(x => x.id === id) : null;
  const title = c ? `Modifier — ${esc(c.name)}` : "Nouveau cocktail";

  openModal(`
    <h3 style="margin-bottom:16px">${title}</h3>
    <form id="cocktail-form" onsubmit="submitCocktailForm(event,${id||'null'})">
      <div class="form-row">
        <div class="form-group">
          <label>Nom *</label>
          <input type="text" id="c-name" required value="${c ? esc(c.name) : ''}"/>
        </div>
        <div class="form-group">
          <label>Prix vente TTC</label>
          <input type="number" id="c-price" step="0.01" value="${c && c.sale_price_ttc ? c.sale_price_ttc : ''}"/>
        </div>
      </div>
      <div class="form-group">
        <label>Ingrédients</label>
        <div id="ingredients-list">
          ${c && c.ingredients.length ? c.ingredients.map(i => ingredientRow(i.product_id, i.dose_cl)).join("") : ingredientRow()}
        </div>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px" onclick="addIngredientRow()">+ Ingrédient</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
}

function ingredientRow(productId = "", doseClVal = "") {
  return `<div class="ingredient-row">
    <select class="ing-product">
      <option value="">— Produit —</option>
      ${allProducts.map(p => `<option value="${p.id}" ${p.id==productId?"selected":""}>${esc(p.name)}</option>`).join("")}
    </select>
    <input type="number" class="ing-dose" placeholder="cl" step="0.5" value="${doseClVal}" style="width:80px"/>
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
  </div>`;
}

function addIngredientRow() {
  document.getElementById("ingredients-list").insertAdjacentHTML("beforeend", ingredientRow());
}

async function submitCocktailForm(e, id) {
  e.preventDefault();
  const name  = document.getElementById("c-name").value.trim();
  const price = document.getElementById("c-price").value;
  if (!name) { alert("Nom requis."); return; }

  const ings = [...document.querySelectorAll(".ingredient-row")].map(row => ({
    product_id: parseInt(row.querySelector(".ing-product").value),
    dose_cl:    parseFloat(row.querySelector(".ing-dose").value),
  })).filter(i => i.product_id && !isNaN(i.dose_cl) && i.dose_cl > 0);

  const body = { name, sale_price_ttc: price ? parseFloat(price) : null, ingredients: ings };
  try {
    if (id) {
      await api(`/api/recettes/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      await api("/api/recettes", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    }
    closeModal();
    allCocktails = await api("/api/recettes");
    renderCocktails(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

async function deleteCocktail(id, name) {
  if (!confirm(`Supprimer "${name}" ?`)) return;
  try {
    await api(`/api/recettes/${id}`, { method: "DELETE" });
    allCocktails = await api("/api/recettes");
    renderCocktails(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════
// VIEW: ALERTS
// ══════════════════════════════════════════════════════════
async function renderAlerts(el) {
  el.innerHTML = `
    <div class="section-header"><span class="section-title">Alertes actives</span></div>
    <div id="weather-widget-area"></div>
    <div id="alerts-body">Chargement…</div>`;

  // Charge météo en parallèle (non bloquant)
  loadWeatherWidget();

  try {
    const [alerts, predictions] = await Promise.all([
      api("/api/alertes"),
      api("/api/predictions").catch(() => []),
    ]);
    const body = document.getElementById("alerts-body");
    let html = "";

    // ── Prédictions de rupture ──────────────────────────────
    if (predictions.length > 0) {
      const critiques = predictions.filter(p => p.urgency === "critique");
      const warnings  = predictions.filter(p => p.urgency === "warning");
      const infos     = predictions.filter(p => p.urgency === "info");

      html += `<div class="pred-section">
        <h3 class="pred-title">🔮 Prédictions de rupture <span class="pred-subtitle">basées sur les 14 derniers jours</span></h3>
        <div class="pred-grid">`;

      predictions.forEach(p => {
        const daysInt = Math.floor(p.days_left);
        const daysStr = daysInt === 0 ? "aujourd'hui" : daysInt === 1 ? "demain" : `dans ${daysInt} jours`;
        const urgClass = p.urgency === "critique" ? "pred-card-critique" : p.urgency === "warning" ? "pred-card-warning" : "pred-card-info";
        const icon = p.urgency === "critique" ? "🔴" : p.urgency === "warning" ? "🟠" : "🟡";

        const evBadge = (p.event_reservations && p.event_reservations.length > 0)
          ? `<div class="pred-card-factor">🎉 ${p.event_need_total} réservé pour ${p.event_reservations.slice(0,2).map(e => esc(e.event_name)).join(', ')}${p.event_reservations.length > 2 ? ` +${p.event_reservations.length-2}` : ''}</div>`
          : '';
        const weatherBadge = p.weather_boost
          ? `<div class="pred-card-factor">☀️ ${esc(p.weather_boost)}</div>`
          : '';

        html += `
        <div class="pred-card ${urgClass}">
          <div class="pred-card-name">${icon} ${esc(p.product_name)}</div>
          <div class="pred-card-msg">Rupture <strong>${daysStr}</strong></div>
          <div class="pred-card-detail">
            Stock : ${p.stock} u · ${p.avg_daily.toFixed(1)}/jour · ${p.total_consumed_14j} vendus en 14j
          </div>
          ${evBadge}
          ${weatherBadge}
          <div class="pred-card-date">📅 ${p.predicted_date}</div>
        </div>`;
      });

      html += `</div></div>`;
    }

    // ── Alertes stock classiques ────────────────────────────
    if (alerts.length === 0 && predictions.length === 0) {
      body.innerHTML = `<div class="info-box" style="color:#27AE60;font-weight:600">✅ Aucune alerte active — tout est en ordre.</div>`;
      return;
    }

    if (alerts.length > 0) {
      const groups = {
        besoin_evenement: { label: "Besoin événement non couvert", icon: "🎉", alerts: [] },
        rupture:          { label: "Rupture de stock",      icon: "🔴", alerts: [] },
        stock_bas:        { label: "Stock bas",              icon: "⚠️", alerts: [] },
        marge:            { label: "Marge insuffisante",     icon: "📉", alerts: [] },
        ecart_inventaire: { label: "Écart inventaire",       icon: "🔍", alerts: [] },
      };
      alerts.forEach(a => {
        const g = groups[a.type] || groups.rupture;
        g.alerts.push(a);
      });

      const archivable = alerts.filter(a => a.product_id);
      html += `<div class="alert-toolbar">
        <label class="alert-select-all">
          <input type="checkbox" id="alert-select-all-cb" onchange="toggleAllAlerts(this.checked)"/>
          Tout sélectionner (${archivable.length} archivables)
        </label>
        <button class="btn btn-danger btn-sm" id="alert-bulk-archive-btn" onclick="archiveSelectedAlerts()" disabled>
          📦 Archiver la sélection (<span id="alert-selected-count">0</span>)
        </button>
      </div>`;

      Object.values(groups).forEach(g => {
        if (g.alerts.length === 0) return;
        html += `<h3 style="margin:20px 0 8px;font-size:15px;font-weight:700">${g.icon} ${esc(g.label)} (${g.alerts.length})</h3>
          <div class="alert-list" style="margin-bottom:8px">
            ${g.alerts.map(a => {
              const pid = a.product_id;
              const cbHtml = pid
                ? `<input type="checkbox" class="alert-cb" data-pid="${pid}" onchange="updateAlertSelection()"/>`
                : `<span style="width:16px;display:inline-block"></span>`;
              const archBtn = pid
                ? `<button class="alert-archive-btn" title="Archiver ce produit" onclick="archiveOneProduct(${pid}, '${esc(a.product || '').replace(/'/g, "\\'")}')">📦</button>`
                : '';
              return `<div class="alert-card alert-${a.severity || 'medium'}">
                ${cbHtml}
                <span class="alert-msg">${esc(a.message)}</span>
                ${a.date ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto">${formatDate(a.date)}</span>` : ''}
                ${archBtn}
              </div>`;
            }).join("")}
          </div>`;
      });
    }

    body.innerHTML = html || `<div class="info-box" style="color:#27AE60;font-weight:600">✅ Aucune alerte active.</div>`;
  } catch (e) {
    document.getElementById("alerts-body").innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

function toggleAllAlerts(checked) {
  document.querySelectorAll(".alert-cb").forEach(cb => { cb.checked = checked; });
  updateAlertSelection();
}

function updateAlertSelection() {
  const checked = document.querySelectorAll(".alert-cb:checked");
  const count = checked.length;
  const btn = document.getElementById("alert-bulk-archive-btn");
  const cntEl = document.getElementById("alert-selected-count");
  if (cntEl) cntEl.textContent = count;
  if (btn) btn.disabled = count === 0;
  // sync master checkbox indeterminate state
  const all = document.querySelectorAll(".alert-cb");
  const master = document.getElementById("alert-select-all-cb");
  if (master) {
    master.checked = all.length > 0 && count === all.length;
    master.indeterminate = count > 0 && count < all.length;
  }
}

async function archiveOneProduct(pid, name) {
  if (!confirm(`Archiver "${name}" ?\n\nCe produit sera masqué des alertes et du stock actif. Vous pourrez le restaurer plus tard.`)) return;
  try {
    await api(`/api/products/${pid}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    allProducts = await api("/api/produits");
    const el = document.getElementById("app") || document.querySelector("main");
    // re-render alerts view
    await renderAlerts(document.getElementById("app"));
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

async function archiveSelectedAlerts() {
  const ids = [...document.querySelectorAll(".alert-cb:checked")]
    .map(cb => parseInt(cb.dataset.pid, 10))
    .filter(id => !isNaN(id));
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  if (!confirm(`Archiver ${unique.length} produit${unique.length > 1 ? 's' : ''} ?\n\nIls seront masqués des alertes et du stock actif.`)) return;
  try {
    await api(`/api/products/archive-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true, product_ids: unique }),
    });
    allProducts = await api("/api/produits");
    await renderAlerts(document.getElementById("app"));
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

// ── Widget Météo ────────────────────────────────────────────────────────
async function loadWeatherWidget(refresh = false) {
  const el = document.getElementById("weather-widget-area");
  if (!el) return;

  // Afficher un indicateur de chargement
  el.innerHTML = `<div class="wx-loading">🌤️ Chargement météo…</div>`;

  try {
    const w = await api(`/api/weather${refresh ? "?refresh=true" : ""}`);

    if (!w.configured) {
      el.innerHTML = `<div class="wx-setup">
        <span class="wx-setup-icon">🌡️</span>
        <div>
          <strong>Alerte Pic de Chaleur non configurée</strong><br>
          <span>Ajoutez <code>OPENWEATHER_API_KEY</code> dans Railway pour recevoir des alertes météo automatiques.
          Clé gratuite sur <a href="https://openweathermap.org/api" target="_blank" style="color:var(--accent)">openweathermap.org</a> (1 000 appels/jour offerts).</span>
        </div>
      </div>`;
      return;
    }

    if (w.error) {
      el.innerHTML = `<div class="wx-setup wx-error">⚠️ Météo : ${esc(w.error)}</div>`;
      return;
    }

    // Niveau de couleur
    const levelCls = {
      canicule: "wx-canicule", chaud: "wx-chaud",
      tiede: "wx-tiede", normal: "wx-normal"
    }[w.alert_level] || "wx-normal";

    const showAlert = ["canicule","chaud","tiede"].includes(w.alert_level);

    // Suggestions produits
    let suggestHtml = "";
    if (showAlert && w.suggestions.length) {
      const rows = w.suggestions.map(s => `
        <div class="wx-prod-row">
          <span class="wx-prod-name">${esc(s.product_name)}</span>
          <span class="wx-prod-stock">Stock : ${s.current_stock} ${s.unit}</span>
          <span class="wx-prod-boost">+${s.boost_pct}%</span>
          <span class="wx-prod-extra">≈ +${s.extra_units} ${s.unit}</span>
        </div>`).join("");
      const intro = w.alert_level === "canicule"
        ? `🔥 Canicule : prévoyez significativement plus sur ces produits`
        : `☀️ Forte chaleur : légère hausse attendue`;
      suggestHtml = `
        <div class="wx-suggest">
          <div class="wx-suggest-title">${intro}</div>
          <div class="wx-prod-list">${rows}</div>
        </div>`;
    }

    el.innerHTML = `
      <div class="wx-card ${levelCls}">
        <div class="wx-main">
          <div class="wx-today">
            <img src="https://openweathermap.org/img/wn/${w.current_icon}.png" class="wx-icon" alt=""/>
            <div>
              <div class="wx-temp-big">${w.current_temp}°C</div>
              <div class="wx-desc">${esc(w.current_desc)} · ${esc(w.city)}</div>
            </div>
          </div>
          <div class="wx-divider"></div>
          <div class="wx-tomorrow">
            <div class="wx-tomorrow-label">Demain</div>
            <img src="https://openweathermap.org/img/wn/${w.tomorrow_icon}.png" class="wx-icon-sm" alt=""/>
            <div class="wx-tomorrow-temps"><strong>${w.tomorrow_max}°C</strong> <span>${w.tomorrow_min}°C</span></div>
            <div class="wx-desc">${esc(w.tomorrow_desc)}</div>
          </div>
          ${showAlert ? `<div class="wx-alert-pill ${levelCls}-pill">${w.alert_emoji} ${esc(w.alert_label)}</div>` : ""}
          <button class="wx-refresh" onclick="loadWeatherWidget(true)" title="Actualiser">↺</button>
        </div>
        ${suggestHtml}
      </div>`;

  } catch(e) {
    const el2 = document.getElementById("weather-widget-area");
    if (el2) el2.innerHTML = `<div class="wx-setup wx-error">
      <span class="wx-setup-icon">⚠️</span>
      <div>
        <strong>Widget météo indisponible</strong><br>
        <span style="font-size:12px;opacity:.8">${esc(e.message || "Erreur de connexion")} — Vérifiez que <code>OPENWEATHER_API_KEY</code> est configuré dans Railway.</span>
      </div>
    </div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: IMPORT CASHPAD
// ══════════════════════════════════════════════════════════
async function renderCashpad(el) {
  el.innerHTML = `
    <!-- ── CONNEXION API CASHPAD ─────────────────────────── -->
    <div class="cp-api-panel" id="cp-api-panel">
      <div class="cp-api-header">
        <div class="cp-api-logo">
          <span style="font-size:28px">🔗</span>
          <div>
            <div class="cp-api-title">Connexion Cashpad API</div>
            <div class="cp-api-sub">Synchronisation automatique toutes les 30 minutes</div>
          </div>
        </div>
        <div id="cp-status-dot" class="cp-dot cp-dot-loading">●</div>
      </div>
      <div id="cp-status-body">
        <div class="cp-loading-msg">Vérification de la connexion…</div>
      </div>
    </div>

    <!-- ── IMPORT MANUEL (fallback) ─────────────────────── -->
    <div class="cp-manual-section">
      <div class="cp-manual-toggle" onclick="toggleManualImport()">
        <span>📥 Import manuel (fichier Excel)</span>
        <span id="cp-manual-arrow">▼</span>
      </div>
      <div id="cp-manual-body" class="hidden">
        <div class="info-box" style="margin:0 0 14px">
          Uploadez le fichier Excel exporté depuis Cashpad (feuille "Ventes-par-produit-2").
          Le numéro de clôture sert à éviter les imports en double.
        </div>
        <div style="max-width:500px">
          <div class="form-group">
            <label>Numéro de clôture *</label>
            <input type="text" id="cashpad-cloture" placeholder="ex: 1042"/>
          </div>
          <div class="upload-zone" id="cashpad-zone" onclick="document.getElementById('cashpad-file').click()">
            <div class="upload-icon">📊</div>
            <div>Cliquez ou glissez le fichier .xlsx ici</div>
            <input type="file" id="cashpad-file" accept=".xlsx,.xls" onchange="setCashpadFile(this)"/>
          </div>
          <div id="cashpad-filename" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>
          <div style="margin-top:14px">
            <button class="btn btn-primary" onclick="submitCashpad()">📥 Importer</button>
          </div>
          <div id="cashpad-result" style="margin-top:16px"></div>
        </div>
      </div>
    </div>`;

  // drag & drop (si le manuel est ouvert)
  document.addEventListener("dragover", e => {
    const zone = document.getElementById("cashpad-zone");
    if (zone) { e.preventDefault(); zone.classList.add("drag-over"); }
  }, { once: false });

  // Load API status
  loadCashpadStatus();
}

function toggleManualImport() {
  const body  = document.getElementById("cp-manual-body");
  const arrow = document.getElementById("cp-manual-arrow");
  if (!body) return;
  const open = body.classList.toggle("hidden");
  if (arrow) arrow.textContent = open ? "▼" : "▲";
}

async function loadCashpadStatus() {
  const dot  = document.getElementById("cp-status-dot");
  const body = document.getElementById("cp-status-body");
  if (!body) return;

  try {
    const s = await api("/api/cashpad/sync-status");

    if (!s.configured) {
      if (dot) { dot.className = "cp-dot cp-dot-off"; dot.textContent = "●"; }
      body.innerHTML = `
        <div class="cp-unconfigured">
          <div class="cp-unconf-icon">🔑</div>
          <div class="cp-unconf-msg">
            <strong>Connexion API non configurée</strong><br>
            Pour activer la sync automatique, vous devez demander vos identifiants API à Cashpad.
          </div>
        </div>
        <div class="cp-setup-steps">
          <div class="cp-step">
            <span class="cp-step-num">1</span>
            <div>Envoyez un email à <strong>support@cashpad.fr</strong> en demandant vos identifiants API :<br>
            <em>email API, token API, et votre installation_id</em></div>
          </div>
          <div class="cp-step">
            <span class="cp-step-num">2</span>
            <div>Dans Railway → votre service → <strong>Variables</strong>, ajoutez :<br>
            <code>CASHPAD_EMAIL</code> · <code>CASHPAD_TOKEN</code> · <code>CASHPAD_INSTALLATION_ID</code></div>
          </div>
          <div class="cp-step">
            <span class="cp-step-num">3</span>
            <div>Railway redéploie automatiquement. La sync démarre toute seule. ✅</div>
          </div>
        </div>
        <div class="cp-copy-block">
          <div class="cp-copy-label">Modèle d'email à envoyer :</div>
          <div class="cp-copy-text" id="cp-email-draft">Bonjour,

Je suis client Cashpad (établissement : Marina di Lava). Je souhaite accéder à votre API REST pour une intégration avec mon logiciel de gestion de stock.

Pourriez-vous m'envoyer :
- L'adresse email à utiliser comme apiuser_email
- Le token d'authentification (apiuser_token)
- Mon installation_id

Merci</div>
          <button class="cp-copy-btn" onclick="copyEmailDraft()">📋 Copier</button>
        </div>`;
      return;
    }

    // Configuré
    if (dot) { dot.className = "cp-dot cp-dot-on"; dot.textContent = "●"; }
    const lastSync = s.last_sync || "Jamais";
    const seqId    = s.last_sequential_id || "0";
    body.innerHTML = `
      <div class="cp-info-row">
        <div class="cp-info-item">
          <span class="cp-info-label">Compte</span>
          <span class="cp-info-val">${esc(s.email)}</span>
        </div>
        <div class="cp-info-item">
          <span class="cp-info-label">Installation</span>
          <span class="cp-info-val">${esc(s.installation_id)}</span>
        </div>
        <div class="cp-info-item">
          <span class="cp-info-label">Dernière sync</span>
          <span class="cp-info-val ${seqId === "0" ? "cp-never" : ""}">${lastSync === "Jamais" ? "⚠️ Jamais effectuée" : "✅ " + lastSync}</span>
        </div>
        <div class="cp-info-item">
          <span class="cp-info-label">Archive n°</span>
          <span class="cp-info-val">${seqId === "0" ? "—" : "#" + seqId}</span>
        </div>
      </div>
      <div class="cp-actions">
        <button class="cp-sync-btn" id="cp-sync-btn" onclick="triggerCashpadSync()">🔄 Synchroniser maintenant</button>
        <button class="cp-reset-btn" onclick="resetCashpadCursor()" title="Repartir depuis la 1ère archive">↺ Réinitialiser le curseur</button>
      </div>
      <div id="cp-sync-result"></div>`;
  } catch(e) {
    if (dot) { dot.className = "cp-dot cp-dot-err"; dot.textContent = "●"; }
    body.innerHTML = `<div class="cp-error">Impossible de vérifier le statut : ${esc(e.message)}</div>`;
  }
}

async function triggerCashpadSync() {
  const btn = document.getElementById("cp-sync-btn");
  const res = document.getElementById("cp-sync-result");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Synchronisation…"; }

  try {
    const r = await api("/api/cashpad/sync", { method: "POST" });
    const msg = r.archives === 0
      ? `<div class="cp-sync-ok">✅ Stock déjà à jour — aucune nouvelle archive.</div>`
      : `<div class="cp-sync-ok">
          ✅ ${r.archives} archive${r.archives > 1 ? "s" : ""} traitée${r.archives > 1 ? "s" : ""} —
          <strong>${r.total_synced} déductions</strong> appliquées.
          ${r.total_skipped > 0 ? `<br><small>${r.total_skipped} ligne${r.total_skipped > 1 ? "s" : ""} sans mapping (pensez à compléter le Mapping Cashpad).</small>` : ""}
        </div>`;
    if (res) res.innerHTML = msg;
    // Rafraîchit le statut
    loadCashpadStatus();
    // Rafraîchit le stock global
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch(e) {
    if (res) res.innerHTML = `<div class="cp-sync-err">❌ ${esc(e.message)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔄 Synchroniser maintenant"; }
  }
}

async function resetCashpadCursor() {
  if (!confirm("Réinitialiser le curseur ?\n\nLe prochain sync re-téléchargera TOUTES les archives depuis le début.\nCela peut créer des doublons si les données ont déjà été importées.")) return;
  await api("/api/cashpad/reset-cursor", { method: "POST" });
  loadCashpadStatus();
}

function copyEmailDraft() {
  const txt = document.getElementById("cp-email-draft");
  if (!txt) return;
  navigator.clipboard.writeText(txt.textContent).then(() => {
    showToast("📋 Email copié dans le presse-papier !");
  });
}

function setCashpadFile(input) {
  const f = input.files[0];
  document.getElementById("cashpad-filename").textContent = f ? `📎 ${f.name}` : "";
}

async function submitCashpad() {
  const cloture = document.getElementById("cashpad-cloture").value.trim();
  const file    = document.getElementById("cashpad-file").files[0];
  if (!cloture) { alert("Entrez le numéro de clôture."); return; }
  if (!file)    { alert("Sélectionnez un fichier Excel."); return; }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("numero_cloture", cloture);

  const resultEl = document.getElementById("cashpad-result");
  resultEl.innerHTML = `<div class="info-box">⏳ Import en cours…</div>`;

  try {
    const res = await api("/api/import/cashpad", { method: "POST", body: fd });
    let html = `<div class="import-preview">
      <h4>✅ Import réussi — ${res.deductions.length} déductions</h4>
      <div style="max-height:300px;overflow-y:auto">`;
    res.deductions.forEach(d => {
      html += `<div class="result-item"><span>${esc(d.product)}</span><span>-${d.deducted} → <strong>${d.new_stock}</strong></span></div>`;
    });
    if (res.alerts?.length) {
      html += `<div style="margin-top:10px;color:#E67E22;font-weight:600">⚠️ Alertes stock : ${res.alerts.map(esc).join(", ")}</div>`;
    }
    if (res.unknown?.length) {
      html += `<div style="margin-top:10px;font-size:12px;color:var(--text-muted)">Produits non mappés : ${res.unknown.map(esc).join(", ")}</div>`;
    }
    html += `</div></div>`;
    resultEl.innerHTML = html;
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch (e) {
    resultEl.innerHTML = `<div class="alert-card alert-high"><span class="alert-icon">❌</span><span class="alert-msg">${esc(e.message)}</span></div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: BON DE LIVRAISON
// ══════════════════════════════════════════════════════════
function renderDelivery(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Bon de livraison</span>
    </div>
    <div class="info-box">
      Uploadez une photo ou un PDF du bon de livraison. Claude AI va extraire les produits automatiquement.
    </div>
    <div style="max-width:520px">
      <div class="form-group">
        <label>Fournisseur (optionnel)</label>
        <input type="text" id="delivery-sup" placeholder="ex: Socobo"/>
      </div>
      <div class="upload-zone" id="delivery-zone" onclick="document.getElementById('delivery-file').click()">
        <div class="upload-icon">📷</div>
        <div style="font-size:15px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Glissez ou cliquez pour choisir</div>
        <small>JPG, PNG, PDF — max 10 Mo</small>
        <input type="file" id="delivery-file" accept="image/*,.pdf" onchange="setDeliveryFile(this)"/>
      </div>
      <div id="delivery-filename" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>
      <div style="margin-top:16px">
        <button class="btn btn-gold btn-lg" onclick="analyzeDelivery()" style="width:100%;justify-content:center">
          ✦ Analyser avec Claude AI
        </button>
      </div>
      <div id="delivery-result" style="margin-top:16px"></div>
    </div>
    <div style="margin-top:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <strong style="font-size:15px">📋 Derniers imports (7 jours)</strong>
        <button class="btn btn-sm" onclick="loadRecentImports()">🔄 Rafraîchir</button>
      </div>
      <div id="recent-imports-list">Chargement…</div>
    </div>

    <div style="margin-top:40px;border-top:2px solid #FEF2F2;padding-top:24px">
      <div style="font-size:13px;font-weight:700;color:#DC2626;margin-bottom:14px;letter-spacing:.5px;text-transform:uppercase">
        ⚠️ Zone d'administration
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;font-weight:600"
          onclick="adminResetStocks()">
          🔄 Remettre tous les stocks à 0
        </button>
        <button class="btn" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;font-weight:600"
          onclick="adminClearImports()">
          🗑 Supprimer tous les BL
        </button>
      </div>
      <div style="margin-top:18px;padding:14px;background:#1a0000;background:linear-gradient(135deg,#7f1d1d,#991b1b);color:#fff;border-radius:10px">
        <div style="font-weight:800;font-size:14px;margin-bottom:6px">🧹 Réinitialisation saison</div>
        <div style="font-size:12px;opacity:0.9;margin-bottom:10px;line-height:1.5">
          Purge toutes les données de rodage avant l'ouverture de la saison :
          imports Cashpad, BL, mouvements manuels, alertes, ventes historiques, pertes déclarées.
          Remet les stocks à 0.<br>
          <strong>Conserve</strong> : produits, cocktails, fournisseurs, mappings, événements, objectif saison.
        </div>
        <button class="btn" style="background:#fff;color:#991b1b;font-weight:800;border:none"
          onclick="adminResetSeason()">
          🚀 Réinitialiser la saison
        </button>
      </div>
    </div>`;

  const zone = document.getElementById("delivery-zone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    if (f) { document.getElementById("delivery-file").files = e.dataTransfer.files; setDeliveryFile({ files: [f] }); }
  });
  loadRecentImports();
}

async function loadRecentImports() {
  const container = document.getElementById("recent-imports-list");
  if (!container) return;
  try {
    const imports = await api("/api/imports/recent?days=7");
    if (imports.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Aucun import ces 7 derniers jours.</div>`;
      return;
    }
    let html = '';
    imports.forEach(imp => {
      const annule = imp.annule;
      const supplierLabel = esc(imp.supplier || 'Fournisseur inconnu');
      const detailsJson = JSON.stringify(imp.details || []).replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += `<div class="import-preview" style="margin-bottom:10px;${annule ? 'opacity:0.55' : ''}cursor:pointer"
        onclick="showImportDetail(${imp.id}, '${esc(imp.reference)}', '${supplierLabel}', '${esc(imp.created_at)}', this)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <strong>${supplierLabel}</strong>
            <span style="color:var(--text-muted);font-size:12px;margin-left:8px">BL n°${esc(imp.reference)} — ${esc(imp.created_at)}</span>
            <span style="font-size:12px;margin-left:8px;color:var(--primary);font-weight:600">${imp.nb_produits} produit(s)</span>
            ${annule ? '<span style="background:#FEF2F2;color:#DC2626;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:6px">Annulé</span>' : ''}
          </div>
          <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-outline" onclick="showImportDetail(${imp.id}, '${esc(imp.reference)}', '${supplierLabel}', '${esc(imp.created_at)}')">🔍 Détail</button>
            ${!annule ? `<button class="btn btn-sm" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA"
              onclick="annulerImport(${imp.id}, '${esc(imp.reference)}', '${esc(imp.supplier)}')">↩ Annuler</button>` : ''}
          </div>
        </div>
        ${imp.details && imp.details.length > 0 ? `
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          ${imp.details.slice(0,5).map(d => `${esc(d.product)} ${d.added > 0 ? '+' : ''}${d.added}`).join(' · ')}
          ${imp.details.length > 5 ? ` · <em>+${imp.details.length - 5} autres</em>` : ''}
        </div>` : ''}
      </div>`;
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px">Erreur : ${esc(e.message)}</div>`;
  }
}

let _currentImportDetail = null;

async function showImportDetail(importId, reference, supplier, date) {
  try {
    const data = await api(`/api/imports/${importId}/detail`);
    const details = Array.isArray(data.details) ? data.details : [];
    const notFound = Array.isArray(data.not_found) ? data.not_found : [];
    _currentImportDetail = { importId, reference, supplier, date, details, notFound, annule: !!data.annule };
    _renderImportDetailModal();
  } catch(e) {
    openModal(`<h3>Détail import</h3><div class="info-box">Erreur chargement : ${esc(e.message)}</div>`);
  }
}

function _renderImportDetailModal() {
  if (!_currentImportDetail) return;
  const { importId, reference, supplier, date, details, notFound, annule } = _currentImportDetail;

  const canEdit = !annule;

  const rows = details.map((d, i) => {
    const hasPid = d.product_id != null;
    const priceDisplay = d.old_price != null
      ? `${Number(d.old_price).toFixed(2)} €${d.new_price != null && d.new_price !== d.old_price ? ` → <strong>${Number(d.new_price).toFixed(2)} €</strong>` : ''}`
      : (d.new_price != null ? `<strong>${Number(d.new_price).toFixed(2)} €</strong>` : '—');
    const editBtns = canEdit && hasPid
      ? `<button class="btn btn-sm btn-outline" style="padding:2px 7px;font-size:12px" title="Modifier" onclick="editImportLine(${importId},${d.product_id},${i},${d.added},${d.new_price != null ? d.new_price : 'null'})">✏️</button>
         <button class="btn btn-sm" style="padding:2px 7px;font-size:12px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA" title="Supprimer" onclick="deleteImportLine(${importId},${d.product_id},'${esc(d.product)}',${d.added})">🗑</button>`
      : '';
    return `<tr id="bl-row-${i}">
      <td style="font-weight:600">${esc(d.product)}</td>
      <td style="color:${d.added < 0 ? '#DC2626' : 'var(--primary)'};font-weight:700;text-align:center">${d.added > 0 ? '+' : ''}${d.added}</td>
      <td style="color:var(--text-muted);text-align:right">${priceDisplay}</td>
      <td style="text-align:right;white-space:nowrap">${editBtns}</td>
    </tr>`;
  }).join('');

  const annuleBanner = annule
    ? `<div style="background:#FEF2F2;color:#DC2626;font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:12px">⚠️ Cet import a été annulé — modification impossible</div>`
    : '';

  const notFoundHtml = (notFound && notFound.length)
    ? `<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
         <div style="color:#DC2626;font-weight:600;font-size:13px;margin-bottom:8px">
           ⚠️ ${notFound.length} produit(s) non reconnu(s) — à créer ou mapper
         </div>
         ${notFound.map(n => `
           <div style="display:flex;align-items:center;gap:8px;background:#FEF2F2;border:1px solid #FECACA;
                       border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:13px;color:#991B1B">
             <span>❌</span><span>${esc(n)}</span>
           </div>`).join('')}
       </div>`
    : '';

  openModal(`
    <h3>📋 Détail — ${esc(supplier)}</h3>
    <div style="color:var(--text-muted);font-size:12px;margin-bottom:12px">BL n°${esc(reference)} · ${esc(date)}</div>
    ${annuleBanner}
    ${rows.length
      ? `<div class="table-wrap"><table>
           <thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix achat</th><th></th></tr></thead>
           <tbody id="bl-tbody">${rows}</tbody>
         </table></div>`
      : '<div class="info-box">Aucun produit importé.</div>'}
    ${notFoundHtml}
  `);
}

function showAdminPinModal({ title, warning, confirmLabel, onConfirm }) {
  openModal(`
    <h3 style="color:#DC2626">${title}</h3>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13px;color:#991B1B;line-height:1.6">
      ${warning}
    </div>
    <div class="form-group" style="margin-bottom:16px">
      <label style="font-size:13px;font-weight:600">Code PIN direction</label>
      <input id="admin-pin-input" type="password" inputmode="numeric" maxlength="8"
        placeholder="••••" autocomplete="off"
        style="margin-top:6px;width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;
               background:var(--surface);color:var(--text);font-size:15px;letter-spacing:4px"
        onkeydown="if(event.key==='Enter') _submitAdminPin()"/>
    </div>
    <div id="admin-pin-error" style="color:#DC2626;font-size:12px;margin-bottom:10px;display:none">Code incorrect</div>
    <div style="display:flex;gap:10px">
      <button class="btn" style="flex:1;background:#DC2626;color:#fff;font-weight:700;justify-content:center"
        onclick="_submitAdminPin()">${confirmLabel}</button>
      <button class="btn btn-outline" style="flex:1;justify-content:center" onclick="closeModal()">Annuler</button>
    </div>
  `);
  setTimeout(() => document.getElementById('admin-pin-input')?.focus(), 100);
  window._adminPinCallback = onConfirm;
}

async function _submitAdminPin() {
  const pin = document.getElementById('admin-pin-input')?.value || '';
  const errEl = document.getElementById('admin-pin-error');
  if (!pin) { if (errEl) { errEl.style.display='block'; errEl.textContent='Entrez le code PIN'; } return; }
  try {
    await window._adminPinCallback(pin);
    closeModal();
  } catch(e) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message || 'Code incorrect'; }
    const input = document.getElementById('admin-pin-input');
    if (input) { input.value = ''; input.focus(); }
  }
}

async function adminResetStocks() {
  showAdminPinModal({
    title: '🔄 Remettre tous les stocks à 0',
    warning: '⚠️ Cette action va mettre <strong>TOUS les stocks à zéro</strong>.<br>Les prix d\'achat et les bons de livraison ne seront pas modifiés.<br><strong>Action irréversible.</strong>',
    confirmLabel: 'Confirmer la remise à 0',
    onConfirm: async (pin) => {
      const res = await api("/api/admin/reset-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      allProducts = await api("/api/produits");
      updateAlertBadge();
      alert(`✓ ${res.products_reset} produit(s) remis à 0.`);
    }
  });
}

async function adminClearImports() {
  showAdminPinModal({
    title: '🗑 Supprimer tous les BL',
    warning: '⚠️ Cette action va supprimer <strong>tous les bons de livraison</strong>.<br>Les stocks <strong>ne seront PAS modifiés</strong>.<br><strong>Action irréversible.</strong>',
    confirmLabel: 'Confirmer la suppression',
    onConfirm: async (pin) => {
      const res = await api("/api/admin/clear-imports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      loadRecentImports();
      alert(`✓ ${res.deleted} bon(s) de livraison supprimé(s).`);
    }
  });
}

async function adminResetSeason() {
  // Étape 1 : confirmation "tape RESET"
  openModal(`
    <h3 style="margin-bottom:10px;color:#991B1B">🧹 Réinitialisation saison</h3>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 14px;margin:10px 0 14px;font-size:13px;color:#991B1B;line-height:1.6">
      ⚠️ <strong>Action IRRÉVERSIBLE.</strong><br>
      Vont être <strong>supprimés</strong> :<br>
      • Tous les imports Cashpad<br>
      • Tous les bons de livraison<br>
      • Tous les mouvements manuels, alertes inventaire, pertes déclarées<br>
      • Les sessions d'inventaire et les alertes service<br>
      • Les stocks seront remis à <strong>0</strong><br><br>
      Vont être <strong>conservés</strong> : produits, cocktails, fournisseurs, mappings Cashpad, événements, objectif saison.
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label style="font-size:13px;font-weight:600">Tapez <code>RESET</code> en majuscules pour confirmer</label>
      <input id="reset-season-conf" type="text" placeholder="RESET" autocomplete="off"
        style="margin-top:6px;width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;
               background:var(--surface);color:var(--text);font-size:15px;letter-spacing:3px;text-transform:uppercase"/>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label style="font-size:13px;font-weight:600">Code PIN direction</label>
      <input id="reset-season-pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off"
        style="margin-top:6px;width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;
               background:var(--surface);color:var(--text);font-size:15px;letter-spacing:4px"/>
    </div>
    <div id="reset-season-error" style="color:#DC2626;font-size:12px;margin-bottom:10px;display:none"></div>
    <div style="display:flex;gap:10px">
      <button class="btn" style="flex:1;background:#991B1B;color:#fff;font-weight:800;justify-content:center"
        onclick="_submitResetSeason()">🚀 Réinitialiser</button>
      <button class="btn btn-outline" style="flex:1;justify-content:center" onclick="closeModal()">Annuler</button>
    </div>
  `);
  setTimeout(() => document.getElementById('reset-season-conf')?.focus(), 100);
}

async function _submitResetSeason() {
  const conf = (document.getElementById('reset-season-conf')?.value || '').trim();
  const pin = document.getElementById('reset-season-pin')?.value || '';
  const errEl = document.getElementById('reset-season-error');
  if (conf !== 'RESET') {
    if (errEl) { errEl.textContent = 'Vous devez taper RESET en majuscules.'; errEl.style.display = 'block'; }
    return;
  }
  if (!pin) {
    if (errEl) { errEl.textContent = 'Code PIN requis.'; errEl.style.display = 'block'; }
    return;
  }
  try {
    const res = await api("/api/admin/reset-season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, confirmation: conf })
    });
    closeModal();
    allProducts = await api("/api/produits");
    updateAlertBadge();
    alert(
      `✓ Réinitialisation effectuée.\n\n` +
      `• ${res.stock_history_deleted} événements historiques supprimés\n` +
      `• ${res.import_logs_deleted} imports/BL supprimés\n` +
      `• ${res.inventory_sessions_deleted} sessions inventaire supprimées\n` +
      `• ${res.service_alerts_deleted} alertes service supprimées\n` +
      `• ${res.manual_losses_deleted} pertes manuelles supprimées\n` +
      `• ${res.products_reset} stocks remis à 0\n\n` +
      `Prêt pour la nouvelle saison !`
    );
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Erreur'; errEl.style.display = 'block'; }
  }
}

async function deleteImportLine(importId, productId, productName, qty) {
  if (!confirm(`Supprimer la ligne "${productName}" (${qty > 0 ? '+' : ''}${qty}) ?\n\nLe stock sera ajusté en conséquence.`)) return;
  try {
    await api(`/api/imports/${importId}/lines/${productId}`, { method: "DELETE" });
    _currentImportDetail.details = _currentImportDetail.details.filter(d => d.product_id !== productId);
    _renderImportDetailModal();
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch(e) {
    alert("Erreur suppression : " + e.message);
  }
}

function editImportLine(importId, productId, rowIndex, currentQty, currentPrice) {
  const row = document.getElementById(`bl-row-${rowIndex}`);
  if (!row) { alert("Erreur : ligne introuvable dans le DOM"); return; }
  const d = _currentImportDetail && _currentImportDetail.details[rowIndex];
  if (!d) { alert("Erreur : données de ligne introuvables"); return; }

  const priceVal = currentPrice != null && currentPrice !== 'null' ? currentPrice : '';
  row.innerHTML = `
    <td style="font-weight:600;font-size:12px">${esc(d.product)}</td>
    <td colspan="2" style="padding:4px 6px">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <label style="font-size:11px;color:var(--text-muted)">Qté</label>
        <input id="edit-qty-${rowIndex}" type="number" step="0.01" value="${currentQty}"
          style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px"/>
        <label style="font-size:11px;color:var(--text-muted)">Prix€</label>
        <input id="edit-price-${rowIndex}" type="number" step="0.01" value="${priceVal}" placeholder="inchangé"
          style="width:80px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px"/>
      </div>
    </td>
    <td style="text-align:right;white-space:nowrap">
      <button class="btn btn-sm" style="padding:2px 8px;font-size:12px" onclick="saveImportLine(${importId},${productId},${rowIndex})">✓</button>
      <button class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:12px" onclick="_renderImportDetailModal()">✕</button>
    </td>`;
}

async function saveImportLine(importId, productId, rowIndex) {
  const qtyEl = document.getElementById(`edit-qty-${rowIndex}`);
  const priceEl = document.getElementById(`edit-price-${rowIndex}`);
  if (!qtyEl) { alert("Erreur : champ quantité introuvable"); return; }

  const newQty = parseFloat(qtyEl.value);
  if (isNaN(newQty) || newQty < 0) { alert("Quantité invalide"); return; }
  const rawPrice = priceEl ? priceEl.value.trim() : '';
  const newPrice = rawPrice !== '' ? parseFloat(rawPrice) : null;
  if (rawPrice !== '' && isNaN(newPrice)) { alert("Prix invalide"); return; }

  try {
    await api(`/api/imports/${importId}/lines/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_qty: newQty, new_price: newPrice })
    });
    const d = _currentImportDetail.details[rowIndex];
    if (d) {
      d.added = newQty;
      if (newPrice != null) d.new_price = newPrice;
    }
    _renderImportDetailModal();
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch(e) {
    alert("Erreur sauvegarde : " + e.message);
  }
}

async function annulerImport(importId, reference, supplier) {
  if (!confirm(`Annuler l'import BL n°${reference} (${supplier}) ?\n\nLes quantités seront retirées du stock et les anciens prix restaurés.`)) return;
  try {
    const res = await api(`/api/imports/${importId}/annuler`, { method: "POST" });
    alert(`✓ Import annulé — ${res.reversed.length} produit(s) corrigés.`);
    allProducts = await api("/api/produits");
    updateAlertBadge();
    loadRecentImports();
  } catch(e) {
    alert("Erreur : " + e.message);
  }
}

function setDeliveryFile(input) {
  const f = input.files[0];
  document.getElementById("delivery-filename").textContent = f ? `📎 ${f.name}` : "";
}

async function analyzeDelivery() {
  const file = document.getElementById("delivery-file").files[0];
  if (!file) { alert("Sélectionnez un fichier."); return; }

  const resultEl = document.getElementById("delivery-result");
  resultEl.innerHTML = `<div class="info-box">⏳ Analyse par Claude AI en cours…</div>`;

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res = await api("/api/import/livraison", { method: "POST", body: fd });
    window._deliveryProducts = res.products;

    // Auto-remplir le fournisseur si détecté par le parser
    if (res.fournisseur) {
      const supField = document.getElementById("delivery-sup");
      if (supField && !supField.value.trim()) supField.value = res.fournisseur;
    }

    let html = `<div class="import-preview">
      <h4>📋 Produits détectés — vérifiez avant de valider</h4>
      <table style="width:100%;margin-bottom:12px">
        <thead><tr><th>Produit</th><th>Qté</th><th>Prix HT</th><th>N° Facture</th></tr></thead>
        <tbody>
          ${res.products.map((p, i) => `
            <tr>
              <td><input type="text" id="dp-name-${i}" value="${esc(p.nom||'')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
              <td><input type="number" id="dp-qty-${i}" value="${p.quantite||0}" step="0.01" style="width:70px;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
              <td><input type="number" id="dp-prix-${i}" value="${p.prix_unitaire_ht||''}" step="0.01" style="width:80px;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
              <td><input type="text" id="dp-facture-${i}" value="${esc(p.numero_facture||'')}" style="width:100px;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div class="form-row">
        <div class="form-group">
          <label>N° Facture (global si non détecté)</label>
          <input type="text" id="delivery-facture" value="${esc(res.products[0]?.numero_facture||'')}"/>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-success" onclick="confirmDelivery(${res.products.length})">✅ Valider et mettre à jour le stock</button>
      </div>
    </div>`;
    resultEl.innerHTML = html;
  } catch (e) {
    resultEl.innerHTML = `<div class="alert-card alert-high"><span class="alert-icon">❌</span><span class="alert-msg">${esc(e.message)}</span></div>`;
  }
}

async function confirmDelivery(count) {
  const products = [];
  for (let i = 0; i < count; i++) {
    products.push({
      nom:             document.getElementById(`dp-name-${i}`)?.value || "",
      quantite:        parseFloat(document.getElementById(`dp-qty-${i}`)?.value) || 0,
      prix_unitaire_ht:parseFloat(document.getElementById(`dp-prix-${i}`)?.value) || null,
      numero_facture:  document.getElementById(`dp-facture-${i}`)?.value || "",
    });
  }
  // Fallback unique si aucun numéro de facture saisi
  const rawFacture = document.getElementById("delivery-facture")?.value.trim()
    || products[0]?.numero_facture?.trim()
    || "";
  const numero_facture = rawFacture || `LIVRAISON-${new Date().toISOString().slice(0,16).replace("T","-")}`;
  const fournisseur    = document.getElementById("delivery-sup")?.value || "";

  // Zone d'erreur séparée (ne pas écraser le formulaire avec innerHTML +=)
  let errDiv = document.getElementById("delivery-error");
  if (!errDiv) {
    errDiv = document.createElement("div");
    errDiv.id = "delivery-error";
    errDiv.style.marginTop = "12px";
    document.getElementById("delivery-result").after(errDiv);
  }
  errDiv.innerHTML = "";

  try {
    const res = await api("/api/import/livraison/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products, numero_facture, fournisseur }),
    });
    const isAvoir = res.is_avoir;
    const titre = isAvoir
      ? `↩️ Avoir / retour fournisseur enregistré — réf. ${esc(numero_facture)}`
      : `✅ Livraison confirmée — réf. ${esc(numero_facture)}`;
    let html = `<div class="import-preview" style="${isAvoir ? 'background:#FEF9EC;border-color:#F5C07A' : ''}">
      <h4>${titre}</h4>`;
    if (!res.updated?.length) {
      html += `<div style="color:var(--text-muted);font-size:13px">Aucun produit mis à jour (vérifiez les quantités).</div>`;
    } else {
      res.updated.forEach(u => {
        const sign = u.added > 0 ? "+" : "";
        html += `<div class="result-item"><span>${esc(u.product)}</span><span style="color:${u.added<0?'#DC2626':'var(--primary)'}">${sign}${u.added}</span></div>`;
      });
    }
    if (res.not_found?.length) html += `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">⚠️ Non trouvés : ${res.not_found.map(esc).join(", ")}</div>`;
    html += `</div>`;
    document.getElementById("delivery-result").innerHTML = html;
    errDiv.remove();
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch (e) {
    errDiv.innerHTML = `<div class="alert-card alert-high"><span class="alert-icon">❌</span><span class="alert-msg"><strong>Erreur :</strong> ${esc(e.message)}</span></div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: INVENTAIRE DU SOIR
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// VIEW: SORTIE RÉSERVE
// Le serveur note les bouteilles qu'il sort de la réserve
// → chaque sortie est immédiatement déduite du stock
// ══════════════════════════════════════════════════════════

let reserveProducts = [];
let reserveSearch = "";

async function renderInventory(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Sortie Réserve</span>
    </div>
    <div class="info-box">
      🏪 Le serveur note ici les bouteilles qu'il <strong>prend dans la réserve</strong> pour le service.<br>
      Saisissez la <strong>quantité sortie</strong> (ex : 2 bouteilles de Pago ananas prises → entrez 2).
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <div class="form-group" style="max-width:200px;margin:0">
        <label>Prénom du serveur</label>
        <input type="text" id="inv-staff" placeholder="ex: Jean"/>
      </div>
      <div class="form-group" style="flex:1;min-width:180px;margin:0">
        <label>Recherche rapide</label>
        <input type="text" id="reserve-search" placeholder="Pago, Coca, Ricard…"
               oninput="reserveSearch=this.value; renderReserveList()"/>
      </div>
    </div>
    <div id="reserve-list">Chargement…</div>
    <div style="margin-top:16px" id="reserve-submit-bar" class="hidden">
      <button class="btn btn-primary btn-lg" onclick="submitReserve()">
        📦 Valider les sorties
      </button>
      <span id="reserve-count-label" style="margin-left:12px;color:var(--text-muted);font-size:14px"></span>
    </div>
    <div id="reserve-result" style="margin-top:16px"></div>
    <div style="margin-top:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:14px">Sorties du jour</strong>
        <button class="btn btn-sm" onclick="loadSortiesToday()" style="font-size:12px">🔄 Rafraîchir</button>
      </div>
      <div id="sorties-today"></div>
    </div>`;
  loadReserveProducts();
  loadSortiesToday();
}

async function loadReserveProducts() {
  try {
    reserveProducts = await api("/api/inventaire/session");
    renderReserveList();
  } catch (e) {
    const c = document.getElementById("reserve-list");
    if (c) c.innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

function renderReserveList() {
  const container = document.getElementById("reserve-list");
  if (!container) return;

  const q = reserveSearch.toLowerCase().trim();
  const filtered = q
    ? reserveProducts.filter(p => p.name.toLowerCase().includes(q) || (p.category||"").toLowerCase().includes(q))
    : reserveProducts;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="info-box">Aucun produit trouvé.</div>`;
    return;
  }

  // Grouper par catégorie
  const byCat = {};
  filtered.forEach(p => {
    const cat = p.category || "Autres";
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(p);
  });

  let html = '';
  Object.entries(byCat).forEach(([cat, prods]) => {
    html += `<div class="inv-category-block">
      <div class="inv-category-header">${esc(cat)}</div>
      <div class="inv-rows">`;
    prods.forEach(p => {
      const stockAff = fmtStock(p);
      html += `<div class="inv-row" id="reserve-row-${p.id}">
        <div class="inv-name">
          <strong>${esc(p.name)}</strong>
          <div class="inv-theorique">En réserve : ${stockAff}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="reserve-qty-btn" onclick="reserveAdj(${p.id},-1)">−</button>
          <input type="number" class="inv-input reserve-qty" id="inv-${p.id}"
                 value="" placeholder="0" step="1" min="0"
                 oninput="updateReserveBar()"/>
          <button class="reserve-qty-btn" onclick="reserveAdj(${p.id},1)">+</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
  updateReserveBar();
}

function reserveAdj(id, delta) {
  const inp = document.getElementById(`inv-${id}`);
  if (!inp) return;
  const cur = parseFloat(inp.value) || 0;
  const next = Math.max(0, cur + delta);
  inp.value = next || "";
  // Highlight la ligne si > 0
  const row = document.getElementById(`reserve-row-${id}`);
  if (row) row.classList.toggle("inv-row-active", next > 0);
  updateReserveBar();
}

function updateReserveBar() {
  const inputs = document.querySelectorAll(".reserve-qty");
  let count = 0;
  inputs.forEach(inp => {
    const v = parseFloat(inp.value) || 0;
    const id = inp.id.replace("inv-", "");
    const row = document.getElementById(`reserve-row-${id}`);
    if (row) row.classList.toggle("inv-row-active", v > 0);
    if (v > 0) count++;
  });
  const bar = document.getElementById("reserve-submit-bar");
  const lbl = document.getElementById("reserve-count-label");
  if (bar) bar.classList.toggle("hidden", count === 0);
  if (lbl) lbl.textContent = count > 0 ? `${count} produit${count > 1 ? "s" : ""} à sortir` : "";
}

async function submitReserve() {
  const staff = document.getElementById("inv-staff")?.value || "";
  const sorties = reserveProducts
    .map(p => ({
      product_id: p.id,
      qty: parseFloat(document.getElementById(`inv-${p.id}`)?.value) || 0,
    }))
    .filter(s => s.qty > 0);

  if (sorties.length === 0) { alert("Aucune sortie saisie."); return; }

  try {
    const results = [];
    for (const s of sorties) {
      const prod = reserveProducts.find(p => p.id === s.product_id);
      const res = await api("/api/history/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: s.product_id,
          quantity: -s.qty,
          note: `Sortie réserve${staff ? " par " + staff : ""} : -${s.qty} ${prod?.unit || ""}`,
        }),
      });
      results.push({ history_id: res.history_id, name: prod?.name || "?", qty: s.qty, unit: prod?.unit || "", new_stock: res.new_stock });
    }

    // Affiche résumé avec bouton Annuler par ligne
    let html = `<div class="import-preview">
      <h4>📦 Sorties enregistrées (${results.length} produit${results.length > 1 ? 's' : ''})</h4>`;
    results.forEach(r => {
      html += `<div class="result-item" id="sortie-line-${r.history_id}">
        <span>${esc(r.name)} — <strong>−${r.qty} ${esc(r.unit)}</strong></span>
        <button class="btn btn-sm" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA"
          onclick="annulerSortie(${r.history_id}, '${esc(r.name)}', ${r.qty})">↩ Annuler</button>
      </div>`;
    });
    html += `</div>`;
    document.getElementById("reserve-result").innerHTML = html;

    // Réinitialiser les champs
    document.querySelectorAll(".reserve-qty").forEach(inp => { inp.value = ""; });
    document.querySelectorAll(".inv-row-active").forEach(r => r.classList.remove("inv-row-active"));
    updateReserveBar();
    allProducts = await api("/api/produits");
    updateAlertBadge();
    await loadReserveProducts();
    await loadSortiesToday();
  } catch (e) { alert(e.message); }
}

async function annulerSortie(historyId, nom, qty) {
  if (!confirm(`Annuler la sortie de ${qty} × ${nom} ?`)) return;
  try {
    await api(`/api/sorties/annuler/${historyId}`, { method: "POST" });
    const line = document.getElementById(`sortie-line-${historyId}`);
    if (line) {
      line.innerHTML = `<span style="color:var(--text-muted);text-decoration:line-through">${esc(nom)}</span>
        <span style="color:#16A34A;font-size:12px">✓ Annulée</span>`;
    }
    allProducts = await api("/api/produits");
    updateAlertBadge();
    await loadReserveProducts();
    await loadSortiesToday();
  } catch (e) { alert("Erreur : " + e.message); }
}

async function loadSortiesToday() {
  const staff = document.getElementById("inv-staff")?.value || "";
  const container = document.getElementById("sorties-today");
  if (!container) return;
  try {
    const sorties = await api(`/api/sorties/today?staff=${encodeURIComponent(staff)}`);
    if (sorties.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Aucune sortie aujourd'hui${staff ? " pour " + esc(staff) : ""}.</div>`;
      return;
    }
    let html = `<div class="import-preview" style="margin-top:0">
      <h4 style="margin-bottom:10px">🕐 Sorties du jour${staff ? " — " + esc(staff) : ""}</h4>`;
    sorties.forEach(s => {
      html += `<div class="result-item" id="sortie-line-${s.history_id}">
        <span style="font-size:13px"><strong>${esc(s.product)}</strong> — ${Math.abs(s.quantity)} sorti(s) à ${s.created_at}</span>
        <button class="btn btn-sm" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA"
          onclick="annulerSortie(${s.history_id}, '${esc(s.product)}', ${Math.abs(s.quantity)})">↩ Corriger</button>
      </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = "";
  }
}

// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// VIEW: STATISTIQUES
// ══════════════════════════════════════════════════════════
let _statsCharts = [];

async function renderStats(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">📊 Statistiques de consommation</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
      <span style="font-weight:600;font-size:14px">Vue :</span>
      <button class="btn btn-primary stats-view-btn" data-view="live" onclick="switchStatsView('live')">Temps réel</button>
      <button class="btn btn-outline stats-view-btn" data-view="historique" onclick="switchStatsView('historique')">📅 Saison 2025</button>
      <label class="btn btn-outline" style="cursor:pointer;position:relative;overflow:hidden">
        ⬆ Importer saison
        <input type="file" accept=".xlsx" style="position:absolute;opacity:0;width:100%;height:100%;top:0;left:0;cursor:pointer;font-size:0"
          onchange="importHistorique(this)"/>
      </label>
    </div>
    <div id="stats-import-msg" style="margin-bottom:12px"></div>

    <div id="stats-live">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <span style="font-weight:600;font-size:13px">Période :</span>
        ${[7,30,90,180].map(d => `<button class="btn btn-outline stats-period-btn" data-days="${d}" onclick="loadStats(${d})">${d===7?'7j':d===30?'30j':d===90?'3 mois':'Saison'}</button>`).join('')}
      </div>
    </div>
    <div id="stats-histo" class="hidden"></div>
    <div id="stats-loading" style="color:var(--text-muted);padding:20px 0">Chargement…</div>
    <div id="stats-content" class="hidden" style="margin-top:4px">
      <div class="stock-summary" style="margin-bottom:24px" id="stats-kpi"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px" id="stats-charts-row">
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:12px">Consommation par catégorie</div>
          <canvas id="chart-cat" height="220"></canvas>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:12px">Évolution journalière</div>
          <canvas id="chart-daily" height="220"></canvas>
        </div>
      </div>
      <div class="card" style="padding:16px;margin-bottom:24px">
        <div style="font-weight:600;margin-bottom:12px">🏆 Top produits consommés</div>
        <canvas id="chart-top" height="300"></canvas>
      </div>
      <div class="card" style="padding:16px">
        <div style="font-weight:600;margin-bottom:12px">Détail par produit</div>
        <div id="stats-table"></div>
      </div>
    </div>`;
  loadStats(30);
}

function switchStatsView(view) {
  document.querySelectorAll(".stats-view-btn").forEach(b => {
    b.classList.toggle("btn-primary", b.dataset.view === view);
    b.classList.toggle("btn-outline", b.dataset.view !== view);
  });
  document.getElementById("stats-live").classList.toggle("hidden", view !== "live");
  document.getElementById("stats-histo").classList.toggle("hidden", view !== "historique");
  document.getElementById("stats-content").classList.toggle("hidden", view !== "live");
  document.getElementById("stats-loading").classList.add("hidden");
  if (view === "historique") loadHistorique();
}

async function importHistorique(input) {
  const file = input.files[0];
  if (!file) return;
  const msg = document.getElementById("stats-import-msg");
  msg.innerHTML = `<div class="info-box">⏳ Import en cours…</div>`;
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await api("/api/stats/import-historique", { method: "POST", body: fd });
    msg.innerHTML = `<div class="info-box" style="background:#F0FDF4;border-color:#86EFAC">✅ ${res.imported} entrées importées (${res.mois} mois) depuis ${esc(res.source)}</div>`;
    loadHistorique();
    switchStatsView("historique");
  } catch(e) {
    msg.innerHTML = `<div class="info-box" style="background:#FEF2F2">❌ Erreur : ${esc(e.message)}</div>`;
  }
  input.value = "";
}

const MOIS_FR = {"01":"Jan","02":"Fév","03":"Mar","04":"Avr","05":"Mai","06":"Juin","07":"Juil","08":"Août","09":"Sept","10":"Oct","11":"Nov","12":"Déc"};
function fmtMois(m) { const [y,mo] = m.split("-"); return (MOIS_FR[mo]||mo)+" "+y; }

async function loadHistorique() {
  const container = document.getElementById("stats-histo");
  container.innerHTML = `<div style="color:var(--text-muted);padding:16px 0">Chargement…</div>`;
  try {
    const data = await api("/api/stats/historique");
    if (!data.monthly || !data.monthly.length) {
      container.innerHTML = `<div class="info-box">Aucune donnée historique. Cliquez sur "⬆ Importer saison" pour importer votre fichier Cashpad Synthèse.</div>`;
      return;
    }

    _statsCharts.forEach(c => c.destroy()); _statsCharts = [];
    const colors10 = ["#15803D","#16A34A","#4ADE80","#86EFAC","#FCD34D","#FB923C","#F87171","#A78BFA","#60A5FA","#34D399","#F472B6","#94A3B8"];

    container.innerHTML = `
    <!-- KPIs -->
    <div class="stock-summary" style="margin-bottom:24px">
      <div class="summary-card"><div class="s-label">Total vendu</div><div class="s-value">${data.total_qty.toLocaleString()}</div><div class="s-sub">unités saison</div></div>
      <div class="summary-card"><div class="s-label">CA total HT</div><div class="s-value">€${Math.round(data.total_ca).toLocaleString()}</div><div class="s-sub">hors taxes</div></div>
      <div class="summary-card"><div class="s-label">Mois record</div><div class="s-value">${fmtMois(data.peak_mois)}</div><div class="s-sub">${data.peak_qty.toLocaleString()} unités</div></div>
      <div class="summary-card"><div class="s-label">Références</div><div class="s-value">${data.nb_produits}</div><div class="s-sub">produits vendus</div></div>
    </div>

    <!-- Onglets internes -->
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      ${["Vue globale","🏆 Top 20 par catégorie","🔻 30 moins vendus","📊 Catégories"].map((t,i)=>
        `<button class="btn ${i===0?'btn-primary':'btn-outline'} histo-tab-btn" data-tab="${i}" onclick="switchHistoTab(${i})">${t}</button>`
      ).join("")}
    </div>

    <!-- Tab 0 : Vue globale -->
    <div id="histo-tab-0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:10px">📅 Ventes mensuelles</div>
          <canvas id="histo-monthly" height="200"></canvas>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:10px">CA par catégorie</div>
          <canvas id="histo-cat" height="200"></canvas>
        </div>
      </div>
      <div class="card" style="padding:16px">
        <div style="font-weight:600;margin-bottom:10px">🏆 Top 20 toutes catégories</div>
        <canvas id="histo-top20" height="360"></canvas>
      </div>
    </div>

    <!-- Tab 1 : Top 20 par catégorie -->
    <div id="histo-tab-1" class="hidden">
      <div id="histo-by-cat-content"></div>
    </div>

    <!-- Tab 2 : 30 moins vendus -->
    <div id="histo-tab-2" class="hidden">
      <div class="info-box" style="margin-bottom:12px">⚠️ Ces produits se vendent très peu — à revoir pour la prochaine saison (réduire les commandes ou retirer de la carte).</div>
      <div class="table-wrap"><table id="histo-bottom-table">
        <thead><tr><th>Rang</th><th>Produit</th><th>Catégorie</th><th>Qté vendue</th><th>CA HT</th></tr></thead>
        <tbody></tbody>
      </table></div>
    </div>

    <!-- Tab 3 : Catégories -->
    <div id="histo-tab-3" class="hidden">
      <div class="table-wrap"><table>
        <thead><tr><th>Catégorie</th><th>Qté vendue</th><th>CA HT</th><th>% du total</th></tr></thead>
        <tbody>${data.by_category.map(c=>`<tr>
          <td><strong>${esc(c.category)}</strong></td>
          <td>${c.qty.toLocaleString()}</td>
          <td>€${c.ca.toLocaleString()}</td>
          <td><div style="display:flex;align-items:center;gap:6px">
            <div style="background:#E5E7EB;border-radius:4px;height:8px;width:80px">
              <div style="background:#15803D;border-radius:4px;height:8px;width:${Math.round(c.qty/data.total_qty*80)}px"></div>
            </div>
            ${(c.qty/data.total_qty*100).toFixed(1)}%
          </div></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>`;

    // Graphique mensuel
    const mCtx = document.getElementById("histo-monthly").getContext("2d");
    _statsCharts.push(new Chart(mCtx, {
      type: "bar",
      data: {
        labels: data.monthly.map(m => fmtMois(m.mois)),
        datasets: [
          { label: "Unités", data: data.monthly.map(m => m.qty), backgroundColor: "#15803D", borderRadius: 4, yAxisID: "y" },
          { label: "CA HT €", data: data.monthly.map(m => m.ca), type: "line", borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.1)", yAxisID: "y1", tension: 0.3, fill: true },
        ]
      },
      options: { responsive: true,
        scales: { y: { beginAtZero: true, position: "left" }, y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } } },
        plugins: { legend: { labels: { font: { size: 11 } } } }
      }
    }));

    // Donut catégories
    const cCtx = document.getElementById("histo-cat").getContext("2d");
    _statsCharts.push(new Chart(cCtx, {
      type: "doughnut",
      data: { labels: data.by_category.map(c => c.category), datasets: [{ data: data.by_category.map(c => c.ca), backgroundColor: colors10, borderWidth: 2 }] },
      options: { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 10 } } } } }
    }));

    // Top 20 barres
    const tCtx = document.getElementById("histo-top20").getContext("2d");
    _statsCharts.push(new Chart(tCtx, {
      type: "bar",
      data: {
        labels: data.top_products.map(p => p.name),
        datasets: [{ label: "Qté", data: data.top_products.map(p => p.qty), backgroundColor: "#15803D", borderRadius: 4 }]
      },
      options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } } }
    }));

    // Tab 1 : par catégorie
    const catContainer = document.getElementById("histo-by-cat-content");
    let catHtml = "";
    const cats = Object.keys(data.by_cat_products).sort((a,b) => {
      const qa = data.by_cat_products[a].reduce((s,p)=>s+p.qty,0);
      const qb = data.by_cat_products[b].reduce((s,p)=>s+p.qty,0);
      return qb - qa;
    });
    cats.forEach(cat => {
      const prods = data.by_cat_products[cat];
      catHtml += `<div class="card" style="padding:16px;margin-bottom:14px">
        <div style="font-weight:700;font-size:15px;margin-bottom:10px;color:var(--primary)">${esc(cat)}</div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Produit</th><th>Qté vendue</th><th>CA HT</th><th>% total</th><th>Meilleur mois</th></tr></thead>
          <tbody>${prods.map((p,i) => {
            const bestMois = Object.entries(p.par_mois||{}).sort((a,b)=>b[1]-a[1])[0];
            return `<tr>
              <td><strong style="color:${i<3?'#15803D':'var(--text-muted)'}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</strong></td>
              <td><strong>${esc(p.name)}</strong></td>
              <td>${p.qty.toLocaleString()}</td>
              <td>€${p.ca.toLocaleString()}</td>
              <td><span style="background:#F0FDF4;color:#15803D;padding:2px 6px;border-radius:10px;font-size:11px">${p.pct}%</span></td>
              <td style="font-size:12px;color:var(--text-muted)">${bestMois ? fmtMois(bestMois[0])+" ("+bestMois[1]+")" : "—"}</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
      </div>`;
    });
    catContainer.innerHTML = catHtml || `<div class="info-box">Aucune donnée.</div>`;

    // Tab 2 : 30 moins vendus
    const bottomTbody = document.querySelector("#histo-bottom-table tbody");
    bottomTbody.innerHTML = data.bottom_products.map((p,i) => `<tr>
      <td style="color:var(--text-muted)">#${i+1}</td>
      <td>${esc(p.name)}</td>
      <td><span style="background:#F3F4F6;padding:2px 6px;border-radius:10px;font-size:11px">${esc(p.category)}</span></td>
      <td style="color:#DC2626;font-weight:600">${p.qty}</td>
      <td>€${p.ca}</td>
    </tr>`).join("");

  } catch(e) {
    container.innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

function switchHistoTab(tab) {
  document.querySelectorAll(".histo-tab-btn").forEach(b => {
    b.classList.toggle("btn-primary", parseInt(b.dataset.tab) === tab);
    b.classList.toggle("btn-outline", parseInt(b.dataset.tab) !== tab);
  });
  [0,1,2,3].forEach(i => {
    const el = document.getElementById(`histo-tab-${i}`);
    if (el) el.classList.toggle("hidden", i !== tab);
  });
}

async function loadStats(days) {
  // Met à jour le bouton actif
  document.querySelectorAll(".stats-period-btn").forEach(b => {
    b.classList.toggle("btn-primary", parseInt(b.dataset.days) === days);
    b.classList.toggle("btn-outline", parseInt(b.dataset.days) !== days);
  });

  document.getElementById("stats-loading").classList.remove("hidden");
  document.getElementById("stats-content").classList.add("hidden");

  // Détruit les anciens graphiques
  _statsCharts.forEach(c => c.destroy());
  _statsCharts = [];

  try {
    const data = await api(`/api/stats/consommation?periode=${days}`);
    document.getElementById("stats-loading").classList.add("hidden");
    document.getElementById("stats-content").classList.remove("hidden");

    // KPI
    document.getElementById("stats-kpi").innerHTML = `
      <div class="summary-card">
        <div class="s-label">Mouvements totaux</div>
        <div class="s-value">${data.total.toFixed(0)}</div>
        <div class="s-sub">unités consommées</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Produits actifs</div>
        <div class="s-value">${data.top_products.length}</div>
        <div class="s-sub">sur ${days} jours</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Catégories</div>
        <div class="s-value">${data.by_category.length}</div>
        <div class="s-sub">concernées</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Moy. / jour</div>
        <div class="s-value">${(data.total / days).toFixed(1)}</div>
        <div class="s-sub">unités</div>
      </div>`;

    // Graphique catégories (donut)
    const catCtx = document.getElementById("chart-cat").getContext("2d");
    const colors = ["#15803D","#16A34A","#4ADE80","#86EFAC","#BBF7D0","#DCFCE7","#FCD34D","#FB923C","#F87171","#A78BFA"];
    _statsCharts.push(new Chart(catCtx, {
      type: "doughnut",
      data: {
        labels: data.by_category.map(c => c.category),
        datasets: [{ data: data.by_category.map(c => c.qty), backgroundColor: colors, borderWidth: 2 }]
      },
      options: { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } } }
    }));

    // Graphique journalier (ligne)
    const dailyCtx = document.getElementById("chart-daily").getContext("2d");
    _statsCharts.push(new Chart(dailyCtx, {
      type: "line",
      data: {
        labels: data.daily.map(d => d.date.slice(5)),  // MM-DD
        datasets: [{
          label: "Unités", data: data.daily.map(d => d.qty),
          borderColor: "#15803D", backgroundColor: "rgba(21,128,61,0.08)",
          fill: true, tension: 0.3, pointRadius: 2,
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { ticks: { font: { size: 10 }, maxTicksLimit: 10 } }, y: { beginAtZero: true } } }
    }));

    // Top produits (barres horizontales)
    const top15 = data.top_products.slice(0, 15);
    const topCtx = document.getElementById("chart-top").getContext("2d");
    _statsCharts.push(new Chart(topCtx, {
      type: "bar",
      data: {
        labels: top15.map(p => p.name),
        datasets: [{ label: "Quantité", data: top15.map(p => p.qty), backgroundColor: "#15803D", borderRadius: 4 }]
      },
      options: {
        indexAxis: "y", responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } }
      }
    }));

    // Tableau détail
    let thtml = `<div class="table-wrap"><table><thead><tr>
      <th>Produit</th><th>Catégorie</th><th>Quantité consommée</th>
    </tr></thead><tbody>`;
    data.top_products.forEach(p => {
      thtml += `<tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${esc(p.category)}</td>
        <td>${p.qty}</td>
      </tr>`;
    });
    thtml += `</tbody></table></div>`;
    document.getElementById("stats-table").innerHTML = thtml;

  } catch(e) {
    document.getElementById("stats-loading").textContent = "Erreur : " + e.message;
  }
}

// VIEW: HISTORIQUE
// ══════════════════════════════════════════════════════════
async function renderHistory(el) {
  el.innerHTML = `<div class="section-header"><span class="section-title">Historique</span></div><div id="history-body">Chargement…</div>`;
  try {
    const events = await api("/api/historique");
    const body = document.getElementById("history-body");
    if (events.length === 0) {
      body.innerHTML = `<div class="info-box">Aucun événement enregistré.</div>`;
      return;
    }
    body.innerHTML = `<div class="history-list">${events.map(e => {
      const dotCls = ["import_cashpad","livraison","inventaire_soir","mouvement_manuel","alerte_inventaire"].includes(e.event_type) ? e.event_type : "default";
      return `<div class="history-item">
        <div class="history-dot ${dotCls}"></div>
        <div class="history-body">
          <div class="history-desc">${esc(e.description)}</div>
          <div class="history-date">${formatDate(e.created_at)}</div>
          <details class="history-details">
            <summary>Détails</summary>
            <pre>${esc(JSON.stringify(e.data, null, 2))}</pre>
          </details>
        </div>
      </div>`;
    }).join("")}</div>`;
  } catch (e) {
    document.getElementById("history-body").innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: FOURNISSEURS
// ══════════════════════════════════════════════════════════
function renderSuppliers(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Fournisseurs</span>
      <button class="btn btn-primary" onclick="openSupplierForm(null)">+ Nouveau fournisseur</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nom</th><th>Contact</th><th>Téléphone</th><th>Email</th><th>Catégories</th><th></th></tr></thead>
        <tbody>
          ${allSuppliers.map(s => `
            <tr>
              <td><strong>${esc(s.name)}</strong></td>
              <td>${esc(s.contact||"—")}</td>
              <td>${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : "—"}</td>
              <td>${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : "<span style='color:var(--text-faint)'>—</span>"}</td>
              <td>${esc(s.categories||"—")}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" onclick="openSupplierForm(${s.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSupplier(${s.id},'${esc(s.name)}')">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function openSupplierForm(id) {
  const s = id ? allSuppliers.find(x => x.id === id) : null;
  openModal(`
    <h3 style="margin-bottom:16px">${s ? "Modifier fournisseur" : "Nouveau fournisseur"}</h3>
    <form id="supplier-form" onsubmit="submitSupplierForm(event,${id||'null'})">
      <div class="form-group"><label>Nom *</label><input type="text" name="name" required value="${s ? esc(s.name) : ''}"/></div>
      <div class="form-row">
        <div class="form-group"><label>Contact</label><input type="text" name="contact" value="${s ? esc(s.contact||'') : ''}"/></div>
        <div class="form-group"><label>Téléphone</label><input type="text" name="phone" value="${s ? esc(s.phone||'') : ''}"/></div>
      </div>
      <div class="form-group"><label>Email commandes ✉</label><input type="email" name="email" placeholder="commandes@fournisseur.fr" value="${s ? esc(s.email||'') : ''}"/></div>
      <div class="form-group"><label>Catégories</label><input type="text" name="categories" value="${s ? esc(s.categories||'') : ''}"/></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
}

async function submitSupplierForm(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { name: fd.get("name"), contact: fd.get("contact"), phone: fd.get("phone"), email: fd.get("email")||"", categories: fd.get("categories") };
  try {
    if (id) {
      await api(`/api/fournisseurs/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      await api("/api/fournisseurs", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    }
    closeModal();
    allSuppliers = await api("/api/fournisseurs");
    renderSuppliers(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

async function deleteSupplier(id, name) {
  if (!confirm(`Supprimer "${name}" ?`)) return;
  try {
    await api(`/api/fournisseurs/${id}`, { method: "DELETE" });
    allSuppliers = await api("/api/fournisseurs");
    renderSuppliers(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════
// VIEW: MAPPING CASHPAD
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// VIEW: COMMANDES FOURNISSEURS
// ══════════════════════════════════════════════════════════════════════════

let _ordersData = [];
let _orderFormSupplier = null;
let _orderFormData = null;  // draft en cours d'édition
let _orderEditId = null;

async function renderOrders(el) {
  el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Chargement…</div>`;
  try {
    const [orders, suppliers, serviceAlerts] = await Promise.all([
      api("/api/orders"),
      api("/api/suppliers"),
      api("/api/service-alerts?status=open").catch(() => []),
    ]);
    _ordersData = orders;
    el.innerHTML = _buildOrdersListHTML(orders, suppliers, serviceAlerts);
  } catch(e) {
    el.innerHTML = `<div style="padding:40px;color:#DC2626">Erreur : ${e.message}</div>`;
  }
}

function _buildOrdersListHTML(orders, suppliers, serviceAlerts = []) {
  const statusLabel = { draft: "Brouillon", sent: "Envoyée", partial: "Partielle", received: "Reçue" };
  const statusIcon  = { draft: "📝", sent: "📤", partial: "📦", received: "✅" };
  const statusClass = { draft: "ord-draft", sent: "ord-sent", partial: "ord-partial", received: "ord-received" };

  // KPIs
  const drafts   = orders.filter(o => o.status === "draft").length;
  const sent     = orders.filter(o => o.status === "sent").length;
  const received = orders.filter(o => o.status === "received").length;

  // Dernières commandes par fournisseur
  const lastBySupp = {};
  orders.forEach(o => {
    if (!lastBySupp[o.supplier_id] || o.id > lastBySupp[o.supplier_id].id)
      lastBySupp[o.supplier_id] = o;
  });

  const suppCards = suppliers.map(s => {
    const last = lastBySupp[s.id];
    const lastStr = last
      ? `${statusIcon[last.status]} ${last.reference} — ${last.created_at}`
      : `<span style="color:var(--text-faint)">Aucune commande</span>`;
    const emailWarn = !s.email
      ? `<span class="ord-email-warn" title="Ajoutez l'email dans Fournisseurs">⚠️ Email manquant</span>`
      : `<span class="ord-email-ok">✉ ${s.email}</span>`;
    return `
    <div class="ord-supplier-card">
      <div class="ord-supplier-header">
        <div>
          <div class="ord-supplier-name">${s.name}</div>
          <div class="ord-supplier-meta">${emailWarn}</div>
        </div>
        <button class="btn btn-primary ord-new-btn" onclick="openOrderForm(${s.id}, '${s.name.replace(/'/g,"\\'")}')">
          + Commander
        </button>
      </div>
      <div class="ord-supplier-last">Dernière : ${lastStr}</div>
    </div>`;
  }).join("");

  const orderRows = orders.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Aucune commande pour l'instant</td></tr>`
    : orders.map(o => `
    <tr class="ord-row" onclick="openOrderDetail(${o.id})">
      <td><span class="ord-ref">${o.reference}</span></td>
      <td>${o.supplier_name}</td>
      <td>${o.created_at}</td>
      <td><span class="ord-badge ${statusClass[o.status]}">${statusIcon[o.status]} ${statusLabel[o.status]}</span></td>
      <td style="text-align:right">${o.total_ht > 0 ? `€${o.total_ht.toFixed(2)}` : "—"}</td>
      <td style="text-align:right">${o.items_count} ligne${o.items_count > 1 ? "s" : ""}</td>
    </tr>`).join("");

  return `
  <div class="section-header">
    <span class="section-title">🛒 Commandes Fournisseurs</span>
  </div>

  <!-- KPIs -->
  <div class="stock-summary" style="margin-bottom:24px">
    <div class="summary-card ord-kpi-draft" style="--card-icon:'📝'">
      <div class="s-label">Brouillons</div>
      <div class="s-value">${drafts}</div>
      <div class="s-sub">En préparation</div>
    </div>
    <div class="summary-card ord-kpi-sent" style="--card-icon:'📤'">
      <div class="s-label">Envoyées</div>
      <div class="s-value">${sent}</div>
      <div class="s-sub">En attente livraison</div>
    </div>
    <div class="summary-card ord-kpi-received" style="--card-icon:'✅'">
      <div class="s-label">Reçues</div>
      <div class="s-value">${received}</div>
      <div class="s-sub">Traitées</div>
    </div>
  </div>

  <!-- Alertes service -->
  ${serviceAlerts.length > 0 ? `
  <div class="ord-section-title" style="color:#e74c3c">🚨 Signalements du service (${serviceAlerts.length})</div>
  <div class="ord-alerts-grid">
    ${serviceAlerts.map(a => `
      <div class="ord-alert-card ${a.is_rupture ? 'ord-alert-rupture' : 'ord-alert-low'}">
        <div class="ord-alert-top">
          <div>
            <strong>${esc(a.product_name)}</strong>
            ${a.is_rupture ? '<span class="sa-badge-rupture">RUPTURE</span>' : `<small style="color:#f39c12;font-weight:600">${a.reported_stock} restant</small>`}
          </div>
          <small style="color:var(--text-muted)">${esc(a.created_at)} — ${esc(a.staff_name)}</small>
        </div>
        ${a.notes ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic;margin:4px 0">📝 ${esc(a.notes)}</div>` : ""}
        <div class="ord-alert-actions">
          ${a.supplier_name ? `<button class="btn btn-sm btn-primary" onclick="ordCreateFromAlert(${a.id}, ${a.product_id}, '${esc(a.supplier_name).replace(/'/g,"\\'")}')">Commander chez ${esc(a.supplier_name)}</button>` : ""}
          <button class="btn btn-sm btn-outline" onclick="ordAckAlert(${a.id})">✓ Vu</button>
        </div>
      </div>
    `).join("")}
  </div>` : ""}

  <!-- Cartes fournisseurs -->
  <div class="ord-section-title">Commander par fournisseur</div>
  <div class="ord-supplier-grid">${suppCards}</div>

  <!-- Historique -->
  <div class="ord-section-title" style="margin-top:28px">Historique des commandes</div>
  <div class="table-wrap">
    <table class="kpi-table" style="cursor:pointer">
      <thead><tr>
        <th>Référence</th><th>Fournisseur</th><th>Date</th>
        <th>Statut</th><th style="text-align:right">Total HT</th><th style="text-align:right">Lignes</th>
      </tr></thead>
      <tbody id="orders-tbody">${orderRows}</tbody>
    </table>
  </div>`;
}

async function ordAckAlert(alertId) {
  try {
    await api(`/api/service-alerts/${alertId}`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({}) });
    showToast("Alerte marquée comme vue");
    renderOrders(document.getElementById("app"));
  } catch(e) { showToast("Erreur : " + e.message); }
}

async function ordCreateFromAlert(alertId, productId, supplierName) {
  // Find the supplier
  const suppliers = allSuppliers.length ? allSuppliers : await api("/api/suppliers");
  const supp = suppliers.find(s => s.name === supplierName);
  if (supp) {
    await api(`/api/service-alerts/${alertId}`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({}) });
    openOrderForm(supp.id, supp.name);
  } else {
    showToast("Fournisseur introuvable — créez la commande manuellement");
  }
}

async function openOrderForm(supplierId, suppName) {
  _orderFormSupplier = { id: supplierId, name: suppName };
  _orderEditId = null;

  const app = document.getElementById("app");
  app.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Chargement des produits…</div>`;

  try {
    const suggestions = await api(`/api/orders/suggestions/${supplierId}`);
    _orderFormData = suggestions.map(s => ({ ...s, qty_input: s.suggested_qty || 0 }));
    _renderOrderForm(app);
  } catch(e) {
    app.innerHTML = `<div style="padding:40px;color:#DC2626">Erreur : ${e.message}</div>`;
  }
}

async function openOrderEdit(orderId) {
  _orderEditId = orderId;
  const app = document.getElementById("app");
  app.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Chargement…</div>`;
  try {
    const order = await api(`/api/orders/${orderId}`);
    const suggestions = await api(`/api/orders/suggestions/${order.supplier_id}`);
    _orderFormSupplier = { id: order.supplier_id, name: order.supplier_name };
    // Merge: utiliser les qtés de la commande existante
    const qtyMap = {};
    order.items.forEach(it => { if (it.product_id) qtyMap[it.product_id] = it.qty_ordered; });
    _orderFormData = suggestions.map(s => ({
      ...s,
      qty_input: qtyMap[s.product_id] ?? 0,
    }));
    _renderOrderForm(app, order.notes);
  } catch(e) {
    app.innerHTML = `<div style="padding:40px;color:#DC2626">Erreur : ${e.message}</div>`;
  }
}

function _renderOrderForm(el, existingNotes) {
  const rows = (_orderFormData || []).map((p, i) => {
    const stockIcon = p.stock_status === "rupture" ? "🔴" : p.stock_status === "low" ? "🟠" : "🟢";
    const stockVal = p.stock % 1 < 0.05 ? Math.round(p.stock) : parseFloat(p.stock.toFixed(1));
    const hasQty = p.qty_input > 0;
    const prix = p.unit_price_ht != null ? p.unit_price_ht.toFixed(4) : "";
    const lineTotal = (p.qty_input > 0 && p.unit_price_ht) ? `€${(p.qty_input * p.unit_price_ht).toFixed(2)}` : "—";
    return `
    <tr class="ord-form-row ${hasQty ? 'ord-row-active' : ''}" id="ord-row-${i}">
      <td>
        <div class="ord-prod-name">${stockIcon} ${p.product_name}</div>
        <div class="ord-prod-cat">${p.category}</div>
      </td>
      <td class="ord-stock-cell ${p.stock_status === 'rupture' ? 'ord-stock-rupture' : p.stock_status === 'low' ? 'ord-stock-low' : ''}">
        ${stockVal}
        <div style="font-size:10px;color:var(--text-faint)">seuil: ${p.alert_threshold}</div>
      </td>
      <td style="text-align:center">
        ${p.suggested_qty > 0 ? `<span class="ord-suggestion">${p.suggested_qty}</span>` : `<span style="color:var(--text-faint)">—</span>`}
      </td>
      <td>
        <input type="number" class="ord-qty-input" min="0" step="1"
          value="${p.qty_input || ''}" placeholder="0"
          data-idx="${i}"
          oninput="updateOrderRow(${i}, this.value)"
          onclick="this.select()"/>
      </td>
      <td>
        <input type="number" class="ord-price-input" min="0" step="0.0001"
          value="${prix}" placeholder="prix HT"
          data-idx="${i}"
          oninput="updateOrderPrice(${i}, this.value)"/>
      </td>
      <td class="ord-line-total" id="ord-lt-${i}">${lineTotal}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
  <div class="ord-form-container">
    <div class="ord-form-topbar">
      <button class="btn btn-outline" onclick="renderOrders(document.getElementById('app'))">← Retour</button>
      <div class="ord-form-title">
        Commande — <strong>${_orderFormSupplier.name}</strong>
        ${_orderEditId ? `<span class="ord-edit-badge">Modification</span>` : `<span class="ord-new-badge">Nouveau</span>`}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline" onclick="autoFillSuggestions()">💡 Auto-remplir</button>
        <button class="btn btn-outline" onclick="clearOrderForm()">🗑 Vider</button>
      </div>
    </div>

    <div class="ord-form-notes-row">
      <input type="text" id="ord-notes" class="ord-notes-input" placeholder="Notes / instructions pour le fournisseur…" value="${existingNotes || ''}"/>
    </div>

    <div class="table-wrap ord-form-table-wrap">
      <table class="ord-form-table">
        <thead>
          <tr>
            <th>Produit</th>
            <th style="text-align:right">Stock actuel</th>
            <th style="text-align:center">Suggéré 💡</th>
            <th style="text-align:center">Qté à commander</th>
            <th>Prix unit. HT</th>
            <th style="text-align:right">Total ligne</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="ord-form-footer">
      <div class="ord-total-block">
        <div class="ord-total-label">Total estimé HT</div>
        <div class="ord-total-val" id="ord-grand-total">—</div>
        <div class="ord-total-sub" id="ord-lines-count">0 ligne(s)</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-outline ord-save-btn" onclick="saveOrderDraft()">💾 Enregistrer brouillon</button>
        <button class="btn btn-primary ord-send-btn" onclick="previewAndSendOrder()">📧 Aperçu &amp; Envoyer</button>
      </div>
    </div>
  </div>`;

  recalcOrderTotal();
}

function updateOrderRow(idx, val) {
  if (_orderFormData[idx]) {
    _orderFormData[idx].qty_input = parseFloat(val) || 0;
    const row = document.getElementById(`ord-row-${idx}`);
    if (row) row.classList.toggle("ord-row-active", _orderFormData[idx].qty_input > 0);
    // Recalc line total
    const lt = document.getElementById(`ord-lt-${idx}`);
    if (lt) {
      const qty = _orderFormData[idx].qty_input;
      const prix = _orderFormData[idx].unit_price_ht;
      lt.textContent = (qty > 0 && prix) ? `€${(qty * prix).toFixed(2)}` : "—";
    }
    recalcOrderTotal();
  }
}

function updateOrderPrice(idx, val) {
  if (_orderFormData[idx]) {
    _orderFormData[idx].unit_price_ht = parseFloat(val) || null;
    const qty = _orderFormData[idx].qty_input;
    const prix = _orderFormData[idx].unit_price_ht;
    const lt = document.getElementById(`ord-lt-${idx}`);
    if (lt) lt.textContent = (qty > 0 && prix) ? `€${(qty * prix).toFixed(2)}` : "—";
    recalcOrderTotal();
  }
}

function recalcOrderTotal() {
  const items = (_orderFormData || []).filter(p => p.qty_input > 0);
  const total = items.reduce((s, p) => s + (p.qty_input * (p.unit_price_ht || 0)), 0);
  const el = document.getElementById("ord-grand-total");
  const lc = document.getElementById("ord-lines-count");
  if (el) el.textContent = total > 0 ? `€${total.toFixed(2)}` : "—";
  if (lc) lc.textContent = `${items.length} ligne${items.length > 1 ? "s" : ""}`;
}

function autoFillSuggestions() {
  (_orderFormData || []).forEach((p, i) => {
    if (p.suggested_qty > 0 && p.qty_input === 0) {
      p.qty_input = p.suggested_qty;
      const input = document.querySelector(`input.ord-qty-input[data-idx="${i}"]`);
      if (input) { input.value = p.suggested_qty; }
      const row = document.getElementById(`ord-row-${i}`);
      if (row) row.classList.add("ord-row-active");
      const lt = document.getElementById(`ord-lt-${i}`);
      if (lt) {
        const prix = p.unit_price_ht;
        lt.textContent = prix ? `€${(p.suggested_qty * prix).toFixed(2)}` : "—";
      }
    }
  });
  recalcOrderTotal();
}

function clearOrderForm() {
  (_orderFormData || []).forEach((p, i) => {
    p.qty_input = 0;
    const input = document.querySelector(`input.ord-qty-input[data-idx="${i}"]`);
    if (input) input.value = "";
    const row = document.getElementById(`ord-row-${i}`);
    if (row) row.classList.remove("ord-row-active");
    const lt = document.getElementById(`ord-lt-${i}`);
    if (lt) lt.textContent = "—";
  });
  recalcOrderTotal();
}

function _buildOrderPayload() {
  const notes = document.getElementById("ord-notes")?.value || "";
  const items = (_orderFormData || [])
    .filter(p => p.qty_input > 0)
    .map(p => ({
      product_id: p.product_id,
      product_name: p.product_name,
      qty_ordered: p.qty_input,
      unit_price_ht: p.unit_price_ht || null,
    }));
  return { supplier_id: _orderFormSupplier.id, notes, items };
}

async function saveOrderDraft() {
  const payload = _buildOrderPayload();
  if (payload.items.length === 0) {
    alert("Aucune quantité saisie.");
    return;
  }
  try {
    let order;
    if (_orderEditId) {
      order = await api(`/api/orders/${_orderEditId}`, {
        method: "PUT", headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
    } else {
      order = await api("/api/orders", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      _orderEditId = order.id;
    }
    showToast(`✅ Brouillon enregistré — ${order.reference}`);
    renderOrders(document.getElementById("app"));
  } catch(e) {
    alert("Erreur : " + e.message);
  }
}

async function previewAndSendOrder() {
  const payload = _buildOrderPayload();
  if (payload.items.length === 0) { alert("Aucune quantité saisie."); return; }

  // Sauvegarder d'abord
  let order;
  try {
    if (_orderEditId) {
      order = await api(`/api/orders/${_orderEditId}`, {
        method: "PUT", headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
    } else {
      order = await api("/api/orders", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      _orderEditId = order.id;
    }
  } catch(e) { alert("Erreur sauvegarde : " + e.message); return; }

  // Aperçu email
  const total = order.items.reduce((s,it) => s + (it.qty_ordered * (it.unit_price_ht||0)), 0);
  const itemsHtml = order.items.map(it => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${it.product_name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${it.qty_ordered}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${it.unit_price_ht ? `€${it.unit_price_ht.toFixed(4)}` : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${it.line_total != null ? `€${it.line_total.toFixed(2)}` : "—"}</td>
    </tr>`).join("");

  const emailAddr = order.supplier_email || "(email non renseigné)";

  openModal(`
    <div class="kpi-modal-header kpi-blue" style="display:flex;justify-content:space-between;align-items:center">
      <span>📧 Aperçu de la commande</span>
      <span style="font-size:13px;font-weight:500">${order.reference}</span>
    </div>
    <div style="margin:14px 0 6px;font-size:13px">
      <strong>Destinataire :</strong>
      <span style="${!order.supplier_email ? 'color:#DC2626' : 'color:#15803D'}">${emailAddr}</span>
    </div>
    ${!order.supplier_email ? `<div class="kpi-alert-bar">⚠️ Ajoutez l'email du fournisseur dans l'onglet Fournisseurs avant d'envoyer.</div>` : ''}
    <div class="ord-email-preview">
      <div class="ord-email-header">Marina di Lava — Bon de Commande</div>
      <p><strong>Réf :</strong> ${order.reference} &nbsp;|&nbsp; <strong>Fournisseur :</strong> ${order.supplier_name}</p>
      ${order.notes ? `<p style="font-style:italic">${order.notes}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
        <thead><tr style="background:#f9fafb">
          <th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:2px solid #e5e7eb">Produit</th>
          <th style="padding:6px 10px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:2px solid #e5e7eb">Qté</th>
          <th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:2px solid #e5e7eb">Prix unit. HT</th>
          <th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:2px solid #e5e7eb">Total HT</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      ${total > 0 ? `<p style="text-align:right;font-weight:700;margin-top:8px">Total estimé HT : €${total.toFixed(2)}</p>` : ''}
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      <button class="btn btn-outline" onclick="copyOrderMailto(${order.id})">✉ Ouvrir dans Mail</button>
      ${order.supplier_email
        ? `<button class="btn btn-primary" onclick="sendOrderNow(${order.id})">📤 Envoyer automatiquement</button>`
        : ``
      }
    </div>
  `);
}

async function sendOrderNow(orderId) {
  try {
    const res = await api(`/api/orders/${orderId}/send-email`, { method: "POST" });
    if (res.no_smtp) {
      // Pas de config SMTP → fallback mailto
      _openMailto(res.to, res.subject, orderId);
    } else {
      closeModal();
      showToast("✅ Commande envoyée par email !");
      renderOrders(document.getElementById("app"));
    }
  } catch(e) {
    alert("Erreur envoi : " + e.message);
  }
}

async function copyOrderMailto(orderId) {
  try {
    const res = await api(`/api/orders/${orderId}/send-email`, { method: "POST" });
    _openMailto(res.to || "", res.subject || "", orderId);
  } catch(e) { alert("Erreur : " + e.message); }
}

function _openMailto(to, subject, orderId) {
  closeModal();
  // Marquer comme envoyée manuellement
  api(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ status: "sent" })
  }).then(() => renderOrders(document.getElementById("app")));
  const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}`;
  window.open(mailto, "_blank");
  showToast("✉ Email ouvert dans votre client mail");
}

async function openOrderDetail(orderId) {
  const app = document.getElementById("app");
  app.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Chargement…</div>`;
  const order = await api(`/api/orders/${orderId}`);

  const statusLabel = { draft: "Brouillon", sent: "Envoyée", partial: "Partielle", received: "Reçue" };
  const statusIcon  = { draft: "📝", sent: "📤", partial: "📦", received: "✅" };
  const statusClass = { draft: "ord-draft", sent: "ord-sent", partial: "ord-partial", received: "ord-received" };

  const total = order.items.reduce((s,it) => s + (it.qty_ordered * (it.unit_price_ht||0)), 0);

  const itemRows = order.items.map(it => `
    <tr>
      <td>${it.product_name}</td>
      <td style="text-align:center;font-weight:700">${it.qty_ordered}</td>
      <td style="text-align:right">${it.unit_price_ht ? `€${it.unit_price_ht.toFixed(4)}` : "—"}</td>
      <td style="text-align:right">${it.line_total != null ? `€${it.line_total.toFixed(2)}` : "—"}</td>
      <td style="text-align:right;font-size:12px;color:var(--text-muted)">${it.current_stock != null ? it.current_stock : "—"}</td>
    </tr>`).join("");

  const canEdit = order.status === "draft";

  app.innerHTML = `
  <div class="ord-form-container">
    <div class="ord-form-topbar">
      <button class="btn btn-outline" onclick="renderOrders(document.getElementById('app'))">← Retour</button>
      <div class="ord-form-title">
        ${order.reference}
        <span class="ord-badge ${statusClass[order.status]}">${statusIcon[order.status]} ${statusLabel[order.status]}</span>
      </div>
      <div style="display:flex;gap:8px">
        ${canEdit ? `<button class="btn btn-outline" onclick="openOrderEdit(${order.id})">✏️ Modifier</button>` : ''}
        ${order.status !== 'received' ? `
          <select class="ord-status-select" onchange="changeOrderStatus(${order.id}, this.value)">
            <option value="">Changer statut…</option>
            ${order.status !== 'sent' ? `<option value="sent">📤 Marquer envoyée</option>` : ''}
            ${order.status !== 'partial' ? `<option value="partial">📦 Partielle</option>` : ''}
            <option value="received">✅ Marquer reçue</option>
          </select>` : ''}
        ${canEdit ? `<button class="btn" style="background:#FEE2E2;color:#DC2626;border-color:#FECACA" onclick="deleteOrder(${order.id})">🗑 Supprimer</button>` : ''}
      </div>
    </div>

    <div class="ord-detail-meta">
      <div class="ord-meta-item"><span>Fournisseur</span><strong>${order.supplier_name}</strong></div>
      <div class="ord-meta-item"><span>Créée le</span><strong>${order.created_at}</strong></div>
      ${order.sent_at ? `<div class="ord-meta-item"><span>Envoyée le</span><strong>${order.sent_at}</strong></div>` : ''}
      ${order.received_at ? `<div class="ord-meta-item"><span>Reçue le</span><strong>${order.received_at}</strong></div>` : ''}
      ${order.notes ? `<div class="ord-meta-item" style="grid-column:1/-1"><span>Notes</span><strong>${order.notes}</strong></div>` : ''}
    </div>

    <div class="table-wrap" style="margin-top:16px">
      <table class="kpi-table">
        <thead><tr>
          <th>Produit</th>
          <th style="text-align:center">Qté commandée</th>
          <th style="text-align:right">Prix unit. HT</th>
          <th style="text-align:right">Total ligne HT</th>
          <th style="text-align:right">Stock actuel</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    ${total > 0 ? `<div style="text-align:right;font-size:17px;font-weight:800;margin-top:12px;color:var(--accent)">Total HT : €${total.toFixed(2)}</div>` : ''}

    ${order.status === 'sent' ? `
    <div style="margin-top:20px;padding:16px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.3);border-radius:10px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;color:var(--text-muted)">Commande envoyée — en attente de livraison</span>
      <button class="btn btn-primary" onclick="changeOrderStatus(${order.id},'received')">✅ Marquer comme reçue</button>
    </div>` : ''}
  </div>`;
}

async function changeOrderStatus(orderId, status) {
  if (!status) return;
  await api(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ status })
  });
  openOrderDetail(orderId);
}

async function deleteOrder(orderId) {
  if (!confirm("Supprimer ce brouillon ?")) return;
  await api(`/api/orders/${orderId}`, { method: "DELETE" });
  renderOrders(document.getElementById("app"));
}

let allMappings = [];

async function renderMapping(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Mapping Cashpad</span>
      <button class="btn btn-primary" onclick="openMappingForm(null)">+ Nouveau mapping</button>
    </div>
    <div class="info-box">
      Associez les noms Cashpad aux produits ou recettes du stock. Les produits ignorés sont exclus des imports.
    </div>
    <div class="filters">
      <select id="mf-type" onchange="filterMapping()">
        <option value="">Tous les types</option>
        <option value="direct">Direct</option>
        <option value="cocktail">Cocktail</option>
        <option value="ignore">Ignorés</option>
      </select>
      <input type="text" id="mf-search" placeholder="Rechercher…" oninput="filterMapping()"/>
    </div>
    <div id="mapping-body">Chargement…</div>`;

  try {
    allMappings = await api("/api/cashpad_mapping");
    filterMapping();
  } catch (e) {
    document.getElementById("mapping-body").innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

function filterMapping() {
  const type   = document.getElementById("mf-type")?.value || "";
  const search = (document.getElementById("mf-search")?.value || "").toLowerCase();
  const body   = document.getElementById("mapping-body");
  if (!body) return;

  let rows = allMappings;
  if (type === "ignore") rows = rows.filter(m => m.ignore || m.ignored);
  else if (type === "direct")   rows = rows.filter(m => !(m.ignore || m.ignored) && m.mapping_type === "direct");
  else if (type === "cocktail") rows = rows.filter(m => !(m.ignore || m.ignored) && m.mapping_type === "cocktail");
  if (search) rows = rows.filter(m => m.nom_cashpad.toLowerCase().includes(search) ||
    (m.product_name || "").toLowerCase().includes(search) ||
    (m.cocktail_name || "").toLowerCase().includes(search));

  if (rows.length === 0) {
    body.innerHTML = `<div class="info-box">Aucun mapping trouvé.</div>`;
    return;
  }

  body.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Nom Cashpad</th><th>Type</th><th>Produit / Cocktail</th><th>Dose (cl)</th><th>Ignoré</th><th></th>
    </tr></thead>
    <tbody>
      ${rows.map(m => {
        const isIgnored = m.ignore || m.ignored;
        const linked = m.mapping_type === "cocktail"
          ? (m.cocktail_name ? `🍹 ${esc(m.cocktail_name)}` : "—")
          : (m.product_name ? `📦 ${esc(m.product_name)}` : "—");
        return `<tr style="${isIgnored ? 'opacity:0.5' : ''}">
          <td><strong>${esc(m.nom_cashpad)}</strong></td>
          <td><span class="marge-pill ${m.mapping_type === 'cocktail' ? 'marge-green' : 'marge-orange'}">${esc(m.mapping_type)}</span></td>
          <td>${linked}</td>
          <td>${m.dose_cl > 0 ? m.dose_cl + ' cl' : '—'}</td>
          <td>${isIgnored ? '✓' : ''}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-outline btn-sm" onclick="openMappingForm(${m.id})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteMapping(${m.id},'${esc(m.nom_cashpad)}')">🗑</button>
          </td>
        </tr>`;
      }).join("")}
    </tbody>
  </table></div>`;
}

function openMappingForm(id) {
  const m = id ? allMappings.find(x => x.id === id) : null;
  const title = m ? `Modifier mapping` : "Nouveau mapping";

  openModal(`
    <h3 style="margin-bottom:16px">${title}</h3>
    <form id="mapping-form" onsubmit="submitMappingForm(event,${id||'null'})">
      <div class="form-group">
        <label>Nom Cashpad *</label>
        <input type="text" id="m-nom" required value="${m ? esc(m.nom_cashpad) : ''}"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select id="m-type" onchange="toggleMappingTarget()">
            <option value="direct" ${!m || m.mapping_type==='direct' ? 'selected' : ''}>Direct (produit)</option>
            <option value="cocktail" ${m && m.mapping_type==='cocktail' ? 'selected' : ''}>Cocktail (recette)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Dose (cl)</label>
          <input type="number" id="m-dose" step="0.5" value="${m ? m.dose_cl : 0}"/>
        </div>
      </div>
      <div class="form-group" id="m-product-group">
        <label>Produit</label>
        <select id="m-product">
          <option value="">— Aucun —</option>
          ${allProducts.map(p => `<option value="${p.id}" ${m && m.product_id===p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group" id="m-cocktail-group" style="display:none">
        <label>Cocktail / Recette</label>
        <select id="m-cocktail">
          <option value="">— Aucun —</option>
          ${allCocktails.map(c => `<option value="${c.id}" ${m && m.cocktail_id===c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13px">
          <input type="checkbox" id="m-ignore" ${m && (m.ignore||m.ignored) ? 'checked' : ''}/>
          Ignorer lors des imports (boissons chaudes, sirops, etc.)
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);

  // Initialize visibility
  toggleMappingTarget();
}

function toggleMappingTarget() {
  const type = document.getElementById("m-type")?.value;
  const pg = document.getElementById("m-product-group");
  const cg = document.getElementById("m-cocktail-group");
  if (!pg || !cg) return;
  if (type === "cocktail") {
    pg.style.display = "none";
    cg.style.display = "";
  } else {
    pg.style.display = "";
    cg.style.display = "none";
  }
}

async function submitMappingForm(e, id) {
  e.preventDefault();
  const nom      = document.getElementById("m-nom").value.trim();
  const type     = document.getElementById("m-type").value;
  const dose     = parseFloat(document.getElementById("m-dose").value) || 0;
  const prodId   = document.getElementById("m-product")?.value;
  const cockId   = document.getElementById("m-cocktail")?.value;
  const ignored  = document.getElementById("m-ignore").checked;

  if (!nom) { alert("Nom Cashpad requis."); return; }

  const body = {
    nom_cashpad:  nom,
    mapping_type: type,
    dose_cl:      dose,
    product_id:   (type === "direct" && prodId) ? parseInt(prodId) : null,
    cocktail_id:  (type === "cocktail" && cockId) ? parseInt(cockId) : null,
    ignored,
  };

  try {
    if (id) {
      await api(`/api/cashpad_mapping/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      await api("/api/cashpad_mapping", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    }
    closeModal();
    allMappings = await api("/api/cashpad_mapping");
    filterMapping();
  } catch (e) { alert(e.message); }
}

async function deleteMapping(id, name) {
  if (!confirm(`Supprimer le mapping "${name}" ?`)) return;
  try {
    await api(`/api/cashpad_mapping/${id}`, { method: "DELETE" });
    allMappings = await api("/api/cashpad_mapping");
    filterMapping();
  } catch (e) { alert(e.message); }
}

// ── Utilities ──────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  const v = parseFloat(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, "");
}

// Affichage lisible du stock selon le type de produit
function fmtStock(p) {
  const stock = parseFloat(p.stock);
  const qty   = parseFloat(p.qty_per_pack || p.qte_conditionnement || 1);
  const vol   = parseFloat(p.volume_cl || 70);
  const unit  = p.unit || 'unité';

  if (isNaN(stock)) return "—";

  // Produits en carton → afficher uniquement les unités individuelles
  if (qty > 1) {
    const u = Math.abs(stock) % 1 < 0.05 ? Math.round(stock) : parseFloat(stock.toFixed(1));
    return `<span>${u < 0 ? '<span style="color:#DC2626">⚠ ' + u + '</span>' : u} unités</span>`;
  }

  // Fûts → afficher en litres + fraction de fût
  if (unit === 'Fût') {
    const litres = stock * (vol / 100);
    const l = parseFloat(litres.toFixed(2));
    const litreDisplay = l < 0
      ? `<span style="color:#DC2626">⚠ ${l} L</span>`
      : `${l} L`;
    return `<span>${litreDisplay}</span>
            <small style="color:var(--text-faint);display:block;font-size:11px">${parseFloat(stock.toFixed(3))} fût</small>`;
  }

  // Bouteilles individuelles
  // Grande bouteille de mixing (≥ 75cl) → afficher en bouteilles avec décimale
  // Petite bouteille (alcool, etc.) → afficher en btl + cl si négatif
  const s = parseFloat(stock.toFixed(2));
  const isGrande = vol >= 75;

  if (stock < 0) {
    if (isGrande) {
      // Ex : -0.5 Bouteille → "⚠ 0.5 bouteille manquante"
      const manque = Math.abs(s);
      return `<span style="color:#DC2626">⚠ −${manque} btl</span>
              <small style="color:var(--text-faint);display:block;font-size:11px">à régulariser</small>`;
    } else {
      const cl = Math.abs(parseFloat((stock * vol).toFixed(0)));
      return `<span style="color:#DC2626">⚠ ${s} btl</span>
              <small style="color:var(--text-faint);display:block;font-size:11px">${cl} cl consommés</small>`;
    }
  }

  // Stock positif
  if (isGrande) {
    // Afficher avec 1 décimale si pas entier (ex: 2.5 Bouteilles)
    const s2 = stock % 1 < 0.01 ? Math.round(stock) : parseFloat(stock.toFixed(1));
    const label = s2 <= 1 ? unit : unit + 's';
    return `${s2} ${label}`;
  }
  const s2 = Math.abs(stock) % 1 < 0.01 ? Math.round(stock) : s;
  return `${s2} ${unit}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function formatEventRange(ev, opts = {}) {
  if (!ev || !ev.date) return "";
  const short = !!opts.short;
  const fmt = d => {
    const o = new Date(d);
    return o.toLocaleDateString("fr-FR", short
      ? { day: "numeric", month: "short" }
      : { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  const startStr = fmt(ev.date);
  const hasRange = ev.end_date && ev.end_date !== ev.date;
  let out = hasRange ? `${startStr} → ${fmt(ev.end_date)}` : startStr;
  if (ev.start_time || ev.end_time) {
    const t = ev.start_time && ev.end_time
      ? `${ev.start_time} – ${ev.end_time}`
      : (ev.start_time || ev.end_time);
    out += ` · ${t}`;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE ÉVÉNEMENTS / BOOST ÉVÉNEMENTIEL
// ═══════════════════════════════════════════════════════════════════════════

const EVENT_TYPES = ["Concert","Soirée","Brunch","Match","Anniversaire","Privatisé","Happy Hour","Autre"];

const EVENT_TYPE_ICON = {
  "Concert": "🎸", "Soirée": "🌙", "Brunch": "☕", "Match": "⚽",
  "Anniversaire": "🎂", "Privatisé": "🔒", "Happy Hour": "🍹", "Autre": "🎉"
};

async function renderEvents(app) {
  app.innerHTML = `<div class="ev-wrap">
    <div class="ev-header">
      <div>
        <h2 class="ev-title">🎉 Boost Événementiel</h2>
        <p class="ev-subtitle">Marquez vos événements et découvrez leur impact sur la consommation</p>
      </div>
      <button class="ev-add-btn" onclick="openEventForm()">+ Ajouter un événement</button>
    </div>
    <div id="ev-form-area"></div>
    <div id="ev-list-area"><div class="ev-loading">Chargement…</div></div>
    <div id="ev-analysis-area"></div>
  </div>`;

  loadEvents();
}

let __evCache = [];

async function loadEvents() {
  const [events, analysis, products] = await Promise.all([
    api("/api/events"),
    api("/api/events/analysis"),
    api("/api/produits").catch(() => allProducts || []),
  ]);
  allProducts = products || allProducts || [];
  renderEventList(events);
  renderEventAnalysis(analysis);
}

function openEventFormById(eid) {
  const ev = (__evCache || []).find(e => e.id === eid);
  if (!ev) return;
  openEventForm(
    ev.id, ev.name, ev.event_type, ev.date,
    ev.notes || "",
    ev.end_date || "",
    ev.start_time || "",
    ev.end_time || "",
    ev.requirements || []
  );
}

function renderEventList(events) {
  const el = document.getElementById("ev-list-area");
  if (!el) return;
  if (!events.length) {
    el.innerHTML = `<div class="ev-empty">
      <div style="font-size:48px;margin-bottom:12px">🗓️</div>
      <p>Aucun événement enregistré.<br>Ajoutez votre premier événement pour commencer l'analyse.</p>
    </div>`;
    return;
  }
  __evCache = events;
  const rows = events.map(ev => {
    const icon = EVENT_TYPE_ICON[ev.event_type] || "🎉";
    const reqs = ev.requirements || [];
    let reqBlock = "";
    if (reqs.length > 0) {
      reqBlock = `<div class="ev-req-summary">
        ${reqs.map(r => {
          const miss = r.quantity > r.stock ? (r.quantity - r.stock) : 0;
          const cls = miss > 0 ? "ev-req-pill-warn" : "ev-req-pill-ok";
          const icon = miss > 0 ? "⚠️" : "✅";
          return `<span class="ev-req-pill ${cls}" title="Stock ${r.stock} · demandé ${r.quantity}">
            ${icon} ${esc(r.product_name)} ×${r.quantity}${miss > 0 ? ` (manque ${miss})` : ""}
          </span>`;
        }).join("")}
      </div>`;
    }
    return `<div class="ev-item" id="ev-item-${ev.id}">
      <div class="ev-item-icon">${icon}</div>
      <div class="ev-item-info">
        <div class="ev-item-name">${ev.name}</div>
        <div class="ev-item-meta">
          <span class="ev-badge">${ev.event_type}</span>
          <span class="ev-item-date">📅 ${formatEventRange(ev)}</span>
          ${ev.notes ? `<span class="ev-item-notes">· ${ev.notes}</span>` : ""}
        </div>
        ${reqBlock}
      </div>
      <div class="ev-item-actions">
        <button class="ev-btn-edit" onclick="openEventFormById(${ev.id})">✏️</button>
        <button class="ev-btn-del" onclick="deleteEvent(${ev.id})">🗑</button>
      </div>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="ev-list-title">Événements enregistrés (${events.length})</div>
    <div class="ev-list">${rows}</div>`;
}

function openEventForm(id=null, name="", type="Concert", date="", notes="", endDate="", startTime="", endTime="", requirements=[]) {
  const area = document.getElementById("ev-form-area");
  if (!area) return;
  const today = new Date().toISOString().slice(0,10);
  const typeOpts = EVENT_TYPES.map(t =>
    `<option value="${t}" ${t === type ? "selected" : ""}>${EVENT_TYPE_ICON[t]||"🎉"} ${t}</option>`
  ).join("");
  __evReqState = Array.isArray(requirements) ? [...requirements] : [];
  area.innerHTML = `<div class="ev-form">
    <div class="ev-form-title">${id ? "✏️ Modifier l'événement" : "➕ Nouvel événement"}</div>
    <div class="ev-form-grid">
      <div class="ev-field">
        <label>Nom de l'événement</label>
        <input id="evf-name" type="text" placeholder="Ex: Concert Rock, Tournoi Bridge…" value="${name}"/>
      </div>
      <div class="ev-field">
        <label>Type</label>
        <select id="evf-type">${typeOpts}</select>
      </div>
      <div class="ev-field">
        <label>Date de début</label>
        <input id="evf-date" type="date" value="${date || today}"/>
      </div>
      <div class="ev-field">
        <label>Date de fin <span class="ev-hint">(optionnel)</span></label>
        <input id="evf-end-date" type="date" value="${endDate || ''}" placeholder="Si événement sur plusieurs jours"/>
      </div>
      <div class="ev-field">
        <label>Heure de début <span class="ev-hint">(optionnel)</span></label>
        <input id="evf-start-time" type="time" value="${startTime || ''}"/>
      </div>
      <div class="ev-field">
        <label>Heure de fin <span class="ev-hint">(optionnel)</span></label>
        <input id="evf-end-time" type="time" value="${endTime || ''}"/>
      </div>
      <div class="ev-field ev-field-full">
        <label>Notes (optionnel)</label>
        <input id="evf-notes" type="text" placeholder="Ex: 300 personnes, soirée années 80…" value="${notes}"/>
      </div>
      <div class="ev-field ev-field-full">
        <label>Besoins spécifiques (boissons demandées par le client)</label>
        <div id="evf-req-list" class="evf-req-list"></div>
        <div class="evf-req-actions">
          <button type="button" class="evf-req-add" onclick="addEventRequirement()">+ Ajouter un besoin</button>
          <button type="button" class="evf-req-import" onclick="openImportRequestModal()">📄 Importer demande client (PDF / email)</button>
        </div>
      </div>
    </div>
    <div class="ev-form-footer">
      <button class="ev-save-btn" onclick="saveEvent(${id || 'null'})">💾 Enregistrer</button>
      <button class="ev-cancel-btn" onclick="cancelEventForm()">Annuler</button>
    </div>
  </div>`;
  renderEventRequirements();
  area.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

let __evReqState = [];

function renderEventRequirements() {
  const list = document.getElementById("evf-req-list");
  if (!list) return;
  if (__evReqState.length === 0) {
    list.innerHTML = `<div class="evf-req-empty">Aucun besoin spécifique. Cliquez sur « Ajouter un besoin » pour en définir un.</div>`;
    return;
  }
  const prodOptions = (selId) => (allProducts || [])
    .filter(p => !p.archived)
    .map(p => `<option value="${p.id}" ${String(p.id) === String(selId) ? "selected" : ""}>${esc(p.name)}</option>`)
    .join("");
  list.innerHTML = __evReqState.map((r, i) => {
    const p = (allProducts || []).find(x => String(x.id) === String(r.product_id));
    const stock = p ? p.stock : 0;
    const unit = p ? p.unit : "";
    const qty = Number(r.quantity || 0);
    const missing = qty > stock ? qty - stock : 0;
    const badge = p
      ? (missing > 0
          ? `<span class="evf-req-warn">⚠️ Stock ${stock} ${esc(unit)} · manque ${missing}</span>`
          : `<span class="evf-req-ok">✅ Stock ${stock} ${esc(unit)} suffisant</span>`)
      : "";
    return `<div class="evf-req-row">
      <select class="evf-req-product" onchange="updateEventRequirement(${i}, 'product_id', this.value)">
        <option value="">— Produit —</option>
        ${prodOptions(r.product_id)}
      </select>
      <input type="number" class="evf-req-qty" min="0" step="1" value="${qty}"
             placeholder="Qté"
             oninput="updateEventRequirement(${i}, 'quantity', this.value)"/>
      ${badge}
      <button type="button" class="evf-req-del" onclick="removeEventRequirement(${i})" title="Supprimer">✕</button>
    </div>`;
  }).join("");
}

function addEventRequirement() {
  __evReqState.push({ product_id: "", quantity: 1, notes: "" });
  renderEventRequirements();
}

function updateEventRequirement(i, field, value) {
  if (!__evReqState[i]) return;
  if (field === "quantity") value = parseFloat(value) || 0;
  __evReqState[i][field] = value;
  renderEventRequirements();
}

function removeEventRequirement(i) {
  __evReqState.splice(i, 1);
  renderEventRequirements();
}

function openImportRequestModal() {
  openModal(`
    <h3 style="margin-bottom:12px">📄 Importer demande client</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
      Déposez un PDF (bon de commande, devis) <strong>ou</strong> collez le texte de l'email du client.
      L'IA repérera les boissons demandées et les ajoutera automatiquement à la liste des besoins.
    </p>
    <div class="form-group">
      <label>PDF (optionnel)</label>
      <input type="file" id="import-req-file" accept="application/pdf,.pdf"/>
    </div>
    <div class="form-group">
      <label>Ou texte de l'email / demande</label>
      <textarea id="import-req-text" rows="8" placeholder="Ex: Bonjour, pour l'anniversaire du 25 avril nous souhaitons 20 bouteilles de Champagne Deutz, 6 bouteilles de rosé Santini, et 2 fûts de Pietra Blonde. Merci."></textarea>
    </div>
    <div id="import-req-loading" style="display:none;text-align:center;padding:12px;color:var(--text-muted)">
      ⏳ Analyse en cours… (quelques secondes)
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" id="import-req-submit" onclick="submitImportRequest()">🤖 Analyser</button>
    </div>`);
}

async function submitImportRequest() {
  const fileInput = document.getElementById("import-req-file");
  const textVal = document.getElementById("import-req-text").value.trim();
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file && !textVal) { alert("Ajoutez un PDF ou collez du texte."); return; }

  const loading = document.getElementById("import-req-loading");
  const btn = document.getElementById("import-req-submit");
  if (loading) loading.style.display = "block";
  if (btn) btn.disabled = true;

  try {
    const fd = new FormData();
    if (file) fd.append("file", file);
    if (textVal) fd.append("text", textVal);
    const r = await fetch("/api/events/parse-request", {
      method: "POST",
      headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {},
      body: fd,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({detail: r.statusText}));
      throw new Error(err.detail || `Erreur ${r.status}`);
    }
    const data = await r.json();
    const items = data.items || [];
    if (items.length === 0) {
      alert("Aucune boisson détectée dans ce document. Ajoute-les manuellement.");
      return;
    }
    // Fusionner dans __evReqState
    let added = 0, unmatched = 0;
    items.forEach(it => {
      if (!it.product_id) { unmatched++; return; }
      // Éviter doublons : si produit déjà dans state, on cumule
      const existing = __evReqState.find(r => String(r.product_id) === String(it.product_id));
      if (existing) {
        existing.quantity = Number(existing.quantity || 0) + Number(it.quantity || 0);
      } else {
        __evReqState.push({
          product_id: it.product_id,
          quantity: it.quantity,
          notes: it.raw_name && it.raw_name !== it.product_name ? `Demandé: ${it.raw_name}` : "",
        });
      }
      added++;
    });
    closeModal();
    renderEventRequirements();
    let msg = `✅ ${added} boisson${added>1?'s':''} ajoutée${added>1?'s':''} à la liste.`;
    if (unmatched > 0) {
      msg += `\n\n⚠️ ${unmatched} produit${unmatched>1?'s':''} non reconnu${unmatched>1?'s':''} dans le catalogue (ajoute-les manuellement si besoin).`;
    }
    alert(msg);
  } catch (e) {
    alert("Erreur : " + e.message);
  } finally {
    if (loading) loading.style.display = "none";
    if (btn) btn.disabled = false;
  }
}

function cancelEventForm() {
  const area = document.getElementById("ev-form-area");
  if (area) area.innerHTML = "";
}

async function saveEvent(id) {
  const name      = document.getElementById("evf-name").value.trim();
  const type      = document.getElementById("evf-type").value;
  const date      = document.getElementById("evf-date").value;
  const endDate   = document.getElementById("evf-end-date").value;
  const startTime = document.getElementById("evf-start-time").value;
  const endTime   = document.getElementById("evf-end-time").value;
  const notes     = document.getElementById("evf-notes").value.trim();
  if (!name) { alert("Nom de l'événement requis"); return; }
  if (!date) { alert("Date de début requise"); return; }
  if (endDate && endDate < date) { alert("La date de fin doit être postérieure à la date de début."); return; }
  if (startTime && endTime && (!endDate || endDate === date) && endTime <= startTime) {
    alert("L'heure de fin doit être postérieure à l'heure de début."); return;
  }
  const requirements = (__evReqState || [])
    .filter(r => r.product_id && Number(r.quantity) > 0)
    .map(r => ({
      product_id: parseInt(r.product_id, 10),
      quantity: Number(r.quantity),
      notes: r.notes || "",
    }));
  const body = {
    name, event_type: type, date, notes,
    end_date: endDate || null,
    start_time: startTime || "",
    end_time: endTime || "",
    requirements,
  };
  try {
    const opts = { method: id ? "PUT" : "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body) };
    if (id) {
      await api(`/api/events/${id}`, opts);
    } else {
      await api("/api/events", opts);
    }
    cancelEventForm();
    loadEvents();
  } catch(e) {
    alert("Erreur : " + e.message);
  }
}

async function deleteEvent(id) {
  if (!confirm("Supprimer cet événement ?")) return;
  await api(`/api/events/${id}`, { method: "DELETE" });
  loadEvents();
}

function renderEventAnalysis(analysis) {
  const el = document.getElementById("ev-analysis-area");
  if (!el) return;

  if (!analysis.length) {
    el.innerHTML = "";
    return;
  }

  const blocks = analysis.map(group => {
    const icon = EVENT_TYPE_ICON[group.event_type] || "🎉";
    const n = group.count;
    const nData = group.n_with_data || 0;
    const evList = group.events.map(e => `<span class="ev-tag">${e.date} – ${e.name}</span>`).join("");

    if (group.no_data || !group.boosts.length) {
      return `<div class="ev-analysis-card">
        <div class="ev-an-header">
          <span class="ev-an-icon">${icon}</span>
          <div>
            <div class="ev-an-type">${group.event_type}</div>
            <div class="ev-an-count">${n} événement${n>1?"s":""}</div>
          </div>
        </div>
        <div class="ev-no-data">Aucune donnée de consommation pour ces dates.<br>
        <small>Les données proviennent des imports Cashpad effectués ces jours-là.</small></div>
        <div class="ev-tags">${evList}</div>
      </div>`;
    }

    const boostRows = group.boosts.map(b => {
      if (b.boost_pct === null) return "";
      const pct = b.boost_pct;
      const isPositive = pct > 0;
      const arrow = pct > 15 ? "⬆️" : pct < -15 ? "⬇️" : "➡️";
      const cls = pct > 15 ? "ev-boost-up" : pct < -15 ? "ev-boost-down" : "ev-boost-neutral";
      const bar_w = Math.min(Math.abs(pct), 100);
      const bar_cls = pct > 0 ? "ev-bar-pos" : "ev-bar-neg";
      return `<div class="ev-boost-row">
        <div class="ev-boost-name">${b.product_name}</div>
        <div class="ev-boost-bar-wrap">
          <div class="ev-boost-bar ${bar_cls}" style="width:${bar_w}%"></div>
        </div>
        <div class="ev-boost-nums">
          <span class="ev-boost-event">${b.event_avg.toFixed(1)}/j</span>
          <span class="ev-boost-vs">vs ${b.baseline_avg.toFixed(1)}/j</span>
          <span class="${cls}">${arrow} ${pct > 0 ? "+" : ""}${pct}%</span>
        </div>
      </div>`;
    }).filter(Boolean).join("");

    // Genère la phrase narrative (top 3 produits)
    const top3 = group.boosts.filter(b => b.boost_pct !== null && b.boost_pct > 10).slice(0, 3);
    let narrative = "";
    if (top3.length) {
      const parts = top3.map(b => `<strong>${b.product_name}</strong> (+${b.boost_pct}%)`).join(", ");
      narrative = `<div class="ev-narrative">
        💡 Pour les ${nData} dernier${nData>1?"s":""} ${group.event_type.toLowerCase()}${nData>1?"s":""}, vous avez consommé significativement plus de ${parts}.
      </div>`;
    }

    return `<div class="ev-analysis-card">
      <div class="ev-an-header">
        <span class="ev-an-icon">${icon}</span>
        <div>
          <div class="ev-an-type">${group.event_type}</div>
          <div class="ev-an-count">${n} événement${n>1?"s":""} · ${nData} avec données Cashpad</div>
        </div>
      </div>
      ${narrative}
      <div class="ev-boost-legend">
        <span>Produit</span><span></span><span>Événement · Normal · Variation</span>
      </div>
      <div class="ev-boost-list">${boostRows || '<div class="ev-no-data">Aucune variation significative détectée.</div>'}</div>
      <div class="ev-tags" style="margin-top:12px">${evList}</div>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="ev-analysis-title">📊 Analyse de l'impact événementiel</div>
    <div class="ev-analysis-info">Comparaison entre la consommation lors des événements et les jours normaux (baseline).</div>
    <div class="ev-analysis-grid">${blocks}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE DÉMARQUE INCONNUE
// ═══════════════════════════════════════════════════════════════════════════

const LOSS_REASONS = ["Casse","Offert maison","Dégustation","Vol suspecté","Périmé","Autre"];
const LOSS_REASON_ICON = {
  "Casse":"💥","Offert maison":"🍺","Dégustation":"👅",
  "Vol suspecté":"🕵️","Périmé":"🗑️","Autre":"❓"
};

async function renderShrinkage(app) {
  app.innerHTML = `<div class="sh-wrap">
    <div class="sh-header">
      <div>
        <h2 class="sh-title">📉 Démarque Inconnue</h2>
        <p class="sh-subtitle">Pertes déclarées · Écarts d'inventaire · Vraie démarque</p>
      </div>
      <button class="sh-loss-btn" onclick="openLossForm()">⚠️ Saisir une perte</button>
    </div>

    <div id="sh-form-area"></div>
    <div id="sh-kpi-area"><div class="sh-loading">Chargement…</div></div>
    <div id="sh-table-area"></div>
    <div id="sh-history-area"></div>
    <div id="sh-losses-area"></div>
  </div>`;

  loadShrinkage();
}

async function loadShrinkage() {
  const [summary, history, losses, products] = await Promise.all([
    api("/api/shrinkage/summary"),
    api("/api/shrinkage/history"),
    api("/api/losses"),
    api("/api/produits"),
  ]);
  renderShrinkageKpis(summary);
  renderShrinkageTable(summary);
  renderShrinkageHistory(history);
  renderLossesList(losses, products);
}

function renderShrinkageKpis(summary) {
  const el = document.getElementById("sh-kpi-area");
  if (!el) return;

  const totalUnexplained = summary.reduce((s, r) => s + r.unexplained, 0);
  const totalValue = summary.reduce((s, r) => s + r.value_eur, 0);
  const totalDeclared = summary.reduce((s, r) => s + r.declared_losses, 0);
  const nbAffected = summary.filter(r => r.unexplained > 0).length;
  const totalInvLoss = summary.reduce((s, r) => s + r.inventory_loss, 0);

  el.innerHTML = `<div class="sh-kpis">
    <div class="sh-kpi sh-kpi-red">
      <div class="sh-kpi-icon">💸</div>
      <div class="sh-kpi-val">${fmtEur(totalValue)}</div>
      <div class="sh-kpi-lbl">Valeur démarque inconnue</div>
    </div>
    <div class="sh-kpi sh-kpi-orange">
      <div class="sh-kpi-icon">🔍</div>
      <div class="sh-kpi-val">${totalUnexplained.toFixed(1)}</div>
      <div class="sh-kpi-lbl">Unités inexpliquées</div>
    </div>
    <div class="sh-kpi sh-kpi-yellow">
      <div class="sh-kpi-icon">📋</div>
      <div class="sh-kpi-val">${totalDeclared.toFixed(1)}</div>
      <div class="sh-kpi-lbl">Pertes déclarées</div>
    </div>
    <div class="sh-kpi sh-kpi-blue">
      <div class="sh-kpi-icon">📦</div>
      <div class="sh-kpi-val">${nbAffected}</div>
      <div class="sh-kpi-lbl">Produits affectés</div>
    </div>
  </div>
  ${totalValue === 0 && totalDeclared === 0 ? `<div class="sh-empty-state">
    <div style="font-size:52px;margin-bottom:12px">✅</div>
    <div style="font-size:16px;font-weight:700;color:var(--primary)">Aucune démarque détectée</div>
    <p style="color:var(--text-muted);margin-top:8px">Faites un inventaire ou saisissez vos premières pertes pour commencer l'analyse.</p>
  </div>` : ""}`;
}

function renderShrinkageTable(summary) {
  const el = document.getElementById("sh-table-area");
  if (!el) return;
  const rows = summary.filter(r => r.unexplained > 0 || r.declared_losses > 0 || r.inventory_loss > 0);
  if (!rows.length) { el.innerHTML = ""; return; }

  const trs = rows.map(r => {
    const valClass = r.value_eur > 50 ? "sh-val-high" : r.value_eur > 20 ? "sh-val-mid" : "sh-val-low";
    const unexplClass = r.unexplained > 0 ? "sh-unex-bad" : "sh-unex-ok";
    return `<tr>
      <td><strong>${r.product_name}</strong><br><small class="sh-cat">${r.category}</small></td>
      <td class="sh-num">${r.inventory_loss > 0 ? `<span class="sh-inv-loss">−${r.inventory_loss.toFixed(1)} ${r.unit}</span>` : "<span class='sh-zero'>—</span>"}</td>
      <td class="sh-num">${r.declared_losses > 0 ? `<span class="sh-decl">${r.declared_losses.toFixed(1)} ${r.unit}</span>` : "<span class='sh-zero'>—</span>"}</td>
      <td class="sh-num ${unexplClass}">${r.unexplained > 0 ? `<strong>${r.unexplained.toFixed(1)} ${r.unit}</strong>` : "✅ 0"}</td>
      <td class="sh-num ${valClass}">${r.value_eur > 0 ? fmtEur(r.value_eur) : "—"}</td>
      <td class="sh-num sh-stock-col">${r.stock_actuel} ${r.unit}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `<div class="sh-section-title">📊 Détail par produit</div>
  <div class="sh-table-wrap">
    <table class="sh-table">
      <thead><tr>
        <th>Produit</th>
        <th>Écart inventaire</th>
        <th>Pertes déclarées</th>
        <th>Démarque inconnue</th>
        <th>Valeur perdue</th>
        <th>Stock actuel</th>
      </tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>
  <div class="sh-table-legend">
    <span>📦 <em>Écart inventaire</em> = différence constatée lors des inventaires physiques</span>
    <span>📋 <em>Pertes déclarées</em> = casse, offerts maison, vols signalés</span>
    <span>🔍 <em>Démarque inconnue</em> = écart qui reste inexpliqué</span>
  </div>`;
}

function renderShrinkageHistory(history) {
  const el = document.getElementById("sh-history-area");
  if (!el || !history.length) { if(el) el.innerHTML=""; return; }

  const labels = history.map(h => h.label);
  const declData = history.map(h => parseFloat(h.declared_eur.toFixed(2)));
  const invData  = history.map(h => parseFloat(h.inventory_eur.toFixed(2)));

  el.innerHTML = `<div class="sh-section-title">📅 Historique mensuel (valeur €)</div>
    <div class="sh-chart-wrap"><canvas id="sh-chart" height="200"></canvas></div>`;

  setTimeout(() => {
    const ctx = document.getElementById("sh-chart");
    if (!ctx) return;
    if (ctx._chartInstance) ctx._chartInstance.destroy();
    ctx._chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Pertes déclarées (€)", data: declData, backgroundColor: "rgba(251,146,60,.7)", borderRadius: 6 },
          { label: "Écart inventaire (€)",  data: invData,  backgroundColor: "rgba(239,68,68,.7)",  borderRadius: 6 },
        ]
      },
      options: {
        responsive: true, plugins: { legend: { labels: { color: "#ccc" } } },
        scales: {
          x: { stacked: true, ticks: { color: "#999" }, grid: { color: "rgba(255,255,255,.05)" } },
          y: { stacked: true, ticks: { color: "#999", callback: v => `${v}€` }, grid: { color: "rgba(255,255,255,.05)" } }
        }
      }
    });
  }, 100);
}

function renderLossesList(losses, products) {
  const el = document.getElementById("sh-losses-area");
  if (!el) return;

  const productList = (products || []).filter(p => !p.unit || !p.unit.includes("Carton"));
  const opts = productList.map(p => `<option value="${p.id}">${p.name} (${p.category})</option>`).join("");
  window._shrinkageProductOpts = opts;

  if (!losses.length) {
    el.innerHTML = `<div class="sh-section-title">📋 Pertes déclarées</div>
      <div class="sh-empty-losses">Aucune perte déclarée. Utilisez le bouton "Saisir une perte" en haut.</div>`;
    return;
  }

  const rows = losses.map(l => {
    const icon = LOSS_REASON_ICON[l.reason] || "❓";
    const valStr = l.value_eur > 0 ? `<span class="sh-loss-val">${fmtEur(l.value_eur)}</span>` : "";
    return `<div class="sh-loss-row">
      <span class="sh-loss-icon">${icon}</span>
      <div class="sh-loss-info">
        <div class="sh-loss-name">${l.product_name} <span class="sh-loss-qty">−${l.quantity} ${l.unit}</span>${valStr}</div>
        <div class="sh-loss-meta">
          <span class="sh-loss-badge sh-reason-${l.reason.replace(/\s+/g,"-").toLowerCase()}">${l.reason}</span>
          <span class="sh-loss-date">${l.date}</span>
          ${l.staff_name ? `<span class="sh-loss-staff">👤 ${l.staff_name}</span>` : ""}
          ${l.notes ? `<span class="sh-loss-notes">· ${l.notes}</span>` : ""}
        </div>
      </div>
      <button class="sh-loss-del" onclick="deleteLoss(${l.id})" title="Supprimer">🗑</button>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="sh-section-title">📋 Pertes déclarées (${losses.length})</div>
    <div class="sh-losses-list">${rows}</div>`;
}

function openLossForm() {
  const area = document.getElementById("sh-form-area");
  if (!area) return;
  const opts = window._shrinkageProductOpts || "";
  const reasonOpts = LOSS_REASONS.map(r =>
    `<option value="${r}">${LOSS_REASON_ICON[r]||"❓"} ${r}</option>`
  ).join("");
  const today = new Date().toISOString().slice(0,10);

  area.innerHTML = `<div class="sh-form">
    <div class="sh-form-title">⚠️ Saisir une perte</div>
    <div class="sh-form-grid">
      <div class="sh-field sh-field-wide">
        <label>Produit</label>
        <select id="shf-product">${opts ? `<option value="">— Choisir —</option>${opts}` : "<option>Aucun produit</option>"}</select>
      </div>
      <div class="sh-field">
        <label>Quantité perdue</label>
        <input id="shf-qty" type="number" step="0.5" min="0.5" value="1" placeholder="Ex: 2"/>
      </div>
      <div class="sh-field">
        <label>Motif</label>
        <select id="shf-reason">${reasonOpts}</select>
      </div>
      <div class="sh-field">
        <label>Date</label>
        <input id="shf-date" type="date" value="${today}"/>
      </div>
      <div class="sh-field">
        <label>Responsable (optionnel)</label>
        <input id="shf-staff" type="text" placeholder="Nom du staff"/>
      </div>
      <div class="sh-field sh-field-wide">
        <label>Détails (optionnel)</label>
        <input id="shf-notes" type="text" placeholder="Ex: bouteille tombée derrière le bar…"/>
      </div>
      <div class="sh-field sh-field-wide sh-check-field">
        <label>
          <input id="shf-update" type="checkbox" checked/>
          Déduire immédiatement du stock
        </label>
        <small>Décochez si la perte a déjà été comptabilisée lors d'un inventaire.</small>
      </div>
    </div>
    <div class="sh-form-footer">
      <button class="sh-save-btn" onclick="saveLoss()">💾 Enregistrer la perte</button>
      <button class="sh-cancel-btn" onclick="cancelLossForm()">Annuler</button>
    </div>
  </div>`;
  area.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cancelLossForm() {
  const area = document.getElementById("sh-form-area");
  if (area) area.innerHTML = "";
}

async function saveLoss() {
  const pid   = parseInt(document.getElementById("shf-product").value);
  const qty   = parseFloat(document.getElementById("shf-qty").value);
  const reason = document.getElementById("shf-reason").value;
  const date  = document.getElementById("shf-date").value;
  const staff = document.getElementById("shf-staff").value.trim();
  const notes = document.getElementById("shf-notes").value.trim();
  const update = document.getElementById("shf-update").checked;

  if (!pid || isNaN(pid)) { alert("Sélectionnez un produit"); return; }
  if (!qty || qty <= 0)   { alert("Quantité invalide"); return; }

  try {
    const res = await api("/api/losses", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ product_id: pid, quantity: qty, reason, date, staff_name: staff, notes, update_stock: update })
    });
    cancelLossForm();
    loadShrinkage();
    if (update) {
      showToast(`✅ Perte enregistrée · Nouveau stock : ${res.new_stock}`);
    }
  } catch(e) {
    alert("Erreur : " + e.message);
  }
}

async function deleteLoss(id) {
  if (!confirm("Supprimer cette perte déclarée ?\n(Le stock sera restitué si la déduction avait été faite.)")) return;
  await api(`/api/losses/${id}`, { method: "DELETE" });
  loadShrinkage();
}

function showToast(msg) {
  let t = document.getElementById("sh-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "sh-toast";
    t.className = "sh-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("sh-toast-show");
  setTimeout(() => t.classList.remove("sh-toast-show"), 3500);
}

function fmtEur(v) {
  return (v || 0).toLocaleString("fr-FR", { style:"currency", currency:"EUR", minimumFractionDigits:2 });
}


// ══════════════════════════════════════════════════════════════════════════
// ALERTE STOCK (serveur)
// ══════════════════════════════════════════════════════════════════════════

let saProducts = [];

async function renderServiceAlert(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">🚨 Alerte Stock</span>
    </div>
    <div class="info-box" style="font-size:13px">
      Signalez un produit en <strong>rupture</strong> ou <strong>bientôt vide</strong>. La direction sera prévenue.
    </div>
    <div class="sa-search-wrap">
      <input type="text" id="sa-search" placeholder="🔍 Rechercher un produit…"
             oninput="saFilterProducts()" autofocus style="font-size:16px"/>
    </div>
    <div id="sa-product-list"></div>
    <div id="sa-history" style="margin-top:24px"></div>
  `;
  try {
    saProducts = await api("/api/products");
    saFilterProducts();
    saLoadHistory();
  } catch(e) {
    el.innerHTML += `<div class="info-box" style="border-color:#e74c3c">Erreur : ${esc(e.message)}</div>`;
  }
}

function saFilterProducts() {
  const q = (document.getElementById("sa-search")?.value || "").toLowerCase();
  const container = document.getElementById("sa-product-list");
  if (!container) return;

  if (!q || q.length < 2) {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:12px;font-size:13px">Tapez au moins 2 lettres…</p>`;
    return;
  }

  const filtered = saProducts.filter(p =>
    p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q)
  ).slice(0, 10);

  if (!filtered.length) {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:12px">Aucun produit trouvé</p>`;
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div class="sa-product-row" onclick="saOpenAlert(${p.id}, '${esc(p.name).replace(/'/g,"\\'")}', ${p.stock || 0}, '${esc(p.unit || "").replace(/'/g,"\\'")}')">
      <div class="sa-product-info">
        <strong>${esc(p.name)}</strong>
        <small>${esc(p.category || "")}</small>
      </div>
      <div class="sa-product-stock ${p.stock <= 0 ? 'sa-stock-zero' : p.stock <= p.alert_threshold ? 'sa-stock-low' : ''}">
        ${p.stock} ${esc(p.unit || "")}
      </div>
    </div>
  `).join("");
}

function saOpenAlert(productId, productName, currentStock, unit) {
  openModal(`
    <h3 style="margin-bottom:14px">🚨 Signaler : ${productName}</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">Stock système : <strong>${currentStock} ${esc(unit)}</strong></p>
    <div class="form-group">
      <label>Combien il en reste ?</label>
      <div class="flash-qty-control" style="width:fit-content">
        <button class="flash-qty-btn" onclick="saQtyAdj(-1)">−</button>
        <input type="number" class="flash-qty-input" id="sa-qty" value="0" min="0" step="1"/>
        <button class="flash-qty-btn" onclick="saQtyAdj(1)">+</button>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="sa-rupture" ${currentStock <= 0 ? "checked" : ""} style="width:18px;height:18px"/>
        <span>C'est une <strong>rupture totale</strong> (il n'en reste plus du tout)</span>
      </label>
    </div>
    <div class="form-group" style="margin-top:10px">
      <label>Note (optionnel)</label>
      <input type="text" id="sa-notes" placeholder="ex: les clients demandent beaucoup ce soir"/>
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:14px;padding:12px" onclick="saSubmitAlert(${productId})">
      🚨 Envoyer l'alerte
    </button>
  `);
}

function saQtyAdj(d) {
  const i = document.getElementById("sa-qty");
  if (!i) return;
  i.value = Math.max(0, (parseInt(i.value) || 0) + d);
  if (parseInt(i.value) === 0) document.getElementById("sa-rupture").checked = true;
}

async function saSubmitAlert(productId) {
  const qty = parseFloat(document.getElementById("sa-qty")?.value) || 0;
  const isRupture = document.getElementById("sa-rupture")?.checked || false;
  const notes = document.getElementById("sa-notes")?.value || "";
  const staff = userName || "Service";

  try {
    const res = await api("/api/service-alerts", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        product_id: productId,
        reported_stock: qty,
        is_rupture: isRupture,
        staff_name: staff,
        notes,
      }),
    });
    closeModal();
    showToast(`Alerte envoyée : ${res.product_name}`);
    saLoadHistory();
  } catch(e) {
    showToast("Erreur : " + e.message);
  }
}

async function saLoadHistory() {
  const container = document.getElementById("sa-history");
  if (!container) return;
  try {
    const alerts = await api("/api/service-alerts?status=all");
    if (!alerts.length) {
      container.innerHTML = "";
      return;
    }

    // Direction : vue avec sélection et commande
    if (userRole === "manager") {
      const openAlerts = alerts.filter(a => a.status === "open" || a.status === "acknowledged");

      // Grouper les alertes ouvertes par fournisseur
      const bySupplier = {};
      openAlerts.forEach(a => {
        const sup = a.supplier_name || "Sans fournisseur";
        if (!bySupplier[sup]) bySupplier[sup] = [];
        bySupplier[sup].push(a);
      });

      let openHtml = "";
      if (openAlerts.length > 0) {
        openHtml = `<div class="sa-direction-title">À traiter (${openAlerts.length})</div>`;
        Object.entries(bySupplier).forEach(([sup, items]) => {
          openHtml += `<div class="sa-supplier-group">
            <div class="sa-supplier-header">
              <strong>${esc(sup)}</strong>
              ${sup !== "Sans fournisseur" ? `<button class="btn btn-sm btn-primary" onclick="saCommanderGroup('${esc(sup).replace(/'/g,"\\'")}')">🛒 Commander tout</button>` : ""}
            </div>`;
          items.forEach(a => {
            openHtml += `<div class="sa-alert-row-dir">
              <div class="sa-alert-info">
                <strong>${esc(a.product_name)}</strong>
                ${a.is_rupture ? '<span class="sa-badge-rupture">RUPTURE</span>' : `<span class="sa-badge-low">${a.reported_stock} restant</span>`}
                <small style="color:var(--text-muted);display:block">${esc(a.staff_name)} · ${esc(a.created_at)}</small>
                ${a.notes ? `<small style="color:var(--text-muted);font-style:italic">📝 ${esc(a.notes)}</small>` : ""}
              </div>
              <div class="sa-alert-actions-dir">
                <button class="btn btn-sm btn-outline" onclick="saAckAlert(${a.id})">✓ Vu</button>
              </div>
            </div>`;
          });
          openHtml += `</div>`;
        });
      }

      // Historique des résolues
      const resolved = alerts.filter(a => a.status === "ordered" || a.status === "resolved").slice(0, 10);
      let resolvedHtml = "";
      if (resolved.length) {
        resolvedHtml = `<div class="sa-direction-title" style="margin-top:20px">Traitées</div>
          <div class="sa-history-list">${resolved.map(a => {
            const statusMap = { ordered: "🟢 Commandé", resolved: "✅ Résolu" };
            return `<div class="sa-hist-row">
              <div><strong>${esc(a.product_name)}</strong></div>
              <div><small style="color:var(--text-muted)">${esc(a.created_at)}</small> <span class="sa-status">${statusMap[a.status]}</span></div>
            </div>`;
          }).join("")}</div>`;
      }

      container.innerHTML = openHtml + resolvedHtml;
    } else {
      // Service : vue simple
      const recent = alerts.slice(0, 10);
      container.innerHTML = `
        <strong style="font-size:14px">Vos alertes récentes</strong>
        <div class="sa-history-list">
          ${recent.map(a => {
            const statusMap = {
              open: "🟡 En attente",
              acknowledged: "🔵 Vue par la direction",
              ordered: "🟢 Commandé",
              resolved: "✅ Résolu",
            };
            return `<div class="sa-hist-row">
              <div>
                <strong>${esc(a.product_name)}</strong>
                ${a.is_rupture ? '<span class="sa-badge-rupture">RUPTURE</span>' : `<span class="sa-badge-low">${a.reported_stock} restant</span>`}
              </div>
              <div>
                <small style="color:var(--text-muted)">${esc(a.created_at)}</small>
                <span class="sa-status">${statusMap[a.status] || a.status}</span>
              </div>
            </div>`;
          }).join("")}
        </div>`;
    }
  } catch(e) {}
}

async function saAckAlert(alertId) {
  try {
    await api(`/api/service-alerts/${alertId}`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({}) });
    showToast("Alerte mise à jour");
    saLoadHistory();
  } catch(e) { showToast("Erreur : " + e.message); }
}

async function saCommanderGroup(supplierName) {
  const suppliers = allSuppliers.length ? allSuppliers : await api("/api/suppliers");
  const supp = suppliers.find(s => s.name === supplierName);
  if (!supp) { showToast("Fournisseur introuvable"); return; }

  // Marquer les alertes comme "ordered"
  const openAlerts = await api("/api/service-alerts?status=open");
  const toOrder = openAlerts.filter(a => a.supplier_name === supplierName);
  for (const a of toOrder) {
    await api(`/api/service-alerts/${a.id}`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({}) }).catch(() => {});
    await api(`/api/service-alerts/${a.id}`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({}) }).catch(() => {});
  }

  switchView("orders");
  setTimeout(() => openOrderForm(supp.id, supp.name), 500);
}

// ══════════════════════════════════════════════════════════════════════════
// INVENTAIRE FLASH — contrôle de stock par photo IA
// ══════════════════════════════════════════════════════════════════════════

let flashResults = null;
let flashControlId = null;
let flashTab = "scan"; // "scan" ou "history"

function renderFlash(el) {
  flashResults = null;
  flashControlId = null;
  el.innerHTML = `
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <span class="section-title">📸 Inventaire Flash</span>
      <div class="flash-tabs">
        <button class="btn ${flashTab==='scan'?'btn-primary':'btn-outline'} btn-sm" onclick="flashSwitchTab('scan')">📷 Nouveau contrôle</button>
        <button class="btn ${flashTab==='history'?'btn-primary':'btn-outline'} btn-sm" onclick="flashSwitchTab('history')">📋 Historique</button>
      </div>
    </div>
    <div id="flash-tab-content"></div>
  `;
  flashTab === "scan" ? flashRenderScan() : flashRenderHistory();
}

function flashSwitchTab(tab) {
  flashTab = tab;
  renderFlash(document.getElementById("app"));
}

function flashRenderScan() {
  const el = document.getElementById("flash-tab-content");
  el.innerHTML = `
    <div class="info-box" style="font-size:13px">
      Photographiez un frigo ou une étagère. L'IA compte et compare au stock. <strong>Rien n'est modifié</strong> sans votre accord.
    </div>

    <div class="flash-capture-zone" id="flash-capture-zone">
      <div class="form-group" style="max-width:300px;margin:0 0 8px">
        <label>Zone contrôlée</label>
        <input type="text" id="flash-zone" placeholder="ex: Frigo bar, Étagère cave…"/>
      </div>

      <div class="flash-photo-area" style="margin-top:14px">
        <label class="flash-upload-label" id="flash-upload-label">
          <input type="file" id="flash-file-input" accept="image/*" capture="environment"
                 onchange="flashPhotoSelected(this)" style="display:none"/>
          <div class="flash-upload-placeholder">
            <span style="font-size:48px">📸</span>
            <span>Prendre une photo ou choisir une image</span>
          </div>
        </label>
        <div id="flash-preview-wrap" class="hidden">
          <img id="flash-preview" class="flash-preview-img" alt="Photo"/>
          <button class="btn btn-sm" style="margin-top:8px" onclick="flashResetPhoto()">🔄 Nouvelle photo</button>
        </div>
      </div>

      <button class="btn btn-primary btn-lg" id="flash-analyze-btn" style="margin-top:16px;display:none"
              onclick="flashAnalyze()">
        🔍 Analyser la photo
      </button>
      <div id="flash-loading" class="hidden" style="text-align:center;padding:24px">
        <div class="flash-spinner"></div>
        <p style="color:var(--text-muted);margin-top:12px">Analyse en cours… L'IA examine votre photo</p>
      </div>
    </div>

    <div id="flash-results" class="hidden"></div>
  `;
}

let flashCompressedBlob = null;  // photo compressée prête à envoyer

function flashPhotoSelected(input) {
  const file = input.files[0];
  if (!file) return;

  // Compresser l'image côté téléphone avant upload (réduit de ~8Mo à ~150Ko)
  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 1400;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        flashCompressedBlob = blob;
        document.getElementById("flash-upload-label").classList.add("hidden");
        document.getElementById("flash-preview-wrap").classList.remove("hidden");
        document.getElementById("flash-preview").src = URL.createObjectURL(blob);
        document.getElementById("flash-analyze-btn").style.display = "";
        const sizeKo = Math.round(blob.size / 1024);
        showToast(`Photo compressée : ${sizeKo} Ko`);
      }, "image/jpeg", 0.80);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function flashResetPhoto() {
  document.getElementById("flash-upload-label").classList.remove("hidden");
  document.getElementById("flash-preview-wrap").classList.add("hidden");
  document.getElementById("flash-analyze-btn").style.display = "none";
  document.getElementById("flash-results").classList.add("hidden");
  document.getElementById("flash-file-input").value = "";
  flashResults = null;
  flashControlId = null;
  flashCompressedBlob = null;
}

async function flashAnalyze() {
  if (!flashCompressedBlob) { showToast("Prenez une photo d'abord"); return; }

  const zone = document.getElementById("flash-zone")?.value || "";
  const formData = new FormData();
  formData.append("file", flashCompressedBlob, "photo.jpg");
  formData.append("zone", zone);

  document.getElementById("flash-analyze-btn").style.display = "none";
  document.getElementById("flash-loading").classList.remove("hidden");

  try {
    const data = await api("/api/inventory/flash-analyze", { method: "POST", body: formData });
    flashResults = data;
    flashShowResults(data);
  } catch(e) {
    showToast("Erreur : " + e.message);
    document.getElementById("flash-analyze-btn").style.display = "";
  } finally {
    document.getElementById("flash-loading").classList.add("hidden");
  }
}

function flashShowResults(data) {
  const el = document.getElementById("flash-results");
  el.classList.remove("hidden");

  const confColors = { high: "#27ae60", medium: "#f39c12", low: "#e74c3c" };
  const confLabels = { high: "Élevée", medium: "Moyenne", low: "Faible" };
  const conf = data.confidence || "medium";
  const items = data.items || [];
  const matchedItems = items.filter(it => it.product_id != null);
  const nbEcarts = matchedItems.filter(it => {
    const diff = it.quantity - (it.current_stock || 0);
    return Math.abs(diff) > 0.1;
  }).length;

  let html = `
    <div class="flash-kpi-bar">
      <div class="flash-kpi"><span class="flash-kpi-num">${data.total_bottles || 0}</span> détectées</div>
      <div class="flash-kpi"><span class="flash-kpi-num">${matchedItems.length}</span> reconnues</div>
      <div class="flash-kpi"><span class="flash-kpi-num flash-kpi-${nbEcarts > 0 ? 'warn' : 'ok'}">${nbEcarts}</span> écarts</div>
      <div class="flash-kpi"><span class="flash-conf-badge" style="background:${confColors[conf]}">${confLabels[conf]}</span></div>
    </div>`;

  // Produits détectés — cartes
  html += `<div class="flash-products">`;
  items.forEach((item, i) => {
    const matched = item.product_id != null;
    const theo = item.current_stock != null ? item.current_stock : null;
    const diff = matched ? (item.quantity - (item.current_stock || 0)) : null;
    const diffStr = diff != null ? (diff > 0 ? `+${diff}` : `${diff}`) : "";
    const diffClass = diff == null ? "" : diff < -0.1 ? "flash-diff-neg" : diff > 0.1 ? "flash-diff-warn" : "flash-diff-ok";

    html += `<div class="flash-prod-card ${matched ? '' : 'flash-prod-unknown'}" id="flash-row-${i}">
      <div class="flash-prod-top">
        <div class="flash-prod-info">
          <span class="flash-prod-name">${esc(item.product_name)}</span>
          ${item.category ? `<span class="flash-prod-cat">${esc(item.category)}</span>` : ""}
        </div>
        <div class="flash-prod-qty-block">
          <div class="flash-qty-control">
            <button class="flash-qty-btn" onclick="flashQtyAdjust(${i}, -1)">−</button>
            <input type="number" class="flash-qty-input" id="flash-qty-${i}" value="${item.quantity}" min="0" step="1" onchange="flashRecalcDiff(${i})"/>
            <button class="flash-qty-btn" onclick="flashQtyAdjust(${i}, 1)">+</button>
          </div>
        </div>
      </div>
      ${matched ? `
        <div class="flash-prod-compare">
          <span class="flash-prod-theo">Théo. <strong>${theo}</strong></span>
          <span class="flash-prod-diff ${diffClass}" id="flash-diff-${i}">${diffStr}</span>
          <button class="flash-prod-edit-btn" onclick="flashOpenAssociate(${i})">✏️</button>
        </div>
      ` : `
        <div class="flash-prod-actions" id="flash-unmatched-${i}">
          <button class="flash-prod-action-btn flash-btn-assoc" onclick="flashOpenAssociate(${i})">🔗 Associer</button>
          <button class="flash-prod-action-btn flash-btn-create" onclick="flashOpenCreate(${i})">＋ Créer</button>
        </div>
      `}
    </div>`;
  });
  html += `</div>`;

  html += `
    <div class="flash-bottom-bar">
      <button class="btn btn-primary btn-lg" onclick="flashSaveControl()">Enregistrer le contrôle</button>
      <button class="btn btn-outline" onclick="flashResetPhoto()">Recommencer</button>
    </div>
    <div id="flash-save-result" style="margin-top:16px"></div>`;

  el.innerHTML = html;
}

function flashQtyAdjust(index, delta) {
  const input = document.getElementById(`flash-qty-${index}`);
  if (!input) return;
  let v = parseInt(input.value) || 0;
  v = Math.max(0, v + delta);
  input.value = v;
  flashRecalcDiff(index);
}

function flashRecalcDiff(index) {
  if (!flashResults || !flashResults.items[index]) return;
  const item = flashResults.items[index];
  if (item.product_id == null) return;
  const input = document.getElementById(`flash-qty-${index}`);
  const actual = parseFloat(input?.value) || 0;
  const theo = item.current_stock || 0;
  const diff = actual - theo;
  const cell = document.getElementById(`flash-diff-${index}`);
  if (!cell) return;
  cell.textContent = diff > 0 ? `+${diff}` : `${diff}`;
  cell.style.color = diff < 0 ? "#e74c3c" : diff > 0 ? "#f39c12" : "#27ae60";
  cell.style.fontWeight = diff !== 0 ? "700" : "";
}

async function flashSaveControl() {
  if (!flashResults || !flashResults.items) { showToast("Aucun résultat"); return; }
  const staff = userName || "Direction";
  const zone = document.getElementById("flash-zone")?.value || "";

  const counts = [];
  flashResults.items.forEach((item, i) => {
    if (item.product_id == null) return;
    const input = document.getElementById(`flash-qty-${i}`);
    counts.push({
      product_id: item.product_id,
      product_name: item.product_name,
      actual: parseFloat(input?.value) || 0,
    });
  });

  if (counts.length === 0) { showToast("Aucun produit reconnu"); return; }

  try {
    const res = await api("/api/inventory/flash-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counts, staff_name: staff, zone }),
    });
    flashControlId = res.control_id;
    flashRenderControlReport(res);
    showToast("Contrôle enregistré !");
  } catch(e) {
    document.getElementById("flash-save-result").innerHTML =
      `<div class="info-box" style="background:rgba(231,76,60,.12);border-color:#e74c3c">❌ ${esc(e.message)}</div>`;
  }
}

function flashRenderControlReport(res) {
  const el = document.getElementById("flash-results");
  const items = res.items || [];
  const nbEcarts = items.filter(it => Math.abs(it.diff) > 0.1).length;

  let html = `
    <div class="flash-report-banner flash-report-ok">
      <strong>Contrôle enregistré</strong><br>
      <span>${items.length} produit(s), ${nbEcarts} écart(s). Stock non modifié.</span>
    </div>`;

  if (res.alerts && res.alerts.length) {
    html += `<div class="flash-report-banner flash-report-warn">
      ${res.alerts.map(a => esc(a)).join("<br>")}
    </div>`;
  }

  html += `<div class="flash-products">`;
  items.forEach(item => {
    const diffStr = item.diff > 0 ? `+${item.diff}` : `${item.diff}`;
    const diffClass = item.diff < -0.1 ? "flash-diff-neg" : item.diff > 0.1 ? "flash-diff-warn" : "flash-diff-ok";
    const hasEcart = Math.abs(item.diff) > 0.1;

    html += `<div class="flash-prod-card">
      <div class="flash-prod-top">
        <div class="flash-prod-info">
          <span class="flash-prod-name">${esc(item.product_name)}</span>
          ${item.category ? `<span class="flash-prod-cat">${esc(item.category)}</span>` : ""}
        </div>
        <span class="flash-prod-diff ${diffClass}">${diffStr}</span>
      </div>
      <div class="flash-prod-compare">
        <span class="flash-prod-theo">Théo. <strong>${item.theoretical}</strong></span>
        <span class="flash-prod-theo">Compté <strong>${item.actual}</strong></span>
        <span id="flash-action-${item.product_id}" style="margin-left:auto">
          ${hasEcart
            ? `<button class="btn btn-sm btn-primary" onclick="flashCorrectProduct(${flashControlId}, ${item.product_id})">→ Stock</button>`
            : `<span style="color:#27ae60;font-weight:600">✓</span>`}
        </span>
      </div>
    </div>`;
  });
  html += `</div>`;

  html += `
    <div class="flash-bottom-bar">
      <button class="btn btn-outline" onclick="flashSwitchTab('scan')">Nouveau contrôle</button>
      <button class="btn btn-outline" onclick="flashSwitchTab('history')">Voir l'historique</button>
    </div>`;

  el.innerHTML = html;
}

async function flashCorrectProduct(controlId, productId) {
  const actionCell = document.getElementById(`flash-action-${productId}`);
  if (!actionCell) return;
  actionCell.innerHTML = `<span style="color:var(--text-muted)">…</span>`;

  try {
    const res = await api(`/api/inventory/flash-correct/${controlId}/${productId}`, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({})
    });
    actionCell.innerHTML = `<span style="color:#27ae60;font-weight:600">✓ Corrigé (${res.old_stock} → ${res.new_stock})</span>`;
    showToast(`${res.product_name} : stock corrigé`);
  } catch(e) {
    actionCell.innerHTML = `<span style="color:#e74c3c">${esc(e.message)}</span>`;
  }
}

async function flashRenderHistory() {
  const el = document.getElementById("flash-tab-content");
  el.innerHTML = `<p style="color:var(--text-muted);padding:20px;text-align:center">Chargement…</p>`;

  try {
    const controls = await api("/api/inventory/flash-history");
    if (!controls.length) {
      el.innerHTML = `<div class="info-box">Aucun contrôle enregistré pour le moment.</div>`;
      return;
    }

    let html = `<div class="flash-history-list">`;
    controls.forEach(ctrl => {
      const ecartClass = ctrl.nb_ecarts > 0 ? "flash-hist-ecart" : "flash-hist-ok";
      html += `
        <div class="flash-hist-card ${ecartClass}">
          <div class="flash-hist-header" onclick="flashToggleDetail(${ctrl.id})">
            <div>
              <strong>${esc(ctrl.date)}</strong>
              ${ctrl.staff ? ` — <span class="flash-hist-user">${esc(ctrl.staff)}</span>` : ""}
              ${ctrl.zone ? ` <span style="color:var(--text-muted);font-size:12px">(${esc(ctrl.zone)})</span>` : ""}
            </div>
            <div class="flash-hist-badges">
              <span class="flash-hist-badge">${ctrl.nb_products} produits</span>
              ${ctrl.nb_ecarts > 0
                ? `<span class="flash-hist-badge flash-badge-warn">${ctrl.nb_ecarts} écart(s)</span>`
                : `<span class="flash-hist-badge flash-badge-ok">✓ RAS</span>`}
              ${ctrl.nb_corrected > 0
                ? `<span class="flash-hist-badge flash-badge-info">${ctrl.nb_corrected} corrigé(s)</span>`
                : ""}
            </div>
          </div>
          <div class="flash-hist-detail hidden" id="flash-hist-detail-${ctrl.id}">
            <table class="data-table" style="margin:8px 0;font-size:13px">
              <thead><tr><th>Produit</th><th>Théo.</th><th>Compté</th><th>Écart</th><th>Action</th></tr></thead>
              <tbody>
                ${ctrl.items.map(it => {
                  const dc = it.diff < 0 ? "color:#e74c3c;font-weight:700" : it.diff > 0 ? "color:#f39c12;font-weight:700" : "color:#27ae60";
                  const ds = it.diff > 0 ? `+${it.diff}` : `${it.diff}`;
                  const uid = `${ctrl.id}-${it.product_id}`;
                  return `<tr>
                    <td>${esc(it.product_name)}</td>
                    <td>${it.theoretical}</td>
                    <td>
                      ${it.corrected
                        ? it.actual
                        : `<div class="flash-qty-control" style="transform:scale(0.85);transform-origin:left">
                            <button class="flash-qty-btn" onclick="flashHistQty('${uid}',-1)">−</button>
                            <input type="number" class="flash-qty-input" id="flash-hist-qty-${uid}" value="${it.actual}" min="0" step="1"
                                   onchange="flashHistRecalc('${uid}',${it.theoretical})"/>
                            <button class="flash-qty-btn" onclick="flashHistQty('${uid}',1)">+</button>
                          </div>`}
                    </td>
                    <td style="${dc}" id="flash-hist-diff-${uid}">${ds}</td>
                    <td id="flash-hist-action-${uid}">
                      ${it.corrected
                        ? `<span style="color:#27ae60;font-size:12px">✓ Corrigé ${it.corrected_at||""}</span>`
                        : it.product_id
                          ? `<button class="btn btn-sm btn-primary" style="font-size:11px" onclick="flashCorrectFromHistory(${ctrl.id}, ${it.product_id})">→ Stock</button>`
                          : `—`}
                    </td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    });
    html += `</div>`;
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="info-box" style="border-color:#e74c3c">Erreur : ${esc(e.message)}</div>`;
  }
}

function flashToggleDetail(id) {
  const el = document.getElementById(`flash-hist-detail-${id}`);
  if (el) el.classList.toggle("hidden");
}

function flashHistQty(uid, delta) {
  const input = document.getElementById(`flash-hist-qty-${uid}`);
  if (!input) return;
  let v = parseInt(input.value) || 0;
  v = Math.max(0, v + delta);
  input.value = v;
  const theo = parseFloat(input.closest("tr").querySelectorAll("td")[1].textContent) || 0;
  flashHistRecalc(uid, theo);
}

function flashHistRecalc(uid, theo) {
  const input = document.getElementById(`flash-hist-qty-${uid}`);
  const diffCell = document.getElementById(`flash-hist-diff-${uid}`);
  if (!input || !diffCell) return;
  const actual = parseFloat(input.value) || 0;
  const diff = actual - theo;
  diffCell.textContent = diff > 0 ? `+${diff}` : `${diff}`;
  diffCell.style.color = diff < 0 ? "#e74c3c" : diff > 0 ? "#f39c12" : "#27ae60";
  diffCell.style.fontWeight = diff !== 0 ? "700" : "";
}

async function flashCorrectFromHistory(controlId, productId) {
  const uid = `${controlId}-${productId}`;
  const cell = document.getElementById(`flash-hist-action-${uid}`);
  const input = document.getElementById(`flash-hist-qty-${uid}`);
  if (!cell) return;

  const qty = input ? parseFloat(input.value) : null;
  cell.innerHTML = `<span style="color:var(--text-muted)">…</span>`;

  try {
    const res = await api(`/api/inventory/flash-correct/${controlId}/${productId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qty != null ? { qty } : {}),
    });
    cell.innerHTML = `<span style="color:#27ae60;font-size:12px">✓ ${res.old_stock} → ${res.new_stock}</span>`;
    if (input) input.replaceWith(document.createTextNode(res.new_stock));
    showToast(`${res.product_name} : stock corrigé`);
  } catch(e) {
    cell.innerHTML = `<span style="color:#e74c3c;font-size:12px">${esc(e.message)}</span>`;
  }
}

// ── Associer un produit non reconnu à un produit existant ─────────────
let _flashAssocIndex = null;
let _flashAssocCat = "all";

async function flashOpenAssociate(index) {
  const item = flashResults.items[index];
  if (!item) return;
  _flashAssocIndex = index;
  _flashAssocCat = "all";

  if (!allProducts.length) {
    try { allProducts = await api("/api/products"); } catch(e) { showToast("Erreur chargement produits"); return; }
  }

  // Extraire les catégories uniques
  const cats = [...new Set(allProducts.map(p => p.category || "Autres"))].sort();

  const searchName = esc(item.product_name);
  openModal(`
    <h3 style="margin-bottom:12px">🔗 Associer "${searchName}"</h3>
    <input type="text" id="flash-assoc-search" placeholder="🔍 Tapez pour rechercher…"
           oninput="flashFilterAssoc()" autofocus
           style="margin-bottom:10px;width:100%;font-size:16px;padding:10px 12px"/>
    <div class="flash-assoc-cats" id="flash-assoc-cats">
      <button class="flash-cat-btn active" onclick="flashSetAssocCat('all')">Tous</button>
      ${cats.map(c => `<button class="flash-cat-btn" onclick="flashSetAssocCat('${esc(c).replace(/'/g,"\\'")}')">${esc(c)}</button>`).join("")}
    </div>
    <div id="flash-assoc-list" class="flash-assoc-list"></div>
  `);
  flashFilterAssoc();
}

function flashSetAssocCat(cat) {
  _flashAssocCat = cat;
  document.querySelectorAll(".flash-cat-btn").forEach(b => b.classList.toggle("active", b.textContent === (cat === "all" ? "Tous" : cat)));
  flashFilterAssoc();
}

function _flashNormalize(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/saint/g, "st");
}

function flashFilterAssoc() {
  const q = _flashNormalize(document.getElementById("flash-assoc-search")?.value || "");
  const container = document.getElementById("flash-assoc-list");
  if (!container) return;

  const filtered = allProducts.filter(p => {
    if (_flashAssocCat !== "all" && p.category !== _flashAssocCat) return false;
    if (!q) return true;
    const name = _flashNormalize(p.name + " " + (p.category || ""));
    return name.includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">Aucun produit trouvé</div>`;
    return;
  }

  const idx = _flashAssocIndex;
  container.innerHTML = filtered.map(p =>
    `<div class="flash-assoc-option" onclick="flashDoAssociate(${idx}, ${p.id}, '${esc(p.name).replace(/'/g,"\\'")}', ${p.stock || 0}, '${esc(p.category).replace(/'/g,"\\'")}')">
      <div>
        <strong>${esc(p.name)}</strong><br>
        <small style="color:var(--text-muted)">${esc(p.category)}</small>
      </div>
      <span style="color:var(--text-muted);font-size:13px">stock: ${p.stock || 0}</span>
    </div>`
  ).join("");
}

function flashDoAssociate(index, productId, productName, stock, category) {
  if (!flashResults || !flashResults.items[index]) return;
  const item = flashResults.items[index];
  item.product_id = productId;
  item.current_stock = stock;
  item.category = category;

  // Mettre à jour la ligne dans le tableau
  const actionsDiv = document.getElementById(`flash-unmatched-${index}`);
  if (actionsDiv) {
    actionsDiv.innerHTML = `<small style="color:#27ae60">✓ Associé à <strong>${productName}</strong></small>`;
  }

  // Recalculer l'écart
  const diff = item.quantity - stock;
  const diffCell = document.getElementById(`flash-diff-${index}`);
  if (diffCell) {
    diffCell.textContent = diff > 0 ? `+${diff}` : `${diff}`;
    diffCell.style.color = diff < 0 ? "#e74c3c" : diff > 0 ? "#f39c12" : "#27ae60";
    diffCell.style.fontWeight = diff !== 0 ? "700" : "";
  }

  // Mettre à jour le stock théorique affiché
  const row = document.getElementById(`flash-row-${index}`);
  if (row) {
    const cells = row.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = stock;
  }

  closeModal();
  showToast(`${item.product_name} → ${productName}`);
}

// ── Créer un nouveau produit depuis la détection IA ───────────────────
function flashOpenCreate(index) {
  const item = flashResults.items[index];
  if (!item) return;

  const categories = ["Bières","Vins Blancs","Vins Rosés","Vins Rouges","Champagnes","Anisés","Apéritifs","Rhums","Gins","Whiskies","Vodkas","Cachaça","Tequilas","Digestifs","Eaux","Sodas","Cocktails SA","Autres"];

  // Essayer de deviner la catégorie depuis la détection IA
  const aiCat = (item.category || item.product_name || "").toLowerCase();
  let guessedCat = "Autres";
  if (aiCat.includes("eau") || aiCat.includes("water") || aiCat.includes("mineral")) guessedCat = "Eaux";
  else if (aiCat.includes("bière") || aiCat.includes("beer") || aiCat.includes("pietra") || aiCat.includes("ipa")) guessedCat = "Bières";
  else if (aiCat.includes("vin") || aiCat.includes("wine")) guessedCat = "Vins Rouges";
  else if (aiCat.includes("coca") || aiCat.includes("soda") || aiCat.includes("schweppes") || aiCat.includes("orangina") || aiCat.includes("pago")) guessedCat = "Sodas";
  else if (aiCat.includes("ricard") || aiCat.includes("pastis") || aiCat.includes("anis")) guessedCat = "Anisés";
  else if (aiCat.includes("rhum") || aiCat.includes("rum")) guessedCat = "Rhums";
  else if (aiCat.includes("gin")) guessedCat = "Gins";
  else if (aiCat.includes("whisk") || aiCat.includes("bourbon")) guessedCat = "Whiskies";
  else if (aiCat.includes("vodka")) guessedCat = "Vodkas";
  else if (aiCat.includes("champagne") || aiCat.includes("prosecco")) guessedCat = "Champagnes";

  openModal(`
    <h3 style="margin-bottom:12px">➕ Créer un produit</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">Pré-rempli par l'IA. Ajustez si besoin puis validez.</p>
    <form id="flash-create-form" onsubmit="flashDoCreate(event, ${index})">
      <div class="form-row">
        <div class="form-group">
          <label>Nom *</label>
          <input type="text" name="name" required value="${esc(item.product_name)}"/>
        </div>
        <div class="form-group">
          <label>Catégorie *</label>
          <select name="category" required>
            ${categories.map(c => `<option ${c===guessedCat?"selected":""}>${c}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Unité</label>
          <select name="unit">
            ${["Bouteille","Fût","Carton 6","Carton 12","Carton 24","Bidon"].map(u => `<option>${u}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Volume (cl)</label>
          <input type="number" name="volume_cl" value="75" step="1"/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Stock initial</label>
          <input type="number" name="stock" value="${item.quantity}" step="1" min="0"/>
        </div>
        <div class="form-group">
          <label>Seuil d'alerte</label>
          <input type="number" name="alert_threshold" value="2" step="1" min="0"/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Prix achat HT (€)</label>
          <input type="number" name="purchase_price" step="0.01" placeholder="optionnel"/>
        </div>
        <div class="form-group">
          <label>Prix vente TTC (€)</label>
          <input type="number" name="sale_price_ttc" step="0.01" placeholder="optionnel"/>
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:12px;width:100%">✅ Créer le produit</button>
    </form>
  `);
}

async function flashDoCreate(event, index) {
  event.preventDefault();
  const form = document.getElementById("flash-create-form");
  const fd = new FormData(form);

  const body = {
    name: fd.get("name"),
    category: fd.get("category"),
    unit: fd.get("unit"),
    volume_cl: parseFloat(fd.get("volume_cl")) || 75,
    stock: parseFloat(fd.get("stock")) || 0,
    alert_threshold: parseFloat(fd.get("alert_threshold")) || 2,
    purchase_price: fd.get("purchase_price") ? parseFloat(fd.get("purchase_price")) : null,
    sale_price_ttc: fd.get("sale_price_ttc") ? parseFloat(fd.get("sale_price_ttc")) : null,
  };

  try {
    const product = await api("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Mettre à jour le flash result avec le nouveau produit
    const item = flashResults.items[index];
    item.product_id = product.id;
    item.current_stock = product.stock;
    item.category = product.category;

    const actionsDiv = document.getElementById(`flash-unmatched-${index}`);
    if (actionsDiv) {
      actionsDiv.innerHTML = `<small style="color:#27ae60">✓ Produit créé : <strong>${esc(product.name)}</strong></small>`;
    }

    const row = document.getElementById(`flash-row-${index}`);
    if (row) {
      const cells = row.querySelectorAll("td");
      if (cells[1]) cells[1].textContent = product.stock;
    }

    // Recalculer l'écart
    const diff = item.quantity - product.stock;
    const diffCell = document.getElementById(`flash-diff-${index}`);
    if (diffCell) {
      diffCell.textContent = diff > 0 ? `+${diff}` : `${diff}`;
      diffCell.style.color = diff < 0 ? "#e74c3c" : diff > 0 ? "#f39c12" : "#27ae60";
    }

    closeModal();
    showToast(`Produit "${product.name}" créé !`);

    // Rafraîchir allProducts
    allProducts = await api("/api/products");
  } catch(e) {
    showToast("Erreur : " + e.message);
  }
}


// ══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD — widgets
// ══════════════════════════════════════════════════════════════════════════

function renderLastSyncCard(sync) {
  if (!sync) return "";
  if (!sync.has_sync) {
    return `<div class="db-card db-card-clickable db-sync-empty" onclick="switchView('cashpad')" title="Importer depuis Cashpad">
      <div class="db-card-title">⏱️ Dernière sync Cashpad</div>
      <div class="db-sync-row">
        <span class="db-sync-icon">📭</span>
        <div>
          <div class="db-sync-label">Aucun import</div>
          <div class="db-sync-date">Cliquez pour importer</div>
        </div>
      </div>
    </div>`;
  }
  const statusClass = sync.status === "ok" ? "db-sync-ok" : sync.status === "warn" ? "db-sync-warn" : "db-sync-error";
  const icon = sync.status === "ok" ? "✅" : sync.status === "warn" ? "⚠️" : "🔴";
  return `<div class="db-card db-card-clickable ${statusClass}" onclick="switchView('cashpad')" title="Ouvrir Cashpad">
    <div class="db-card-title">⏱️ Dernière sync Cashpad</div>
    <div class="db-sync-row">
      <span class="db-sync-icon">${icon}</span>
      <div>
        <div class="db-sync-label">${esc(sync.label)}</div>
        <div class="db-sync-date">${esc(sync.date_fr)}</div>
      </div>
    </div>
  </div>`;
}

function renderPendingOrdersCard(orders) {
  orders = orders || [];
  if (orders.length === 0) {
    return `<div class="db-card db-card-clickable" onclick="switchView('orders')" title="Voir les commandes">
      <div class="db-card-title">🛒 Commandes en attente</div>
      <div class="db-sync-row">
        <span class="db-sync-icon">✅</span>
        <div>
          <div class="db-sync-label">Tout est à jour</div>
          <div class="db-sync-date">Aucune commande en attente</div>
        </div>
      </div>
    </div>`;
  }
  const rows = orders.slice(0, 5).map(o => {
    const dayColor = o.days_since >= 5 ? "#dc2626" : o.days_since >= 3 ? "#f59e0b" : "#6b7280";
    const daysLabel = o.days_since === 0 ? "aujourd'hui" : o.days_since === 1 ? "hier" : `il y a ${o.days_since}j`;
    return `<div class="db-order-row">
      <div class="db-order-main">
        <span class="db-order-ref">${esc(o.reference)}</span>
        <span class="db-order-sup">${esc(o.supplier || "—")}</span>
      </div>
      <span class="db-order-days" style="color:${dayColor}">${daysLabel}</span>
    </div>`;
  }).join("");
  return `<div class="db-card db-card-clickable" onclick="switchView('orders')" title="Voir les commandes">
    <div class="db-card-title">🛒 Commandes en attente <span class="db-card-badge">${orders.length}</span></div>
    ${rows}
  </div>`;
}

function renderWeekdayCaCard(weekdays) {
  weekdays = weekdays || [];
  const hasData = weekdays.some(d => d.n_days > 0);
  if (!hasData) {
    return `<div class="db-card db-card-clickable" onclick="switchView('cashpad')" title="Importer depuis Cashpad">
      <div class="db-card-title">📊 CA par jour de la semaine</div>
      <div class="db-empty-hero">
        <div class="db-empty-icon">📈</div>
        <div class="db-empty-title">Pas encore de données</div>
        <div class="db-empty-sub">Importez vos ventes Cashpad pour voir apparaître le CA moyen par jour</div>
      </div>
    </div>`;
  }
  const maxAvg = Math.max(...weekdays.map(d => d.avg), 1);
  const bars = weekdays.map(d => {
    const h = Math.max(4, (d.avg / maxAvg) * 90);
    const isTop = d.avg === maxAvg && d.avg > 0;
    const pct = maxAvg > 0 ? Math.round((d.avg / maxAvg) * 100) : 0;
    return `<div class="db-wd-col" title="${esc(d.day)} : moyenne €${d.avg.toFixed(0)} sur ${d.n_days} jour(s)">
      <div class="db-wd-val">${d.avg > 0 ? "€" + d.avg.toFixed(0) : "—"}</div>
      <div class="db-wd-bar-wrap"><div class="db-wd-bar ${isTop ? 'db-wd-bar-top' : ''}" style="height:${h}px"></div></div>
      <div class="db-wd-day">${esc(d.day.slice(0,3))}</div>
      ${isTop ? '<div class="db-wd-crown">👑</div>' : ''}
    </div>`;
  }).join("");
  return `<div class="db-card db-card-full db-card-clickable" onclick="switchView('stats')" title="Voir les statistiques">
    <div class="db-card-title">📊 CA moyen par jour de la semaine <span class="db-card-sub">· 4 dernières semaines</span></div>
    <div class="db-wd-grid">${bars}</div>
  </div>`;
}

function renderSeasonGoalCard(goal) {
  if (!goal) return "";
  if (!goal.configured) {
    return `<div class="db-card db-card-clickable" onclick="openSeasonGoalModal()" title="Définir un objectif">
      <div class="db-card-title">🎯 Objectif saison</div>
      <div class="db-sync-row">
        <span class="db-sync-icon">🎯</span>
        <div>
          <div class="db-sync-label">Aucun objectif défini</div>
          <div class="db-sync-date">Cliquez pour en créer un</div>
        </div>
      </div>
    </div>`;
  }
  const pct = Math.min(goal.pct || 0, 100);
  const pctColor = pct >= 100 ? "#16a34a" : pct >= 75 ? "#84cc16" : pct >= 50 ? "#f59e0b" : "#dc2626";
  let subLine;
  if (goal.before_start) {
    subLine = `Saison non commencée`;
  } else if (goal.after_end) {
    subLine = pct >= 100 ? `🏆 Objectif atteint !` : `Saison terminée (${pct.toFixed(1)}%)`;
  } else {
    const rythme = goal.rythme_daily || 0;
    subLine = goal.days_remaining > 0
      ? `Reste ${goal.days_remaining}j · il faut €${rythme.toFixed(0)}/jour`
      : `Dernier jour !`;
  }
  const fmt = v => (v || 0).toLocaleString("fr-FR", { style:"currency", currency:"EUR", maximumFractionDigits:0 });
  return `<div class="db-card">
    <div class="db-card-title">🎯 Objectif saison
      <button class="db-goal-edit" onclick="event.stopPropagation();openSeasonGoalModal()" title="Modifier l'objectif">✏️</button>
    </div>
    <div class="db-goal-amounts">
      <span class="db-goal-done">${fmt(goal.ca_so_far)}</span>
      <span class="db-goal-pct" style="color:${pctColor}">${pct.toFixed(1)}%</span>
    </div>
    <div class="db-goal-target">/ ${fmt(goal.amount)}</div>
    <div class="db-goal-bar-wrap">
      <div class="db-goal-bar" style="width:${pct}%;background:${pctColor}"></div>
    </div>
    <div class="db-goal-sub">${subLine}</div>
  </div>`;
}

async function openSeasonGoalModal() {
  let current = { amount: 0, start: "", end: "" };
  try { current = await api("/api/season-goal"); } catch(_) {}
  const thisYear = new Date().getFullYear();
  openModal(`
    <h3 style="margin-bottom:16px">🎯 Objectif CA saison</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
      Définissez un objectif de chiffre d'affaires à atteindre sur la période de la saison.
      La progression se base sur les imports Cashpad.
    </p>
    <div class="form-group">
      <label>Objectif CA (€)</label>
      <input type="number" id="sg-amount" step="100" min="0" value="${current.amount || 0}" placeholder="150000"/>
    </div>
    <div class="form-group">
      <label>Date de début</label>
      <input type="date" id="sg-start" value="${current.start || thisYear + '-05-01'}"/>
    </div>
    <div class="form-group">
      <label>Date de fin</label>
      <input type="date" id="sg-end" value="${current.end || thisYear + '-09-30'}"/>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveSeasonGoal()">💾 Enregistrer</button>
    </div>`);
}

async function saveSeasonGoal() {
  const amount = parseFloat(document.getElementById("sg-amount").value) || 0;
  const start = document.getElementById("sg-start").value;
  const end = document.getElementById("sg-end").value;
  if (amount <= 0) { alert("Objectif invalide."); return; }
  if (!start || !end) { alert("Dates requises."); return; }
  if (end < start) { alert("La date de fin doit être postérieure à la date de début."); return; }
  try {
    await api("/api/season-goal", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ amount, start, end }),
    });
    closeModal();
    renderDashboard(document.getElementById("app"));
  } catch(e) { alert("Erreur : " + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD
// ══════════════════════════════════════════════════════════════════════════

async function renderDashboard(el) {
  el.innerHTML = `<div class="db-wrap"><p style="color:var(--text-muted);text-align:center;padding:40px">Chargement du tableau de bord…</p></div>`;

  let data;
  try {
    await api("/api/weather").catch(() => null);
    data = await api("/api/dashboard");
  } catch(e) {
    el.innerHTML = `<div class="db-wrap"><p style="color:red;text-align:center;padding:40px">Erreur : ${esc(e.message)}</p></div>`;
    return;
  }

  // ── KPIs stock (depuis allProducts déjà chargé) ────────────────────────
  const withVal   = allProducts.filter(p => p.valeur_stock !== null);
  const totalVal  = withVal.reduce((s, p) => s + p.valeur_stock, 0);
  const ruptures  = allProducts.filter(p => p.stock === 0).length;
  const stockBas  = allProducts.filter(p => p.stock > 0 && p.stock <= p.alert_threshold).length;
  const margesOk  = allProducts.filter(p => p.marge_color === "green").length;
  const nbProd    = allProducts.length;
  const nbEnStock = allProducts.filter(p => p.stock > 0).length;
  const ruptureColor = ruptures > 0 ? "#dc2626" : "#16a34a";

  // ── Greeting ───────────────────────────────────────────────────────────
  if (window.__dashClockTimer) { clearInterval(window.__dashClockTimer); window.__dashClockTimer = null; }
  const now = new Date();
  const hour = now.getHours();
  let greeting = "Bonne journée";
  if (hour < 6)  greeting = "Bonne nuit";
  else if (hour < 12) greeting = "Bonjour";
  else if (hour < 18) greeting = "Bon après-midi";
  else greeting = "Bonsoir";

  const dateStr = now.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const dateCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // ── Météo ──────────────────────────────────────────────────────────────
  const w = data.weather || {};
  let weatherHtml;
  if (!w.configured) {
    weatherHtml = `<p class="db-empty">Météo non configurée</p>`;
  } else if (w.stale || !w.current_temp) {
    weatherHtml = `<p class="db-empty">Données météo indisponibles</p>`;
  } else {
    weatherHtml = `
      <div class="db-weather-mini">
        <span class="db-weather-emoji">${esc(w.alert_emoji || "⛅")}</span>
        <span class="db-weather-temp">${w.current_temp}°C</span>
      </div>
      <div class="db-weather-city">${esc(w.city || "")}</div>
      <div class="db-weather-label">${esc(w.alert_label || "")}</div>`;
  }

  // ── CA ─────────────────────────────────────────────────────────────────
  const fmtCA = v => (v || 0).toLocaleString("fr-FR", { style:"currency", currency:"EUR", minimumFractionDigits:2 });

  // ── Alertes ────────────────────────────────────────────────────────────
  const alerts = data.urgent_alerts || [];
  let alertsHtml;
  if (alerts.length === 0) {
    alertsHtml = `<p class="db-empty">✅ Aucune alerte stock urgente</p>`;
  } else {
    alertsHtml = alerts.map(a => {
      const isRupture = a.stock <= 0;
      const badge = isRupture
        ? `<span class="db-badge db-badge-red">Rupture</span>`
        : `<span class="db-badge db-badge-orange">${a.stock} ${esc(a.unit)}</span>`;
      return `<div class="db-alert-row">
        <span class="db-alert-name">${esc(a.name)}</span>
        ${badge}
      </div>`;
    }).join("");
  }

  // ── Événements ─────────────────────────────────────────────────────────
  const events = data.events_upcoming || [];
  let eventsHtml;
  if (events.length === 0) {
    eventsHtml = `
      <p class="db-empty">Aucun événement planifié</p>
      <button class="db-shortcut-btn" onclick="switchView('events')">＋ Ajouter un événement</button>`;
  } else {
    eventsHtml = events.map(ev => {
      const dStr = formatEventRange(ev, { short: true });
      return `<div class="db-event-row db-event-clickable" onclick="switchView('events')" title="Ouvrir les événements">
        <span class="db-event-date">${dStr}</span>
        <span class="db-event-name">${esc(ev.name)}</span>
        <span class="db-event-type">${esc(ev.event_type || "")}</span>
      </div>`;
    }).join("");
  }

  // ── Top produits ───────────────────────────────────────────────────────
  const tops = data.top_products || [];
  let topsHtml;
  if (tops.length === 0) {
    topsHtml = `
      <p class="db-empty">Aucune vente Cashpad importée cette semaine</p>
      <button class="db-shortcut-btn" onclick="switchView('cashpad')">→ Importer depuis Cashpad</button>`;
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    topsHtml = tops.map((t, i) =>
      `<div class="db-top-row">
        <span class="db-top-medal">${medals[i] || ""}</span>
        <span class="db-top-name">${esc(t.name)}</span>
        <span class="db-top-qty">${t.qty_sold} ${esc(t.unit)}</span>
      </div>`
    ).join("");
  }

  // ── Countdown fin de saison ────────────────────────────────────────────
  const endSeason = new Date(now.getFullYear(), 9, 5); // 5 octobre
  if (endSeason < now) endSeason.setFullYear(endSeason.getFullYear() + 1);
  const daysLeft = Math.ceil((endSeason - now) / (1000 * 60 * 60 * 24));
  const countdownEmoji = daysLeft > 60 ? "☀️" : daysLeft > 30 ? "🔥" : "🏁";

  // ── Render ─────────────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="db-wrap">
      <div class="db-greeting">
        <div class="db-greeting-top">
          ${userPhoto ? `<img src="${userPhoto}" class="db-greeting-avatar" onclick="flashOpenAvatarUpload()"/>` : ""}
          <div>
            <div class="db-greeting-hello">${esc(greeting)}${userName ? ` ${esc(userName)}` : ""} 👋</div>
            <div class="db-greeting-date">${dateCap} <span class="db-greeting-clock" id="db-greeting-clock"></span></div>
          </div>
          <div class="db-countdown">
            <div class="db-countdown-num">${countdownEmoji} ${daysLeft}</div>
            <div class="db-countdown-label">jours avant fin de saison</div>
          </div>
        </div>
      </div>

      <div id="db-service-alerts"></div>

      <div class="db-kpi-row" onclick="switchView('stock')">
        <div class="db-kpi">
          <div class="db-kpi-label">💰 Valeur stock</div>
          <div class="db-kpi-val">€${totalVal.toFixed(0)}</div>
          <div class="db-kpi-sub">${withVal.length} valorisés</div>
        </div>
        <div class="db-kpi-sep"></div>
        <div class="db-kpi">
          <div class="db-kpi-label">📦 Produits</div>
          <div class="db-kpi-val">${nbProd}</div>
          <div class="db-kpi-sub">${nbEnStock} en stock</div>
        </div>
        <div class="db-kpi-sep"></div>
        <div class="db-kpi">
          <div class="db-kpi-label">🚨 Ruptures</div>
          <div class="db-kpi-val" style="color:${ruptureColor}">${ruptures}</div>
          <div class="db-kpi-sub">${stockBas > 0 ? `⚠️ ${stockBas} stock bas` : "Stock sain ✅"}</div>
        </div>
        <div class="db-kpi-sep"></div>
        <div class="db-kpi">
          <div class="db-kpi-label">📈 Marge ≥ 70%</div>
          <div class="db-kpi-val" style="color:#16a34a">${margesOk}</div>
          <div class="db-kpi-sub">sur ${allProducts.filter(p => p.marge !== null).length} valorisés</div>
        </div>
      </div>

      <div class="db-grid">

        <div class="db-card db-card-clickable" onclick="switchView('alerts')" title="Ouvrir les alertes">
          <div class="db-card-title">🌡️ Météo</div>
          ${weatherHtml}
        </div>

        <div class="db-card db-card-clickable" onclick="switchView('stats')" title="Voir les statistiques">
          <div class="db-card-title">💰 Chiffre d'affaires</div>
          <div class="db-ca-row">
            <div class="db-ca-block">
              <div class="db-ca-label">Hier</div>
              <div class="db-card-value">${fmtCA(data.ca_yesterday)}</div>
            </div>
            <div class="db-ca-sep"></div>
            <div class="db-ca-block">
              <div class="db-ca-label">7 derniers jours</div>
              <div class="db-card-value db-card-value-sm">${fmtCA(data.ca_week)}</div>
            </div>
          </div>
          ${(() => {
            const n1 = data.ca_n1 || 0;
            const hier = data.ca_yesterday || 0;
            const diff = hier - n1;
            const pct = n1 > 0 ? Math.round((diff / n1) * 100) : null;
            const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
            const color = diff > 0 ? "#27ae60" : diff < 0 ? "#e74c3c" : "var(--text-muted)";
            return `<div class="db-ca-n1">
              <div class="db-ca-n1-label">N-1 — ${esc(data.ca_n1_day || "")} ${esc(data.ca_n1_date || "")}</div>
              <div class="db-ca-n1-row">
                <span class="db-ca-n1-val">${fmtCA(n1)}</span>
                ${pct !== null ? `<span class="db-ca-n1-diff" style="color:${color}">${arrow} ${Math.abs(pct)}%</span>` : ""}
                ${diff !== 0 ? `<span class="db-ca-n1-euro" style="color:${color}">(${diff > 0 ? "+" : ""}${fmtCA(diff)})</span>` : ""}
              </div>
            </div>`;
          })()}
        </div>

        <div class="db-card db-card-clickable" onclick="switchView('alerts')" title="Voir toutes les alertes">
          <div class="db-card-title">🔴 Alertes stock urgentes</div>
          ${alertsHtml}
        </div>

        <div class="db-card db-card-clickable" onclick="switchView('events')" title="Gérer les événements">
          <div class="db-card-title">📅 Prochains événements</div>
          <div class="db-events-scroll">${eventsHtml}</div>
        </div>

        ${renderLastSyncCard(data.last_sync)}
        ${renderPendingOrdersCard(data.pending_orders)}
        ${renderSeasonGoalCard(data.season_goal)}

        <div class="db-card db-card-clickable" onclick="switchView('stats')" title="Voir les statistiques">
          <div class="db-card-title">📦 Top 3 produits <span class="db-card-sub">· cette semaine</span></div>
          ${topsHtml}
        </div>

        ${renderWeekdayCaCard(data.ca_weekday)}

        <div class="db-card db-card-full db-card-clickable" id="db-manque-gagner" onclick="switchView('shrinkage')" title="Voir la démarque">
          <div class="db-card-title">💸 Manque à gagner <span class="db-card-sub">· ruptures</span></div>
          <p class="db-empty">Chargement…</p>
        </div>

      </div>
    </div>`;

  // Horloge temps réel (mise à jour chaque seconde)
  const tickClock = () => {
    const el = document.getElementById("db-greeting-clock");
    if (!el) { if (window.__dashClockTimer) { clearInterval(window.__dashClockTimer); window.__dashClockTimer = null; } return; }
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    el.textContent = `· ${hh}:${mm}:${ss}`;
  };
  tickClock();
  window.__dashClockTimer = setInterval(tickClock, 1000);

  // Charger les alertes serveur
  api("/api/service-alerts?status=open").then(alerts => {
    const el = document.getElementById("db-service-alerts");
    if (!el || !alerts.length) return;
    el.innerHTML = `
      <div class="db-alerts-widget" onclick="switchView('service_alert')">
        <div class="db-alerts-header">
          <span>🚨 Signalements service</span>
          <span class="db-alerts-count">${alerts.length}</span>
        </div>
        ${alerts.slice(0, 5).map(a => `
          <div class="db-alert-item">
            <span class="db-alert-name">${esc(a.product_name)}</span>
            ${a.is_rupture
              ? '<span class="db-alert-tag db-alert-tag-rupture">RUPTURE</span>'
              : `<span class="db-alert-tag db-alert-tag-low">${a.reported_stock} restant</span>`}
            <span class="db-alert-by">${esc(a.staff_name)} · ${esc(a.created_at)}</span>
          </div>
        `).join("")}
        ${alerts.length > 5 ? `<div style="text-align:center;font-size:12px;color:var(--text-muted);padding-top:4px">+ ${alerts.length - 5} autre(s)</div>` : ""}
      </div>`;
  }).catch(() => {});

  // Charger le manque à gagner en parallèle
  api("/api/manque-a-gagner").then(mag => {
    const el = document.getElementById("db-manque-gagner");
    if (!el) return;
    if (!mag.items || mag.items.length === 0) {
      el.innerHTML = `<div class="db-card-title">💸 Manque à gagner (ruptures)</div>
        <p class="db-empty">✅ Aucune perte due aux ruptures ce mois — ${esc(mag.month)}</p>`;
    } else {
      el.innerHTML = `<div class="db-card-title">💸 Manque à gagner — ${esc(mag.month)}</div>
        <div class="db-mag-total">${fmtCA(mag.total_lost)} perdus</div>
        ${mag.items.map(it => `
          <div class="db-mag-row">
            <span class="db-mag-name">${esc(it.product_name)}</span>
            <span class="db-mag-detail">${it.hours_rupture}h en rupture</span>
            <span class="db-mag-loss">−${fmtCA(it.lost_eur)}</span>
          </div>
        `).join("")}`;
    }
  }).catch(() => {});
}
