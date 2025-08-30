# StockTracker App for Smart Glasses

A real-time stock tracking application for smart glasses using the @mentra/sdk. The app provides live stock data, voice commands, and a dashboard interface for monitoring your favorite stocks.

## 🚀 Features

- **Real-time Stock Data**: Get live prices and percentage changes for any stock
- **Voice Commands**: Add, remove, and pin stocks using natural language
- **Multiple Timeframes**: View data for 1D, 1W, 1M, and 1Y periods
- **Dashboard Interface**: Persistent stock cards for quick reference
- **Real-time API**: Yahoo Finance (no API key required)
- **Mock Mode**: Test with simulated data for development

## 📦 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd MentraStocks
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp config/env.example .env
# Edit .env with your actual values
```

## ⚙️ Configuration

### Required Environment Variables

```bash
# Your application package name from @mentra/sdk
PACKAGE_NAME=your-stocktracker-app

# Your AugmentOS API key
AUGMENTOS_API_KEY=your-augmentos-api-key-here
```

### Optional Environment Variables

```bash
# Optional: Financial Modeling Prep API key (for company lookup)
# Get free API key at: https://financialmodelingprep.com/developer/docs/
# Note: FMP API works without key but has lower rate limits
FMP_API_KEY=your-fmp-api-key-here

# Server port (defaults to 80)
PORT=3000

# Node environment
NODE_ENV=production
```

## 🏃‍♂️ Running the App

### Real Stock Data Mode
```bash
# Start with real stock data
npm run start

# Development mode with auto-restart
npm run dev
```

### Mock Data Mode (for testing)
```bash
# Start with mock data
npm run start:mock

# Development mode with auto-restart
npm run dev:mock
```

### Using Bun (faster)
```bash
# Real data
bun run src/app/StockTrackerApp.ts

# Mock data
bun run src/mock/StockTrackerApp-mock.ts
```

## 🧪 Testing

### Test Real API
```bash
# Test real stock API with popular stocks
npm run test:real
```

### Test Mock API
```bash
# Test mock data generation
npm run test
```

### Full Verification
```bash
# Comprehensive app verification
npm run verify
```

## 🎤 Voice Commands

The app responds to voice commands with the activation phrase "Stock tracker":

### Adding Stocks
- "Stock tracker add AAPL"
- "Stock tracker add ticker CRWD" - Add specific ticker symbol
- "Stock tracker add ticker A-A-P-L" - Add ticker with dashes (handles transcription)
- "Stock tracker focus on Tesla"
- "Stock tracker add NVIDIA"

### Managing Watchlist
- "Stock tracker pin Apple" - Pin a stock to prevent removal
- "Stock tracker pin N-V-D-A" - Pin ticker with dashes (handles transcription)
- "Stock tracker remove Google" - Remove an unpinned stock
- "Stock tracker remove T-S-L-A" - Remove ticker with dashes (handles transcription)
- "Stock tracker details AAPL" - Show detailed stock information
- "Stock tracker details G-O-O-G-L" - Show details with dashes (handles transcription)

### Getting Help
- "Stock tracker help" - Show available commands

## 📊 API Endpoints

When the app is running, these endpoints are available:

- `GET /health` - Health check
- `GET /api/status` - App status and metrics
- `GET /api/user/:userId/watchlist` - Get user's watchlist
- `POST /api/user/:userId/stock` - Add stock to watchlist
- `GET /api/stock/:ticker` - Get stock data
- `POST /api/token` - Generate JWT token

## 🔧 AI Tools

The app provides these AI tools for integration:

- `add_stock` - Add stock to watchlist
- `remove_stock` - Remove stock from watchlist
- `pin_stock` - Pin stock in watchlist
- `get_watchlist` - Get current watchlist
- `get_stock_price` - Get stock price and change
- `set_timeframe` - Set display timeframe
- `set_refresh_interval` - Set refresh interval

## 📈 Supported Stocks

The app supports any stock symbol available on Yahoo Finance, including:

- **Tech**: AAPL, GOOGL, MSFT, TSLA, AMZN, NVDA, META, NFLX
- **Finance**: JPM, BAC, WFC, GS
- **Healthcare**: JNJ, PFE, UNH, ABBV
- **Consumer**: KO, PG, WMT, HD
- **And many more...**

## 🏗️ Architecture

### Stock API Providers
1. **Yahoo Finance** (Primary) - No API key required, reliable
2. **Mock Data** (Testing) - Simulated data for development

### App Structure
```
src/
├── app/
│   └── StockTrackerApp.ts      # Main app with real data
├── mock/
│   ├── StockTrackerApp-mock.ts # Mock version for testing
│   └── test-mock-data.ts       # Mock data utilities
├── utils/
│   └── stock-api.ts            # Multi-provider API manager
├── types/
│   └── index.ts                # TypeScript type definitions
└── test-real-api.ts            # Real API testing
```

## 🔍 Troubleshooting

### Common Issues

1. **"AUGMENTOS_API_KEY environment variable is required"**
   - Set your AugmentOS API key in the .env file

2. **"PACKAGE_NAME environment variable is required"**
   - Set your package name in the .env file

3. **Stock data not loading**
   - Check internet connection
   - Verify stock symbol is valid
   - Check API rate limits

4. **Voice commands not working**
   - Ensure you say "Stock tracker" first
   - Check microphone permissions
   - Verify transcription is working

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=true
```

## 📝 Development

### Adding New Features
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both real and mock data
5. Submit a pull request

### Testing Strategy
- Use mock mode for development and testing
- Use real mode for final verification
- Test voice commands thoroughly
- Verify API fallback behavior

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines before submitting pull requests.

## 📞 Support

For support and questions:
- Check the troubleshooting section
- Review the API documentation
- Open an issue on GitHub

---

**Happy Stock Tracking! 📈**

Run ngrok http --url=https://great-beetle-mint.ngrok-free.app 3000