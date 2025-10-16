/**
 * Request timeout middleware
 * Prevents hung requests from blocking resources
 */

/**
 * Create timeout middleware
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 */
export function requestTimeout(timeout = 30000) {
  return (req, res, next) => {
    // Set timeout on request
    req.setTimeout(timeout, () => {
      console.error(`⏰ [TIMEOUT] Request timed out after ${timeout}ms: ${req.method} ${req.path}`);
      
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          message: `Request took longer than ${timeout / 1000} seconds to complete`,
        });
      }
    });

    // Set timeout on response
    res.setTimeout(timeout, () => {
      console.error(`⏰ [TIMEOUT] Response timed out after ${timeout}ms: ${req.method} ${req.path}`);
      
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: 'Gateway timeout',
          message: 'Server took too long to respond',
        });
      }
    });

    next();
  };
}

/**
 * Payment-specific timeout (longer)
 */
export function paymentTimeout() {
  return requestTimeout(45000); // 45 seconds for payments
}

/**
 * Callback-specific timeout (shorter)
 */
export function callbackTimeout() {
  return requestTimeout(15000); // 15 seconds for callbacks
}

/**
 * API timeout (standard)
 */
export function apiTimeout() {
  return requestTimeout(30000); // 30 seconds for standard APIs
}

export default {
  requestTimeout,
  paymentTimeout,
  callbackTimeout,
  apiTimeout,
};
