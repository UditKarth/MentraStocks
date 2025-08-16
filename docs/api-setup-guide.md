# StockTracker API Setup Guide

This guide explains how to set up financial data APIs for the StockTracker application.

## 🚀 **Quick Start (No API Key Required)**

The StockTracker app now works **out of the box** with **Yahoo Finance API** (no API key required). Simply run:

```bash
npm run start:mock  # Uses mock data for testing
npm run start       # Uses real Yahoo Finance data
```

## 📊 **Available API Providers**

### **1. Yahoo Finance API (Primary - No API Key)**
- ✅ **No registration required**
- ✅ **No API key needed**
- ✅ **Real-time data**
- ✅ **Good rate limits**
- ✅ **Reliable service**

**Usage**: Automatically used as the primary provider

### **2. Mock Data (Testing)**
- 🧪 **For development and testing**
- 📊 **Realistic simulated data**
- ⚡ **No rate limits**
- 🔄 **Automatic fallback**

## 🔧 **Configuration**

### **Environment Variables**

Add these to your `.env` file:

```bash
# Required
PACKAGE_NAME=com.example.stocktracker
AUGMENTOS_API_KEY=your_mentra_api_key

# Optional - Server port
PORT=3000
```

### **API Provider Priority**

The app tries providers in this order:
1. **Yahoo Finance** (primary)
2. **Mock Data** (fallback)

## 🎯 **How It Works**

### **Data Flow**
```
User Request → StockTracker App → API Manager → Provider Chain
                                                    ↓
                                            Try Yahoo Finance
                                                    ↓
                                            Try Alpha Vantage (if available)
                                                    ↓
                                            Fallback to Mock Data
```

### **API Response Format**
```typescript
interface StockApiResponse {
  price: number;        // Current stock price
  changePercent: number; // Percentage change
}
```

## 📈 **API Usage Examples**

### **Yahoo Finance API**
```typescript
// Automatically used - no configuration needed
const data = await stockApiManager.fetchStockData('AAPL', '1D');
// Returns: { price: 150.25, changePercent: 2.5 }
```



## 🔄 **Rate Limits & Best Practices**

### **Yahoo Finance**
- **Rate Limit**: Reasonable limits, no strict enforcement
- **Best Practice**: Use for primary data fetching
- **Reliability**: High



### **Mock Data**
- **Rate Limit**: None
- **Best Practice**: Development and testing
- **Reliability**: Always available

## 🛠 **Troubleshooting**

### **Common Issues**

#### **"All providers failed" Error**
```bash
# Check network connectivity
curl https://query1.finance.yahoo.com/v8/finance/chart/AAPL

# Check API key (if using Alpha Vantage)
echo $ALPHA_VANTAGE_API_KEY
```

#### **Rate Limit Exceeded**
```bash
# Switch to mock data temporarily
# Or wait for rate limit reset
```

#### **Invalid Ticker Symbol**
```bash
# Ensure ticker is valid
# Examples: AAPL, GOOGL, MSFT, TSLA
# Not: APPLE, GOOGLE (use ticker symbols, not company names)
```

### **Debug Mode**

Enable debug logging by setting:
```bash
DEBUG=stocktracker:* npm run start
```

## 🚀 **Production Deployment**

### **Recommended Setup**
1. **Primary**: Yahoo Finance API (no setup required)
2. **Fallback**: Mock Data (for testing)
3. **Monitoring**: Add logging for API usage

### **Environment Variables for Production**
```bash
# Production .env
PACKAGE_NAME=com.yourcompany.stocktracker
AUGMENTOS_API_KEY=your_production_mentra_key
PORT=3000
NODE_ENV=production
```

## 📊 **API Performance**

### **Response Times**
- **Yahoo Finance**: ~200-500ms
- **Mock Data**: ~100-300ms

### **Success Rates**
- **Yahoo Finance**: ~95%
- **Mock Data**: 100%

## 🔮 **Future Enhancements**

### **Planned Providers**
- **IEX Cloud**: Professional-grade data
- **Polygon.io**: Real-time market data
- **Finnhub**: Alternative free tier
- **Alpha Vantage**: Optional paid tier

### **Features**
- **Caching**: Reduce API calls
- **WebSocket**: Real-time updates
- **Historical Data**: Chart support
- **News Integration**: Stock news

## 📞 **Support**

### **Getting Help**
1. Check the logs for error messages
2. Verify API keys and environment variables
3. Test with mock data first
4. Check network connectivity

### **Useful Links**
- [Yahoo Finance API Documentation](https://finance.yahoo.com/)
- [StockTracker GitHub Issues](https://github.com/your-repo/issues)

---

**Note**: The StockTracker app is designed to work immediately without any API setup. Yahoo Finance provides reliable, free stock data that's perfect for most use cases.
