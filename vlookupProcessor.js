const Excel = require('exceljs');
const path = require('path');

async function performVlookup(mainFilePath, templateFilePath, mappings) {
  const mainWorkbook = new Excel.Workbook();
  await mainWorkbook.xlsx.readFile(mainFilePath);
  const mainSheet = mainWorkbook.worksheets[0];

  const templateWorkbook = new Excel.Workbook();
  await templateWorkbook.xlsx.readFile(templateFilePath);
  const templateSheet = templateWorkbook.worksheets[0];

  // --- Langkah 1: Persiapan Lookup Map & Kolom ---
  const lookupMap = new Map();
  let templateKeyColNum = -1;
  let templateValueColNum = -1;
  templateSheet.getRow(1).eachCell((cell, colNum) => {
    if (cell.text.trim() === mappings.templateKey) templateKeyColNum = colNum;
    if (cell.text.trim() === mappings.valueToGet) templateValueColNum = colNum;
  });

  if (templateKeyColNum === -1 || templateValueColNum === -1) {
    throw new Error('Kolom kunci atau kolom nilai tidak ditemukan di file template.');
  }

  templateSheet.eachRow((row, rowNum) => {
    if (rowNum > 1) {
      const key = row.getCell(templateKeyColNum).text;
      const value = row.getCell(templateValueColNum).value;
      if (key) lookupMap.set(key, value);
    }
  });

  let mainKeyColNum = -1;
  mainSheet.getRow(1).eachCell((cell, colNum) => {
    if (cell.text.trim() === mappings.mainKey) mainKeyColNum = colNum;
  });

  if (mainKeyColNum === -1) {
    throw new Error('Kolom kunci tidak ditemukan di file utama.');
  }

  // --- Langkah 2: Inisialisasi Diagnostik ---
  const diagnostics = {
    summary: {
      totalRowsInMainFile: mainSheet.rowCount - 1,
      totalRowsMatched: 0,
      totalRowsUnmatched: 0,
    },
    unmatchedRowsSample: [],
    matchedRowsSample: [],
    SAMPLE_SIZE: 10 // Batasi sampel agar tidak membebani memori
  };

  // Tambahkan header baru di file utama
  const newColumnIndex = mainSheet.columnCount + 1;
  mainSheet.getRow(1).getCell(newColumnIndex).value = mappings.valueToGet;
  mainSheet.getRow(1).getCell(newColumnIndex).font = { bold: true };


  // --- Langkah 3: Proses & Kumpulkan Diagnostik ---
  mainSheet.eachRow((row, rowNum) => {
    if (rowNum > 1) {
      const keyToFind = row.getCell(mainKeyColNum).text;
      if (lookupMap.has(keyToFind)) {
        // Data Ditemukan
        diagnostics.summary.totalRowsMatched++;
        const foundValue = lookupMap.get(keyToFind);
        row.getCell(newColumnIndex).value = foundValue;

        // Simpan sampel yang cocok
        if (diagnostics.matchedRowsSample.length < diagnostics.SAMPLE_SIZE) {
            diagnostics.matchedRowsSample.push({
                key: keyToFind,
                value: foundValue
            });
        }
      } else {
        // Data Tidak Ditemukan
        diagnostics.summary.totalRowsUnmatched++;
        
        // Simpan sampel yang tidak cocok
        if (diagnostics.unmatchedRowsSample.length < diagnostics.SAMPLE_SIZE) {
            diagnostics.unmatchedRowsSample.push({ key: keyToFind });
        }
      }
    }
  });

  // --- Langkah 4: Finalisasi & Simpan File ---
  diagnostics.summary.matchPercentage = diagnostics.summary.totalRowsInMainFile > 0 
    ? (diagnostics.summary.totalRowsMatched / diagnostics.summary.totalRowsInMainFile) * 100 
    : 0;

  const outputDir = path.join(__dirname, 'output');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFileName = `VLOOKUP_Result_${timestamp}.xlsx`;
  const outPath = path.join(outputDir, outFileName);

  await mainWorkbook.xlsx.writeFile(outPath);
  
  // Kembalikan path DAN data diagnostik
  return { resultPath: outPath, diagnostics };
}

module.exports = { performVlookup };