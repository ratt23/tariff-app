function initVlookupKustom() {
    if (!document.getElementById('vlookupApp')) return;

    const vlookupMainFile = document.getElementById('vlookupMainFile');
    const vlookupTemplateFile = document.getElementById('vlookupTemplateFile');
    const vlookupMainFileName = document.getElementById('vlookupMainFileName');
    const vlookupTemplateFileName = document.getElementById('vlookupTemplateFileName');
    const vlookupLoadingDiv = document.getElementById('vlookupLoading');
    const vlookupResDiv = document.getElementById('vlookupRes');
    const vlookupControlPanelDiv = document.getElementById('vlookupControlPanel');
    const vlookupMappingForm = document.getElementById('vlookupMappingForm');
    const vlookupProcessBtn = document.getElementById('vlookupProcessBtn');
    const vlookupNextStepContainer = document.getElementById('vlookupNextStepContainer');
    const vlookupInspectBtn = document.getElementById('vlookupInspectBtn');
    let vlookupFiles = {};

    setupDragDrop('vlookupUploadAreaMain', 'vlookupMainFile');
    setupDragDrop('vlookupUploadAreaTemplate', 'vlookupTemplateFile');

    function updateVlookupNextButtonState() {
        if (vlookupFiles.main && vlookupFiles.template) {
            vlookupNextStepContainer.style.display = 'block';
        } else {
            vlookupNextStepContainer.style.display = 'none';
        }
    }

    vlookupMainFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            vlookupFiles.main = e.target.files[0];
            vlookupMainFileName.textContent = vlookupFiles.main.name;
            document.querySelector('#vlookupUploadAreaMain .upload-label').innerHTML = '<i class="fas fa-sync-alt"></i> Ganti File Utama';
            updateVlookupNextButtonState();
        }
    });

    vlookupTemplateFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            vlookupFiles.template = e.target.files[0];
            vlookupTemplateFileName.textContent = vlookupFiles.template.name;
            document.querySelector('#vlookupUploadAreaTemplate .upload-label').innerHTML = '<i class="fas fa-sync-alt"></i> Ganti File Template';
            updateVlookupNextButtonState();
        }
    });

    vlookupInspectBtn.addEventListener('click', async () => {
        vlookupLoadingDiv.style.display = 'block';
        vlookupLoadingDiv.innerHTML = '<div class="spinner"></div><p>Memeriksa file...</p>';
        vlookupControlPanelDiv.style.display = 'none';
        vlookupResDiv.innerHTML = '';
        const formData = new FormData();
        formData.append('mainFile', vlookupFiles.main);
        formData.append('templateFile', vlookupFiles.template);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch('/vlookup-inspect', { method: 'POST', body: formData, signal: controller.signal });
            clearTimeout(timeoutId);

            const result = await response.json();
            if (!result.ok) throw new Error(result.error);
            buildVlookupWizardPanel(result.mainHeaders, result.templateHeaders);
            document.getElementById('vlookupUploadStep').style.display = 'none';
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                vlookupResDiv.innerHTML = `<div class="report error"><strong>Pemeriksaan Gagal:</strong> Proses memakan waktu terlalu lama.</div>`;
            } else {
                vlookupResDiv.innerHTML = `<div class="report error"><strong>Error:</strong> ${err.message}</div>`;
            }
        } finally {
            vlookupLoadingDiv.style.display = 'none';
        }
    });

    function buildVlookupWizardPanel(mainHeaders, templateHeaders) {
        vlookupMappingForm.innerHTML = `<div class="form-row"><label for="vlookup-main-key">Kunci di File Utama</label><select id="vlookup-main-key">${mainHeaders.map(h => `<option value="${h}">${h}</option>`).join('')}</select></div><div class="form-row"><label for="vlookup-template-key">Kunci di File Template</label><select id="vlookup-template-key">${templateHeaders.map(h => `<option value="${h}">${h}</option>`).join('')}</select></div><div class="form-row"><label for="vlookup-value-to-get">Data yang Ingin Diambil</label><select id="vlookup-value-to-get">${templateHeaders.map(h => `<option value="${h}">${h}</option>`).join('')}</select></div>`;
        const mainKeySelect = document.getElementById('vlookup-main-key');
        const templateKeySelect = document.getElementById('vlookup-template-key');
        const commonKey = mainHeaders.find(h => templateHeaders.some(th => th.toUpperCase() === h.toUpperCase()));
        if (commonKey) {
            mainKeySelect.value = commonKey;
            templateKeySelect.value = commonKey;
        }

        document.getElementById('vlookupHeadersPreview').innerHTML = `<h4><i class="fas fa-list-ul"></i> Pratinjau Kolom</h4><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;"><div><p style="font-weight: 600; margin-bottom: 5px;">File Utama</p><ul style="font-size: 0.8em; margin: 0; padding-left: 15px; max-height: 150px; overflow-y: auto;">${mainHeaders.map(h => `<li>${h}</li>`).join('')}</ul></div><div><p style="font-weight: 600; margin-bottom: 5px;">File Template</p><ul style="font-size: 0.8em; margin: 0; padding-left: 15px; max-height: 150px; overflow-y: auto;">${templateHeaders.map(h => `<li>${h}</li>`).join('')}</ul></div></div>`;
        vlookupControlPanelDiv.style.display = 'block';
    }

    vlookupProcessBtn.addEventListener('click', async () => {
        toggleButtonLoading(vlookupProcessBtn, true);
        vlookupLoadingDiv.style.display = 'block';
        vlookupLoadingDiv.innerHTML = '<div class="spinner"></div><p>Menggabungkan file...</p>';
        vlookupControlPanelDiv.style.display = 'none';

        const mappings = { mainKey: document.getElementById('vlookup-main-key').value, templateKey: document.getElementById('vlookup-template-key').value, valueToGet: document.getElementById('vlookup-value-to-get').value };
        const formData = new FormData();
        formData.append('mainFile', vlookupFiles.main);
        formData.append('templateFile', vlookupFiles.template);
        formData.append('mappings', JSON.stringify(mappings));

        try {
            const response = await fetch('/vlookup-process', { method: 'POST', body: formData });
            const result = await response.json();
            if (!result.ok) throw new Error(result.error);

            const { summary } = result.diagnostics;
            const resultHTML = `
              <div class="report-dashboard">
                <div class="report-icon success"><i class="fas fa-check-circle"></i></div>
                <h3>Penggabungan Berhasil!</h3>
                <p>Berhasil mencocokkan <strong>${summary.totalRowsMatched}</strong> dari <strong>${summary.totalRowsInMainFile}</strong> baris (${summary.matchPercentage.toFixed(1)}%).</p>
                <div class="download-actions"><a href="${result.excel}" target="_blank" class="btn btn-primary"><i class="fas fa-file-excel"></i> Unduh Hasil Excel</a></div>
                <div class="secondary-actions"><button id="reviewVlookupBtn" class="btn-link"><i class="fas fa-search"></i> Tinjau Ringkasan Penggabungan</button></div>
                <hr>
                <button id="processNewVlookupBtn" class="btn btn-secondary"><i class="fas fa-redo"></i> Proses File Baru</button>
              </div>`;
            vlookupResDiv.innerHTML = resultHTML;

            document.getElementById('reviewVlookupBtn').addEventListener('click', () => {
                const reviewContent = buildVlookupReviewHTML(result.diagnostics);
                openModal('Ringkasan Penggabungan VLOOKUP', reviewContent);
            });
            document.getElementById('processNewVlookupBtn').addEventListener('click', () => {
                vlookupResDiv.innerHTML = '';
                vlookupFiles = {};
                vlookupMainFileName.textContent = 'File yang akan ditambahi data';
                vlookupTemplateFileName.textContent = 'File yang datanya akan diambil';
                document.querySelector('#vlookupUploadAreaMain .upload-label').innerHTML = '<i class="fas fa-file-alt"></i> 1. Unggah File Utama';
                document.querySelector('#vlookupUploadAreaTemplate .upload-label').innerHTML = '<i class="fas fa-table"></i> 2. Unggah File Template';
                vlookupMainFile.value = '';
                vlookupTemplateFile.value = '';
                document.getElementById('vlookupUploadStep').style.display = 'block';
                vlookupNextStepContainer.style.display = 'none';
            });

        } catch (err) {
            vlookupResDiv.innerHTML = `<div class="report error"><h4><i class="fas fa-exclamation-triangle"></i> Gagal!</h4><p>${err.message}</p></div>`;
        } finally {
            vlookupLoadingDiv.style.display = 'none';
            toggleButtonLoading(vlookupProcessBtn, false);
        }
    });

    function buildVlookupReviewHTML(diagnostics) {
        const { summary, unmatchedRowsSample, matchedRowsSample } = diagnostics;
        let html = `<h4><i class="fas fa-chart-bar"></i> Ringkasan Penggabungan</h4><div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;"><div style="background: #d1ecf1; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #0c5460;">${summary.totalRowsInMainFile}</div><div>Total Baris</div></div><div style="background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #155724;">${summary.totalRowsMatched}</div><div>Berhasil</div></div><div style="background: #f8d7da; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #721c24;">${summary.totalRowsUnmatched}</div><div>Gagal</div></div></div>`;
        if (unmatchedRowsSample && unmatchedRowsSample.length > 0) {
            html += `<h4 style="margin-top: 25px;"><i class="fas fa-times-circle"></i> Sampel Kunci yang Gagal Ditemukan</h4><div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px;"><ul style="padding-left: 20px; margin: 0;">${unmatchedRowsSample.map(row => `<li>${row.key}</li>`).join('')}</ul></div>`;
        } else {
            html += `<p style="color: #28a745; margin-top: 20px;"><i class="fas fa-check-circle"></i> Luar biasa! Semua baris berhasil dicocokkan.</p>`;
        }
        if (matchedRowsSample && matchedRowsSample.length > 0) {
            html += `<h4 style="margin-top: 25px;"><i class="fas fa-check-circle"></i> Sampel Data yang Berhasil Digabungkan</h4><div style="max-height: 250px; overflow-y: auto;"><table class="preview-table"><thead><tr><th>Kunci</th><th>Nilai Ditemukan</th></tr></thead><tbody>${matchedRowsSample.map(row => `<tr><td>${row.key}</td><td>${formatCellValue(row.value)}</td></tr>`).join('')}</tbody></table></div>`;
        }
        return html;
    }
}