const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitize = require('sanitize-filename');
const Excel = require('exceljs');

const { processAndDiagnoseSheet, createFinalExcel } = require('./processExcel');
// PDF generation removed - not compatible with Netlify
const { inspectSourceFile, buildReport, inspectTemplateFile } = require('./report-constructor-engine');

const app = express();
const UPLOAD_DIR = 'uploads';
const OUTPUT_DIR = 'output';

[UPLOAD_DIR, OUTPUT_DIR, 'public'].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

app.use(express.static('public'));
app.use('/output', express.static('output'));
app.use(express.json());

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '_' + sanitize(file.originalname)),
});
const upload = multer({ storage });

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

// Endpoint Inspeksi (Dengan Optimasi dan Validasi)
app.post('/inspect-file', upload.single('file'), async (req, res) => {
    try {
        validateExcelMimeType(req.file);

        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const inspectionData = {};
        const MAX_ROWS_TO_INSPECT = 5000;

        for (const sheet of workbook.worksheets) {
            if (sheet.rowCount === 0) continue;

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
        res.json({ ok: true, sheets: inspectionData });
    } catch (error) {
        console.error("Error inspecting file:", error.message);
        res.status(400).json({ ok: false, error: error.message });
    }
    finally { if (req.file) fs.unlink(req.file.path, () => { }); }
});

// Endpoint Proses Utama (NO PDF)
app.post('/process-file', upload.single('file'), async (req, res) => {
    try {
        validateExcelMimeType(req.file);
        const mappings = JSON.parse(req.body.mappings);
        const classMap = JSON.parse(req.body.classMap);
        const selectedSheet = req.body.sheet;
        const filterConfig = JSON.parse(req.body.filterConfig);

        const { allAcceptedRows, summary, rejectedRowsSample, acceptedRowsSample } = await processAndDiagnoseSheet(req.file.path, mappings, classMap, selectedSheet, filterConfig);

        if (allAcceptedRows.length === 0) throw new Error("Tidak ada data yang diproses setelah filter diterapkan.");

        const finalXlsxPath = await createFinalExcel(allAcceptedRows);

        res.json({
            ok: true, message: 'File berhasil diproses!',
            excel: `/output/${path.basename(finalXlsxPath)}`,
            diagnostics: { summary, rejectedRowsSample, acceptedRowsSample }
        });
    } catch (error) {
        console.error('Error processing file:', error.message);
        res.status(500).json({ ok: false, error: error.message });
    }
    finally { if (req.file) fs.unlink(req.file.path, () => { }); }
});

// Endpoint Double Check & Fungsi compareFiles
async function compareFiles(originalPath, processedPath, mappings, classMap, selectedSheet) {
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
    const originalHeaders = {};
    originalSheet.getRow(1).eachCell((cell, colNum) => { if (cell.text) originalHeaders[cell.text.trim()] = colNum; });
    const colCode = originalHeaders[mappings.kode];
    const colName = originalHeaders[mappings.nama];
    const colClass = originalHeaders[mappings.kelas];
    const colPrice = originalHeaders[mappings.harga];
    if (!colCode || !colName || !colClass || !colPrice) {
        throw new Error('Mapping kolom tidak valid untuk file original');
    }
    const processedHeaders = {};
    processedSheet.getRow(1).eachCell((cell, colNum) => { if (cell.text) processedHeaders[cell.text.trim()] = colNum; });
    const classToColumnMap = {};
    const classColumns = ['OPD', 'ED', 'KELAS 3', 'KELAS 2', 'KELAS 1', 'VIP', 'VVIP'];
    classColumns.forEach(className => { classToColumnMap[className] = processedHeaders[className]; });
    function parsePrice(val) {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        const strVal = String(val).trim();
        if (!strVal) return null;
        const cleanStr = strVal.replace(/[^\d,-]/g, '').replace(',', '.');
        const parsed = parseFloat(cleanStr);
        return isNaN(parsed) ? null : parsed;
    }
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
    processedSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const processedCode = (row.getCell(processedHeaders['Kode']).text || '').trim();
        const processedName = (row.getCell(processedHeaders['Nama Pemeriksaan']).text || '').trim();
        if (!processedCode || !processedName) return;
        const key = `${processedCode}|${processedName}`.toUpperCase();
        const originalItem = originalDataMap.get(key);
        if (!originalItem) {
            results.priceComparison.push({ code: processedCode, name: processedName, status: 'NOT_FOUND', message: 'Item tidak ditemukan di file original' });
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
    results.summary.matchPercentage = results.summary.itemsCompared > 0 ? (results.summary.priceMatches / results.summary.itemsCompared) * 100 : 0;
    return results;
}
app.post('/double-check-tarif', upload.fields([{ name: 'originalFile', maxCount: 1 }, { name: 'processedFile', maxCount: 1 }]), async (req, res) => {
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
        const comparisonResult = await compareFiles(originalFile.path, processedFile.path, mappings, classMap, selectedSheet);
        res.json({ ok: true, message: 'Double check harga selesai!', comparison: comparisonResult });
    } catch (error) {
        console.error('Error in double check:', error.message);
        res.status(500).json({ ok: false, error: error.message });
    } finally {
        if (originalFile) fs.unlink(originalFile.path, () => { });
        if (processedFile) fs.unlink(processedFile.path, () => { });
    }
});

// ======================================================================
// === ENDPOINT UNTUK KONSTRUKTOR LAPORAN ===
// ======================================================================

app.post('/inspect-source-file', upload.single('file'), async (req, res) => {
    try {
        validateExcelMimeType(req.file);
        const config = req.body.config ? JSON.parse(req.body.config) : { headerRowCount: 'auto' };
        const inspectionResult = await inspectSourceFile(req.file.path, config);
        res.json({ ok: true, ...inspectionResult });
    } catch (error) {
        console.error("Error inspecting source file:", error.message);
        res.status(400).json({ ok: false, error: error.message });
    } finally {
        if (req.file) fs.unlink(req.file.path, () => { });
    }
});

app.post('/inspect-template', upload.single('templateFile'), async (req, res) => {
    try {
        if (!req.file) throw new Error("File template tidak diunggah.");
        validateExcelMimeType(req.file);
        const headers = await inspectTemplateFile(req.file.path);
        res.json({ ok: true, headers });
    } catch (error) {
        console.error("Error inspecting template:", error.message);
        res.status(400).json({ ok: false, error: error.message });
    } finally {
        if (req.file) fs.unlink(req.file.path, () => { });
    }
});


app.post('/build-report', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) throw new Error("File sumber tidak ada.");
        if (!req.body.config) throw new Error("Konfigurasi laporan tidak ada.");
        validateExcelMimeType(req.file);
        const config = JSON.parse(req.body.config);
        const { resultPath, diagnostics } = await buildReport(req.file.path, config);
        res.json({
            ok: true,
            message: 'Laporan berhasil dibuat!',
            excel: `/output/${path.basename(resultPath)}`,
            diagnostics
        });
    } catch (error) {
        console.error("Error building report:", error.message);
        res.status(500).json({ ok: false, error: error.message });
    } finally {
        if (req.file) fs.unlink(req.file.path, () => { });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 GraphiWorks (Legacy - No PDF) berjalan di http://localhost:${PORT}`));