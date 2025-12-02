/**
 * Chunk Processor Utilities
 * Generic utilities untuk memproses data dalam chunks untuk menghindari timeout
 */

const config = require('./config');

/**
 * Process items in chunks with progress callback
 * @param {Array} items - Array of items to process
 * @param {number} chunkSize - Size of each chunk
 * @param {Function} processFn - Async function to process each chunk: (chunk, chunkIndex) => Promise<any>
 * @param {Function} progressCallback - Progress callback: (progress, message) => void
 * @returns {Promise<Array>} - Array of results from each chunk
 */
async function processInChunks(items, chunkSize, processFn, progressCallback = () => { }) {
    const results = [];
    const totalItems = items.length;
    const totalChunks = Math.ceil(totalItems / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, totalItems);
        const chunk = items.slice(start, end);

        const progress = Math.round(((i + 1) / totalChunks) * 100);
        const message = `Processing chunk ${i + 1}/${totalChunks} (${start + 1}-${end} of ${totalItems})`;

        progressCallback(progress, message);

        try {
            const result = await processFn(chunk, i);
            results.push(result);
        } catch (error) {
            console.error(`Error processing chunk ${i + 1}:`, error);
            throw new Error(`Failed at chunk ${i + 1}/${totalChunks}: ${error.message}`);
        }
    }

    return results;
}

/**
 * Read Excel rows in chunks
 * @param {ExcelJS.Worksheet} sheet - ExcelJS worksheet
 * @param {number} startRow - Starting row number (1-indexed)
 * @param {number} endRow - Ending row number (inclusive)
 * @returns {Array} - Array of row objects
 */
function readExcelRowsInRange(sheet, startRow, endRow) {
    const rows = [];

    for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
        const row = sheet.getRow(rowNum);
        if (row) {
            rows.push(row);
        }
    }

    return rows;
}

/**
 * Process Excel sheet in chunks
 * @param {ExcelJS.Worksheet} sheet - ExcelJS worksheet
 * @param {number} headerRows - Number of header rows to skip
 * @param {number} chunkSize - Rows per chunk
 * @param {Function} processFn - Function to process each chunk: (rows, chunkIndex) => Promise<any>
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Array>} Results from all chunks
 */
async function processExcelInChunks(sheet, headerRows, chunkSize, processFn, progressCallback = () => { }) {
    const totalRows = sheet.rowCount;
    const dataRowCount = totalRows - headerRows;

    if (dataRowCount <= 0) {
        return [];
    }

    const totalChunks = Math.ceil(dataRowCount / chunkSize);
    const results = [];

    for (let i = 0; i < totalChunks; i++) {
        const startRow = headerRows + 1 + (i * chunkSize);
        const endRow = Math.min(startRow + chunkSize - 1, totalRows);

        const rows = readExcelRowsInRange(sheet, startRow, endRow);

        const progress = Math.round(((i + 1) / totalChunks) * 100);
        const message = `Processing rows ${startRow}-${endRow} of ${totalRows}`;

        progressCallback(progress, message);

        try {
            const result = await processFn(rows, i, startRow);
            results.push(result);
        } catch (error) {
            console.error(`Error processing rows ${startRow}-${endRow}:`, error);
            throw error;
        }
    }

    return results;
}

/**
 * Delay utility for rate limiting
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Merge chunk results into single object
 * Useful for combining grouped data from multiple chunks
 * @param {Array} chunkResults - Array of objects to merge
 * @returns {Object} Merged object
 */
function mergeChunkResults(chunkResults) {
    return chunkResults.reduce((acc, chunk) => {
        return { ...acc, ...chunk };
    }, {});
}

/**
 * Flatten chunk results into single array
 * @param {Array} chunkResults - Array of arrays
 * @returns {Array} Flattened array
 */
function flattenChunkResults(chunkResults) {
    return chunkResults.flat();
}

/**
 * Execute with timeout
 * @param {Promise} promise - Promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} errorMessage - Error message if timeout
 * @returns {Promise} Promise that rejects on timeout
 */
async function executeWithTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    return Promise.race([promise, timeout]);
}

module.exports = {
    processInChunks,
    readExcelRowsInRange,
    processExcelInChunks,
    delay,
    mergeChunkResults,
    flattenChunkResults,
    executeWithTimeout,

    // Export chunk sizes for convenience
    CHUNK_SIZES: config.CHUNK_SIZES,
};
