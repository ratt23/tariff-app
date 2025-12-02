// Updated tarif-generator.js to use job-based API endpoints
function initTarifGenerator() {
    if (!document.getElementById('tarifGeneratorApp')) return;

    const tarifFileInput = document.getElementById('tarifFileInput');
    const tarifFileNameDisplay = document.getElementById('tarifFileName');
    const tarifLoadingDiv = document.getElementById('tarifLoading');
    const tarifResDiv = document.getElementById('tarifRes');
    const tarifControlPanelDiv = document.getElementById('tarifControlPanel');
    const tarifSheetSelect = document.getElementById('tarifSheetSelect');
    const tarifFilterColumnSelect = document.getElementById('tarifFilterColumnSelect');
    const filterValuesWrapper = document.getElementById('filter-values-wrapper');
    const tarifFilterValuesContainer = document.getElementById('tarifFilterValuesContainer');
    const tarifMappingForm = document.getElementById('tarifMappingForm');
    const classMapWrapper = document.getElementById('class-map-wrapper');
    const tarifClassMappingForm = document.getElementById('tarifClassMappingForm');
    const tarifProcessBtn = document.getElementById('tarifProcessBtn');

    let tarifUploadedFile = null;
    let tarifInspectionData = null;
    let currentJobPoller = null; // Track active poller

    setupDragDrop('tarifUploadArea', 'tarifFileInput');

    // File inspection with job-based API
    tarifFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length === 0) return;
        tarifUploadedFile = e.target.files[0];
        tarifFileNameDisplay.textContent = `File terpilih: ${tarifUploadedFile.name}`;
        tarifResDiv.innerHTML = '';
        tarifControlPanelDiv.style.display = 'none';
        tarifLoadingDiv.style.display = 'block';
        tarifLoadingDiv.innerHTML = '<div class="spinner"></div><p id="inspectionProgressMsg">Menginspeksi file...</p>';

        const formData = new FormData();
        formData.append('file', tarifUploadedFile);

        try {
            // Start inspection job
            const jobId = await window.startJob('/jobs/start-inspection', formData);

            // Poll for status
            currentJobPoller = window.jobPoller.startPolling(
                jobId,
                (progress, message) => {
                    document.getElementById('inspectionProgressMsg').textContent = `${message} (${progress}%)`;
                },
                (result) => {
                    // Success - inspection complete  
                    tarifInspectionData = result.sheets;
                    const sheetNames = Object.keys(tarifInspectionData);
                    tarifSheetSelect.innerHTML = sheetNames.map(name => `<option value="${name}">${name}</option>`).join('');
                    updateTarifControlPanel(sheetNames[0]);
                    tarifControlPanelDiv.style.display = 'block';
                    tarifLoadingDiv.style.display = 'none';
                    currentJobPoller = null;
                },
                (error) => {
                    // Error
                    tarifLoadingDiv.style.display = 'none';
                    tarifResDiv.innerHTML = `<div class="report error"><strong>Error:</strong> ${error.message}</div>`;
                    currentJobPoller = null;
                }
            );
        } catch (err) {
            tarifLoadingDiv.style.display = 'none';
            tarifResDiv.innerHTML = `<div class="report error"><strong>Error:</strong> ${err.message}</div>`;
        }
    });

    tarifSheetSelect.addEventListener('change', (e) => updateTarifControlPanel(e.target.value));
    tarifFilterColumnSelect.addEventListener('change', (e) => updateFilterValueCheckboxes(tarifSheetSelect.value, e.target.value));

    function updateTarifControlPanel(sheetName) {
        const sheetData = tarifInspectionData[sheetName];
        if (!sheetData) return;
        const { headers } = sheetData;

        tarifFilterColumnSelect.innerHTML = '<option value="">-- Tidak Ada Filter --</option>' + headers.map(h => `<option value="${h}">${h}</option>`).join('');
        updateFilterValueCheckboxes(sheetName, '');

        const targets = {
            kode: { label: 'Kolom Kode Item', k: ['KODE', 'CODE'] },
            nama: { label: 'Kolom Nama Pemeriksaan', k: ['NAMA', 'NAME'] },
            kelas: { label: 'Kolom Kelas', k: ['KELAS', 'CLASS'] },
            harga: { label: 'Kolom Harga', k: ['HARGA', 'PRICE', 'TARIF'] }
        };
        tarifMappingForm.innerHTML = Object.entries(targets).map(([key, value]) => `
            <div class="form-row">
                <label for="tarif-${key}-select">${value.label}</label>
                <select id="tarif-${key}-select" name="${key}">${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
            </div>`).join('');

        Object.entries(targets).forEach(([key, value]) => {
            const select = document.getElementById(`tarif-${key}-select`);
            const bestGuess = headers.find(h => value.k.some(kw => h.toUpperCase().includes(kw)));
            if (bestGuess) select.value = bestGuess;
        });

        document.getElementById('tarif-kelas-select').addEventListener('change', () => updateClassMappingPanel(sheetName));
        updateClassMappingPanel(sheetName);
    }

    function findValuesForColumn(uniqueValuesPerColumn, targetColumnName) {
        if (!uniqueValuesPerColumn || !targetColumnName) return [];
        if (uniqueValuesPerColumn[targetColumnName]) return uniqueValuesPerColumn[targetColumnName];
        const normalizedTarget = targetColumnName.trim().toUpperCase();
        for (const key in uniqueValuesPerColumn) {
            if (key.trim().toUpperCase() === normalizedTarget) return uniqueValuesPerColumn[key];
        }
        return [];
    }

    function updateFilterValueCheckboxes(sheetName, columnName) {
        if (!columnName) {
            filterValuesWrapper.style.display = 'none';
            return;
        }
        const values = findValuesForColumn(tarifInspectionData[sheetName].uniqueValuesPerColumn, columnName);
        if (values.length > 0) {
            tarifFilterValuesContainer.innerHTML = values.map(val => `<div><input type="checkbox" id="filter-${val.replace(/[^a-zA-Z0-9]/g, '-')}" name="filterValue" value="${val}" checked><label for="filter-${val.replace(/[^a-zA-Z0-9]/g, '-')}" style="margin-left: 5px; font-weight: normal;">${val}</label></div>`).join('');
            filterValuesWrapper.style.display = 'block';
        } else {
            filterValuesWrapper.style.display = 'none';
        }
    }

    function updateClassMappingPanel(sheetName) {
        const classColumnName = document.getElementById('tarif-kelas-select').value;
        const uniqueClasses = classColumnName ? (findValuesForColumn(tarifInspectionData[sheetName].uniqueValuesPerColumn, classColumnName) || []) : [];
        if (uniqueClasses.length > 0 && uniqueClasses.length < 50) {
            const outputClasses = ['ignore', 'OPD', 'ED', 'KELAS 3', 'KELAS 2', 'KELAS 1', 'VIP', 'VVIP'];
            tarifClassMappingForm.innerHTML = uniqueClasses.map(cls => `<div class="form-row" style="flex-direction: row; align-items: center; margin-bottom: 8px;"><label for="classmap-${cls}" style="flex: 1; margin: 0; font-weight: normal;">${cls}:</label><select id="classmap-${cls}" name="${cls}" style="flex: 1.5;">${outputClasses.map(oc => `<option value="${oc}">${oc === 'ignore' ? '-- Abaikan --' : oc}</option>`).join('')}</select></div>`).join('');
            uniqueClasses.forEach(cls => {
                const select = document.getElementById(`classmap-${cls}`);
                const normalizedCls = cls.toUpperCase();
                const bestGuess = outputClasses.find(oc => oc !== 'ignore' && normalizedCls.includes(oc.replace(/\s/g, '')));
                if (bestGuess) select.value = bestGuess;
            });
            classMapWrapper.style.display = 'block';
        } else {
            tarifClassMappingForm.innerHTML = '';
            classMapWrapper.style.display = 'none';
        }
    }

    // File processing with job-based API
    tarifProcessBtn.addEventListener('click', async () => {
        toggleButtonLoading(tarifProcessBtn, true);
        tarifLoadingDiv.style.display = 'block';
        tarifLoadingDiv.innerHTML = '<div class="spinner"></div><p id="processingProgressMsg">Memproses data, mohon tunggu...</p>';
        tarifControlPanelDiv.style.display = 'none';

        const mappings = {
            kode: document.getElementById('tarif-kode-select').value,
            nama: document.getElementById('tarif-nama-select').value,
            kelas: document.getElementById('tarif-kelas-select').value,
            harga: document.getElementById('tarif-harga-select').value
        };
        const classMap = {};
        tarifClassMappingForm.querySelectorAll('select').forEach(select => { classMap[select.name] = select.value; });
        const selectedSheet = tarifSheetSelect.value;
        const filterColumn = tarifFilterColumnSelect.value;
        const checkedFilterValues = Array.from(document.querySelectorAll('#tarifFilterValuesContainer input:checked')).map(cb => cb.value);
        const filterConfig = { column: filterColumn, values: checkedFilterValues };

        const formData = new FormData();
        formData.append('file', tarifUploadedFile);
        formData.append('mappings', JSON.stringify(mappings));
        formData.append('classMap', JSON.stringify(classMap));
        formData.append('sheet', selectedSheet);
        formData.append('filterConfig', JSON.stringify(filterConfig));

        try {
            // Start processing job
            const jobId = await window.startJob('/jobs/start-processing', formData);

            // Poll for status
            currentJobPoller = window.jobPoller.startPolling(
                jobId,
                (progress, message) => {
                    document.getElementById('processingProgressMsg').textContent = `${message} (${progress}%)`;
                },
                (result) => {
                    // Success - processing complete
                    tarifLoadingDiv.style.display = 'none';
                    toggleButtonLoading(tarifProcessBtn, false);

                    // Store for double check (note: NO PDF in results now)
                    window.lastProcessedFiles = {
                        original: tarifUploadedFile,
                        processed: {
                            excelUrl: result.excel,
                            mappings,
                            classMap,
                            selectedSheet
                        }
                    };

                    const resultHTML = `
                      <div class="report-dashboard">
                        <div class="report-icon success"><i class="fas fa-check-circle"></i></div>
                        <h3>Proses Berhasil!</h3>
                        <p>Buku tarif Anda telah dibuat berdasarkan ${result.diagnostics?.summary?.uniqueItemCount || 'N/A'} item unik.</p>
                        <div class="download-actions">
                          <a href="${result.excel}" target="_blank" class="btn btn-primary"><i class="fas fa-file-excel"></i> Unduh Excel</a>
                        </div>
                        <div class="secondary-actions">
                          <button id="reviewBtn" class="btn-link"><i class="fas fa-search"></i> Tinjau Ringkasan Proses</button>
                          <button id="doubleCheckBtn" class="btn-link"><i class="fas fa-clipboard-check"></i> Double Check Harga</button>
                        </div>
                        <hr>
                        <button id="processNewBtn" class="btn btn-secondary"><i class="fas fa-redo"></i> Proses File Baru</button>
                      </div>`;
                    tarifResDiv.innerHTML = resultHTML;

                    document.getElementById('reviewBtn').addEventListener('click', () => {
                        const reviewContent = buildReviewSectionHTML(result.diagnostics);
                        openModal('Ringkasan & Sampel Proses', reviewContent);
                    });
                    document.getElementById('doubleCheckBtn').addEventListener('click', () => performDoubleCheck());
                    document.getElementById('processNewBtn').addEventListener('click', () => {
                        tarifResDiv.innerHTML = '';
                        tarifControlPanelDiv.style.display = 'none';
                        tarifFileNameDisplay.textContent = 'Pilih file Excel untuk memulai';
                        tarifFileInput.value = '';
                        window.lastProcessedFiles = { original: null, processed: null };
                    });

                    currentJobPoller = null;
                },
                (error) => {
                    // Error
                    tarifLoadingDiv.style.display = 'none';
                    toggleButtonLoading(tarifProcessBtn, false);
                    tarifResDiv.innerHTML = `<div class="report error"><h4><i class="fas fa-exclamation-triangle"></i> Terjadi Kesalahan</h4><p>${error.message}</p><button onclick="location.reload()" class="btn btn-secondary" style="margin-top: 15px;">Coba Lagi</button></div>`;
                    currentJobPoller = null;
                }
            );
        } catch (err) {
            tarifLoadingDiv.style.display = 'none';
            toggleButtonLoading(tarifProcessBtn, false);
            tarifResDiv.innerHTML = `<div class="report error"><h4><i class="fas fa-exclamation-triangle"></i> Terjadi Kesalahan</h4><p>${err.message}</p><button onclick="location.reload()" class="btn btn-secondary" style="margin-top: 15px;">Coba Lagi</button></div>`;
        }
    });

    function buildReviewSectionHTML(diagnostics) {
        if (!diagnostics) return '<div class="report error"><p>Data diagnostik tidak tersedia</p></div>';
        const { summary, rejectedRowsSample, acceptedRowsSample } = diagnostics;
        let html = `<div class="review-content"><h4><i class="fas fa-chart-bar"></i> Ringkasan Proses</h4><div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin: 15px 0;"><div style="background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #155724;">${summary.totalRowsRead || 0}</div><div style="font-size: 0.9em;">Total Baris Dibaca</div></div><div style="background: #f8d7da; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #721c24;">${summary.totalRowsFiltered || 0}</div><div style="font-size: 0.9em;">Baris Ditolak/Filter</div></div><div style="background: #d1ecf1; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #0c5460;">${summary.uniqueItemCount || 0}</div><div style="font-size: 0.9em;">Item Unik Diproses</div></div></div>`;
        if (rejectedRowsSample && rejectedRowsSample.length > 0) { html += `<h4><i class="fas fa-times-circle"></i> Sampel Data yang Ditolak (Maks. 10)</h4><div style="max-height: 250px; overflow-y: auto;"><table class="preview-table"><thead><tr><th>Kode</th><th>Nama</th><th>Alasan Ditolak</th></tr></thead><tbody>${rejectedRowsSample.map(row => `<tr><td>${row.kode || ''}</td><td>${row.nama || ''}</td><td style="color: #dc3545;">${row.alasan || 'Tidak diketahui'}</td></tr>`).join('')}</tbody></table></div>`; } else { html += `<p style="color: #28a745; margin-top: 20px;"><i class="fas fa-check-circle"></i> Tidak ada baris yang ditolak atau difilter.</p>`; }
        if (acceptedRowsSample && acceptedRowsSample.length > 0) { const headers = Object.keys(acceptedRowsSample[0]); html += `<h4 style="margin-top: 25px;"><i class="fas fa-check-circle"></i> Preview Hasil yang Diterima (Maks. 10)</h4><div style="max-height: 300px; overflow-y: auto;"><table class="preview-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${acceptedRowsSample.map(row => `<tr>${headers.map(h => `<td>${formatCellValue(row[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
        html += `</div>`; return html;
    }

    async function performDoubleCheck() {
        if (!window.lastProcessedFiles.original || !window.lastProcessedFiles.processed) {
            alert('Tidak ada data file untuk dilakukan double check. Harap proses file terlebih dahulu.');
            return;
        }
        openModal('Double Check Harga', '<div class="loading" style="padding: 40px;"><div class="spinner"></div><p id="doubleCheckProgressMsg">Membandingkan harga...</p></div>');
        try {
            const excelResponse = await fetch(window.lastProcessedFiles.processed.excelUrl);
            const excelBlob = await excelResponse.blob();
            const processedFile = new File([excelBlob], 'processed_file.xlsx');
            const formData = new FormData();
            formData.append('originalFile', window.lastProcessedFiles.original);
            formData.append('processedFile', processedFile);
            formData.append('mappings', JSON.stringify(window.lastProcessedFiles.processed.mappings));
            formData.append('classMap', JSON.stringify(window.lastProcessedFiles.processed.classMap));
            formData.append('selectedSheet', window.lastProcessedFiles.processed.selectedSheet);

            // Use job-based endpoint
            const jobId = await window.startJob('/jobs/start-double-check', formData);

            currentJobPoller = window.jobPoller.startPolling(
                jobId,
                (progress, message) => {
                    const msgEl = document.getElementById('doubleCheckProgressMsg');
                    if (msgEl) msgEl.textContent = `${message} (${progress}%)`;
                },
                (result) => {
                    const doubleCheckContent = displayDoubleCheckResultsHTML(result.comparison);
                    openModal('Hasil Double Check Harga', doubleCheckContent);
                    currentJobPoller = null;
                },
                (error) => {
                    const modalBody = document.getElementById('modalBody');
                    if (modalBody) {
                        modalBody.innerHTML = `<div class="report error" style="margin: 0;"><h4><i class="fas fa-exclamation-triangle"></i> Gagal!</h4><p>${error.message}</p></div>`;
                    }
                    currentJobPoller = null;
                }
            );
        } catch (error) {
            const modalBody = document.getElementById('modalBody');
            if (modalBody) {
                modalBody.innerHTML = `<div class="report error" style="margin: 0;"><h4><i class="fas fa-exclamation-triangle"></i> Gagal!</h4><p>${error.message}</p></div>`;
            }
        }
    }

    function displayDoubleCheckResultsHTML(comparison) {
        let html = `<div class="double-check-results"><div class="comparison-summary"><h5>Ringkasan Perbandingan</h5><div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;"><div style="background: #e7f3ff; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: var(--primary-color);">${comparison.summary.itemsCompared}</div><div style="font-size: 0.9em;">Item Dibandingkan</div></div><div style="background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #28a745;">${comparison.summary.priceMatches}</div><div style="font-size: 0.9em;">Harga Cocok</div></div><div style="background: #f8d7da; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: #dc3545;">${comparison.summary.priceMismatches}</div><div style="font-size: 0.9em;">Tidak Cocok</div></div><div style="background: ${comparison.summary.matchPercentage >= 95 ? '#d4edda' : '#f8d7da'}; padding: 15px; border-radius: 8px; text-align: center;"><div style="font-size: 1.5em; font-weight: bold; color: ${comparison.summary.matchPercentage >= 95 ? '#28a745' : '#dc3545'};">${comparison.summary.matchPercentage.toFixed(1)}%</div><div style="font-size: 0.9em;">Kecocokan</div></div></div></div>`;
        const mismatches = comparison.priceComparison.filter(item => item.status === 'MISMATCH');
        if (mismatches.length > 0) { html += `<div style="margin-top: 25px;"><h5><i class="fas fa-list"></i> Detail Item yang Tidak Cocok</h5><div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px;">${mismatches.map((item, index) => `<div class="item-comparison" style="border-bottom: 1px solid #eee; padding: 15px; background: ${index % 2 === 0 ? '#f8f9fa' : 'white'};"><div style="font-weight: bold;">${item.code} - ${item.name}</div><table class="preview-table" style="margin-top: 10px; font-size: 0.9em; width: 100%;"><thead><tr><th>Kelas</th><th>Harga Original</th><th>Harga Hasil</th></tr></thead><tbody>${item.details.filter(d => !d.match).map(detail => `<tr style="background: #f8d7da33;"><td><strong>${detail.class}</strong></td><td>${formatCurrency(detail.originalPrice)}</td><td>${formatCurrency(detail.processedPrice)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div></div>`; } else { html += `<div class="report success" style="margin-top: 20px; text-align: center;"><h4><i class="fas fa-check-circle"></i> Sempurna!</h4><p>Semua harga cocok.</p></div>` }
        html += `</div>`; return html;
    }

    function formatCurrency(amount) {
        if (amount === null || amount === undefined || amount === '') return '<span style="color: #6c757d;">-</span>';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    }
}
function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '<span style="color: #6c757d;">-</span>';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}