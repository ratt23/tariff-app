const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitize = require('sanitize-filename');
const Excel = require('exceljs');

// Import job-based modules
const jobManager = require('./jobManager');
const { processAndDiagnoseSheetChunked, createFinalExcel } = require('./processExcel');
// PDF generation removed - not compatible with Netlify
const { inspectSourceFile, buildReportChunked, inspectTemplateFile } = require('./report-constructor-engine');
const { CHUNK_SIZES } = require('./chunkProcessor');

const app = express();

// Local directories not needed for Cloudinary storage
// const IS_NETLIFY = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;
// const BASE_DIR = IS_NETLIFY ? '/tmp' : '.'; 
// Legacy upload/output dirs removed to prevent read-only errors on startup

app.use(express.static('public'));
// app.use('/output', express.static(OUTPUT_DIR)); // Output is now served via Cloudinary URLs
app.use(express.json());

const cloudinaryStorage = require('./cloudinaryStorage');
const { downloadToTemp, uploadFile, deleteFile, getPublicIdFromUrl } = require('./cloudinaryConfig');

// Use Cloudinary storage
const upload = multer({ storage: cloudinaryStorage });

const ALLOWED_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel' // .xls
];

function validateExcelMimeType(file) {
    if (!file) {
        throw new Error('Tidak ada file yang diunggah.');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new Error(`Format file tidak valid. Aplikasi hanya menerima file Excel (.xlsx, .xls), bukan ${file.mimetype}.`);
    }
}

// ======================================================================
// === JOB MANAGEMENT ENDPOINTS ===
// ======================================================================

/**
 * GET /jobs/:jobId/status
 * Get status of a job
 */
app.get('/jobs/:jobId/status', async (req, res) => {
    try {
        const status = await jobManager.getJobStatus(req.params.jobId);
        if (!status) {
            return res.status(404).json({ ok: false, error: 'Job not found' });
        }
        res.json({ ok: true, ...status });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * DELETE /jobs/:jobId
 * Cancel a job
 */
app.delete('/jobs/:jobId', async (req, res) => {
    try {
        await jobManager.cancelJob(req.params.jobId);
        res.json({ ok: true, message: 'Job cancelled' });
    } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
    }
});

// ======================================================================
// === FILE INSPECTION ENDPOINTS (JOB-BASED) ===
// ======================================================================

/**
 * POST /jobs/start-inspection
 * Start file inspection job
 */
app.post('/jobs/start-inspection', upload.single('file'), async (req, res) => {
    let filePath = null;
    try {
        validateExcelMimeType(req.file);
        filePath = req.file.path;

        // Create job immediately
        const jobId = await jobManager.createJob('inspection', {
            filename: req.file.originalname,
            fileUrl: req.file.path, // Cloudinary URL
            publicId: req.file.filename // Cloudinary Public ID
        });

        // Return jobId immediately
        res.json({ ok: true, jobId });

        // Start background processing
        setImmediate(async () => {
            let localFilePath = null;
            try {
                await jobManager.updateJobProgress(jobId, 5, 'Downloading file from cloud...');
                localFilePath = await downloadToTemp(req.file.path);

                await jobManager.updateJobProgress(jobId, 10, 'Reading Excel file...');

                const workbook = new Excel.Workbook();
                await workbook.xlsx.readFile(localFilePath);
                const inspectionData = {};
                const MAX_ROWS_TO_INSPECT = 5000;

                let sheetsProcessed = 0;
                const totalSheets = workbook.worksheets.length;

                for (const sheet of workbook.worksheets) {
                    if (sheet.rowCount === 0) continue;

                    sheetsProcessed++;
                    const progress = 10 + Math.round((sheetsProcessed / totalSheets) * 80);
                    await jobManager.updateJobProgress(jobId, progress, `Inspecting sheet: ${sheet.name}`);

                    const headersWithCol = [];
                    const uniqueValuesPerColumn = {};
                    const headerRow = sheet.getRow(1);
                    headerRow.eachCell((cell, colNum) => {
                        if (cell.text) {
                            const headerText = cell.text.trim();
                            headersWithCol.push({ text: headerText, col: colNum });
                            uniqueValuesPerColumn[headerText] = new Set();
                        }
                    });

                    let rowsInspected = 0;
                    sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
                        if (rowNum > 1) {
                            if (rowsInspected >= MAX_ROWS_TO_INSPECT) return;
                            headersWithCol.forEach(headerInfo => {
                                const cellVal = (row.getCell(headerInfo.col).text || '').trim();
                                if (cellVal) {
                                    uniqueValuesPerColumn[headerInfo.text].add(cellVal);
                                }
                            });
                            rowsInspected++;
                        }
                    });

                    for (const header in uniqueValuesPerColumn) {
                        uniqueValuesPerColumn[header] = Array.from(uniqueValuesPerColumn[header]).sort();
                    }

                    inspectionData[sheet.name] = {
                        headers: headersWithCol.map(h => h.text),
                        uniqueValuesPerColumn
                    };
                }

                await jobManager.setJobCompleted(jobId, { sheets: inspectionData });
            } catch (error) {
                await jobManager.setJobFailed(jobId, error.message);
            } finally {
                // Cleanup local temp file
                if (localFilePath) fs.unlink(localFilePath, () => { });
                // Optional: Cleanup Cloudinary file if no longer needed
                // await deleteFile(req.file.filename); 
            }
        });

    } catch (error) {
        console.error("Error starting inspection:", error.message);
        // If upload happened but job failed to start, we might want to cleanup Cloudinary
        if (req.file && req.file.filename) {
            deleteFile(req.file.filename).catch(e => console.error(e));
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});

// ======================================================================
// === FILE PROCESSING ENDPOINTS (JOB-BASED) ===
// ======================================================================

/**
 * POST /jobs/start-processing
 * Start file processing job
 */
app.post('/jobs/start-processing', upload.single('file'), async (req, res) => {
    let filePath = null;
    try {
        validateExcelMimeType(req.file);
        filePath = req.file.path;

        const mappings = JSON.parse(req.body.mappings);
        const classMap = JSON.parse(req.body.classMap);
        const selectedSheet = req.body.sheet;
        const filterConfig = JSON.parse(req.body.filterConfig);

        // Create job
        const jobId = await jobManager.createJob('processing', {
            filename: req.file.originalname,
            fileUrl: req.file.path,
            publicId: req.file.filename,
            mappings,
            classMap,
            selectedSheet,
            filterConfig
        });

        // Return jobId immediately
        res.json({ ok: true, jobId });

        // Start background processing
        setImmediate(async () => {
            let localFilePath = null;
            try {
                await jobManager.updateJobProgress(jobId, 5, 'Downloading file from cloud...');
                localFilePath = await downloadToTemp(req.file.path);

                // Process with chunking
                const { allAcceptedRows, summary, rejectedRowsSample, acceptedRowsSample } =
                    await processAndDiagnoseSheetChunked(
                        localFilePath,
                        mappings,
                        classMap,
                        selectedSheet,
                        filterConfig,
                        async (progress, message) => {
                            await jobManager.updateJobProgress(jobId, progress, message);
                        }
                    );

                if (allAcceptedRows.length === 0) {
                    throw new Error("Tidak ada data yang diproses setelah filter diterapkan.");
                }

                await jobManager.updateJobProgress(jobId, 90, 'Creating Excel file...');
                // createFinalExcel now returns { url, publicId } or similar, we need to update it
                // But wait, createFinalExcel is in processExcel.js. I need to update it to return the Cloudinary URL.
                // For now, let's assume I will update createFinalExcel to return the URL directly or an object.
                // Let's assume it returns the URL string for backward compatibility or I'll check its implementation.
                // I will update createFinalExcel to return the URL.

                const finalXlsxUrl = await createFinalExcel(allAcceptedRows);

                await jobManager.setJobCompleted(jobId, {
                    excel: finalXlsxUrl, // This will be a full Cloudinary URL
                    diagnostics: { summary, rejectedRowsSample, acceptedRowsSample }
                });

            } catch (error) {
                await jobManager.setJobFailed(jobId, error.message);
            } finally {
                if (localFilePath) fs.unlink(localFilePath, () => { });
                // Cleanup input file from Cloudinary to save space?
                // await deleteFile(req.file.filename);
            }
        });

    } catch (error) {
        console.error('Error starting processing:', error.message);
        if (req.file && req.file.filename) {
            deleteFile(req.file.filename).catch(e => console.error(e));
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});

// ======================================================================
// === DOUBLE CHECK ENDPOINTS (JOB-BASED) ===
// ======================================================================

/**
 * POST /jobs/start-double-check
 * Start double check comparison job
 */
app.post('/jobs/start-double-check', upload.fields([
    { name: 'originalFile', maxCount: 1 },
    { name: 'processedFile', maxCount: 1 }
]), async (req, res) => {
    const originalFile = req.files.originalFile ? req.files.originalFile[0] : null;
    const processedFile = req.files.processedFile ? req.files.processedFile[0] : null;

    try {
        if (!originalFile || !processedFile) {
            return res.status(400).json({ ok: false, error: 'Harap unggah kedua file.' });
        }

        const mappings = JSON.parse(req.body.mappings || '{}');
        const classMap = JSON.parse(req.body.classMap || '{}');
        const selectedSheet = req.body.selectedSheet;

        if (!mappings.kode || !mappings.nama || !mappings.kelas || !mappings.harga) {
            throw new Error('Mapping kolom tidak lengkap');
        }

        // Create job
        const jobId = await jobManager.createJob('double-check', {
            originalFile: originalFile.originalname,
            processedFile: processedFile.originalname,
            originalUrl: originalFile.path,
            processedUrl: processedFile.path
        });

        res.json({ ok: true, jobId });

        // Background processing
        setImmediate(async () => {
            let localOriginalPath = null;
            let localProcessedPath = null;
            try {
                await jobManager.updateJobProgress(jobId, 5, 'Downloading files...');
                localOriginalPath = await downloadToTemp(originalFile.path);
                localProcessedPath = await downloadToTemp(processedFile.path);

                await jobManager.updateJobProgress(jobId, 10, 'Reading files...');

                const comparisonResult = await compareFilesChunked(
                    localOriginalPath,
                    localProcessedPath,
                    mappings,
                    classMap,
                    selectedSheet,
                    async (progress, message) => {
                        await jobManager.updateJobProgress(jobId, 10 + Math.round(progress * 0.85), message);
                    }
                );

                await jobManager.setJobCompleted(jobId, { comparison: comparisonResult });

            } catch (error) {
                await jobManager.setJobFailed(jobId, error.message);
            } finally {
                if (localOriginalPath) fs.unlink(localOriginalPath, () => { });
                if (localProcessedPath) fs.unlink(localProcessedPath, () => { });
            }
        });

    } catch (error) {
        console.error('Error starting double check:', error.message);
        if (originalFile && originalFile.filename) deleteFile(originalFile.filename).catch(e => console.error(e));
        if (processedFile && processedFile.filename) deleteFile(processedFile.filename).catch(e => console.error(e));
        res.status(400).json({ ok: false, error: error.message });
    }
});

// Helper function for double check with chunking
async function compareFilesChunked(originalPath, processedPath, mappings, classMap, selectedSheet, progressCallback = () => { }) {
    const originalWorkbook = new Excel.Workbook();
    const processedWorkbook = new Excel.Workbook();
    await originalWorkbook.xlsx.readFile(originalPath);
    await processedWorkbook.xlsx.readFile(processedPath);

    const originalSheet = originalWorkbook.getWorksheet(selectedSheet);
    const processedSheet = processedWorkbook.worksheets[0];

    if (!originalSheet) {
        throw new Error(`Sheet "${selectedSheet}" tidak ditemukan di file original`);
    }

    const results = {
        summary: { itemsCompared: 0, priceMatches: 0, priceMismatches: 0 },
        priceComparison: []
    };

    // Get headers
    const originalHeaders = {};
    originalSheet.getRow(1).eachCell((cell, colNum) => {
        if (cell.text) originalHeaders[cell.text.trim()] = colNum;
    });

    const colCode = originalHeaders[mappings.kode];
    const colName = originalHeaders[mappings.nama];
    const colClass = originalHeaders[mappings.kelas];
    const colPrice = originalHeaders[mappings.harga];

    if (!colCode || !colName || !colClass || !colPrice) {
        throw new Error('Mapping kolom tidak valid untuk file original');
    }

    const processedHeaders = {};
    processedSheet.getRow(1).eachCell((cell, colNum) => {
        if (cell.text) processedHeaders[cell.text.trim()] = colNum;
    });

    const classToColumnMap = {};
    const classColumns = ['OPD', 'ED', 'KELAS 3', 'KELAS 2', 'KELAS 1', 'VIP', 'VVIP'];
    classColumns.forEach(className => {
        classToColumnMap[className] = processedHeaders[className];
    });

    function parsePrice(val) {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        const strVal = String(val).trim();
        if (!strVal) return null;
        const cleanStr = strVal.replace(/[^\d,-]/g, '').replace(',', '.');
        const parsed = parseFloat(cleanStr);
        return isNaN(parsed) ? null : parsed;
    }

    await progressCallback(20, 'Building original data map...');

    // Build original data map
    const originalDataMap = new Map();
    originalSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const code = (row.getCell(colCode).text || '').trim();
        const name = (row.getCell(colName).text || '').trim();
        const kelas = (row.getCell(colClass).text || '').trim().toUpperCase();
        const price = parsePrice(row.getCell(colPrice).value);
        if (!code || !name) return;

        const key = `${code}|${name}`.toUpperCase();
        if (!originalDataMap.has(key)) {
            originalDataMap.set(key, { code, name, prices: {} });
        }
        const targetClass = classMap[kelas] || kelas;
        if (targetClass && targetClass !== 'ignore') {
            originalDataMap.get(key).prices[targetClass] = price;
        }
    });

    await progressCallback(50, 'Comparing processed data...');

    // Compare in chunks
    const processedRows = [];
    processedSheet.eachRow((row, rowNum) => {
        if (rowNum > 1) processedRows.push(row);
    });

    const chunkSize = CHUNK_SIZES.DOUBLE_CHECK;
    const totalChunks = Math.ceil(processedRows.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, processedRows.length);
        const chunk = processedRows.slice(start, end);

        const chunkProgress = 50 + Math.round((i / totalChunks) * 45);
        await progressCallback(chunkProgress, `Comparing chunk ${i + 1}/${totalChunks}`);

        chunk.forEach(row => {
            const processedCode = (row.getCell(processedHeaders['Kode']).text || '').trim();
            const processedName = (row.getCell(processedHeaders['Nama Pemeriksaan']).text || '').trim();

            if (!processedCode || !processedName) return;

            const key = `${processedCode}|${processedName}`.toUpperCase();
            const originalItem = originalDataMap.get(key);

            if (!originalItem) {
                results.priceComparison.push({
                    code: processedCode,
                    name: processedName,
                    status: 'NOT_FOUND',
                    message: 'Item tidak ditemukan di file original'
                });
                return;
            }

            results.summary.itemsCompared++;
            const comparison = { code: processedCode, name: processedName, status: 'MATCH', details: [] };
            let allMatch = true;

            classColumns.forEach(className => {
                const processedPriceCol = classToColumnMap[className];
                if (!processedPriceCol) return;

                const processedPrice = parsePrice(row.getCell(processedPriceCol).value);
                const originalPrice = originalItem.prices[className] || null;
                const isMatch = processedPrice === originalPrice;

                comparison.details.push({ class: className, originalPrice, processedPrice, match: isMatch });
                if (!isMatch) allMatch = false;
            });

            if (allMatch) {
                comparison.status = 'MATCH';
                results.summary.priceMatches++;
            } else {
                comparison.status = 'MISMATCH';
                results.summary.priceMismatches++;
            }

            results.priceComparison.push(comparison);
        });
    }

    results.summary.matchPercentage = results.summary.itemsCompared > 0
        ? (results.summary.priceMatches / results.summary.itemsCompared) * 100
        : 0;

    return results;
}

// ======================================================================
// === REPORT CONSTRUCTOR ENDPOINTS (JOB-BASED) ===
// ======================================================================

/**
 * POST /jobs/start-source-inspection
 * Inspect source file for report building
 */
app.post('/jobs/start-source-inspection', upload.single('file'), async (req, res) => {
    let filePath = null;
    try {
        validateExcelMimeType(req.file);
        filePath = req.file.path;
        const config = req.body.config ? JSON.parse(req.body.config) : { headerRowCount: 'auto' };

        const jobId = await jobManager.createJob('source-inspection', {
            filename: req.file.originalname,
            fileUrl: req.file.path
        });

        res.json({ ok: true, jobId });

        setImmediate(async () => {
            let localFilePath = null;
            try {
                await jobManager.updateJobProgress(jobId, 10, 'Downloading file...');
                localFilePath = await downloadToTemp(req.file.path);

                await jobManager.updateJobProgress(jobId, 20, 'Inspecting source file...');
                const inspectionResult = await inspectSourceFile(localFilePath, config);
                await jobManager.setJobCompleted(jobId, inspectionResult);
            } catch (error) {
                await jobManager.setJobFailed(jobId, error.message);
            } finally {
                if (localFilePath) fs.unlink(localFilePath, () => { });
            }
        });

    } catch (error) {
        console.error("Error starting source inspection:", error.message);
        if (req.file && req.file.filename) deleteFile(req.file.filename).catch(e => console.error(e));
        res.status(400).json({ ok: false, error: error.message });
    }
});

/**
 * POST /jobs/start-report-build
 * Build report from source file
 */
app.post('/jobs/start-report-build', upload.single('file'), async (req, res) => {
    let filePath = null;
    try {
        if (!req.file) throw new Error("File sumber tidak ada.");
        if (!req.body.config) throw new Error("Konfigurasi laporan tidak ada.");

        validateExcelMimeType(req.file);
        filePath = req.file.path;
        const config = JSON.parse(req.body.config);

        const jobId = await jobManager.createJob('report-build', {
            filename: req.file.originalname,
            fileUrl: req.file.path,
            config
        });

        res.json({ ok: true, jobId });

        setImmediate(async () => {
            let localFilePath = null;
            try {
                await jobManager.updateJobProgress(jobId, 10, 'Downloading file...');
                localFilePath = await downloadToTemp(req.file.path);

                const { resultUrl, diagnostics } = await buildReportChunked(
                    localFilePath,
                    config,
                    async (progress, message) => {
                        await jobManager.updateJobProgress(jobId, progress, message);
                    }
                );

                await jobManager.setJobCompleted(jobId, {
                    excel: resultUrl,
                    diagnostics
                });

            } catch (error) {
                await jobManager.setJobFailed(jobId, error.message);
            } finally {
                if (localFilePath) fs.unlink(localFilePath, () => { });
            }
        });

    } catch (error) {
        console.error("Error starting report build:", error.message);
        if (req.file && req.file.filename) deleteFile(req.file.filename).catch(e => console.error(e));
        res.status(400).json({ ok: false, error: error.message });
    }
});

/**
 * POST /jobs/start-template-inspection
 * Inspect template file structure
 */
app.post('/jobs/start-template-inspection', upload.single('templateFile'), async (req, res) => {
    let filePath = null;
    try {
        if (!req.file) throw new Error("File template tidak diunggah.");
        validateExcelMimeType(req.file);
        filePath = req.file.path;

        const jobId = await jobManager.createJob('template-inspection', {
            filename: req.file.originalname,
            fileUrl: req.file.path
        });

        res.json({ ok: true, jobId });

        setImmediate(async () => {
            let localFilePath = null;
            try {
                await jobManager.updateJobProgress(jobId, 10, 'Downloading template...');
                localFilePath = await downloadToTemp(req.file.path);

                await jobManager.updateJobProgress(jobId, 30, 'Inspecting template...');
                const headers = await inspectTemplateFile(localFilePath);
                await jobManager.setJobCompleted(jobId, { headers });
            } catch (error) {
                await jobManager.setJobFailed(jobId, error.message);
            } finally {
                if (localFilePath) fs.unlink(localFilePath, () => { });
            }
        });

    } catch (error) {
        console.error("Error inspecting template:", error.message);
        if (req.file && req.file.filename) deleteFile(req.file.filename).catch(e => console.error(e));
        res.status(400).json({ ok: false, error: error.message });
    }
});


// Only listen if run directly, not when imported by Netlify Functions
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 GraphiWorks (Job-Based) berjalan di http://localhost:${PORT}`));
}

module.exports = app; // Export for Netlify Functions
