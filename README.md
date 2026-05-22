# Vertex

Live intelligence terminal for markets, crypto, AI, US politics, and high-signal prediction-market odds.

The site is static and deploys on GitHub Pages. It does not require private API keys:

- Crypto prices: CoinGecko
- Fear & Greed: alternative.me
- News: Google News RSS through rss2json
- Prediction markets: Polymarket Gamma API keyset endpoint, filtered to crypto, politics, markets, and AI
- Market snapshot: Stooq and CoinGecko via the scheduled GitHub Actions updater every 5 minutes

The frontend refreshes crypto, odds, and news directly in the browser. Sports and novelty Polymarket contracts are filtered out of the main odds board.

Deployment target: https://adfiwdnfio.github.io/vertex/
