/**
 * Job Manager untuk Chunked Processing
 * Mendukung in-memory (development) dan file-based storage (production/Netlify)
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

class JobManager {
    constructor() {
        this.storageType = config.STORAGE_TYPE;
        this.storagePath = config.STORAGE_PATH;
        this.jobs = new Map(); // In-memory cache

        // Ensure storage directory exists for file-based storage
        if (this.storageType === 'file') {
            this.initFileStorage();
        }

        // Auto cleanup old jobs
        if (config.AUTO_CLEANUP_ENABLED) {
            this.startCleanupInterval();
        }
    }

    async initFileStorage() {
        try {
            await fs.mkdir(this.storagePath, { recursive: true });
            console.log(`📁 Job storage initialized at: ${this.storagePath}`);
        } catch (error) {
            console.error('Failed to initialize job storage:', error);
        }
    }

    /**
     * Create a new job
     * @param {string} type - Job type (e.g., 'inspection', 'processing', 'report')
     * @param {object} data - Initial job data
     * @returns {string} jobId
     */
    async createJob(type, data = {}) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            type,
            status: 'pending',  // pending, processing, completed, failed, cancelled
            progress: 0,
            message: 'Job created',
            data,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            result: null,
            error: null,
        };

        await this.saveJob(job);
        console.log(`✅ Job created: ${jobId} (${type})`);
        return jobId;
    }

    /**
     * Update job progress
     * @param {string} jobId
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} message - Progress message
     * @param {object} data - Additional data to merge
     */
    async updateJobProgress(jobId, progress, message = '', data = {}) {
        const job = await this.getJob(jobId);
        if (!job) throw new Error(`Job ${jobId} not found`);

        job.status = 'processing';
        job.progress = Math.min(100, Math.max(0, progress));
        job.message = message;
        job.data = { ...job.data, ...data };
        job.updatedAt = Date.now();

        await this.saveJob(job);
        console.log(`📊 Job ${jobId}: ${progress}% - ${message}`);
    }

    /**
     * Mark job as completed
     * @param {string} jobId
     * @param {object} result - Final result
     */
    async setJobCompleted(jobId, result) {
        const job = await this.getJob(jobId);
        if (!job) throw new Error(`Job ${jobId} not found`);

        job.status = 'completed';
        job.progress = 100;
        job.message = 'Job completed successfully';
        job.result = result;
        job.updatedAt = Date.now();

        await this.saveJob(job);
        console.log(`✅ Job completed: ${jobId}`);
    }

    /**
     * Mark job as failed
     * @param {string} jobId
     * @param {string|Error} error - Error message or Error object
     */
    async setJobFailed(jobId, error) {
        const job = await this.getJob(jobId);
        if (!job) throw new Error(`Job ${jobId} not found`);

        job.status = 'failed';
        job.message = 'Job failed';
        job.error = error instanceof Error ? error.message : error;
        job.updatedAt = Date.now();

        await this.saveJob(job);
        console.error(`❌ Job failed: ${jobId} - ${job.error}`);
    }

    /**
     * Cancel a job
     * @param {string} jobId
     */
    async cancelJob(jobId) {
        const job = await this.getJob(jobId);
        if (!job) throw new Error(`Job ${jobId} not found`);

        if (job.status === 'completed' || job.status === 'failed') {
            throw new Error(`Cannot cancel ${job.status} job`);
        }

        job.status = 'cancelled';
        job.message = 'Job cancelled by user';
        job.updatedAt = Date.now();

        await this.saveJob(job);
        console.log(`🚫 Job cancelled: ${jobId}`);
    }

    /**
     * Get job status
     * @param {string} jobId
     * @returns {object|null} Job object or null if not found
     */
    async getJobStatus(jobId) {
        const job = await this.getJob(jobId);
        if (!job) return null;

        // Return only necessary fields for status check
        return {
            id: job.id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            message: job.message,
            result: job.result,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        };
    }

    /**
     * Save job to storage (memory or file)
     * @private
     */
    async saveJob(job) {
        // Always cache in memory
        this.jobs.set(job.id, job);

        // Persist to file if file-based storage
        if (this.storageType === 'file') {
            const filePath = path.join(this.storagePath, `${job.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(job, null, 2));
        }
    }

    /**
     * Get job from storage
     * @private
     */
    async getJob(jobId) {
        // Check memory cache first
        if (this.jobs.has(jobId)) {
            return this.jobs.get(jobId);
        }

        // Load from file if file-based storage
        if (this.storageType === 'file') {
            try {
                const filePath = path.join(this.storagePath, `${jobId}.json`);
                const data = await fs.readFile(filePath, 'utf-8');
                const job = JSON.parse(data);
                this.jobs.set(jobId, job); // Cache it
                return job;
            } catch (error) {
                return null; // Job not found
            }
        }

        return null;
    }

    /**
     * Clean up old jobs (older than JOB_MAX_AGE)
     */
    async cleanupOldJobs() {
        const now = Date.now();
        const maxAge = config.JOB_MAX_AGE;
        let cleaned = 0;

        if (this.storageType === 'file') {
            try {
                const files = await fs.readdir(this.storagePath);
                for (const file of files) {
                    if (!file.endsWith('.json')) continue;

                    const filePath = path.join(this.storagePath, file);
                    const data = await fs.readFile(filePath, 'utf-8');
                    const job = JSON.parse(data);

                    if (now - job.updatedAt > maxAge) {
                        await fs.unlink(filePath);
                        this.jobs.delete(job.id);
                        cleaned++;
                    }
                }
            } catch (error) {
                console.error('Error during cleanup:', error);
            }
        } else {
            // Memory-based cleanup
            for (const [jobId, job] of this.jobs.entries()) {
                if (now - job.updatedAt > maxAge) {
                    this.jobs.delete(jobId);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} old jobs`);
        }
    }

    /**
     * Start automatic cleanup interval
     * @private
     */
    startCleanupInterval() {
        setInterval(() => {
            this.cleanupOldJobs();
        }, config.CLEANUP_CHECK_INTERVAL);
        console.log('🔄 Auto cleanup enabled');
    }
}

// Export singleton instance
const jobManager = new JobManager();
module.exports = jobManager;
