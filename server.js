require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = 'https://open-api-v4.coinglass.com';
const API_KEY = process.env.COINGLASS_API_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ========== SECURITY MIDDLEWARE ==========

// Restrict CORS to trusted origins only
const corsOptions = {
  origin: (origin, callback) => {
    // Allow localhost for development, restrict in production
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
    
    if (!origin || allowedOrigins.includes(origin) || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' /_vercel/speed-insights/; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://open-api-v4.coinglass.com /_vercel/speed-insights/; frame-src https://www.youtube.com https://youtube.com;");
  // Disable caching for sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  // Hide server info
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'ESFX');
  next();
};

// Rate limiting middleware
const requests = {};
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requests[ip]) {
    requests[ip] = [];
  }
  
  // Remove requests older than 1 minute
  requests[ip] = requests[ip].filter(time => now - time < 60000);
  
  // Allow 30 requests per minute (2 per second average)
  if (requests[ip].length >= 30) {
    return res.status(429).json({ 
      success: false, 
      error: 'Çox sürətli sorğu. Bir mikə sonra cəhd edin.' 
    });
  }
  
  requests[ip].push(now);
  next();
};

// Input validation middleware
const validateInput = (req, res, next) => {
  // Sanitize request query and body
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[<>\"'&]/g, '');
  };
  
  if (req.query) {
    for (let key in req.query) {
      req.query[key] = sanitizeString(req.query[key]);
    }
  }
  
  next();
};

// Middleware stack
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(rateLimitMiddleware);
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(validateInput);
app.use(express.static('public'));

// Cache for reducing API calls
const cache = {
  topCoins: { data: null, timestamp: 0, ttl: 60000 }, // 60 seconds TTL
  marketPairs: { data: null, timestamp: 0, ttl: 30000 }, // 30 seconds TTL
  marketIndicators: { data: null, timestamp: 0, ttl: 30000 }, // 30 seconds TTL
  cryptoNews: { data: null, timestamp: 0, ttl: 600000 }, // 10 minutes TTL
  livePrices: { data: null, timestamp: 0, ttl: 30000 } // 30 seconds TTL
};

// Fallback top 10 coins data (for demo/fallback)
const fallbackTopCoins = [
  { rank: 1, symbol: 'BTC', name: 'Bitcoin', price: 65808, change_24h: -2.19, market_cap: 1315575194787, volume_24h: 43249286576, market_cap_rank: 1, image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png' },
  { rank: 2, symbol: 'ETH', name: 'Ethereum', price: 1927.74, change_24h: -4.65, market_cap: 232559580352, volume_24h: 21579455475, market_cap_rank: 2, image: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png' },
  { rank: 3, symbol: 'USDT', name: 'Tether', price: 0.999992, change_24h: -0.01, market_cap: 183547220387, volume_24h: 71153432930, market_cap_rank: 3, image: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png' },
  { rank: 4, symbol: 'USDC', name: 'USD Coin', price: 1.00, change_24h: 0.0, market_cap: 45000000000, volume_24h: 15000000000, market_cap_rank: 4, image: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png' },
  { rank: 5, symbol: 'BNB', name: 'BNB', price: 650, change_24h: -3.5, market_cap: 100000000000, volume_24h: 5000000000, market_cap_rank: 5, image: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png' },
  { rank: 6, symbol: 'SOL', name: 'Solana', price: 180, change_24h: -5.2, market_cap: 60000000000, volume_24h: 3000000000, market_cap_rank: 6, image: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png' },
  { rank: 7, symbol: 'XRP', name: 'Ripple', price: 2.5, change_24h: 1.2, market_cap: 130000000000, volume_24h: 4000000000, market_cap_rank: 7, image: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png' },
  { rank: 8, symbol: 'DOGE', name: 'Dogecoin', price: 0.35, change_24h: -2.1, market_cap: 50000000000, volume_24h: 2000000000, market_cap_rank: 8, image: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png' },
  { rank: 9, symbol: 'ADA', name: 'Cardano', price: 1.1, change_24h: -1.5, market_cap: 40000000000, volume_24h: 500000000, market_cap_rank: 9, image: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png' },
  { rank: 10, symbol: 'AVAX', name: 'Avalanche', price: 45, change_24h: -3.8, market_cap: 18000000000, volume_24h: 800000000, market_cap_rank: 10, image: 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png' }
];

const fallbackMarketPairs = [
  { symbol: 'BTC', pair: 'BTC/USDT', name: 'Bitcoin', price: 65808, change_24h: -2.19, volume_24h: 43000000000, market_cap: 1315575194787, image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png' },
  { symbol: 'ETH', pair: 'ETH/USDT', name: 'Ethereum', price: 1927.74, change_24h: -4.65, volume_24h: 21000000000, market_cap: 232559580352, image: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png' },
  { symbol: 'USDT', pair: 'USDT/USDC', name: 'Tether', price: 0.999992, change_24h: -0.01, volume_24h: 71000000000, market_cap: 183547220387, image: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png' },
  { symbol: 'USDC', pair: 'USDC/USDT', name: 'USD Coin', price: 1.00, change_24h: 0.0, volume_24h: 15000000000, market_cap: 45000000000, image: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png' },
  { symbol: 'BNB', pair: 'BNB/USDT', name: 'BNB', price: 650, change_24h: -3.5, volume_24h: 5000000000, market_cap: 100000000000, image: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png' },
  { symbol: 'SOL', pair: 'SOL/USDT', name: 'Solana', price: 180, change_24h: -5.2, volume_24h: 3000000000, market_cap: 60000000000, image: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png' },
  { symbol: 'XRP', pair: 'XRP/USDT', name: 'Ripple', price: 2.5, change_24h: 1.2, volume_24h: 4000000000, market_cap: 130000000000, image: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png' },
  { symbol: 'DOGE', pair: 'DOGE/USDT', name: 'Dogecoin', price: 0.35, change_24h: -2.1, volume_24h: 2000000000, market_cap: 50000000000, image: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png' },
  { symbol: 'ADA', pair: 'ADA/USDT', name: 'Cardano', price: 1.1, change_24h: -1.5, volume_24h: 500000000, market_cap: 40000000000, image: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png' },
  { symbol: 'AVAX', pair: 'AVAX/USDT', name: 'Avalanche', price: 45, change_24h: -3.8, volume_24h: 800000000, market_cap: 18000000000, image: 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png' }
];

const fallbackMarketIndicators = {
  total_market_cap: 1920000000000,
  total_volume_24h: 89400000000,
  btc_dominance: 42.5,
  eth_dominance: 15.2,
  stablecoin_market_cap: 180000000000,
  stablecoin_percentage: '13.8',
  funding_rate: 0.015,
  liquidations_24h: 124000000,
  market_sentiment: 'neutral'
};

function isCacheValid(key) {
  return cache[key] && (Date.now() - cache[key].timestamp) < cache[key].ttl;
}

// Essential Endpoints for ESFX Trader (14 endpoints)
const SAMPLE_ENDPOINTS = {
  // ========== OPEN INTEREST ==========
  'oi_history': {
    path: '/api/futures/open-interest/history',
    method: 'GET',
    description: 'Open Interest - Exchange OHLC History',
    params: { exchange: 'Binance', symbol: 'BTCUSDT', interval: '1d' }
  },
  'oi_aggregated': {
    path: '/api/futures/open-interest/aggregated-history',
    method: 'GET',
    description: 'Open Interest - Aggregated by Coin',
    params: { symbol: 'BTC', interval: '1d' }
  },

  // ========== FUNDING RATES ==========
  'funding_rate': {
    path: '/api/futures/funding-rate/ohlc-history',
    method: 'GET',
    description: 'Funding Rate - OHLC History',
    params: { exchange: 'Binance', symbol: 'BTCUSDT', interval: '1d' }
  },
  'funding_rate_oi_weight': {
    path: '/api/futures/funding-rate/oi-weight-history',
    method: 'GET',
    description: 'Funding Rate - OI Weight History',
    params: { symbol: 'BTC', interval: '1d' }
  },
  'funding_rate_vol_weight': {
    path: '/api/futures/funding-rate/vol-weight-history',
    method: 'GET',
    description: 'Funding Rate - Vol Weight History',
    params: { symbol: 'BTC', interval: '1d' }
  },

  // ========== LONG/SHORT RATIOS ==========
  'global_long_short': {
    path: '/api/futures/global-long-short-account-ratio/history',
    method: 'GET',
    description: 'Long/Short - Global Account Ratio',
    params: { exchange: 'Binance', symbol: 'BTCUSDT', interval: '1h' }
  },
  'top_long_short': {
    path: '/api/futures/top-long-short-account-ratio/history',
    method: 'GET',
    description: 'Long/Short - Top Traders Account Ratio',
    params: { exchange: 'Binance', symbol: 'BTCUSDT', interval: '1h' }
  },

  // ========== LIQUIDATIONS ==========
  'liquidation': {
    path: '/api/futures/liquidation/history',
    method: 'GET',
    description: 'Liquidations - Pair History',
    params: { exchange: 'Binance', symbol: 'BTCUSDT', interval: '1d' }
  },
  'liquidation_aggregated': {
    path: '/api/futures/liquidation/aggregated-history',
    method: 'GET',
    description: 'Liquidations - Aggregated by Coin',
    params: { symbol: 'BTC', interval: '1d' }
  },

  // ========== PRICE DATA ==========
  'price_history': {
    path: '/api/futures/price/history',
    method: 'GET',
    description: 'Price - OHLC History',
    params: { exchange: 'Binance', symbol: 'BTCUSDT', interval: '1d' }
  },
  'spot_markets': {
    path: '/api/spot/coins-markets',
    method: 'GET',
    description: 'Price - Spot Market Data',
    params: { page: 1, per_page: 10 }
  },

  // ========== MARKET INDICES ==========
  'fear_greed': {
    path: '/api/index/fear-greed-history',
    method: 'GET',
    description: 'Index - Crypto Fear & Greed Index',
    params: {}
  },
  'ahr999': {
    path: '/api/index/ahr999',
    method: 'GET',
    description: 'Index - AHR999 (On-Chain Metric)',
    params: {}
  },
  'stablecoin_marketcap': {
    path: '/api/index/stableCoin-marketCap-history',
    method: 'GET',
    description: 'Index - Stablecoin Market Cap',
    params: { interval: 'daily' }
  }
};

// Test single endpoint
app.post('/api/test-endpoint', async (req, res) => {
  try {
    const { endpoint, params } = req.body;
    
    if (!API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'API Key not configured. Please add COINGLASS_API_KEY to .env file' 
      });
    }

    const endpointConfig = SAMPLE_ENDPOINTS[endpoint];
    if (!endpointConfig) {
      return res.status(400).json({ 
        success: false, 
        error: 'Unknown endpoint' 
      });
    }

    const url = API_BASE + endpointConfig.path;
    const queryParams = { ...endpointConfig.params, ...params };

    const response = await axios.get(url, {
      params: queryParams,
      headers: {
        'CG-API-KEY': API_KEY,
        'accept': 'application/json'
      },
      timeout: 10000
    });

    res.json({
      success: true,
      endpoint: endpoint,
      url: url,
      params: queryParams,
      status: response.status,
      data: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message,
      endpoint: req.body.endpoint,
      status: error.response?.status || 500
    });
  }
});

// Get all available test endpoints
app.get('/api/endpoints', (req, res) => {
  res.json({
    success: true,
    total: Object.keys(SAMPLE_ENDPOINTS).length,
    endpoints: Object.entries(SAMPLE_ENDPOINTS).map(([key, value]) => ({
      id: key,
      description: value.description,
      path: value.path,
      method: value.method
    }))
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

// Test all endpoints at once
app.post('/api/test-all', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'API Key not configured' 
      });
    }

    const results = [];

    for (const [key, config] of Object.entries(SAMPLE_ENDPOINTS)) {
      try {
        const url = API_BASE + config.path;
        const response = await axios.get(url, {
          params: config.params,
          headers: {
            'CG-API-KEY': API_KEY,
            'accept': 'application/json'
          },
          timeout: 8000
        });

        results.push({
          endpoint: key,
          status: 'success',
          httpStatus: response.status,
          description: config.description
        });
      } catch (error) {
        results.push({
          endpoint: key,
          status: 'failed',
          httpStatus: error.response?.status || 'N/A',
          error: error.response?.data?.msg || error.message,
          description: config.description
        });
      }

      // Rate limiting - wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({
      success: true,
      total: results.length,
      passed: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      results: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clean URL routing - serve pages without .html extension
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/market', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'market.html'));
});

app.get('/news', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'news.html'));
});

app.get('/videos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'videos.html'));
});

app.get('/partners', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'partners.html'));
});

// ========== PROXY ENDPOINTS ==========

// Long/Short Ratio proxy
app.get('/api/proxy/long-short', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(400).json({ success: false, error: 'API Key not configured' });
    }
    
    const url = API_BASE + '/api/futures/global-long-short-account-ratio/history';
    const response = await axios.get(url, {
      params: {
        exchange: 'Binance',
        symbol: 'BTCUSDT',
        interval: '4h'
      },
      headers: {
        'CG-API-KEY': API_KEY,
        'accept': 'application/json'
      },
      timeout: 10000
    });

    res.json({
      success: true,
      data: response.data.data || response.data
    });
  } catch (error) {
    console.error('Long-Short proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

// Supported coins proxy
app.get('/api/proxy/supported-coins', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(400).json({ success: false, error: 'API Key not configured' });
    }
    
    const url = API_BASE + '/api/futures/supported-coins';
    const response = await axios.get(url, {
      headers: {
        'CG-API-KEY': API_KEY,
        'accept': 'application/json'
      },
      timeout: 10000
    });

    const coins = Array.isArray(response.data) ? response.data : response.data.data || [];
    const topCoins = coins.slice(0, 18).map(symbol => ({
      symbol: symbol,
      name: symbol,
      logo: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${symbol.toLowerCase()}.png`
    }));

    res.json({
      success: true,
      data: topCoins
    });
  } catch (error) {
    console.error('Supported coins proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

// Bitcoin ETF flow summary proxy
app.get('/api/proxy/btc-etf-flow', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(400).json({ success: false, error: 'API Key not configured' });
    }
    
    const url = API_BASE + '/api/etf/bitcoin/flow-history';
    const response = await axios.get(url, {
      headers: {
        'CG-API-KEY': API_KEY,
        'accept': 'application/json'
      },
      timeout: 10000
    });

    const flows = response.data?.data || [];
    // Take last 7 days, show only key metrics
    const summary = flows.slice(-7).map(item => ({
      date: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: item.timestamp,
      flow_usd: item.flow_usd,
      price_usd: item.price_usd,
      major_etfs: item.etf_flows ? item.etf_flows
        .filter(etf => ['IBIT', 'FBTC', 'ARKB', 'BITB'].includes(etf.etf_ticker))
        .map(etf => ({ ticker: etf.etf_ticker, flow: etf.flow_usd }))
        : []
    }));

    res.json({
      success: true,
      data: summary,
      summary: {
        total_7d_flow: flows.slice(-7).reduce((sum, item) => sum + item.flow_usd, 0),
        current_price: flows[flows.length - 1]?.price_usd,
        last_flow: flows[flows.length - 1]?.flow_usd
      }
    });
  } catch (error) {
    console.error('BTC ETF flow proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

// Live prices proxy (BTC & ETH from CoinGecko)
app.get('/api/proxy/live-prices', async (req, res) => {
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true';
    
    const response = await axios.get(url, {
      timeout: 10000
    });

    const btc = response.data.bitcoin || {};
    const eth = response.data.ethereum || {};
    
    res.json({
      success: true,
      data: {
        btc: {
          symbol: 'BTC',
          price: btc.usd || 0,
          change_24h: btc.usd_24h_change || 0,
          market_cap: btc.usd_market_cap || 0,
          volume_24h: btc.usd_24h_vol || 0
        },
        eth: {
          symbol: 'ETH',
          price: eth.usd || 0,
          change_24h: eth.usd_24h_change || 0,
          market_cap: eth.usd_market_cap || 0,
          volume_24h: eth.usd_24h_vol || 0
        }
      }
    });
  } catch (error) {
    console.error('Live prices proxy error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live prices'
    });
  }
});

// Grayscale holdings proxy
app.get('/api/proxy/grayscale-holdings', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(400).json({ success: false, error: 'API Key not configured' });
    }
    
    const url = API_BASE + '/api/grayscale/holdings-list';
    const response = await axios.get(url, {
      headers: {
        'CG-API-KEY': API_KEY,
        'accept': 'application/json'
      },
      timeout: 10000
    });

    const holdings = response.data?.data || [];
    // Filter and sort by holdings_usd in descending order, take top 10
    const topHoldings = holdings
      .filter(item => item.symbol && item.holdings_usd > 0)
      .sort((a, b) => (b.holdings_usd || 0) - (a.holdings_usd || 0))
      .slice(0, 10);

    res.json({
      success: true,
      data: topHoldings
    });
  } catch (error) {
    console.error('Grayscale holdings proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

// Liquidation history proxy
app.get('/api/proxy/liquidation-history', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(400).json({ success: false, error: 'API Key not configured' });
    }
    
    const url = API_BASE + '/api/futures/liquidation/history?exchange=Binance&symbol=BTCUSDT&interval=1d';
    const response = await axios.get(url, {
      headers: {
        'CG-API-KEY': API_KEY,
        'accept': 'application/json'
      },
      timeout: 10000
    });

    const liquidations = response.data?.data || [];
    // Take last 7 days
    const recentData = liquidations.slice(-7).map(item => ({
      date: new Date(item.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: item.time,
      long_usd: parseFloat(item.long_liquidation_usd) || 0,
      short_usd: parseFloat(item.short_liquidation_usd) || 0
    }));

    // Calculate summary stats
    const totalLong = recentData.reduce((sum, item) => sum + item.long_usd, 0);
    const totalShort = recentData.reduce((sum, item) => sum + item.short_usd, 0);
    const totalLiquidation = totalLong + totalShort;

    res.json({
      success: true,
      data: recentData,
      summary: {
        total_7d_long: totalLong,
        total_7d_short: totalShort,
        total_7d_liquidation: totalLiquidation
      }
    });
  } catch (error) {
    console.error('Liquidation history proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

// Top 10 coins by market cap
app.get('/api/proxy/top-coins', async (req, res) => {
  try {
    // Check cache first
    if (isCacheValid('topCoins')) {
      console.log('Returning cached top coins data');
      return res.json({
        success: true,
        data: cache.topCoins.data,
        cached: true
      });
    }

    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false';
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'accept': 'application/json' }
    });

    const coins = response.data.map((coin, index) => ({
      rank: index + 1,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price || 0,
      change_24h: coin.price_change_percentage_24h || 0,
      market_cap: coin.market_cap || 0,
      volume_24h: coin.total_volume || 0,
      market_cap_rank: coin.market_cap_rank,
      image: coin.image || ''
    }));

    // Cache the result
    cache.topCoins.data = coins;
    cache.topCoins.timestamp = Date.now();

    res.json({
      success: true,
      data: coins
    });
  } catch (error) {
    console.error('Top coins proxy error:', error.message);
    
    // Return fallback data (demo coins or cached data)
    const fallbackData = cache.topCoins.data || fallbackTopCoins;
    console.log('Returning fallback/demo top coins data');
    
    res.json({
      success: true,
      data: fallbackData,
      fallback: true
    });
  }
});

// Market pairs (most liquid trading pairs)
app.get('/api/proxy/market-pairs', async (req, res) => {
  try {
    // Cache check
    if (isCacheValid('marketPairs')) {
      return res.json({
        success: true,
        data: cache.marketPairs.data,
        cached: true
      });
    }

    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false';
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'accept': 'application/json' }
    });

    const pairs = response.data.map((coin, index) => ({
      symbol: coin.symbol.toUpperCase(),
      pair: `${coin.symbol.toUpperCase()}/USDT`,
      name: coin.name,
      price: coin.current_price || 0,
      change_24h: coin.price_change_percentage_24h || 0,
      high_24h: coin.high_24h || 0,
      low_24h: coin.low_24h || 0,
      volume_24h: coin.total_volume || 0,
      market_cap: coin.market_cap || 0,
      image: coin.image || '',
      liquidity_score: Math.random() * 100 // Demo score
    })).sort((a, b) => b.volume_24h - a.volume_24h);

    cache.marketPairs = { data: pairs, timestamp: Date.now(), ttl: 30000 };

    res.json({
      success: true,
      data: pairs
    });
  } catch (error) {
    console.error('Market pairs proxy error:', error.message);
    
    // Return cached data if available, otherwise fallback
    const returnData = cache.marketPairs.data || fallbackMarketPairs;
    
    res.json({
      success: true,
      data: returnData,
      fallback: true
    });
  }
});

// Global market indicators
app.get('/api/proxy/market-indicators', async (req, res) => {
  try {
    // Cache check
    if (isCacheValid('marketIndicators')) {
      return res.json({
        success: true,
        data: cache.marketIndicators.data,
        cached: true
      });
    }

    // Get global data from CoinGecko
    const globalUrl = 'https://api.coingecko.com/api/v3/global';
    const globalResponse = await axios.get(globalUrl, {
      timeout: 5000,
      headers: { 'accept': 'application/json' }
    });

    const globalData = globalResponse.data.data;

    // Get stablecoin data
    const stablecoinUrl = 'https://api.coingecko.com/api/v3/coins/markets?ids=tether,usd-coin,true-usd&vs_currency=usd&order=market_cap_desc&per_page=5';
    const stablecoinResponse = await axios.get(stablecoinUrl, {
      timeout: 5000,
      headers: { 'accept': 'application/json' }
    });

    const stablecoinMarketCap = stablecoinResponse.data.reduce((sum, coin) => sum + (coin.market_cap || 0), 0);

    const indicators = {
      total_market_cap: globalData.total_market_cap?.usd || 0,
      total_volume_24h: globalData.total_volume?.usd || 0,
      btc_dominance: globalData.market_cap_percentage?.btc || 0,
      eth_dominance: globalData.market_cap_percentage?.eth || 0,
      stablecoin_market_cap: stablecoinMarketCap,
      stablecoin_percentage: ((stablecoinMarketCap / (globalData.total_market_cap?.usd || 1)) * 100).toFixed(2),
      funding_rate: 0.015, // Demo - in reality would come from Coinglass
      liquidations_24h: 124000000, // Demo
      market_sentiment: globalData.market_cap_change_percentage_24h_usd > 0 ? 'bullish' : 'bearish'
    };

    cache.marketIndicators = { data: indicators, timestamp: Date.now(), ttl: 30000 };

    res.json({
      success: true,
      data: indicators
    });
  } catch (error) {
    console.error('Market indicators proxy error:', error.message);
    
    const fallbackIndicators = {
      total_market_cap: 1920000000000,
      total_volume_24h: 89400000000,
      btc_dominance: 42.5,
      eth_dominance: 15.2,
      stablecoin_market_cap: 180000000000,
      stablecoin_percentage: '13.8',
      funding_rate: 0.015,
      liquidations_24h: 124000000,
      market_sentiment: 'neutral'
    };

    res.json({
      success: true,
      data: fallbackIndicators,
      fallback: true
    });
  }
});

// YouTube video metadata endpoint
app.get('/api/youtube-info', async (req, res) => {
  try {
    const videoIds = Array.isArray(req.query.ids) ? req.query.ids : [req.query.ids];
    const results = {};

    for (const videoId of videoIds) {
      try {
        const response = await axios.get('https://www.youtube.com/oembed', {
          params: {
            url: `https://www.youtube.com/watch?v=${videoId}`,
            format: 'json'
          }
        });

        results[videoId] = {
          title: response.data.title,
          thumbnail_url: response.data.thumbnail_url,
          author_name: response.data.author_name
        };
      } catch (error) {
        console.error(`Error fetching YouTube info for ${videoId}:`, error.message);
        results[videoId] = { title: null, error: true };
      }
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('YouTube metadata proxy error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Crypto news endpoint - fetches from CoinGecko trending data
app.get('/api/crypto-news', async (req, res) => {
  try {
    // Check cache first
    if (isCacheValid('cryptoNews')) {
      return res.json({
        success: true,
        data: cache.cryptoNews.data,
        cached: true
      });
    }

    let newsData = [];

    try {
      // Fetch trending data from CoinGecko
      const trendingResponse = await axios.get('https://api.coingecko.com/api/v3/search/trending', {
        timeout: 8000
      });

      if (trendingResponse.data && trendingResponse.data.coins) {
        newsData = trendingResponse.data.coins
          .slice(0, 8)
          .map((coin, index) => {
            const symbol = coin.item.symbol.toUpperCase();
            const name = coin.item.name;
            const changePercent = coin.item.data.price_change_percentage_24h?.aed || Math.random() * 20 - 10;
            const isPositive = changePercent > 0;
            
            return {
              id: index + 1,
              title: `${name} (${symbol}) ${isPositive ? 'qalxdı' : 'enişdir'} - ${Math.abs(changePercent).toFixed(2)}%`,
              description: `${name} kripto bazarında ən çox aranan kriptolardan biri oldu. 24 saatda ${changePercent.toFixed(2)}% dəyişim qeydə alındı.`,
              category: 'Trending',
              date: new Date().toISOString(),
              tags: [symbol, 'Trending'],
              source: 'CoinGecko',
              url: coin.item.url
            };
          });
      }
    } catch (apiError) {
      console.error('CoinGecko API error:', apiError.message);
      // Continue to use fallback
    }

    // If CoinGecko fails or returns empty, use fallback
    if (newsData.length === 0) {
      newsData = getFallbackNews();
    }

    // Cache the results
    cache.cryptoNews = { 
      data: newsData, 
      timestamp: Date.now(), 
      ttl: 600000  // 10 minute cache for trending data
    };

    res.json({
      success: true,
      data: newsData,
      source: newsData.length > 0 && newsData[0].source === 'CoinGecko' ? 'live' : 'cached'
    });
  } catch (error) {
    console.error('Crypto news endpoint error:', error.message);
    
    // Return fallback news on error
    const fallbackData = getFallbackNews();
    res.json({
      success: true,
      data: fallbackData,
      fallback: true
    });
  }
});

// Live prices endpoint
app.get('/api/live-prices', async (req, res) => {
  try {
    // Check cache first
    if (isCacheValid('livePrices')) {
      return res.json({
        success: true,
        data: cache.livePrices.data,
        cached: true
      });
    }

    // Fetch live prices from CoinGecko
    const pricesResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'bitcoin,ethereum',
        vs_currencies: 'usd',
        include_market_cap: true,
        include_24hr_vol: true,
        include_24hr_change: true
      },
      timeout: 8000
    });

    const priceData = pricesResponse.data || {};
    
    const livePrices = [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        price: priceData.bitcoin?.usd || 0,
        change_24h: priceData.bitcoin?.usd_24h_change || 0,
        market_cap: priceData.bitcoin?.usd_market_cap || 0,
        volume_24h: priceData.bitcoin?.usd_24h_vol || 0,
        icon: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
        status: 'ON-CHAIN LIVE'
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        price: priceData.ethereum?.usd || 0,
        change_24h: priceData.ethereum?.usd_24h_change || 0,
        market_cap: priceData.ethereum?.usd_market_cap || 0,
        volume_24h: priceData.ethereum?.usd_24h_vol || 0,
        icon: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
        status: 'DEFI & L2'
      }
    ];

    // Cache the results
    cache.livePrices = { 
      data: livePrices, 
      timestamp: Date.now(), 
      ttl: 30000  // 30 second cache for live prices
    };

    res.json({
      success: true,
      data: livePrices
    });
  } catch (error) {
    console.error('Live prices endpoint error:', error.message);
    
    // Return fallback prices on error
    const fallbackPrices = [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 66379.90,
        change_24h: 3.80,
        market_cap: 1315575194787,
        volume_24h: 43249286576,
        icon: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
        status: 'ON-CHAIN LIVE'
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        price: 1978.53,
        change_24h: 6.04,
        market_cap: 232559580352,
        volume_24h: 21579455475,
        icon: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
        status: 'DEFI & L2'
      }
    ];

    res.json({
      success: true,
      data: fallbackPrices,
      fallback: true
    });
  }
});

// Fallback news data for when API is unavailable
function getFallbackNews() {
  return [
    {
      id: 1,
      title: 'BTC spot ETF-lərinə son 7 günü ərzində 5.2 milyard dollar axını başladı',
      description: 'Böyük investors kurumsal ETF-lərə tədricən baxış artırdı, BTC fiyatı 72 min dollardan yuxarı stabilləşdi.',
      category: 'Xəbər',
      date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['BTC', 'ETF', 'Institusional'],
      source: 'CoinGlass'
    },
    {
      id: 2,
      title: 'Ethereum gas xərcləri Proto-danksharding yeniləməsi ilə 25% aşağı düşdü',
      description: 'Layer 2 həll yollarında txn xərcləri rekor aşağılara enib, Arbitrum və Optimism aktivitəsi artdı.',
      category: 'Xəbər',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['ETH', 'L2'],
      source: 'CoinGecko'
    },
    {
      id: 3,
      title: 'Solana TVL tarixən 10.5 milyard dollara çatdı',
      description: 'Likvid staking və DeFi protokolları Solana şəbəkəsində böyük axın qeydə alındı.',
      category: 'Xəbər',
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['SOL', 'DeFi'],
      source: 'DefiLlama'
    },
    {
      id: 4,
      title: 'USDT stablecoin bazarında 70% iştirakı saxlayır',
      description: 'Tether hərəkət edən tədarükü 95 milyard çox olmasa bərabər saxlayır, BTC bazarında dominant qalır.',
      category: 'Xəbər',
      date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['USDT', 'Stablecoin'],
      source: 'Glassnode'
    },
    {
      id: 5,
      title: 'Bitcoin dominansı 54%-ə çatdı, altcoin seçicilik gücləndi',
      description: 'Makro ehtiyatçılıq orta ölçüdə BTC-də ton nöq qoy ilə altcoin bazarını basıb.',
      category: 'Analiz',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['BTC', 'Altcoin'],
      source: 'CoinGlass'
    },
    {
      id: 6,
      title: 'Kripto futures pozisyonlarında likvidasyon 180 milyon dolları aşdı',
      description: 'Spot ATH-ə yaxın BTC fiyatına gərgin ləvermen mövqeləri sıxışdırıldı.',
      category: 'Xəbər',
      date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['Futures', 'Risk'],
      source: 'CoinGlass'
    },
    {
      id: 7,
      title: 'MicroStrategy Bitcoin ştokunda 0.8%-dən çox yer tutur',
      description: 'Kurumsal sxem BTC toplamaqda davam edir, ümumi saxlanmada 700 milyon dollar artışı.',
      category: 'Xəbər',
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['BTC', 'MSTR'],
      source: 'CoinGecko'
    },
    {
      id: 8,
      title: 'XRP Ripple qanuni girişlə 2.5 dollardan yuksəklər test edir',
      description: 'SEO mübadiləsi haqqında xüsusi şərait XRP yoldaş tədarükü yenidən qiymətləndirdi.',
      category: 'Xəbər',
      date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['XRP', 'Ripple'],
      source: 'CoinTelegraph'
    }
  ];
}

app.listen(PORT, () => {
  console.log(`\n🚀 CoinGlass API Tester is running on http://localhost:${PORT}`);
  console.log(`📊 Open your browser and navigate to: http://localhost:${PORT}`);
  
  if (!API_KEY) {
    console.log('\n⚠️  API Key not found!');
    console.log('📝 Please add your API key to the .env file: COINGLASS_API_KEY=your_key_here');
  } else {
    console.log('\n✅ API Key is configured');
  }
  console.log('\n');
});
