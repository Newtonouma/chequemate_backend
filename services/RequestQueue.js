/**
 * Simple in-memory request queue for handling concurrent requests
 * Prevents request drops during high traffic periods
 */

class RequestQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.maxConcurrent = options.maxConcurrent || 10;
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 2000;
    
    this.queue = [];
    this.processing = new Set();
    this.completed = [];
    this.failed = [];
    
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalDropped: 0,
    };
    
    console.log(`🚀 [${this.name}] Queue initialized - Max concurrent: ${this.maxConcurrent}, Max queue size: ${this.maxQueueSize}`);
  }

  /**
   * Add a job to the queue
   */
  async add(jobId, handler, data = {}, options = {}) {
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      this.stats.totalDropped++;
      console.error(
        `❌ [${this.name}] Queue full! Dropped job ${jobId}. Current size: ${this.queue.length}`
      );
      throw new Error(`Queue ${this.name} is full`);
    }

    const job = {
      id: jobId,
      handler,
      data,
      options: {
        priority: options.priority || 1,
        attempts: 0,
        maxAttempts: options.maxAttempts || this.retryAttempts,
        addedAt: Date.now(),
      },
    };

    this.queue.push(job);
    this.stats.totalQueued++;
    
    console.log(
      `📥 [${this.name}] Job ${jobId} queued. Queue size: ${this.queue.length}, Processing: ${this.processing.size}`
    );

    // Process queue
    this.process();

    return {
      jobId,
      queuePosition: this.queue.length,
      status: 'queued',
    };
  }

  /**
   * Process jobs from queue
   */
  async process() {
    // Don't process if we're at max concurrency
    if (this.processing.size >= this.maxConcurrent) {
      return;
    }

    // Don't process if queue is empty
    if (this.queue.length === 0) {
      return;
    }

    // Sort by priority (higher priority first)
    this.queue.sort((a, b) => b.options.priority - a.options.priority);

    // Take next job
    const job = this.queue.shift();
    if (!job) return;

    this.processing.add(job.id);
    
    console.log(
      `🔄 [${this.name}] Processing job ${job.id} (attempt ${job.options.attempts + 1}/${job.options.maxAttempts})`
    );

    try {
      // Execute the job handler
      const result = await job.handler(job.data);
      
      // Job completed successfully
      this.processing.delete(job.id);
      this.completed.push({
        id: job.id,
        completedAt: Date.now(),
        duration: Date.now() - job.options.addedAt,
        result,
      });
      this.stats.totalProcessed++;
      
      console.log(
        `✅ [${this.name}] Job ${job.id} completed in ${Date.now() - job.options.addedAt}ms. Queue: ${this.queue.length}, Processing: ${this.processing.size}`
      );

      // Keep only last 100 completed jobs
      if (this.completed.length > 100) {
        this.completed.shift();
      }

    } catch (error) {
      job.options.attempts++;
      
      console.error(
        `❌ [${this.name}] Job ${job.id} failed (attempt ${job.options.attempts}/${job.options.maxAttempts}):`,
        error.message
      );

      // Retry if we haven't exceeded max attempts
      if (job.options.attempts < job.options.maxAttempts) {
        console.log(
          `🔄 [${this.name}] Retrying job ${job.id} in ${this.retryDelay}ms...`
        );
        
        // Re-queue with delay
        setTimeout(() => {
          this.queue.push(job);
          this.process();
        }, this.retryDelay);
        
      } else {
        // Max attempts reached, mark as failed
        this.failed.push({
          id: job.id,
          failedAt: Date.now(),
          error: error.message,
          attempts: job.options.attempts,
        });
        this.stats.totalFailed++;
        
        console.error(
          `💀 [${this.name}] Job ${job.id} permanently failed after ${job.options.attempts} attempts`
        );

        // Keep only last 500 failed jobs
        if (this.failed.length > 500) {
          this.failed.shift();
        }
      }

      this.processing.delete(job.id);
    }

    // Process next job in queue
    setImmediate(() => this.process());
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      name: this.name,
      queueSize: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.length,
      failed: this.failed.length,
      stats: this.stats,
      capacity: {
        maxConcurrent: this.maxConcurrent,
        maxQueueSize: this.maxQueueSize,
        utilizationPercent: Math.round((this.processing.size / this.maxConcurrent) * 100),
        queueFullnessPercent: Math.round((this.queue.length / this.maxQueueSize) * 100),
      },
    };
  }

  /**
   * Get recent failed jobs
   */
  getRecentFailures(limit = 10) {
    return this.failed.slice(-limit);
  }

  /**
   * Clear completed and failed job history
   */
  clearHistory() {
    this.completed = [];
    this.failed = [];
    console.log(`🧹 [${this.name}] Job history cleared`);
  }
}

export default RequestQueue;
