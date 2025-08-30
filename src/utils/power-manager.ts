/**
 * Power-Aware Scheduling System
 * 
 * Adapts API polling and voice processing based on battery level
 * and charging status to extend battery life on smart glasses.
 */

export interface PowerState {
  batteryLevel: number;
  isCharging: boolean;
  isLowPower: boolean;
  lastUpdate: number;
  hasExternalBattery?: boolean;
  externalBatteryLevel?: number;
  powerSource?: 'internal' | 'external' | 'charging';
}

export interface BatteryData {
  level: number;
  charging: boolean;
  hasExternalBattery?: boolean;
  externalBatteryLevel?: number;
}

export interface PowerSettings {
  normalInterval: number;      // Normal battery polling interval
  lowPowerInterval: number;    // Low battery polling interval
  criticalInterval: number;    // Critical battery polling interval
  voiceEnabled: boolean;       // Whether voice processing is enabled
  continuousListening: boolean; // Whether continuous listening is enabled
  externalBatteryThreshold: number; // Battery level threshold for external battery
}

export class PowerManager {
  private static instance: PowerManager;
  private powerState: PowerState = {
    batteryLevel: 100,
    isCharging: false,
    isLowPower: false,
    lastUpdate: Date.now(),
    hasExternalBattery: false,
    externalBatteryLevel: undefined,
    powerSource: 'internal'
  };
  
  private settings: PowerSettings = {
    normalInterval: 60000,     // 1 minute
    lowPowerInterval: 120000,  // 2 minutes
    criticalInterval: 300000,  // 5 minutes
    voiceEnabled: true,
    continuousListening: true,
    externalBatteryThreshold: 20  // 20% threshold for external battery consideration
  };

  private listeners: Array<(state: PowerState) => void> = [];
  private batteryCheckTimer: NodeJS.Timeout | null = null;
  private batteryEventCleanup: (() => void) | null = null;

  private constructor() {
    this.startBatteryMonitoring();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PowerManager {
    if (!PowerManager.instance) {
      PowerManager.instance = new PowerManager();
    }
    return PowerManager.instance;
  }

  /**
   * Update power state with real battery data from MentraOS
   */
  updatePowerState(batteryLevel: number, isCharging: boolean): void {
    this.updatePowerStateWithData({
      level: batteryLevel,
      charging: isCharging
    });
  }

  /**
   * Update power state with comprehensive battery data
   */
  updatePowerStateWithData(batteryData: BatteryData): void {
    const wasLowPower = this.powerState.isLowPower;
    const wasCharging = this.powerState.isCharging;
    
    // Determine power source
    let powerSource: 'internal' | 'external' | 'charging' = 'internal';
    if (batteryData.charging) {
      powerSource = 'charging';
    } else if (batteryData.hasExternalBattery && batteryData.externalBatteryLevel && batteryData.externalBatteryLevel > this.settings.externalBatteryThreshold) {
      powerSource = 'external';
    }
    
    this.powerState = {
      batteryLevel: Math.max(0, Math.min(100, batteryData.level)),
      isCharging: batteryData.charging,
      isLowPower: batteryData.level < 20,
      lastUpdate: Date.now(),
      hasExternalBattery: batteryData.hasExternalBattery,
      externalBatteryLevel: batteryData.externalBatteryLevel,
      powerSource
    };

    // Notify listeners if power state changed significantly
    if (wasLowPower !== this.powerState.isLowPower || wasCharging !== this.powerState.isCharging) {
      this.notifyListeners();
    }

    console.log(`Power state updated: ${this.powerState.batteryLevel}% battery, charging: ${this.powerState.isCharging}, low power: ${this.powerState.isLowPower}, power source: ${this.powerState.powerSource}`);
  }

  /**
   * Get current power state
   */
  getPowerState(): PowerState {
    return { ...this.powerState };
  }

  /**
   * Get optimal polling interval based on power state
   */
  getOptimalInterval(): number {
    // When charging, use normal interval regardless of battery level
    if (this.powerState.isCharging) {
      return this.settings.normalInterval;
    }

    // When using external battery, be more conservative
    if (this.powerState.powerSource === 'external') {
      if (this.powerState.externalBatteryLevel && this.powerState.externalBatteryLevel < 30) {
        return this.settings.lowPowerInterval; // External battery getting low
      }
      return this.settings.normalInterval; // External battery has good charge
    }

    // Internal battery logic
    if (this.powerState.batteryLevel < 10) {
      return this.settings.criticalInterval; // Critical battery
    } else if (this.powerState.batteryLevel < 20) {
      return this.settings.lowPowerInterval; // Low battery
    } else {
      return this.settings.normalInterval; // Normal battery
    }
  }

  /**
   * Check if voice processing should be enabled
   */
  shouldEnableVoice(): boolean {
    if (!this.settings.voiceEnabled) return false;
    
    // Always enable voice when charging
    if (this.powerState.isCharging) {
      return true;
    }
    
    // Enable voice when using external battery (unless critically low)
    if (this.powerState.powerSource === 'external') {
      if (this.powerState.externalBatteryLevel && this.powerState.externalBatteryLevel < 10) {
        return false; // External battery critically low
      }
      return true; // External battery available
    }
    
    // Disable voice in critical battery for internal battery
    if (this.powerState.batteryLevel < 10) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if continuous listening should be enabled
   */
  shouldEnableContinuousListening(): boolean {
    if (!this.settings.continuousListening) return false;
    if (!this.shouldEnableVoice()) return false;
    
    // Disable continuous listening in low power mode
    if (this.powerState.isLowPower && !this.powerState.isCharging) {
      return false;
    }
    
    return true;
  }

  /**
   * Get power-aware settings
   */
  getPowerSettings(): PowerSettings {
    return {
      ...this.settings,
      voiceEnabled: this.shouldEnableVoice(),
      continuousListening: this.shouldEnableContinuousListening()
    };
  }

  /**
   * Update power settings
   */
  updateSettings(newSettings: Partial<PowerSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.notifyListeners();
  }

  /**
   * Add power state change listener
   */
  addListener(listener: (state: PowerState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of power state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getPowerState());
      } catch (error) {
        console.error('Error in power state listener:', error);
      }
    });
  }

  /**
   * Initialize power management with MentraOS session
   */
  initializeWithSession(session: any): void {
    try {
      // Check for power capabilities
      if (session.capabilities?.power) {
        const power = session.capabilities.power;
        
        if (power.hasExternalBattery) {
          console.log("External battery pack available - enabling enhanced power management");
          this.powerState.hasExternalBattery = true;
        } else {
          console.log("Built-in battery only - using standard power management");
          this.powerState.hasExternalBattery = false;
        }
      }

      // Subscribe to battery events
      if (session.events?.onGlassesBattery) {
        const batteryCleanup = session.events.onGlassesBattery((data: any) => {
          console.log(`Battery: ${data.level}% ${data.charging ? "(charging)" : ""}`);
          
          // Update power state with real battery data
          this.updatePowerStateWithData({
            level: data.level,
            charging: data.charging,
            hasExternalBattery: this.powerState.hasExternalBattery,
            externalBatteryLevel: data.externalBatteryLevel
          });

          if (this.powerState.hasExternalBattery && data.charging) {
            console.log("Charging from external battery");
          }
        });

        // Store cleanup function for later
        this.batteryEventCleanup = batteryCleanup;
      }

      console.log("Power management initialized with MentraOS session");
    } catch (error) {
      console.error("Failed to initialize power management with session:", error);
      // Fall back to simulated monitoring
      this.startSimulatedBatteryMonitoring();
    }
  }

  /**
   * Start battery monitoring
   */
  private startBatteryMonitoring(): void {
    if (this.batteryCheckTimer) {
      clearInterval(this.batteryCheckTimer);
    }

    // Check battery every 30 seconds
    this.batteryCheckTimer = setInterval(() => {
      this.checkBatteryStatus();
    }, 30000);
  }

  /**
   * Start simulated battery monitoring (fallback)
   */
  private startSimulatedBatteryMonitoring(): void {
    console.log("Starting simulated battery monitoring (fallback mode)");
    this.startBatteryMonitoring();
  }

  /**
   * Check battery status (simulated for now)
   */
  private checkBatteryStatus(): void {
    // In a real implementation, this would check actual battery status
    // For now, we'll simulate gradual battery drain when not charging
    
    if (!this.powerState.isCharging && this.powerState.batteryLevel > 0) {
      // Simulate 1% battery drain every 30 seconds
      const newBatteryLevel = Math.max(0, this.powerState.batteryLevel - 1);
      this.updatePowerState(newBatteryLevel, false);
    }
  }

  /**
   * Get power recommendations
   */
  getPowerRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // External battery recommendations
    if (this.powerState.hasExternalBattery) {
      if (this.powerState.powerSource === 'external') {
        if (this.powerState.externalBatteryLevel && this.powerState.externalBatteryLevel < 30) {
          recommendations.push('External battery getting low - consider charging');
        } else {
          recommendations.push('Using external battery - extended runtime available');
        }
      } else if (this.powerState.isCharging) {
        recommendations.push('Charging from external battery - full performance mode');
      }
    }
    
    // Internal battery recommendations
    if (this.powerState.powerSource === 'internal') {
      if (this.powerState.batteryLevel < 10) {
        recommendations.push('Critical battery level - consider charging');
        recommendations.push('Reduced functionality to conserve power');
      } else if (this.powerState.batteryLevel < 20) {
        recommendations.push('Low battery - reduced polling frequency');
        recommendations.push('Voice processing limited');
      } else if (this.powerState.batteryLevel < 50) {
        recommendations.push('Moderate battery - normal operation');
      } else {
        recommendations.push('Good battery level - full functionality');
      }
    }
    
    // Charging recommendations
    if (this.powerState.isCharging) {
      recommendations.push('Charging - full performance mode');
    }
    
    return recommendations;
  }

  /**
   * Get power statistics
   */
  getPowerStats(): {
    batteryLevel: number;
    isCharging: boolean;
    isLowPower: boolean;
    optimalInterval: number;
    voiceEnabled: boolean;
    continuousListening: boolean;
    uptime: number;
    hasExternalBattery: boolean;
    externalBatteryLevel?: number;
    powerSource: string;
  } {
    return {
      batteryLevel: this.powerState.batteryLevel,
      isCharging: this.powerState.isCharging,
      isLowPower: this.powerState.isLowPower,
      optimalInterval: this.getOptimalInterval(),
      voiceEnabled: this.shouldEnableVoice(),
      continuousListening: this.shouldEnableContinuousListening(),
      uptime: Date.now() - this.powerState.lastUpdate,
      hasExternalBattery: this.powerState.hasExternalBattery || false,
      externalBatteryLevel: this.powerState.externalBatteryLevel,
      powerSource: this.powerState.powerSource || 'internal'
    };
  }

  /**
   * Stop battery monitoring (for testing or shutdown)
   */
  stopBatteryMonitoring(): void {
    if (this.batteryCheckTimer) {
      clearInterval(this.batteryCheckTimer);
      this.batteryCheckTimer = null;
    }
    
    if (this.batteryEventCleanup) {
      this.batteryEventCleanup();
      this.batteryEventCleanup = null;
    }
  }

  /**
   * Simulate battery drain (for testing)
   */
  simulateBatteryDrain(percentage: number): void {
    const newLevel = Math.max(0, this.powerState.batteryLevel - percentage);
    this.updatePowerState(newLevel, this.powerState.isCharging);
  }

  /**
   * Simulate charging (for testing)
   */
  simulateCharging(isCharging: boolean): void {
    this.updatePowerState(this.powerState.batteryLevel, isCharging);
  }
}
