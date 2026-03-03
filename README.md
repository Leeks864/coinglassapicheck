# CoinGlass API Tester Dashboard

A web-based testing dashboard for the CoinGlass Hobbyist Plan API. Test endpoints, validate responses, and explore the API with ease.

## Features

✅ **Interactive Web Dashboard** - Test endpoints directly from your browser
✅ **Sample Endpoints** - Pre-configured endpoints to get you started quickly
✅ **Test All Endpoints** - Run batch tests across multiple endpoints at once
✅ **Real-time Feedback** - See success/error responses with detailed information
✅ **Beautiful UI** - Modern, responsive design that works on desktop and mobile
✅ **No Coding Required** - Just configure your API key and start testing

## Setup Instructions

### 1. Prerequisites

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **CoinGlass Hobbyist API Key** - [Get it here](https://www.coinglass.com/user)

### 2. Installation

1. Navigate to the project folder:
   ```powershell
   cd c:\Users\orkhan\Desktop\coinglassapicheck
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Create a `.env` file by copying the example:
   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit the `.env` file and add your API key:
   ```
   COINGLASS_API_KEY=your_actual_api_key_here
   PORT=3000
   ```

### 3. Run the Server

```powershell
npm start
```

You should see:
```
🚀 CoinGlass API Tester is running on http://localhost:3000
📊 Open your browser and navigate to: http://localhost:3000
✅ API Key is configured
```

### 4. Open in Browser

Go to: **http://localhost:3000**

## How to Use

### Test a Single Endpoint

1. Select an endpoint from the left panel
2. Click "Test Selected Endpoint"
3. View the response in the right panel

### Test All Endpoints

1. Click the "Test All Endpoints" button
2. Wait for the batch test to complete (takes ~30-60 seconds)
3. View detailed results showing which endpoints passed/failed

### Understand the Results

- **Success (Green)** - Endpoint is working and returning data
- **Failed (Red)** - Endpoint returned an error (check API key, rate limit, or parameters)
- **HTTP Status** - Shows the response code (200, 401, 429, 500, etc.)

## Available Test Endpoints

The dashboard comes pre-configured with these sample endpoints:

| Endpoint | Description |
|----------|-------------|
| `supported_coins` | Get all supported coins |
| `supported_exchanges` | Get all supported exchanges |
| `btc_price` | Get BTC/USD price |
| `btc_oi` | Get BTC Open Interest History |
| `btc_fr` | Get BTC Funding Rate History |
| `btc_ls_ratio` | Get Bitcoin Long/Short Ratio |
| `btc_liquidation` | Get Bitcoin Liquidation History |
| `fear_greed` | Get Crypto Fear & Greed Index |

## Expanding the Endpoints

To add more endpoints, edit `server.js` and add them to the `SAMPLE_ENDPOINTS` object:

```javascript
'my_endpoint': {
  path: '/endpoint/path',
  method: 'GET',
  description: 'My Endpoint Description',
  params: { param1: 'value1' }
}
```

Then restart the server with `npm start`.

## Troubleshooting

### "API Key Missing" Error
- Check that `.env` file exists in the project folder
- Verify the `COINGLASS_API_KEY` value is correct (no spaces, quotes, or typos)
- Restart the server after updating `.env`

### "Connection Refused" Error
- Ensure Node.js is installed: `node --version`
- Check that the server is running: `npm start`
- Try a different port in `.env`: `PORT=8080`

### "401 Unauthorized" Error
- Your API key is invalid or expired
- Get a new one from: https://www.coinglass.com/user

### "429 Rate Limit" Error
- You've hit the API rate limit
- Wait a few minutes and try again
- The batch test automatically pauses between requests to avoid this

### Port Already in Use
- Change the port in `.env` file
- Or kill the process: `Get-Process node | Stop-Process`

## API Documentation

Full API docs: https://docs.coinglass.com/reference

## Next Steps

This tester is perfect for:
- ✅ Validating your API key works
- ✅ Understanding the API response format
- ✅ Building a production application
- ✅ Creating your website using the API data

You can easily extend this to:
- Add database storage for historical data
- Build real-time dashboards
- Integrate with a frontend framework (React, Vue, etc.)
- Create automated trading/analysis tools

## Support

- CoinGlass API Docs: https://docs.coinglass.com/reference
- CoinGlass Website: https://www.coinglass.com
- Node.js Help: https://nodejs.org/docs/

---

Happy testing! 🚀
