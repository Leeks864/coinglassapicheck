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

const corsOptions = {
  origin: (origin, callback) => {
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

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://open-api-v4.coinglass.com; frame-src https://www.youtube.com https://youtube.com;");
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'ESFX');
  next();
};

const requests = {};
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requests[ip]) {
    requests[ip] = [];
  }
  
  requests[ip] = requests[ip].filter(time => now - time < 60000);
  
  if (requests[ip].length >= 30) {
    return res.status(429).json({ 
      success: false, 
      error: 'Çox sürətli sorğu. Bir mikə sonra cəhd edin.' 
    });
  }
  
  requests[ip].push(now);
  next();
};

const validateInput = (req, res, next) => {
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

app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(rateLimitMiddleware);
app.use(express.json({ limit: '10kb' }));
app.use(validateInput);
app.use(express.static('public'));

const cache = {
  topCoins: { data: null, timestamp: 0, ttl: 60000 },
  marketPairs: { data: null, timestamp: 0, ttl: 30000 },
  marketIndicators: { data: null, timestamp: 0, ttl: 30000 },
  cryptoNews: { data: null, timestamp: 0, ttl: 600000 },
  livePrices: { data: null, timestamp: 0, ttl: 30000 }
};

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

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

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
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

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
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

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
    const topHoldings = holdings
      .filter(item => item.symbol && item.holdings_usd > 0)
      .sort((a, b) => (b.holdings_usd || 0) - (a.holdings_usd || 0))
      .slice(0, 10);

    res.json({
      success: true,
      data: topHoldings
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

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
    const recentData = liquidations.slice(-7).map(item => ({
      date: new Date(item.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: item.time,
      long_usd: parseFloat(item.long_liquidation_usd) || 0,
      short_usd: parseFloat(item.short_liquidation_usd) || 0
    }));

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
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.msg || error.message
    });
  }
});

app.get('/api/proxy/top-coins', async (req, res) => {
  try {
    if (isCacheValid('topCoins')) {
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

    cache.topCoins.data = coins;
    cache.topCoins.timestamp = Date.now();

    res.json({
      success: true,
      data: coins
    });
  } catch (error) {
    const fallbackData = cache.topCoins.data || fallbackTopCoins;
    res.json({
      success: true,
      data: fallbackData,
      fallback: true
    });
  }
});

app.get('/api/proxy/market-pairs', async (req, res) => {
  try {
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
      liquidity_score: Math.random() * 100
    })).sort((a, b) => b.volume_24h - a.volume_24h);

    cache.marketPairs = { data: pairs, timestamp: Date.now(), ttl: 30000 };

    res.json({
      success: true,
      data: pairs
    });
  } catch (error) {
    const returnData = cache.marketPairs.data || fallbackMarketPairs;
    res.json({
      success: true,
      data: returnData,
      fallback: true
    });
  }
});

app.get('/api/proxy/market-indicators', async (req, res) => {
  try {
    if (isCacheValid('marketIndicators')) {
      return res.json({
        success: true,
        data: cache.marketIndicators.data,
        cached: true
      });
    }

    const globalUrl = 'https://api.coingecko.com/api/v3/global';
    const globalResponse = await axios.get(globalUrl, {
      timeout: 5000,
      headers: { 'accept': 'application/json' }
    });

    const globalData = globalResponse.data.data;

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
      funding_rate: 0.015,
      liquidations_24h: 124000000,
      market_sentiment: globalData.market_cap_change_percentage_24h_usd > 0 ? 'bullish' : 'bearish'
    };

    cache.marketIndicators = { data: indicators, timestamp: Date.now(), ttl: 30000 };

    res.json({
      success: true,
      data: indicators
    });
  } catch (error) {
    res.json({
      success: true,
      data: fallbackMarketIndicators,
      fallback: true
    });
  }
});

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
        results[videoId] = { title: null, error: true };
      }
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/crypto-news', async (req, res) => {
  try {
    if (isCacheValid('cryptoNews')) {
      return res.json({
        success: true,
        data: cache.cryptoNews.data,
        cached: true
      });
    }

    let newsData = [];

    try {
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
      const fallbackData = getFallbackNews();
      cache.cryptoNews = { 
        data: fallbackData, 
        timestamp: Date.now(), 
        ttl: 600000
      };
      return res.json({
        success: true,
        data: fallbackData,
        fallback: true
      });
    }

    if (newsData.length === 0) {
      newsData = getFallbackNews();
    }

    cache.cryptoNews = { 
      data: newsData, 
      timestamp: Date.now(), 
      ttl: 600000
    };

    res.json({
      success: true,
      data: newsData,
      source: newsData.length > 0 && newsData[0].source === 'CoinGecko' ? 'live' : 'cached'
    });
  } catch (error) {
    const fallbackData = getFallbackNews();
    res.json({
      success: true,
      data: fallbackData,
      fallback: true
    });
  }
});

app.get('/api/live-prices', async (req, res) => {
  try {
    if (isCacheValid('livePrices')) {
      return res.json({
        success: true,
        data: cache.livePrices.data,
        cached: true
      });
    }

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

    cache.livePrices = { 
      data: livePrices, 
      timestamp: Date.now(), 
      ttl: 30000
    };

    res.json({
      success: true,
      data: livePrices
    });
  } catch (error) {
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

app.listen(PORT, () => {
  console.log(`\nServer running on http://localhost:${PORT}`);
});
