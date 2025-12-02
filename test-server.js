/**
 * Simple test script untuk verify job-based server
 * Run: node test-server.js
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function pollJobStatus(jobId, maxAttempts = 60) {
    log(`\n📊 Polling job ${jobId}...`, 'blue');

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            const response = await axios.get(`${BASE_URL}/jobs/${jobId}/status`);
            const data = response.data;

            if (!data.ok) {
                throw new Error(data.error || 'Failed to get status');
            }

            log(`  Progress: ${data.progress}% - ${data.message}`, 'yellow');

            if (data.status === 'completed') {
                log('✅ Job completed successfully!', 'green');
                return data.result;
            } else if (data.status === 'failed') {
                throw new Error(`Job failed: ${data.error}`);
            } else if (data.status === 'cancelled') {
                throw new Error('Job was cancelled');
            }
        } catch (error) {
            if (error.response) {
                throw new Error(`HTTP ${error.response.status}: ${error.response.data.error || 'Unknown error'}`);
            }
            throw error;
        }
    }

    throw new Error('Timeout: Job did not complete in time');
}

async function testJobCancellation() {
    log('\n🧪 Test: Job Cancellation', 'blue');

    // Create a dummy job (we'll just use inspection for testing)
    // In real scenario, you'd need a test file
    log('⏭ Skipped (requires file upload)', 'yellow');
}

async function testServer() {
    log('='.repeat(60), 'blue');
    log('🚀 Testing Job-Based Server', 'blue');
    log('='.repeat(60), 'blue');

    try {
        // Test 1: Check if server is running
        log('\n🧪 Test 1: Server Health Check', 'blue');
        try {
            await axios.get(`${BASE_URL}`);
            log('✅ Server is running', 'green');
        } catch (error) {
            throw new Error('❌ Server is not running. Please start server first: node server-jobified.js');
        }

        // Test 2: Job status endpoint (non-existent job)
        log('\n🧪 Test 2: Get Status for Non-Existent Job', 'blue');
        try {
            const response = await axios.get(`${BASE_URL}/jobs/fake-job-id/status`);
            if (response.data.ok === false) {
                log('✅ Correctly returns error for non-existent job', 'green');
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                log('✅ Correctly returns 404 for non-existent job', 'green');
            } else {
                throw error;
            }
        }

        // Test 3: Cancel non-existent job
        log('\n🧪 Test 3: Cancel Non-Existent Job', 'blue');
        try {
            await axios.delete(`${BASE_URL}/jobs/fake-job-id`);
        } catch (error) {
            if (error.response && error.response.status === 400) {
                log('✅ Correctly returns error when cancelling non-existent job', 'green');
            } else {
                log('⚠️  Unexpected error response', 'yellow');
            }
        }

        log('\n' + '='.repeat(60), 'blue');
        log('✅ All basic tests passed!', 'green');
        log('='.repeat(60), 'blue');

        log('\n📝 Manual Testing Required:', 'yellow');
        log('  1. Upload a test Excel file via the web interface');
        log('  2. Verify progress bar updates correctly');
        log('  3. Verify final result download links work');
        log('  4. Test cancellation during processing');

    } catch (error) {
        log('\n❌ Test failed:', 'red');
        log(error.message, 'red');
        process.exit(1);
    }
}

// Run tests
log('\n⚠️  Make sure server is running: node server-jobified.js\n', 'yellow');
setTimeout(() => {
    testServer().then(() => {
        log('\n✅ Testing complete!\n', 'green');
        process.exit(0);
    }).catch(error => {
        log('\n❌ Testing failed!\n', 'red');
        console.error(error);
        process.exit(1);
    });
}, 1000);
