const Excel = require('exceljs');

// Konfigurasi ini harus sama dengan yang ada di processExcel.js
const NAMA_KOLOM_KODE = ['CODE', 'KODE', 'KODE ITEM'];
const NAMA_KOLOM_NAMA = ['NAME', 'NAMA', 'ITEM NAME', 'NAMA PEMERIKSAAN'];
const NAMA_KOLOM_KELAS = ['CLASS', 'KELAS'];
const NAMA_KOLOM_HARGA = ['PRICE UPLOAD', 'PRICE', 'HARGA', 'TARIF', 'BIAYA'];
const PEMETAAN_KELAS = {
  'OPD': 'OPD', 'ED': 'ED', 'KELAS 3': 'KELAS 3', 'KELAS III': 'KELAS 3',
  'KELAS 2': 'KELAS 2', 'KELAS II': 'KELAS 2', 'KELAS 1': 'KELAS 1',
  'KELAS I': 'KELAS 1', 'VIP': 'VIP', 'VVIP': 'VVIP'
};

// Fungsi helper untuk menemukan kolom
function findColumn(headers, possibleNames) {
  for (const name of possibleNames) {
    if (headers[name]) return headers[name];
  }
  return null;
}

// Fungsi utama untuk validasi
async function validateSheet(inputPath) {
  const errors = [];
  const warnings = [];
  
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(inputPath);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    errors.push("File Excel tidak valid atau tidak berisi worksheet.");
    return { isValid: false, errors, warnings };
  }

  // === 1. PEMERIKSAAN HEADER ===
  const headerRow = sheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, col) => {
    const v = (cell.text || '').trim().toUpperCase();
    if (v) headers[v] = col;
  });

  const colCode = findColumn(headers, NAMA_KOLOM_KODE);
  const colName = findColumn(headers, NAMA_KOLOM_NAMA);
  const colClass = findColumn(headers, NAMA_KOLOM_KELAS);
  const colPrice = findColumn(headers, NAMA_KOLOM_HARGA);

  if (!colCode) errors.push(`Kolom Kode tidak ditemukan. Harusnya bernama salah satu dari: ${NAMA_KOLOM_KODE.join(', ')}`);
  if (!colName) errors.push(`Kolom Nama Pemeriksaan tidak ditemukan. Harusnya bernama salah satu dari: ${NAMA_KOLOM_NAMA.join(', ')}`);
  if (!colClass) errors.push(`Kolom Kelas tidak ditemukan. Harusnya bernama salah satu dari: ${NAMA_KOLOM_KELAS.join(', ')}`);
  if (!colPrice) errors.push(`Kolom Harga tidak ditemukan. Harusnya bernama salah satu dari: ${NAMA_KOLOM_HARGA.join(', ')}`);

  // Jika header ada yang kurang, langsung hentikan dan laporkan
  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  // === 2. PEMERIKSAAN DATA (50 baris pertama) ===
  const uniqueClassesInFile = new Set();
  for (let i = 2; i <= sheet.rowCount && i < 52; i++) {
    const row = sheet.getRow(i);
    const codeVal = row.getCell(colCode).text;
    const nameVal = row.getCell(colName).text;
    const priceVal = row.getCell(colPrice).value;
    const classVal = (row.getCell(colClass).text || '').trim().toUpperCase();
    
    if (!codeVal || !nameVal) {
      warnings.push(`Baris ${i}: Ditemukan baris dengan Kode atau Nama kosong. Baris ini akan dilewati.`);
    }

    if (priceVal !== null && typeof priceVal !== 'number') {
      const priceStr = String(priceVal).trim();
      if (priceStr && isNaN(parseFloat(priceStr.replace(/[^\d,-]/g, '').replace(',', '.')))) {
        errors.push(`Baris ${i}: Kolom Harga berisi teks ('${priceStr}') yang tidak bisa diubah menjadi angka.`);
      }
    }
    
    if (classVal) {
      uniqueClassesInFile.add(classVal);
    }
  }

  // === 3. PEMERIKSAAN KONSISTENSI KELAS ===
  const knownClasses = Object.keys(PEMETAAN_KELAS);
  uniqueClassesInFile.forEach(className => {
    if (!knownClasses.includes(className)) {
      warnings.push(`Ditemukan nama kelas '${className}' yang tidak dikenal. Harga untuk kelas ini tidak akan diproses. Anda bisa menambahkannya di 'PEMETAAN_KELAS' pada file processExcel.js.`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

module.exports = { validateSheet };