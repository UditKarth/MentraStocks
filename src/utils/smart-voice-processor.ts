/**
 * Smart Voice Processor for StockTracker
 * 
 * Implements intelligent voice processing features:
 * - Voice activity detection to reduce CPU usage
 * - Transcription deduplication to avoid processing duplicates
 * - Smart silence detection
 * - Power-aware voice processing
 * - Memory leak prevention
 */

export interface VoiceActivityConfig {
  silenceThreshold: number;
  voiceActivityThreshold: number;
  maxTranscriptionLength: number;
  deduplicationWindow: number;
  maxRecentTranscriptions: number;
  lowPowerMode: boolean;
}

export interface VoiceActivityState {
  isListening: boolean;
  isVoiceActive: boolean;
  lastVoiceActivity: number;
  silenceStartTime: number | null;
  consecutiveSilence: number;
  transcriptionCount: number;
  duplicateCount: number;
}

export class SmartVoiceProcessor {
  private static instance: SmartVoiceProcessor;
  
  private state: VoiceActivityState = {
    isListening: false,
    isVoiceActive: false,
    lastVoiceActivity: 0,
    silenceStartTime: null,
    consecutiveSilence: 0,
    transcriptionCount: 0,
    duplicateCount: 0
  };
  
  private config: VoiceActivityConfig = {
    silenceThreshold: 3000, // 3 seconds
    voiceActivityThreshold: 0.1, // audio level threshold
    maxTranscriptionLength: 200, // characters
    deduplicationWindow: 5000, // 5 seconds
    maxRecentTranscriptions: 100,
    lowPowerMode: false
  };
  
  private recentTranscriptions: Map<string, number> = new Map(); // text -> timestamp
  private silenceTimer: NodeJS.Timeout | null = null;
  private activityTimer: NodeJS.Timeout | null = null;
  
  // Callbacks
  private onVoiceStart?: () => void;
  private onVoiceEnd?: () => void;
  private onTranscription?: (text: string, isFinal: boolean) => void;
  private onSilence?: () => void;

  private constructor() {
    console.log('Smart Voice Processor initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SmartVoiceProcessor {
    if (!SmartVoiceProcessor.instance) {
      SmartVoiceProcessor.instance = new SmartVoiceProcessor();
    }
    return SmartVoiceProcessor.instance;
  }

  /**
   * Start voice processing with smart activity detection
   */
  startListening(): void {
    if (this.state.isListening) {
      console.log('Voice processing already active');
      return;
    }

    this.state.isListening = true;
    this.state.isVoiceActive = false;
    this.state.consecutiveSilence = 0;
    
    console.log('Smart voice processing started');
    
    // Start voice activity monitoring
    this.startVoiceActivityMonitoring();
  }

  /**
   * Stop voice processing
   */
  stopListening(): void {
    if (!this.state.isListening) {
      return;
    }

    this.state.isListening = false;
    this.state.isVoiceActive = false;
    
    // Clear timers
    this.clearTimers();
    
    console.log('Smart voice processing stopped');
  }

  /**
   * Process incoming transcription with deduplication
   */
  processTranscription(text: string, isFinal: boolean = false): boolean {
    if (!this.state.isListening) {
      return false;
    }

    this.state.transcriptionCount++;
    
    // Normalize text for deduplication
    const normalizedText = this.normalizeText(text);
    
    // Check for duplicates
    if (this.isDuplicate(normalizedText)) {
      this.state.duplicateCount++;
      console.log('Duplicate transcription ignored:', normalizedText.substring(0, 50));
      return false;
    }
    
    // Add to recent transcriptions
    this.addToRecentTranscriptions(normalizedText);
    
    // Update voice activity state
    this.updateVoiceActivity();
    
    // Process the transcription
    if (this.onTranscription) {
      this.onTranscription(text, isFinal);
    }
    
    return true;
  }

  /**
   * Process audio level data for voice activity detection
   */
  processAudioLevel(level: number): void {
    if (!this.state.isListening) return;
    
    const isVoiceActive = level > this.config.voiceActivityThreshold;
    
    if (isVoiceActive !== this.state.isVoiceActive) {
      this.state.isVoiceActive = isVoiceActive;
      
      if (isVoiceActive) {
        this.onVoiceDetected();
      } else {
        this.onVoiceEnded();
      }
    }
    
    if (isVoiceActive) {
      this.state.lastVoiceActivity = Date.now();
      this.state.consecutiveSilence = 0;
    }
  }

  /**
   * Set callbacks for voice events
   */
  setCallbacks(callbacks: {
    onVoiceStart?: () => void;
    onVoiceEnd?: () => void;
    onTranscription?: (text: string, isFinal: boolean) => void;
    onSilence?: () => void;
  }): void {
    this.onVoiceStart = callbacks.onVoiceStart;
    this.onVoiceEnd = callbacks.onVoiceEnd;
    this.onTranscription = callbacks.onTranscription;
    this.onSilence = callbacks.onSilence;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<VoiceActivityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Smart Voice Processor config updated:', newConfig);
  }

  /**
   * Get current state
   */
  getState(): VoiceActivityState {
    return { ...this.state };
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    transcriptionCount: number;
    duplicateCount: number;
    duplicateRate: number;
    recentTranscriptionsCount: number;
    isListening: boolean;
    isVoiceActive: boolean;
  } {
    const duplicateRate = this.state.transcriptionCount > 0 
      ? this.state.duplicateCount / this.state.transcriptionCount 
      : 0;
    
    return {
      transcriptionCount: this.state.transcriptionCount,
      duplicateCount: this.state.duplicateCount,
      duplicateRate,
      recentTranscriptionsCount: this.recentTranscriptions.size,
      isListening: this.state.isListening,
      isVoiceActive: this.state.isVoiceActive
    };
  }

  /**
   * Start voice activity monitoring
   */
  private startVoiceActivityMonitoring(): void {
    // Monitor for silence periods
    this.activityTimer = setInterval(() => {
      if (!this.state.isListening) return;
      
      const now = Date.now();
      const timeSinceActivity = now - this.state.lastVoiceActivity;
      
      if (timeSinceActivity > this.config.silenceThreshold) {
        this.state.consecutiveSilence++;
        
        if (this.state.consecutiveSilence === 1) {
          // First silence period
          this.state.silenceStartTime = now;
          if (this.onSilence) {
            this.onSilence();
          }
        }
      }
    }, 1000); // Check every second
  }

  /**
   * Handle voice detection
   */
  private onVoiceDetected(): void {
    console.log('Voice activity detected');
    
    // Clear silence timer
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    this.state.silenceStartTime = null;
    this.state.consecutiveSilence = 0;
    
    if (this.onVoiceStart) {
      this.onVoiceStart();
    }
  }

  /**
   * Handle voice end
   */
  private onVoiceEnded(): void {
    console.log('Voice activity ended');
    
    // Set silence timer
    this.silenceTimer = setTimeout(() => {
      if (this.onVoiceEnd) {
        this.onVoiceEnd();
      }
    }, this.config.silenceThreshold);
  }

  /**
   * Update voice activity state
   */
  private updateVoiceActivity(): void {
    this.state.lastVoiceActivity = Date.now();
    this.state.consecutiveSilence = 0;
    
    if (this.state.silenceStartTime) {
      this.state.silenceStartTime = null;
    }
  }

  /**
   * Normalize text for deduplication
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s]/g, ''); // Remove punctuation
  }

  /**
   * Check if transcription is a duplicate
   */
  private isDuplicate(normalizedText: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.deduplicationWindow;
    
    // Check if we've seen this text recently
    const lastSeen = this.recentTranscriptions.get(normalizedText);
    if (lastSeen && lastSeen > windowStart) {
      return true;
    }
    
    // Check for similar texts (fuzzy matching)
    for (const [existingText, timestamp] of this.recentTranscriptions.entries()) {
      if (timestamp > windowStart) {
        const similarity = this.calculateSimilarity(normalizedText, existingText);
        if (similarity > 0.8) { // 80% similarity threshold
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Calculate text similarity using simple algorithm
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  /**
   * Add text to recent transcriptions
   */
  private addToRecentTranscriptions(normalizedText: string): void {
    const now = Date.now();
    const windowStart = now - this.config.deduplicationWindow;
    
    // Add new transcription
    this.recentTranscriptions.set(normalizedText, now);
    
    // Clean up old transcriptions
    for (const [text, timestamp] of this.recentTranscriptions.entries()) {
      if (timestamp < windowStart) {
        this.recentTranscriptions.delete(text);
      }
    }
    
    // Limit total size
    if (this.recentTranscriptions.size > this.config.maxRecentTranscriptions) {
      const entries = Array.from(this.recentTranscriptions.entries());
      entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
      
      // Remove oldest entries
      const toRemove = entries.slice(0, entries.length - this.config.maxRecentTranscriptions);
      toRemove.forEach(([text]) => {
        this.recentTranscriptions.delete(text);
      });
    }
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  /**
   * Enable low power mode
   */
  enableLowPowerMode(): void {
    this.config.lowPowerMode = true;
    this.config.silenceThreshold = 5000; // Longer silence threshold
    this.config.maxRecentTranscriptions = 50; // Fewer recent transcriptions
    console.log('Smart Voice Processor: Low power mode enabled');
  }

  /**
   * Disable low power mode
   */
  disableLowPowerMode(): void {
    this.config.lowPowerMode = false;
    this.config.silenceThreshold = 3000; // Normal silence threshold
    this.config.maxRecentTranscriptions = 100; // Normal recent transcriptions
    console.log('Smart Voice Processor: Low power mode disabled');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopListening();
    this.recentTranscriptions.clear();
    console.log('Smart Voice Processor destroyed');
  }
}
