/* Vertex: keyless live intelligence dashboard */

var FALLBACK_MARKETS = {
  generatedAt: null,
  quotes: {
    SPX: { name: "S&P 500", price: 7353.61, pct: -0.67 },
    COMP: { name: "NASDAQ", price: 25870.71, pct: -0.84 },
    DJI: { name: "DOW", price: 49363.88, pct: -0.65 },
    BTC: { name: "BTC", price: 76560, pct: -0.2 },
    GOLD: { name: "Gold", price: 4475.91, pct: -0.14 },
    OIL: { name: "Oil", price: 103.68, pct: 4.59 },
    VIX: { name: "VIX", price: 20.42, pct: 0.67 }
  },
  futures: {
    ES: { name: "S&P Futures", price: 7367, pct: -0.07 },
    NQ: { name: "Nasdaq Futures", price: 28899.25, pct: 0 },
    YM: { name: "Dow Futures", price: 49346, pct: -0.17 },
    GC: { name: "Gold Futures", price: 4478.32, pct: -0.18 },
    CL: { name: "Oil Futures", price: 103.66, pct: 4.57 },
    VX: { name: "VIX Futures", price: 20.42, pct: 0.67 }
  }
};

var state = {
  markets: FALLBACK_MARKETS,
  crypto: null,
  fearGreed: null,
  polymarket: [],
  breaking: [],
  ai: [],
  politics: [],
  cryptoNews: [],
  sentimentNews: [],
  loading: false
};

var NEWS_QUERIES = {
  breaking: 'Trump OR bitcoin OR OpenAI OR markets OR "Federal Reserve" when:3d',
  ai: 'OpenAI OR Anthropic OR ChatGPT OR Claude OR Gemini OR DeepMind OR xAI when:14d',
  politics: 'Trump OR Congress OR Senate OR "White House" OR "Supreme Court" OR election OR tariff OR "executive order" when:7d',
  crypto: 'bitcoin OR ethereum OR crypto OR ETF OR stablecoin OR Coinbase when:7d',
  sentiment: 'bitcoin OR ethereum OR crypto OR ETF OR Coinbase when:3d'
};

function $(selector, root) {
  return (root || document).querySelector(selector);
}

function $all(selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
  });
}

function stripHtml(value) {
  var node = document.createElement("div");
  node.innerHTML = value || "";
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

function safeUrl(value) {
  try {
    var url = new URL(value, window.location.href);
    return /^https?:$/.test(url.protocol) ? url.href : "#";
  } catch (err) {
    return "#";
  }
}

function formatPrice(value, compact) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (compact && Math.abs(num) >= 1000) return "$" + Math.round(num).toLocaleString();
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(num) >= 10) return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatCryptoPrice(value) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (num >= 1000) return "$" + Math.round(num).toLocaleString();
  if (num >= 1) return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + num.toFixed(4);
}

function formatCompact(value) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (num >= 1e12) return "$" + (num / 1e12).toFixed(2) + "T";
  if (num >= 1e9) return "$" + (num / 1e9).toFixed(1) + "B";
  if (num >= 1e6) return "$" + (num / 1e6).toFixed(1) + "M";
  return "$" + Math.round(num).toLocaleString();
}

function pctClass(value) {
  return Number(value) >= 0 ? "positive" : "negative";
}

function pctText(value) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return (num >= 0 ? "▲ " : "▼ ") + Math.abs(num).toFixed(2) + "%";
}

function timeAgo(value) {
  if (!value) return "live";
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "live";
  var seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return seconds + "s ago";
  var minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  var hours = Math.round(minutes / 60);
  if (hours < 48) return hours + "h ago";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fetchJson(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 12000);
  return fetch(url, { signal: controller.signal, cache: "no-store" })
    .then(function(res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return res.json();
    });
}

function parseNewsTitle(title) {
  var clean = stripHtml(title);
  var idx = clean.lastIndexOf(" - ");
  if (idx > clean.length * 0.3) {
    return { title: clean.slice(0, idx).trim(), source: clean.slice(idx + 3).trim() };
  }
  return { title: clean, source: "Google News" };
}

function normalizeNews(items) {
  var seen = {};
  return (items || []).map(function(item) {
    var parsed = parseNewsTitle(item.title);
    var date = new Date((item.pubDate || "").replace(" ", "T"));
    if (isNaN(date.getTime())) date = new Date(item.pubDate || Date.now());
    return {
      title: parsed.title,
      source: parsed.source,
      url: safeUrl(item.link),
      summary: stripHtml(item.description || item.content || ""),
      isoDate: date.toISOString(),
      timestamp: date.getTime()
    };
  }).filter(function(item) {
    var key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 52);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return item.title && item.url !== "#";
  }).sort(function(a, b) {
    return b.timestamp - a.timestamp;
  });
}

function fetchNews(query, limit) {
  var rss = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
  var api = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rss);
  return fetchJson(api, 14000)
    .then(function(payload) {
      if (!payload || payload.status !== "ok") return [];
      return normalizeNews(payload.items).slice(0, limit || 10);
    })
    .catch(function(err) {
      console.warn("News feed failed", err);
      return [];
    });
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (err) { return []; }
  }
  return [];
}

function marketCategory(title) {
  var t = String(title || "").toLowerCase();
  if (/bitcoin|btc|ethereum|crypto|solana/.test(t)) return "Crypto";
  if (/election|trump|biden|congress|senate|supreme court|nominee/.test(t)) return "Politics";
  if (/fed|rate|oil|inflation|stock|nasdaq|s&p|tesla/.test(t)) return "Markets";
  if (/openai|anthropic|ai|gpt|gemini|claude/.test(t)) return "AI";
  if (/nba|nfl|ufc|soccer|tennis| vs\. /.test(t)) return "Sports";
  return "Top";
}

function normalizePolymarket(market) {
  var outcomes = parseArray(market.outcomes);
  var prices = parseArray(market.outcomePrices).map(Number);
  var bestIndex = 0;
  var bestPrice = -1;
  prices.forEach(function(price, index) {
    if (Number.isFinite(price) && price > bestPrice) {
      bestPrice = price;
      bestIndex = index;
    }
  });
  var event = market.events && market.events[0] ? market.events[0] : null;
  var title = market.question || (event && event.title) || "Polymarket market";
  var slug = (event && event.slug) || market.slug;
  return {
    id: market.id || market.conditionId || title,
    title: title,
    category: marketCategory(title),
    topOutcome: outcomes[bestIndex] || "Top outcome",
    odds: bestPrice >= 0 ? Math.round(bestPrice * 1000) / 10 : null,
    volume: Number(market.volume24hr || market.volume || 0) || 0,
    url: slug ? "https://polymarket.com/event/" + slug : "https://polymarket.com"
  };
}

function getEtDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function stockSession() {
  var d = getEtDate();
  var day = d.getDay();
  var minutes = d.getHours() * 60 + d.getMinutes();
  if (day === 0 || day === 6) return "Closed";
  if (minutes >= 240 && minutes < 570) return "Pre-market";
  if (minutes >= 570 && minutes < 960) return "Open";
  if (minutes >= 960 && minutes < 1200) return "After hours";
  return "Closed";
}

function futuresSession() {
  var d = getEtDate();
  var day = d.getDay();
  var minutes = d.getHours() * 60 + d.getMinutes();
  if (day === 6) return "Closed";
  if (day === 0) return minutes >= 1080 ? "Open" : "Closed";
  if (day === 5) return minutes < 1020 ? "Open" : "Closed";
  if (minutes >= 1020 && minutes < 1080) return "Break";
  return "Open";
}

function setStatus(text) {
  var stamp = $("#header-timestamp");
  if (stamp) stamp.textContent = text;
}

function renderTicker() {
  var wrap = $("#ticker-inner");
  if (!wrap) return;
  var quotes = state.markets.quotes || {};
  var order = ["SPX", "COMP", "DJI", "BTC", "GOLD", "OIL", "VIX"];
  var items = order.filter(function(key) { return quotes[key]; }).map(function(key) {
    var quote = quotes[key];
    var price = key === "BTC" ? formatCryptoPrice(quote.price) : formatPrice(quote.price);
    return '<span class="ticker-item"><span class="ticker-name">' + escapeHtml(quote.name || key) + '</span><span class="ticker-price">' + price + '</span><span class="ticker-change ' + pctClass(quote.pct) + '">' + pctText(quote.pct) + '</span></span>';
  }).join("");
  wrap.innerHTML = items + items;
}

function renderBrief() {
  var content = $("#brief-content");
  var date = $("#brief-date");
  if (date) date.textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (!content) return;
  content.innerHTML = articleList(state.breaking, 10, "No live headlines loaded yet.");
}

function articleList(items, limit, emptyText) {
  if (!items || !items.length) {
    return '<div class="empty-state">' + escapeHtml(emptyText || "Loading live feed...") + '</div>';
  }
  var html = '<div class="brief-list">';
  items.slice(0, limit || items.length).forEach(function(item, index) {
    html += '<div class="brief-row">';
    html += '<span class="brief-num">' + String(index + 1).padStart(2, "0") + '</span>';
    html += '<div class="brief-main"><a class="brief-summary brief-link" target="_blank" rel="noopener noreferrer" href="' + safeUrl(item.url) + '">' + escapeHtml(item.title) + '</a><span class="brief-source">' + escapeHtml(item.source) + '</span></div>';
    html += '<span class="brief-time">' + timeAgo(item.isoDate) + '</span>';
    html += '</div>';
  });
  html += '</div><div class="brief-updated">Live news via Google News RSS and rss2json. Updated ' + new Date().toLocaleTimeString() + '.</div>';
  return html;
}

function renderMarkets() {
  var content = $("#markets-content");
  if (!content) return;
  var quotes = state.markets.quotes || {};
  var futures = state.markets.futures || {};
  var html = '<div class="market-status-banner"><div><span class="session-dot"></span> NYSE/NASDAQ: <strong>' + stockSession() + '</strong></div><div><span class="session-dot"></span> Futures: <strong>' + futuresSession() + '</strong></div></div>';
  html += '<div class="section-label">INDICES & COMMODITIES</div><div class="market-grid">';
  Object.keys(quotes).forEach(function(key) {
    var quote = quotes[key];
    html += marketCard(key, quote);
  });
  html += '</div><div class="section-label">FUTURES</div><div class="market-grid">';
  Object.keys(futures).forEach(function(key) {
    html += marketCard(key, futures[key]);
  });
  html += '</div><div class="market-hours-info"><div class="market-hours-row"><span class="mh-label">Stock market</span><span class="mh-detail">Pre 4:00-9:30 AM ET | Open 9:30 AM-4:00 PM ET | After 4:00-8:00 PM ET</span></div><div class="market-hours-row"><span class="mh-label">Futures</span><span class="mh-detail">Sun 6:00 PM - Fri 5:00 PM ET, daily 5-6 PM ET break</span></div></div>';
  html += '<div class="brief-updated">Market snapshot from Stooq/CoinGecko. ' + (state.markets.generatedAt ? "Updated " + timeAgo(state.markets.generatedAt) : "Using fallback until the first live refresh.") + '</div>';
  content.innerHTML = html;
}

function marketCard(key, quote) {
  var price = key === "BTC" ? formatCryptoPrice(quote.price) : formatPrice(quote.price);
  return '<div class="market-card"><div class="market-card-name">' + escapeHtml(quote.name || key) + '</div><div class="market-card-price">' + price + '</div><div class="market-card-change ' + pctClass(quote.pct) + '">' + pctText(quote.pct) + '</div></div>';
}

function renderCrypto() {
  var content = $("#crypto-content");
  if (!content) return;
  var data = state.crypto || {};
  var coins = [
    ["bitcoin", "Bitcoin"],
    ["ethereum", "Ethereum"],
    ["solana", "Solana"],
    ["dogecoin", "Dogecoin"]
  ];
  var html = '<div class="crypto-hero"><div><span class="crypto-label">BTC/USD</span><div class="btc-value" id="live-btc-price">' + formatCryptoPrice(data.bitcoin && data.bitcoin.usd) + '</div><div class="btc-change ' + pctClass(data.bitcoin && data.bitcoin.usd_24h_change) + '">' + pctText(data.bitcoin && data.bitcoin.usd_24h_change) + ' 24h</div></div><div class="fear-greed"><span>Fear & Greed</span><strong>' + escapeHtml(state.fearGreed ? state.fearGreed.value : "--") + '</strong><span>' + escapeHtml(state.fearGreed ? state.fearGreed.value_classification : "Loading") + '</span></div></div>';
  html += '<div class="crypto-grid">';
  coins.forEach(function(pair) {
    var coin = data[pair[0]] || {};
    html += '<div class="crypto-card"><span>' + pair[1] + '</span><strong>' + formatCryptoPrice(coin.usd) + '</strong><small class="' + pctClass(coin.usd_24h_change) + '">' + pctText(coin.usd_24h_change) + '</small><em>' + formatCompact(coin.usd_market_cap) + '</em></div>';
  });
  html += '</div><div class="section-label">CRYPTO NEWS</div>';
  html += articleList(state.cryptoNews, 8, "Loading crypto headlines...");
  content.innerHTML = html;
}

function renderSentiment() {
  var content = $("#csa-content");
  var updated = $("#csa-last-update");
  if (updated) updated.textContent = "Updated " + new Date().toLocaleTimeString();
  if (!content) return;
  var fngValue = state.fearGreed ? Number(state.fearGreed.value) : 50;
  var mood = fngValue <= 25 ? "Extreme fear" : fngValue <= 45 ? "Fear" : fngValue < 60 ? "Neutral" : fngValue < 75 ? "Greed" : "Extreme greed";
  var btc = state.crypto && state.crypto.bitcoin ? state.crypto.bitcoin : {};
  var html = '<div class="sentiment-grid"><div class="sentiment-panel"><span>Bitcoin</span><strong>' + formatCryptoPrice(btc.usd) + '</strong><em class="' + pctClass(btc.usd_24h_change) + '">' + pctText(btc.usd_24h_change) + ' 24h</em></div><div class="sentiment-panel"><span>Fear & Greed</span><strong>' + escapeHtml(state.fearGreed ? state.fearGreed.value : "--") + '</strong><em>' + mood + '</em></div><div class="sentiment-panel"><span>Signal</span><strong>' + (fngValue < 45 ? "Risk-off" : fngValue > 60 ? "Risk-on" : "Mixed") + '</strong><em>Live crypto pulse</em></div></div>';
  html += '<div class="section-label">SENTIMENT HEADLINES</div>';
  html += articleList(state.sentimentNews, 5, "Loading sentiment headlines...");
  content.innerHTML = html;
}

function renderNewsTable(sectionId, items, label, emptyText) {
  var content = $(sectionId);
  if (!content) return;
  if (!items || !items.length) {
    content.innerHTML = '<div class="empty-state">' + escapeHtml(emptyText) + '</div>';
    return;
  }
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>' + escapeHtml(label) + '</th><th>Source</th></tr></thead><tbody>';
  items.forEach(function(item) {
    html += '<tr><td>' + timeAgo(item.isoDate) + '</td><td><a class="source-link" href="' + safeUrl(item.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.title) + '</a></td><td>' + escapeHtml(item.source) + '</td></tr>';
  });
  html += '</tbody></table></div><div class="brief-updated">Live feed via Google News RSS. Updated ' + new Date().toLocaleTimeString() + '.</div>';
  content.innerHTML = html;
}

function renderPolymarket() {
  var content = $("#polymarket-content");
  var count = $("#section-polymarket .card-count");
  if (count) count.textContent = state.polymarket.length ? state.polymarket.length + " live markets" : "Loading markets";
  if (!content) return;
  if (!state.polymarket.length) {
    content.innerHTML = '<div class="empty-state">Loading Polymarket markets...</div>';
    return;
  }
  var groups = ["Top", "Politics", "Crypto", "Markets", "AI", "Sports"];
  var html = '<div class="poly-live-bar"><span class="poly-live-dot"></span><span class="poly-live-label">LIVE ODDS</span><span class="poly-live-ts">Updated ' + new Date().toLocaleTimeString() + '</span></div>';
  groups.forEach(function(group) {
    var rows = state.polymarket.filter(function(item) { return item.category === group; });
    if (!rows.length) return;
    html += '<div class="section-label">' + group.toUpperCase() + '</div><div class="poly-contract-list">';
    rows.forEach(function(item) {
      html += '<div class="poly-contract-row"><a class="poly-contract-title" href="' + safeUrl(item.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.title) + '</a><div class="poly-contract-right"><span class="poly-outcome-label">' + escapeHtml(item.topOutcome) + '</span><span class="poly-odds-value">' + (item.odds == null ? "--" : item.odds.toFixed(1) + "%") + '</span></div></div>';
    });
    html += '</div>';
  });
  html += '<div class="poly-source">Data: <a class="source-link" href="https://polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket</a> Gamma API.</div>';
  content.innerHTML = html;
}

function renderAll() {
  renderTicker();
  renderBrief();
  renderMarkets();
  renderCrypto();
  renderSentiment();
  renderNewsTable("#ai-content", state.ai, "AI headline", "Loading AI headlines...");
  renderNewsTable("#politics-content", state.politics, "Policy headline", "Loading US politics headlines...");
  renderPolymarket();
  var aiCount = $("#ai-count");
  if (aiCount) aiCount.textContent = state.ai.length ? state.ai.length + " live items" : "Loading";
}

async function loadMarkets() {
  try {
    var data = await fetchJson("data/markets.json?v=" + Date.now(), 10000);
    if (data && data.quotes) state.markets = data;
  } catch (err) {
    console.warn("Market snapshot failed", err);
  }
}

async function loadCrypto() {
  try {
    state.crypto = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true", 12000);
  } catch (err) {
    console.warn("CoinGecko prices failed", err);
  }
}

async function loadFearGreed() {
  try {
    var data = await fetchJson("https://api.alternative.me/fng/?limit=1", 12000);
    state.fearGreed = data && data.data ? data.data[0] : null;
  } catch (err) {
    console.warn("Fear & Greed failed", err);
  }
}

async function loadPolymarket() {
  try {
    var markets = await fetchJson("https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=24&order=volume24hr&ascending=false", 14000);
    state.polymarket = Array.isArray(markets) ? markets.map(normalizePolymarket) : [];
  } catch (err) {
    console.warn("Polymarket failed", err);
  }
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function loadNews() {
  state.breaking = await fetchNews(NEWS_QUERIES.breaking, 10);
  renderBrief();
  await sleep(400);
  state.ai = await fetchNews(NEWS_QUERIES.ai, 10);
  renderNewsTable("#ai-content", state.ai, "AI headline", "No AI headlines loaded.");
  await sleep(400);
  state.politics = await fetchNews(NEWS_QUERIES.politics, 10);
  renderNewsTable("#politics-content", state.politics, "Policy headline", "No politics headlines loaded.");
  await sleep(400);
  state.cryptoNews = await fetchNews(NEWS_QUERIES.crypto, 8);
  state.sentimentNews = await fetchNews(NEWS_QUERIES.sentiment, 5);
  if (!state.breaking.length) {
    state.breaking = state.ai.concat(state.politics, state.cryptoNews)
      .sort(function(a, b) { return b.timestamp - a.timestamp; })
      .slice(0, 10);
  }
}

async function refreshAll() {
  if (state.loading) return;
  state.loading = true;
  $all(".btn-refresh").forEach(function(btn) { btn.classList.add("spinning"); });
  setStatus("LIVE - Refreshing");
  renderAll();
  await Promise.allSettled([loadMarkets(), loadCrypto(), loadFearGreed(), loadPolymarket()]);
  renderAll();
  await loadNews();
  renderAll();
  state.loading = false;
  $all(".btn-refresh").forEach(function(btn) { btn.classList.remove("spinning"); });
  $(".live-indicator").style.display = "inline-flex";
  setStatus("LIVE - Updated " + new Date().toLocaleTimeString());
}

function initTheme() {
  var stored = localStorage.getItem("vertex-theme");
  if (stored === "light" || stored === "dark") document.documentElement.dataset.theme = stored;
  var btn = $("#theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", function() {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("vertex-theme", next);
  });
}

function initCollapsible() {
  $all(".card-header").forEach(function(header) {
    header.addEventListener("click", function(event) {
      if (event.target.closest("button")) return;
      var card = header.closest(".card");
      if (card) card.classList.toggle("collapsed");
    });
  });
}

function initButtons() {
  var refresh = $("#refresh-all");
  var csa = $("#csa-refresh");
  if (refresh) refresh.addEventListener("click", refreshAll);
  if (csa) csa.addEventListener("click", async function(event) {
    event.stopPropagation();
    await Promise.allSettled([loadCrypto(), loadFearGreed()]);
    state.sentimentNews = await fetchNews(NEWS_QUERIES.sentiment, 5);
    renderCrypto();
    renderSentiment();
  });
}

document.addEventListener("DOMContentLoaded", function() {
  initTheme();
  initCollapsible();
  initButtons();
  renderAll();
  refreshAll();
  setInterval(function() {
    loadMarkets().then(function() { renderMarkets(); renderTicker(); });
    loadCrypto().then(function() { renderCrypto(); renderSentiment(); renderTicker(); });
    loadPolymarket().then(renderPolymarket);
  }, 60000);
  setInterval(function() {
    loadNews().then(renderAll);
  }, 300000);
});
