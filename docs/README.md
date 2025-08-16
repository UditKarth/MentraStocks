# StockTracker for Smart Glasses

A TypeScript application for tracking stocks on smart glasses using the @mentra/sdk. This app allows users to manage a watchlist of stocks via voice commands and displays real-time price information with periodic updates.

## Features

- **Voice Command Interface**: Add, remove, and pin stocks using natural language
- **Real-time Updates**: Configurable refresh intervals with visual progress indicator
- **Persistent Watchlists**: User watchlists are saved and restored across sessions
- **Smart Display**: Glanceable format optimized for smart glasses with color-coded price changes
- **Pin System**: Pin important stocks to prevent automatic removal
- **Multiple Timeframes**: Support for 1D, 1W, 1M, 1Y timeframes
- **Configurable Settings**: Customizable refresh intervals, max stocks, and other preferences
- **MentraOS Integration**: Listens for system-wide settings changes
- **Proper Resource Management**: Automatic cleanup of listeners and intervals

## Architecture

The application follows the same architectural patterns as the LiveCaptionsApp example:

- Extends `AppServer` from @mentra/sdk
- Uses global maps for user state management
- Implements session lifecycle management (`onSession`, `onStop`)
- Handles voice transcription with language-specific processing
- Manages settings changes with event listeners

## Prerequisites

- Node.js 18.0.0 or higher
- @mentra/sdk access
- Financial API key (for stock data)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   export PACKAGE_NAME="your-package-name"
   export AUGMENTOS_API_KEY="your-augmentos-api-key"
   export FINANCIAL_API_KEY="your-financial-api-key"
   export PORT=80  # Optional, defaults to 80
   ```

## Usage

### Starting the Application

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

### Voice Commands

All commands must start with "Stock tracker":

- **Add a stock**: "Stock tracker add AAPL" or "Stock tracker focus on NVIDIA"
- **Pin a stock**: "Stock tracker pin Apple"
- **Remove a stock**: "Stock tracker remove Google"
- **Price alerts**: "Stock tracker alert me if Tesla drops below 175" (acknowledged for future implementation)

### Display Format

The app displays stocks in a glanceable format:
```
Stock Tracker [████████░░] (1D)

📌AAPL $175.20 <color="green">▲0.5%</color> (1D)
GOOG $140.10 <color="red">▼1.2%</color> (1D)
NVDA <color="gray">Loading...</color>
```

- **Progress bar**: Shows refresh cycle progress (60-second intervals)
- **Pin icon**: 📌 indicates pinned stocks
- **Color coding**: Green for gains, red for losses
- **Timeframe**: Shows current display timeframe

## Data Models

### Stock Interface
```typescript
interface Stock {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  isPinned: boolean;
}
```

### Settings

The app uses individual settings instead of nested objects for better type safety and performance:

- `timeframe`: `'1D' | '1W' | '1M' | '1Y'` - Display timeframe
- `refresh_interval_seconds`: `number` - Refresh interval in seconds (30-300)
- `max_stocks`: `number` - Maximum stocks in watchlist (1-10)
- `watchlist`: `Stock[]` - Array of tracked stocks

See `settings-config.md` for detailed settings documentation.

## Configuration

### Environment Variables

- `PACKAGE_NAME`: Your application package name
- `AUGMENTOS_API_KEY`: API key for @mentra/sdk
- `FINANCIAL_API_KEY`: API key for financial data provider
- `PORT`: Server port (default: 80)

### Financial API Integration

The app currently uses a mock API endpoint. To integrate with a real financial API:

1. Update the `fetchStockData` method in `StockTrackerApp.ts`
2. Replace the mock endpoint with your preferred financial data provider
3. Ensure the API returns data matching the `StockApiResponse` interface

Example providers:
- Alpha Vantage
- Yahoo Finance API
- IEX Cloud
- Polygon.io

## Session Management

### onSession
- Loads user watchlist and settings from session storage
- Initializes data refresh loop (60-second intervals)
- Sets up voice command listeners
- Applies initial display

### onStop
- Cleans up refresh intervals
- Removes user data from global maps
- Prevents memory leaks

## State Management

The app uses global maps for user state:
- `userWatchlists`: Map<string, Stock[]> - User watchlists
- `userRefreshIntervals`: Map<string, NodeJS.Timeout> - Refresh timers
- `userCleanupFunctions`: Map<string, Array<() => void>> - Settings listeners cleanup

## Error Handling

- API failures are gracefully handled with fallback to previous data
- Invalid voice commands are ignored
- Session errors trigger default settings
- Network timeouts prevent hanging requests

## Future Enhancements

- Price alert notifications
- Multiple watchlist support
- Technical indicators
- News integration
- Portfolio tracking
- Custom refresh intervals

## Development

### Development Setup

#### Using npm
```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev          # Main app
npm run dev:mock     # Mock version

# Production
npm start            # Run app directly
npm run start:mock   # Run mock app directly

# Testing
npm test             # Run tests
```

#### Using bun (Recommended - Faster)
```bash
# Install dependencies
bun install

# Development (with hot reload)
bun run dev          # Main app
bun run dev:mock     # Mock version

# Production
bun run start        # Run app directly
bun run start:mock   # Run mock app directly

# Testing
bun run test         # Run tests
```

#### Build Commands
```bash
npm run build        # Compile TypeScript to JavaScript
npm run clean        # Remove dist folder
npm run rebuild      # Clean and rebuild
```

### TypeScript Configuration
The project uses strict TypeScript settings for type safety and better development experience.

### Code Structure

#### Source Code (`src/`)
- `src/app/StockTrackerApp.ts`: Main application class (with real API)
- `src/app/exampleapp.ts`: Example app for reference
- `src/mock/StockTrackerApp-mock.ts`: Version using mock data for testing
- `src/mock/test-mock-data.ts`: Mock data and testing utilities

#### Configuration (`config/`)
- `config/config.example`: Configuration template

#### Documentation (`docs/`)
- `docs/README.md`: This file
- `docs/settings-config.md`: Detailed settings documentation
- `docs/layout-improvements.md`: Layout improvements guide
- `docs/appsession-improvements.md`: AppSession improvements guide
- `docs/appserver-improvements.md`: AppServer improvements guide

#### Project Files
- `package.json`: Dependencies and scripts
- `tsconfig.json`: TypeScript configuration
- `.gitignore`: Git ignore rules

## License

MIT License - see LICENSE file for details.
