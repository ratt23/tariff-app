/**
 * Configuration untuk Chunked Processing System
 * Disesuaikan untuk Netlify Serverless Functions
 */

const path = require('path');
const os = require('os');

module.exports = {
  // Chunk sizes untuk berbagai operasi
  CHUNK_SIZES: {
    EXCEL_INSPECTION: 1000,      // Inspect 1000 rows per chunk
    EXCEL_PROCESSING: 500,       // Process 500 rows per chunk
    REPORT_BUILDING: 500,        // Build report 500 rows per chunk
    DOUBLE_CHECK: 500,           // Compare 500 rows per chunk
  },

  // Job management settings
  JOB_CLEANUP_INTERVAL: 3600000, // 1 hour in milliseconds
  JOB_MAX_AGE: 3600000,          // Jobs older than 1 hour akan dihapus

  // Storage configuration
  // 'file' untuk production (Netlify), 'memory' untuk development
  STORAGE_TYPE: process.env.STORAGE_TYPE || 'file',

  // Storage path - use system temp dir for reliability on Netlify/Lambda & Local
  STORAGE_PATH: process.env.STORAGE_PATH || path.join(os.tmpdir(), 'tariff-app-jobs'),

  // Timeout settings (milliseconds)
  TIMEOUTS: {
    PER_CHUNK: 8000,             // Max 8 seconds per chunk processing
    TOTAL_REQUEST: 25000,        // Max 25 seconds total per HTTP request
  },

  // File cleanup settings
  AUTO_CLEANUP_ENABLED: true,
  CLEANUP_CHECK_INTERVAL: 300000, // Check every 5 minutes
};
