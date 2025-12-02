/**
 * Job Polling Utility 
 * Frontend JavaScript untuk polling job status dari server
 */

class JobPoller {
    constructor() {
        this.pollingIntervals = new Map();
        this.defaultPollInterval = 1000; // 1 second
    }

    /**
     * Start polling for a job
     * @param {string} jobId - Job ID to poll
     * @param {Function} onProgress - Callback for progress updates: (progress, message) => void
     * @param {Function} onComplete - Callback for completion: (result) => void
     * @param {Function} onError - Callback for errors: (error) => void
     * @param {number} pollInterval - Polling interval in ms (default: 1000)
     */
    async startPolling(jobId, onProgress, onComplete, onError, pollInterval = this.defaultPollInterval) {
        // Clear any existing polling for this job
        this.stopPolling(jobId);

        const poll = async () => {
            try {
                const response = await fetch(`/jobs/${jobId}/status`);
                const data = await response.json();

                if (!data.ok) {
                    throw new Error(data.error || 'Failed to get job status');
                }

                if (data.status === 'pending' || data.status === 'processing') {
                    // Still processing
                    onProgress(data.progress || 0, data.message || 'Processing...');
                } else if (data.status === 'completed') {
                    // Completed successfully
                    this.stopPolling(jobId);
                    onComplete(data.result);
                } else if (data.status === 'failed') {
                    // Failed
                    this.stopPolling(jobId);
                    onError(new Error(data.error || 'Job failed'));
                } else if (data.status === 'cancelled') {
                    // Cancelled
                    this.stopPolling(jobId);
                    onError(new Error('Job was cancelled'));
                }
            } catch (error) {
                this.stopPolling(jobId);
                onError(error);
            }
        };

        // Start immediate first poll
        await poll();

        // Set up interval
        const intervalId = setInterval(poll, pollInterval);
        this.pollingIntervals.set(jobId, intervalId);
    }

    /**
     * Stop polling for a job
     * @param {string} jobId - Job ID
     */
    stopPolling(jobId) {
        const intervalId = this.pollingIntervals.get(jobId);
        if (intervalId) {
            clearInterval(intervalId);
            this.pollingIntervals.delete(jobId);
        }
    }

    /**
     * Cancel a job
     * @param {string} jobId - Job ID to cancel
     */
    async cancelJob(jobId) {
        try {
            this.stopPolling(jobId);
            const response = await fetch(`/jobs/${jobId}`, { method: 'DELETE' });
            const data = await response.json();

            if (!data.ok) {
                throw new Error(data.error || 'Failed to cancel job');
            }

            return true;
        } catch (error) {
            console.error('Error cancelling job:', error);
            throw error;
        }
    }

    /**
     * Stop all active polling
     */
    stopAll() {
        this.pollingIntervals.forEach((intervalId, jobId) => {
            clearInterval(intervalId);
        });
        this.pollingIntervals.clear();
    }
}

// Export singleton instance
const jobPoller = new JobPoller();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    jobPoller.stopAll();
});

/**
 * Helper function to upload file and start job
 * @param {string} endpoint - API endpoint
 * @param {FormData} formData - Form data with file and params
 * @returns {Promise<string>} jobId
 */
async function startJob(endpoint, formData) {
    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
    });

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.error || 'Failed to start job');
    }

    return data.jobId;
}

/**
 * Show progress UI
 * @param {HTMLElement} container - Container element
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Progress message
 */
function updateProgressUI(container, progress, message) {
    let progressBar = container.querySelector('.progress-bar');
    let progressText = container.querySelector('.progress-text');
    let progressPercent = container.querySelector('.progress-percent');

    if (!progressBar) {
        container.innerHTML = `
      <div class="progress-container" style="margin: 20px 0;">
        <div class="progress-header" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span class="progress-text" style="font-size: 14px; color: #555;">Processing...</span>
          <span class="progress-percent" style="font-size: 14px; font-weight: bold; color: #333;">0%</span>
        </div>
        <div style="width: 100%; height: 24px; background: #e0e0e0; border-radius: 12px; overflow: hidden;">
          <div class="progress-bar" style="height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease; width: 0%;"></div>
        </div>
        <button class="cancel-btn" style="margin-top: 10px; padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Cancel
        </button>
      </div>
    `;

        progressBar = container.querySelector('.progress-bar');
        progressText = container.querySelector('.progress-text');
        progressPercent = container.querySelector('.progress-percent');
    }

    progressBar.style.width = `${progress}%`;
    progressText.textContent = message;
    progressPercent.textContent = `${Math.round(progress)}%`;
}

/**
 * Clear progress UI
 * @param {HTMLElement} container - Container element
 */
function clearProgressUI(container) {
    const progressContainer = container.querySelector('.progress-container');
    if (progressContainer) {
        progressContainer.remove();
    }
}

// === EXPOSE TO GLOBAL WINDOW ===
window.jobPoller = jobPoller;
window.startJob = startJob;
window.updateProgressUI = updateProgressUI;
window.clearProgressUI = clearProgressUI;
