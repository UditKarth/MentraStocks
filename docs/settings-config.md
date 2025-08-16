# StockTracker Settings Configuration

This document describes all the settings available in the StockTracker application and how they are used.

## Available Settings

### Core Settings

#### `watchlist`
- **Type**: `Stock[]`
- **Default**: `[]`
- **Description**: Array of stocks in the user's watchlist
- **Structure**:
  ```typescript
  interface Stock {
    ticker: string;
    price: number | null;
    changePercent: number | null;
    isPinned: boolean;
  }
  ```

#### `timeframe`
- **Type**: `'1D' | '1W' | '1M' | '1Y'`
- **Default**: `'1D'`
- **Description**: The time period for stock price changes (1 Day, 1 Week, 1 Month, 1 Year)
- **Usage**: Used when fetching stock data from the financial API

#### `refresh_interval_seconds`
- **Type**: `number`
- **Default**: `60`
- **Description**: How often to refresh stock data (in seconds)
- **Range**: 30-300 seconds (30 seconds to 5 minutes)
- **Usage**: Controls the automatic refresh cycle

#### `max_stocks`
- **Type**: `number`
- **Default**: `5`
- **Description**: Maximum number of stocks allowed in the watchlist
- **Range**: 1-10 stocks
- **Usage**: When adding new stocks, if the limit is reached, unpinned stocks are removed

## Settings Usage Examples

### Getting Settings
```typescript
// Get with proper typing and defaults
const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
const refreshInterval = session.settings.get<number>('refresh_interval_seconds', 60);
const maxStocks = session.settings.get<number>('max_stocks', 5);
const watchlist = session.settings.get<Stock[]>('watchlist', []);
```

### Setting Values
```typescript
// Update individual settings
session.settings.set('timeframe', '1W');
session.settings.set('refresh_interval_seconds', 120);
session.settings.set('max_stocks', 8);
session.settings.set('watchlist', updatedWatchlist);
```

### Listening for Changes
```typescript
// Listen for specific setting changes
const cleanup = session.settings.onValueChange<'1D' | '1W' | '1M' | '1Y'>('timeframe', (newValue, oldValue) => {
  console.log(`Timeframe changed from ${oldValue} to ${newValue}`);
  // Update display or fetch new data
});

// Listen for any setting changes
const allChangesCleanup = session.settings.onChange((changes) => {
  console.log('Settings changed:', Object.keys(changes));
});
```

## MentraOS Settings Integration

The app also listens for system-wide MentraOS settings:

### `metricSystemEnabled`
- **Type**: `boolean`
- **Description**: Whether the user has enabled metric system
- **Usage**: Could be used for currency formatting in future versions

```typescript
const cleanup = session.settings.onMentraosSettingChange<boolean>('metricSystemEnabled', (enabled, wasEnabled) => {
  console.log(`Metric system ${enabled ? 'enabled' : 'disabled'}`);
  // Update currency formatting if needed
});
```

## Best Practices

### 1. Always Provide Defaults
```typescript
// Good
const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');

// Avoid
const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe'); // Could be undefined!
```

### 2. Use Proper TypeScript Generics
```typescript
// Good - Type safe
const enabled = session.settings.get<boolean>('feature_enabled', false);
const theme = session.settings.get<'light' | 'dark'>('theme', 'light');

// Avoid - Loses type safety
const value = session.settings.get('some_setting');
```

### 3. Clean Up Listeners
```typescript
// Store cleanup functions
const cleanupFunctions: Array<() => void> = [];

cleanupFunctions.push(
  session.settings.onValueChange('timeframe', handleTimeframeChange),
  session.settings.onValueChange('refresh_interval_seconds', handleRefreshChange),
  session.settings.onChange(handleAnyChange)
);

// Clean up in onStop
cleanupFunctions.forEach(cleanup => cleanup());
```

## Settings Validation

The app includes validation for settings:

- **refresh_interval_seconds**: Minimum 30 seconds, maximum 300 seconds
- **max_stocks**: Minimum 1, maximum 10
- **timeframe**: Must be one of the allowed values
- **watchlist**: Must be an array of valid Stock objects

## Future Settings

Potential future settings that could be added:

- `currency_format`: How to display prices (USD, EUR, etc.)
- `price_alerts`: Array of price alert configurations
- `display_mode`: How to display the watchlist (compact, detailed, etc.)
- `auto_pin_new`: Whether to automatically pin newly added stocks
- `sound_enabled`: Whether to play sounds for price changes
- `vibration_enabled`: Whether to vibrate for significant price changes

