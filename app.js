/* Vertex: keyless live market terminal */

var FALLBACK_MARKETS = {
  generatedAt: null,
  sources: ["Stooq", "CoinGecko"],
  quotes: {
    SPX: { name: "S&P 500", price: 7445.7, pct: 0.17 },
    COMP: { name: "NASDAQ", price: 26293.1, pct: 0.09 },
    QQQ: { name: "QQQ", price: 714.51, pct: 0.19 },
    NVDA: { name: "NVIDIA", price: 219.51, pct: -1.77 },
    MSTR: { name: "Strategy", price: 164.94, pct: -0.52 },
    COIN: { name: "Coinbase", price: 193.56, pct: 1.19 },
    BTC: { name: "Bitcoin", price: 77623, pct: 0.22 },
    GOLD: { name: "Gold", price: 4535.82, pct: -0.16 },
    OIL: { name: "Oil", price: 97.66, pct: -0.35 },
    VIX: { name: "VIX", price: 19.99, pct: -2.08 },
    DXY: { name: "Dollar Index", price: 99.21, pct: -0.01 }
  },
  futures: {
    ES: { name: "S&P Futures", price: 7476.75, pct: 0.13 },
    NQ: { name: "Nasdaq Futures", price: 29535.25, pct: 0.27 },
    YM: { name: "Dow Futures", price: 50439, pct: 0.07 },
    GC: { name: "Gold Futures", price: 4536.59, pct: -0.17 },
    CL: { name: "Oil Futures", price: 97.66, pct: -0.35 },
    VX: { name: "VIX Futures", price: 19.99, pct: -2.08 }
  }
};

var WATCHLIST = ["SPX", "COMP", "QQQ", "NVDA", "MSTR", "COIN", "BTC", "GOLD", "OIL", "VIX", "DXY"];
var FUTURES_LIST = ["ES", "NQ", "YM", "GC", "CL", "VX"];
var CRYPTO_COINS = [
  ["bitcoin", "Bitcoin", "BTC"],
  ["ethereum", "Ethereum", "ETH"],
  ["solana", "Solana", "SOL"],
  ["ripple", "XRP", "XRP"],
  ["binancecoin", "BNB", "BNB"],
  ["chainlink", "Chainlink", "LINK"]
];

var REFRESH_CADENCE = {
  polymarket: "30s",
  crypto: "45s",
  markets: "5m",
  news: "3m"
};

var MARKET_LINKS = {
  SPX: "https://www.tradingview.com/symbols/SPX/",
  COMP: "https://www.tradingview.com/symbols/NASDAQ-IXIC/",
  DJI: "https://www.tradingview.com/symbols/DJ-DJI/",
  QQQ: "https://www.tradingview.com/symbols/NASDAQ-QQQ/",
  NVDA: "https://www.tradingview.com/symbols/NASDAQ-NVDA/",
  MSTR: "https://www.tradingview.com/symbols/NASDAQ-MSTR/",
  COIN: "https://www.tradingview.com/symbols/NASDAQ-COIN/",
  BTC: "https://www.coingecko.com/en/coins/bitcoin",
  GOLD: "https://www.tradingview.com/symbols/XAUUSD/",
  OIL: "https://www.tradingview.com/symbols/NYMEX-CL1!/",
  VIX: "https://www.tradingview.com/symbols/CBOE-VIX/",
  DXY: "https://www.tradingview.com/symbols/TVC-DXY/",
  ES: "https://www.tradingview.com/symbols/CME_MINI-ES1!/",
  NQ: "https://www.tradingview.com/symbols/CME_MINI-NQ1!/",
  YM: "https://www.tradingview.com/symbols/CBOT_MINI-YM1!/",
  GC: "https://www.tradingview.com/symbols/COMEX-GC1!/",
  CL: "https://www.tradingview.com/symbols/NYMEX-CL1!/",
  VX: "https://www.tradingview.com/symbols/CBOE-VX1!/"
};

var NEWS_QUERIES = {
  Crypto: 'bitcoin OR ethereum OR solana OR stablecoin OR "crypto ETF" OR Coinbase OR MicroStrategy when:3d',
  Markets: '"Federal Reserve" OR inflation OR CPI OR jobs OR Treasury OR Nasdaq OR "S&P 500" OR oil OR gold when:3d',
  AI: 'OpenAI OR Anthropic OR xAI OR Nvidia OR "AI chip" OR ChatGPT OR Claude OR Gemini when:7d',
  Politics: 'Trump OR Congress OR Senate OR "White House" OR tariff OR "Supreme Court" OR election OR legislation when:3d'
};

var state = {
  markets: FALLBACK_MARKETS,
  crypto: null,
  fearGreed: null,
  polymarket: [],
  feed: [],
  loading: false,
  polyFilter: "Trending",
  newsFilter: "All",
  lastUpdated: {
    markets: null,
    crypto: null,
    fearGreed: null,
    polymarket: null,
    news: null
  }
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

function fetchJson(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 12000);
  return fetch(url, { signal: controller.signal, cache: "no-store" })
    .then(function(res) {
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return res.json();
    })
    .finally(function() {
      clearTimeout(timer);
    });
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (err) { return []; }
  }
  return [];
}

function asNumber(value) {
  var num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatPrice(value, compact, forceDollar) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "--";
  var prefix = forceDollar ? "$" : "";
  if (compact && Math.abs(num) >= 1000) return prefix + Math.round(num).toLocaleString();
  if (Math.abs(num) >= 1000) return prefix + num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(num) >= 10) return prefix + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return prefix + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatCryptoPrice(value) {
  return formatPrice(value, false, true);
}

function formatCompactMoney(value) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (num >= 1e12) return "$" + (num / 1e12).toFixed(2) + "T";
  if (num >= 1e9) return "$" + (num / 1e9).toFixed(1) + "B";
  if (num >= 1e6) return "$" + (num / 1e6).toFixed(1) + "M";
  if (num >= 1e3) return "$" + (num / 1e3).toFixed(1) + "K";
  return "$" + Math.round(num).toLocaleString();
}

function pctClass(value) {
  var num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "neutral";
  return num > 0 ? "positive" : "negative";
}

function pctText(value) {
  var num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return (num >= 0 ? "+" : "-") + Math.abs(num).toFixed(2) + "%";
}

function pointText(value) {
  if (value == null) return "--";
  var num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "flat";
  var points = num * 100;
  var precision = Math.abs(points) < 10 ? 1 : 0;
  return (points >= 0 ? "+" : "-") + Math.abs(points).toFixed(precision) + " pp";
}

function oddsText(price) {
  var num = Number(price);
  if (!Number.isFinite(num)) return "--";
  return (num * 100).toFixed(num > 0.995 || num < 0.005 ? 1 : 0) + "%";
}

function timeAgo(value) {
  if (!value) return "pending";
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "pending";
  var seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return seconds + "s ago";
  var minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  var hours = Math.round(minutes / 60);
  if (hours < 48) return hours + "h ago";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDate(value) {
  if (!value) return "Open";
  var date = new Date(value);
  if (isNaN(date.getTime())) return "Open";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncateText(value, maxLength) {
  var text = stripHtml(value);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).replace(/\s+\S*$/, "") + "...";
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

function setUpdated(key) {
  state.lastUpdated[key] = new Date().toISOString();
}

function latestUpdate() {
  var values = Object.keys(state.lastUpdated).map(function(key) {
    return state.lastUpdated[key] ? new Date(state.lastUpdated[key]).getTime() : 0;
  });
  return Math.max.apply(Math, values);
}

function updateHeaderStatus() {
  var stamp = $("#header-timestamp");
  if (!stamp) return;
  var latest = latestUpdate();
  stamp.textContent = latest ? "Updated " + new Date(latest).toLocaleTimeString() : "Connecting live feeds";
}

function renderCadence() {
  var wrap = $("#cadence-grid");
  if (!wrap) return;
  var items = [
    ["Odds", REFRESH_CADENCE.polymarket, state.lastUpdated.polymarket],
    ["Crypto", REFRESH_CADENCE.crypto, state.lastUpdated.crypto],
    ["News", REFRESH_CADENCE.news, state.lastUpdated.news],
    ["Markets", REFRESH_CADENCE.markets, state.markets.generatedAt || state.lastUpdated.markets]
  ];
  wrap.innerHTML = items.map(function(item) {
    return '<span class="cadence-pill"><span class="status-dot"></span>' + escapeHtml(item[0]) + ' <strong>' + escapeHtml(item[1]) + '</strong> ' + escapeHtml(timeAgo(item[2])) + '</span>';
  }).join("");
}

function renderTicker() {
  var wrap = $("#ticker-inner");
  if (!wrap) return;
  var quotes = state.markets.quotes || {};
  var items = WATCHLIST.filter(function(key) { return quotes[key]; }).map(function(key) {
    var quote = quotes[key];
    var isDollar = /BTC|QQQ|NVDA|MSTR|COIN|GOLD|OIL/.test(key);
    var price = key === "BTC" ? formatCryptoPrice(quote.price) : formatPrice(quote.price, true, isDollar);
    return '<a class="ticker-item" target="_blank" rel="noopener noreferrer" href="' + safeUrl(MARKET_LINKS[key]) + '"><span class="ticker-name">' + escapeHtml(key) + '</span><span class="ticker-price">' + price + '</span><span class="ticker-change ' + pctClass(quote.pct) + '">' + pctText(quote.pct) + '</span></a>';
  }).join("");
  wrap.innerHTML = items + items;
}

function riskMode() {
  var quotes = state.markets.quotes || {};
  var spx = asNumber(quotes.SPX && quotes.SPX.pct) || 0;
  var nasdaq = asNumber(quotes.COMP && quotes.COMP.pct) || 0;
  var btc = state.crypto && state.crypto.bitcoin ? asNumber(state.crypto.bitcoin.usd_24h_change) || 0 : (asNumber(quotes.BTC && quotes.BTC.pct) || 0);
  var vix = asNumber(quotes.VIX && quotes.VIX.pct) || 0;
  var score = spx + nasdaq + btc - vix * 0.35;
  if (score >= 1.25) return { label: "Risk-on", detail: "Equities/crypto firm, volatility softer", className: "positive" };
  if (score <= -1.25) return { label: "Risk-off", detail: "Pressure across risk assets", className: "negative" };
  return { label: "Mixed", detail: "Cross-asset signal is not one-way", className: "neutral" };
}

function renderPulse() {
  var wrap = $("#pulse-content");
  if (!wrap) return;
  var quotes = state.markets.quotes || {};
  var btc = state.crypto && state.crypto.bitcoin ? state.crypto.bitcoin : quotes.BTC || {};
  var fng = state.fearGreed || {};
  var risk = riskMode();
  var trendingCount = getPolymarketRows("Trending").length;
  var bestTrend = getPolymarketRows("Trending")[0];
  var cells = [
    {
      label: "Regime",
      value: '<span class="' + risk.className + '">' + escapeHtml(risk.label) + '</span>',
      detail: risk.detail
    },
    {
      label: "BTC/USD",
      value: formatCryptoPrice(btc.usd || btc.price),
      detail: '<span class="' + pctClass(btc.usd_24h_change || btc.pct) + '">' + pctText(btc.usd_24h_change || btc.pct) + '</span> 24h'
    },
    {
      label: "Crypto Sentiment",
      value: escapeHtml(fng.value || "--"),
      detail: escapeHtml(fng.value_classification || "Fear & Greed pending")
    },
    {
      label: "Prediction Markets",
      value: String(trendingCount || "--"),
      detail: bestTrend ? escapeHtml(bestTrend.category + ": " + bestTrend.primaryOutcome + " " + oddsText(bestTrend.primaryOdds)) : "Filtering live odds"
    }
  ];
  wrap.innerHTML = cells.map(function(cell) {
    return '<div class="pulse-cell"><span class="pulse-label">' + escapeHtml(cell.label) + '</span><div class="pulse-value">' + cell.value + '</div><div class="pulse-detail">' + cell.detail + '</div></div>';
  }).join("");
}

function renderMarkets() {
  var content = $("#markets-content");
  if (!content) return;
  var quotes = state.markets.quotes || {};
  var futures = state.markets.futures || {};
  var meta = $("#markets-meta");
  if (meta) meta.textContent = "Snapshot " + timeAgo(state.markets.generatedAt || state.lastUpdated.markets);
  var html = '<div class="market-status"><span><span class="status-dot"></span> NYSE/NASDAQ ' + escapeHtml(stockSession()) + '</span><span>Futures ' + escapeHtml(futuresSession()) + '</span></div>';
  html += '<div class="quote-grid">';
  WATCHLIST.filter(function(key) { return quotes[key]; }).forEach(function(key) {
    html += quoteRow(key, quotes[key]);
  });
  html += '</div>';
  html += '<div class="source-note">Market prices refresh from Stooq through GitHub every 5 minutes; crypto ticks update in-browser.</div>';
  html += '<div class="quote-grid">';
  FUTURES_LIST.filter(function(key) { return futures[key]; }).forEach(function(key) {
    html += quoteRow(key, futures[key]);
  });
  html += '</div>';
  content.innerHTML = html;
}

function quoteRow(key, quote) {
  var isDollar = /BTC|QQQ|NVDA|MSTR|COIN|GOLD|OIL|GC|CL/.test(key);
  var price = key === "BTC" ? formatCryptoPrice(quote.price) : formatPrice(quote.price, false, isDollar);
  return '<a class="quote-row" target="_blank" rel="noopener noreferrer" href="' + safeUrl(MARKET_LINKS[key]) + '"><span class="quote-main"><span class="quote-name">' + escapeHtml(quote.name || key) + '</span><span class="quote-symbol">' + escapeHtml(key) + '</span></span><span><span class="quote-price">' + price + '</span><br><span class="quote-change ' + pctClass(quote.pct) + '">' + pctText(quote.pct) + '</span></span></a>';
}

function renderCrypto() {
  var content = $("#crypto-content");
  if (!content) return;
  var meta = $("#crypto-meta");
  if (meta) meta.textContent = "Crypto " + timeAgo(state.lastUpdated.crypto) + " | Sentiment " + timeAgo(state.lastUpdated.fearGreed);
  var data = state.crypto || {};
  var btc = data.bitcoin || {};
  var fng = state.fearGreed || {};
  var html = '<div class="crypto-hero"><div class="crypto-lead"><span class="metric-label">Bitcoin</span><div class="btc-value">' + formatCryptoPrice(btc.usd) + '</div><div class="' + pctClass(btc.usd_24h_change) + '">' + pctText(btc.usd_24h_change) + ' 24h</div></div><div class="fear-greed"><span class="metric-label">Fear & Greed</span><strong>' + escapeHtml(fng.value || "--") + '</strong><span>' + escapeHtml(fng.value_classification || "Pending") + '</span></div></div>';
  html += '<div class="mini-grid">';
  CRYPTO_COINS.forEach(function(pair) {
    var coin = data[pair[0]] || {};
    html += '<div class="mini-row"><span>' + escapeHtml(pair[2]) + '</span><strong>' + formatCryptoPrice(coin.usd) + '</strong><em class="' + pctClass(coin.usd_24h_change) + '">' + pctText(coin.usd_24h_change) + '</em></div>';
  });
  html += '</div>';
  html += '<div class="source-note">Prices: <a class="source-link" target="_blank" rel="noopener noreferrer" href="https://www.coingecko.com/">CoinGecko</a>. Sentiment: <a class="source-link" target="_blank" rel="noopener noreferrer" href="https://alternative.me/crypto/fear-and-greed-index/">alternative.me</a>.</div>';
  content.innerHTML = html;
}

function categoryForMarket(title, description) {
  var text = String((title || "") + " " + (description || "")).toLowerCase();
  if (/election|trump|biden|congress|senate|white house|supreme court|tariff|president|nominee|approval|legislation|bill|geopolitic|china|russia|ukraine|iran|israel|fed chair/.test(text)) return "Politics";
  if (/openai|anthropic|chatgpt|claude|gemini|deepmind|nvidia|nvda|ai\b|artificial intelligence|gpt-|xai\b|semiconductor|chip/.test(text)) return "AI";
  if (/fed\b|fomc|rate cut|interest rate|inflation|cpi|recession|gdp|unemployment|nasdaq|s&p|stock market|oil|gold|treasury|yield|dollar|vix|market crash/.test(text)) return "Markets";
  if (/bitcoin|btc|ethereum|eth\b|solana|stablecoin|crypto|coinbase|microstrategy|mstr|xrp|doge|binance|token|defi|etf/.test(text)) return "Crypto";
  return "Other";
}

function isNoiseMarket(title, description, market) {
  var text = String((title || "") + " " + (description || "")).toLowerCase();
  var sports = /nba|nfl|mlb|nhl|ufc|wnba|soccer|tennis|golf|f1\b|formula 1|world cup|champions league|premier league|baseball|basketball|football|hockey|cavaliers|knicks|lakers|dodgers|yankees|vs\.| vs |playoffs/.test(text);
  var novelty = /kiss|box office|oscar|grammy|emmy|album|movie|tiktok|instagram|youtube|will .* say|say "[^"]+"|mention .* times|weather in|temperature/.test(text);
  var end = new Date(market.endDate || market.endDateIso || 0).getTime();
  var stale = end && end < Date.now() - 6 * 60 * 60 * 1000;
  return sports || novelty || stale;
}

function normalizePolymarket(market) {
  var outcomes = parseArray(market.outcomes);
  var prices = parseArray(market.outcomePrices).map(Number);
  var event = market.events && market.events[0] ? market.events[0] : null;
  var title = market.question || (event && event.title) || "Polymarket market";
  var description = (event && event.description) || market.description || "";
  var category = categoryForMarket(title, description);
  if (category === "Other" || isNoiseMarket(title, description, market)) return null;

  var yesIndex = outcomes.map(function(outcome) { return String(outcome).toLowerCase(); }).indexOf("yes");
  var noIndex = outcomes.map(function(outcome) { return String(outcome).toLowerCase(); }).indexOf("no");
  var bestIndex = 0;
  var bestPrice = -1;
  prices.forEach(function(price, index) {
    if (Number.isFinite(price) && price > bestPrice) {
      bestPrice = price;
      bestIndex = index;
    }
  });
  var primaryIndex = yesIndex >= 0 ? yesIndex : bestIndex;
  var primaryOdds = Number.isFinite(prices[primaryIndex]) ? prices[primaryIndex] : null;
  var secondaryOdds = noIndex >= 0 && Number.isFinite(prices[noIndex]) ? prices[noIndex] : null;
  var slug = (event && event.slug) || market.slug;
  var context = event && event.eventMetadata && event.eventMetadata.context_description
    ? event.eventMetadata.context_description
    : description;
  var volume24h = asNumber(market.volume24hr || market.volume24hrClob || 0) || 0;
  var liquidity = asNumber(market.liquidity || market.liquidityClob || 0) || 0;
  var oneDayPriceChange = asNumber(market.oneDayPriceChange);
  var oneHourPriceChange = asNumber(market.oneHourPriceChange);
  var spread = asNumber(market.spread);
  var updatedAt = market.updatedAt || (event && event.updatedAt) || null;

  return {
    id: market.id || market.conditionId || title,
    title: title,
    category: category,
    primaryOutcome: outcomes[primaryIndex] || "Top",
    primaryOdds: primaryOdds,
    secondaryOdds: secondaryOdds,
    volume24h: volume24h,
    liquidity: liquidity,
    oneDayPriceChange: oneDayPriceChange,
    oneHourPriceChange: oneHourPriceChange,
    spread: spread,
    endDate: market.endDate || market.endDateIso || (event && event.endDate) || null,
    updatedAt: updatedAt,
    context: truncateText(context, 210),
    url: slug ? "https://polymarket.com/event/" + slug : "https://polymarket.com",
    score: volume24h + liquidity * 0.2 + Math.abs((oneDayPriceChange || oneHourPriceChange || 0) * 1000000)
  };
}

function getPolymarketRows(filter) {
  var rows = state.polymarket.slice().sort(function(a, b) { return b.score - a.score; });
  if (filter && filter !== "Trending") {
    rows = rows.filter(function(item) { return item.category === filter; });
  }
  return rows.slice(0, filter === "Trending" ? 10 : 8);
}

function renderPolymarket() {
  var content = $("#polymarket-content");
  if (!content) return;
  var meta = $("#poly-meta");
  if (meta) meta.textContent = state.polymarket.length ? state.polymarket.length + " relevant live markets | " + timeAgo(state.lastUpdated.polymarket) : "Loading markets";
  var rows = getPolymarketRows(state.polyFilter);
  if (!rows.length) {
    content.innerHTML = '<div class="empty-state">No high-signal markets found for this filter yet.</div>';
    return;
  }
  var html = '<div class="poly-list">';
  rows.forEach(function(item) {
    var delta = Number.isFinite(item.oneDayPriceChange) ? item.oneDayPriceChange : item.oneHourPriceChange;
    html += '<div class="poly-row">';
    html += '<div class="poly-main">';
    html += '<div class="poly-meta-row"><span class="category-chip">' + escapeHtml(item.category) + '</span><span>Ends ' + escapeHtml(formatDate(item.endDate)) + '</span><span>Fetched ' + escapeHtml(timeAgo(state.lastUpdated.polymarket || item.updatedAt)) + '</span></div>';
    html += '<a class="poly-title" target="_blank" rel="noopener noreferrer" href="' + safeUrl(item.url) + '">' + escapeHtml(item.title) + '</a>';
    if (item.context) html += '<p class="poly-context">' + escapeHtml(item.context) + '</p>';
    html += '<div class="metric-line"><span>24h volume ' + formatCompactMoney(item.volume24h) + '</span><span>Liquidity ' + formatCompactMoney(item.liquidity) + '</span><span>Spread ' + (Number.isFinite(item.spread) ? oddsText(item.spread) : "--") + '</span>' + (item.secondaryOdds != null ? '<span>No ' + oddsText(item.secondaryOdds) + '</span>' : '') + '</div>';
    html += '</div>';
    html += '<div class="odds-box"><span>' + escapeHtml(item.primaryOutcome) + '</span><strong>' + oddsText(item.primaryOdds) + '</strong><em class="' + pctClass(delta) + '">' + pointText(delta) + '</em></div>';
    html += '</div>';
  });
  html += '</div><div class="source-note">Filtered to crypto, politics, markets, and AI. Sports and novelty contracts are suppressed. Source: <a class="source-link" target="_blank" rel="noopener noreferrer" href="https://polymarket.com/">Polymarket</a>.</div>';
  content.innerHTML = html;
}

function parseNewsTitle(title) {
  var clean = stripHtml(title);
  var idx = clean.lastIndexOf(" - ");
  if (idx > clean.length * 0.3) {
    return { title: clean.slice(0, idx).trim(), source: clean.slice(idx + 3).trim() };
  }
  return { title: clean, source: "Google News" };
}

function normalizeNews(items, category) {
  return (items || []).map(function(item) {
    var parsed = parseNewsTitle(item.title);
    var date = new Date((item.pubDate || "").replace(" ", "T"));
    if (isNaN(date.getTime())) date = new Date(item.pubDate || Date.now());
    return {
      category: category,
      title: parsed.title,
      source: parsed.source,
      url: safeUrl(item.link),
      summary: stripHtml(item.description || item.content || ""),
      isoDate: date.toISOString(),
      timestamp: date.getTime()
    };
  }).filter(function(item) {
    return item.title && item.url !== "#";
  });
}

function fetchNews(query, category, limit) {
  var rss = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
  var api = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rss);
  return fetchJson(api, 14000)
    .then(function(payload) {
      if (!payload || payload.status !== "ok") return [];
      return normalizeNews(payload.items, category).slice(0, limit || 8);
    })
    .catch(function(err) {
      console.warn("News feed failed", category, err);
      return [];
    });
}

function mergeNews(groups) {
  var seen = {};
  return groups.reduce(function(all, group) {
    return all.concat(group || []);
  }, []).filter(function(item) {
    var key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 56);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort(function(a, b) {
    return b.timestamp - a.timestamp;
  }).slice(0, 28);
}

function feedRows() {
  var rows = state.feed.slice();
  if (state.newsFilter !== "All") rows = rows.filter(function(item) { return item.category === state.newsFilter; });
  return rows.slice(0, state.newsFilter === "All" ? 18 : 10);
}

function renderFeed() {
  var content = $("#signal-feed");
  if (!content) return;
  var meta = $("#feed-meta");
  if (meta) meta.textContent = state.feed.length ? state.feed.length + " live headlines | " + timeAgo(state.lastUpdated.news) : "Loading news";
  var rows = feedRows();
  if (!rows.length) {
    content.innerHTML = '<div class="empty-state">Loading focused headlines...</div>';
    return;
  }
  var html = '<div class="feed-list">';
  rows.forEach(function(item) {
    html += '<div class="feed-row"><span class="feed-meta-row">' + escapeHtml(timeAgo(item.isoDate)) + '</span><span class="feed-main"><span class="category-chip">' + escapeHtml(item.category) + '</span><a class="feed-title" target="_blank" rel="noopener noreferrer" href="' + safeUrl(item.url) + '">' + escapeHtml(item.title) + '</a></span><span class="feed-meta-row">' + escapeHtml(item.source) + '</span></div>';
  });
  html += '</div><div class="source-note">News: Google News RSS via rss2json. Feed refreshes every 3 minutes.</div>';
  content.innerHTML = html;
}

function renderAll() {
  updateHeaderStatus();
  renderCadence();
  renderTicker();
  renderPulse();
  renderMarkets();
  renderCrypto();
  renderPolymarket();
  renderFeed();
}

async function loadMarkets() {
  try {
    var data = await fetchJson("data/markets.json?v=" + Date.now(), 10000);
    if (data && data.quotes) {
      state.markets = data;
      setUpdated("markets");
    }
  } catch (err) {
    console.warn("Market snapshot failed", err);
  }
}

async function loadCrypto() {
  try {
    var ids = CRYPTO_COINS.map(function(pair) { return pair[0]; }).join(",");
    state.crypto = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=" + encodeURIComponent(ids) + "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true", 12000);
    setUpdated("crypto");
    if (state.crypto && state.crypto.bitcoin) {
      var btc = state.crypto.bitcoin;
      if (!state.markets.quotes) state.markets.quotes = {};
      state.markets.quotes.BTC = {
        name: "Bitcoin",
        price: btc.usd,
        pct: btc.usd_24h_change
      };
    }
  } catch (err) {
    console.warn("CoinGecko prices failed", err);
  }
}

async function loadFearGreed() {
  try {
    var data = await fetchJson("https://api.alternative.me/fng/?limit=1", 12000);
    state.fearGreed = data && data.data ? data.data[0] : null;
    setUpdated("fearGreed");
  } catch (err) {
    console.warn("Fear & Greed failed", err);
  }
}

async function loadPolymarket() {
  try {
    var urls = [
      "https://gamma-api.polymarket.com/markets/keyset?active=true&closed=false&limit=180&order=volume24hr&ascending=false",
      "https://gamma-api.polymarket.com/markets/keyset?active=true&closed=false&limit=80&tag_id=537&order=volume24hr&ascending=false"
    ];
    var payloads = await Promise.allSettled(urls.map(function(url) { return fetchJson(url, 16000); }));
    var markets = payloads.reduce(function(all, result) {
      if (result.status !== "fulfilled") return all;
      var payload = result.value;
      var rows = Array.isArray(payload) ? payload : (payload && payload.markets) || [];
      return all.concat(rows);
    }, []);
    var seen = {};
    state.polymarket = markets.map(normalizePolymarket).filter(Boolean).filter(function(item) {
      var key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function(a, b) {
      return b.score - a.score;
    });
    setUpdated("polymarket");
  } catch (err) {
    console.warn("Polymarket failed", err);
  }
}

async function loadNews() {
  var groups = await Promise.all(Object.keys(NEWS_QUERIES).map(function(category) {
    return fetchNews(NEWS_QUERIES[category], category, 8);
  }));
  state.feed = mergeNews(groups);
  setUpdated("news");
}

async function refreshAll() {
  if (state.loading) return;
  state.loading = true;
  $all(".btn-refresh").forEach(function(btn) { btn.classList.add("spinning"); });
  renderAll();
  await Promise.allSettled([loadMarkets(), loadCrypto(), loadFearGreed(), loadPolymarket()]);
  renderAll();
  await loadNews();
  state.loading = false;
  $all(".btn-refresh").forEach(function(btn) { btn.classList.remove("spinning"); });
  renderAll();
}

function setActiveTab(containerSelector, attr, value) {
  $all("[" + attr + "]", $(containerSelector)).forEach(function(btn) {
    btn.classList.toggle("active", btn.getAttribute(attr) === value);
  });
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

function initTabs() {
  var polyTabs = $("#poly-tabs");
  if (polyTabs) {
    polyTabs.addEventListener("click", function(event) {
      var btn = event.target.closest("[data-poly-filter]");
      if (!btn) return;
      state.polyFilter = btn.getAttribute("data-poly-filter");
      setActiveTab("#poly-tabs", "data-poly-filter", state.polyFilter);
      renderPolymarket();
      renderPulse();
    });
  }
  var feedTabs = $("#feed-tabs");
  if (feedTabs) {
    feedTabs.addEventListener("click", function(event) {
      var btn = event.target.closest("[data-news-filter]");
      if (!btn) return;
      state.newsFilter = btn.getAttribute("data-news-filter");
      setActiveTab("#feed-tabs", "data-news-filter", state.newsFilter);
      renderFeed();
    });
  }
}

function initButtons() {
  var refresh = $("#refresh-all");
  if (refresh) refresh.addEventListener("click", refreshAll);
}

document.addEventListener("DOMContentLoaded", function() {
  initTheme();
  initTabs();
  initButtons();
  renderAll();
  refreshAll();
  setInterval(function() {
    loadPolymarket().then(function() {
      renderPolymarket();
      renderPulse();
      renderCadence();
      updateHeaderStatus();
    });
  }, 30000);
  setInterval(function() {
    Promise.allSettled([loadCrypto(), loadFearGreed()]).then(function() {
      renderCrypto();
      renderPulse();
      renderTicker();
      renderCadence();
      updateHeaderStatus();
    });
  }, 45000);
  setInterval(function() {
    loadMarkets().then(function() {
      renderMarkets();
      renderTicker();
      renderPulse();
      renderCadence();
      updateHeaderStatus();
    });
  }, 60000);
  setInterval(function() {
    loadNews().then(function() {
      renderFeed();
      renderCadence();
      updateHeaderStatus();
    });
  }, 180000);
  setInterval(renderAll, 15000);
});
