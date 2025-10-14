import axios from "axios";

class ChessComApiQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.requestDelay = 2000; // Start with 2 seconds between requests
    this.lastRequestTime = 0;
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.rateLimitedUntil = null;

    this.cache = new Map();
    this.cacheTTL = {
      playerStats: 15 * 60 * 1000, 
      gameArchives: 30 * 60 * 1000,
      monthlyGames: 5 * 60 * 1000, 
      playerProfile: 30 * 60 * 1000, 
    };

    
    this.api = axios.create({
      headers: {
        "User-Agent":
          "jkuat-university-chess-club-tool/0.1 (username: rookwitdahooks; contact: rolljoe42@gmail.com)",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      timeout: 15000,
    });

    console.log(
      "🔄 [CHESS_API_QUEUE] Initialized with sequential request processing"
    );
    console.log(
      "🔄 [CHESS_API_QUEUE] User-Agent: jkuat-university-chess-club-tool/0.1 (username: rookwitdahooks; contact: rolljoe42@gmail.com)"
    );

    // Clean cache periodically
    setInterval(() => this.cleanCache(), 5 * 60 * 1000); // Every 5 minutes
  }

  // Generate cache key based on request
  getCacheKey(config, cacheType = "default") {
    const baseKey = `${config.method}:${config.url}`;
    return `${cacheType}:${baseKey}`;
  }

  // Get cache TTL based on request type
  getCacheTTL(url) {
    if (url.includes("/player/") && url.includes("/stats")) {
      return this.cacheTTL.playerStats;
    } else if (url.includes("/games/archives") && !url.includes("/202")) {
      return this.cacheTTL.gameArchives;
    } else if (url.includes("/games/202")) {
      return this.cacheTTL.monthlyGames;
    } else if (url.includes("/player/") && !url.includes("/games")) {
      return this.cacheTTL.playerProfile;
    }
    return 5 * 60 * 1000; // Default 5 minutes
  }

  // Clean expired cache entries
  cleanCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, data] of this.cache.entries()) {
      if (now - data.timestamp > data.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(
        `🗄️ [CHESS_API_QUEUE] Cleaned ${cleaned} expired cache entries. Cache size: ${this.cache.size}`
      );
    }
  }

  // Check if we're currently rate limited
  isRateLimited() {
    if (!this.rateLimitedUntil) return false;

    const now = Date.now();
    if (now < this.rateLimitedUntil) {
      const remainingMs = this.rateLimitedUntil - now;
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      return remainingMinutes;
    }

    // Rate limit has expired
    this.rateLimitedUntil = null;
    return false;
  }

  // Set rate limit
  setRateLimit(durationMs = 5 * 60 * 1000) {
    this.rateLimitedUntil = Date.now() + durationMs;
    const minutes = durationMs / (60 * 1000);
    const timeString = new Date(this.rateLimitedUntil).toLocaleTimeString();
    console.log(
      `🚫 [CHESS_API_QUEUE] Rate limited! Pausing for ${minutes} minutes until ${timeString}`
    );

    // Clear queue to prevent further rate limiting
    const queueLength = this.queue.length;
    this.queue = [];
    console.log(
      `🚫 [CHESS_API_QUEUE] Cleared ${queueLength} pending requests due to rate limiting`
    );
  }

  // Add a request to the queue
  async request(config, cacheType = "default") {
    // Check if we're rate limited
    const rateLimitRemaining = this.isRateLimited();
    if (rateLimitRemaining) {
      console.log(
        `🚫 [CHESS_API_QUEUE] Rate limited for ${rateLimitRemaining} more minutes, rejecting request`
      );
      throw new Error(
        `Chess.com API rate limited for ${rateLimitRemaining} more minutes`
      );
    }

    const cacheKey = this.getCacheKey(config, cacheType);

    // Check cache for GET requests
    if (config.method === "get" && this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < cachedData.ttl) {
        console.log(`🗄️ [CHESS_API_QUEUE] Cache hit for ${config.url}`);
        return Promise.resolve(cachedData.response);
      } else {
        // Remove expired cache entry
        this.cache.delete(cacheKey);
      }
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        config,
        cacheType,
        cacheKey,
        resolve,
        reject,
        addedAt: Date.now(),
      });

      console.log(
        `📝 [CHESS_API_QUEUE] Request queued: ${config.url}. Queue length: ${this.queue.length}`
      );

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  // Process the next item in the queue
  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      console.log(`✅ [CHESS_API_QUEUE] Queue processing completed`);
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();

    // Calculate time since last request
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Wait if needed to maintain minimum delay between requests
    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      console.log(
        `⏱️ [CHESS_API_QUEUE] Waiting ${waitTime}ms before next request (queue: ${this.queue.length})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    try {
      console.log(`🔄 [CHESS_API_QUEUE] Processing: ${item.config.url}`);
      this.lastRequestTime = Date.now();

      // Make the actual request
      const response = await this.api(item.config);

      // Cache the response for GET requests
      if (item.config.method === "get") {
        const ttl = this.getCacheTTL(item.config.url);
        this.cache.set(item.cacheKey, {
          timestamp: Date.now(),
          ttl: ttl,
          response: response,
        });
        console.log(
          `🗄️ [CHESS_API_QUEUE] Cached response for ${item.config.url} (TTL: ${
            ttl / 1000
          }s)`
        );
      }

      // Update adaptive timing based on success
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;

      // If we've had many successes, we can slightly reduce delay (but not below 1.5s)
      if (this.consecutiveSuccesses > 5 && this.requestDelay > 1500) {
        this.requestDelay = Math.max(1500, this.requestDelay * 0.95);
        console.log(
          `⚙️ [CHESS_API_QUEUE] Adjusted delay to ${this.requestDelay}ms after ${this.consecutiveSuccesses} successes`
        );
      }

      item.resolve(response);
    } catch (error) {
      this.consecutiveSuccesses = 0;
      this.consecutiveFailures++;

      console.error(`❌ [CHESS_API_QUEUE] Request failed: ${error.message}`);

      // Check for rate limiting errors
      const isRateLimitError =
        (error.response &&
          (error.response.status === 410 || error.response.status === 429)) ||
        (error.code === "ERR_BAD_REQUEST" && error.message.includes("410")) ||
        (error.message && error.message.includes("status code 410")) ||
        (error.message && error.message.includes("status code 429"));

      if (isRateLimitError) {
        console.log(
          `🚫 [CHESS_API_QUEUE] Rate limit detected on ${item.config.url}`
        );
        this.setRateLimit(); // This will clear the queue
        this.requestDelay = Math.min(10000, this.requestDelay * 2); // Double delay up to 10s
      } else {
        // For other errors, increase delay slightly
        this.requestDelay = Math.min(5000, this.requestDelay * 1.2);
        console.log(
          `⚠️ [CHESS_API_QUEUE] Non-rate-limit error, adjusted delay to ${this.requestDelay}ms`
        );
      }

      item.reject(error);
    }

    // Continue processing the queue
    setTimeout(() => this.processQueue(), 200);
  }

  // Get comprehensive queue and cache status
  getStatus() {
    const cacheStats = {
      size: this.cache.size,
      hitRate: this.cacheHits / Math.max(1, this.cacheHits + this.cacheMisses),
      entries: {},
    };

    // Group cache entries by type
    for (const [key] of this.cache.entries()) {
      const type = key.split(":")[0];
      cacheStats.entries[type] = (cacheStats.entries[type] || 0) + 1;
    }

    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      currentDelay: this.requestDelay,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures,
      rateLimited: this.isRateLimited(),
      cache: cacheStats,
      oldestRequestAge:
        this.queue.length > 0
          ? Math.round((Date.now() - this.queue[0].addedAt) / 1000)
          : 0,
    };
  }

  // Manual method to clear cache
  clearCache(pattern = null) {
    if (pattern) {
      let cleared = 0;
      for (const [key] of this.cache.entries()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          cleared++;
        }
      }
      console.log(
        `🗄️ [CHESS_API_QUEUE] Cleared ${cleared} cache entries matching '${pattern}'`
      );
    } else {
      const size = this.cache.size;
      this.cache.clear();
      console.log(`🗄️ [CHESS_API_QUEUE] Cleared all ${size} cache entries`);
    }
  }

  // Cleanup method for graceful shutdown
  cleanup() {
    console.log(
      `🧹 [CHESS_API_QUEUE] Cleaning up. Queue length: ${this.queue.length}, Cache size: ${this.cache.size}`
    );

    // Reject all pending requests
    for (const item of this.queue) {
      item.reject(new Error("ChessComApiQueue shutting down"));
    }

    this.queue = [];
    this.cache.clear();
    this.isProcessing = false;

    console.log("✅ [CHESS_API_QUEUE] Cleanup completed");
  }
}

// Create singleton instance
const chessComApiQueue = new ChessComApiQueue();

// Graceful shutdown handling
process.on("SIGTERM", () => chessComApiQueue.cleanup());
process.on("SIGINT", () => chessComApiQueue.cleanup());

export default chessComApiQueue;
