const puppeteer = require('puppeteer-core');
const path = require('path');

function formatRp(num) {
  if (num === null || num === undefined || num === '') return '';
  return new Intl.NumberFormat('id-ID').format(num);
}

async function generatePdfFromData(rows, outPdfPath) {
  let browser;
  try {
    const htmlContent = `
    <html><head><meta charset="utf-8"><style>
    body { font-family: 'Arial', sans-serif; margin: 20px; font-size: 8pt; }
    table { border-collapse: collapse; width: 100%; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td { border: 1px solid #777; padding: 4px 6px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    h2 { text-align: center; margin-bottom: 20px; font-size: 14pt; }
    thead { display: table-header-group; }
    td.num { text-align: right; }
    </style></head><body>
    <h2>BUKU TARIF LABORATORIUM</h2>
    <table><thead><tr>
    <th>Kode</th><th width="30%">Nama Pemeriksaan</th>
    <th>OPD</th><th>ED</th><th>KELAS 3</th><th>KELAS 2</th><th>KELAS 1</th><th>VIP</th><th>VVIP</th>
    </tr></thead><tbody>
    ${rows.map(r => `
      <tr>
        <td>${r.code || ''}</td><td>${r.name || ''}</td>
        <td class="num">${formatRp(r.OPD)}</td><td class="num">${formatRp(r.ED)}</td>
        <td class="num">${formatRp(r['KELAS 3'])}</td><td class="num">${formatRp(r['KELAS 2'])}</td>
        <td class="num">${formatRp(r['KELAS 1'])}</td><td class="num">${formatRp(r.VIP)}</td>
        <td class="num">${formatRp(r.VVIP)}</td>
      </tr>`).join('')}
    </tbody></table></body></html>`;

    // --- PERBAIKI BAGIAN INI ---
    browser = await puppeteer.launch({
      // GANTI path di bawah ini dengan path yang Anda salin dari "Target"
      // PENTING: Gunakan garis miring terbalik ganda (\\)
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
    await page.pdf({
      path: outPdfPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '1cm', right: '1cm', bottom: '1.5cm', left: '1cm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="font-size: 8pt; width: 100%; text-align: center; padding: 0 1cm;">Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></div>`
    });
    return outPdfPath;

  } catch (error) {
    console.error('❌ ERROR saat membuat PDF:', error);
    // Berikan pesan error yang lebih jelas
    throw new Error('Gagal membuat file PDF. Pastikan path executablePath di generate.js sudah benar dan browser tidak berjalan sebagai admin.');
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { generatePdfFromData };