document.addEventListener('DOMContentLoaded', () => {
    // --- Variabel Global yang Dapat Diakses Semua Script ---
    window.lastProcessedFiles = { original: null, processed: null };

    // --- Bagian Navigasi & Utilitas ---
    const views = document.querySelectorAll('.view');
    const backToMenuBtn = document.getElementById('backToMenuBtn');

    window.showView = function(viewId) {
        views.forEach(v => {
            v.style.display = 'none';
            v.classList.remove('active');
        });
        const el = document.getElementById(viewId);
        if (el) {
            el.style.display = 'block';
            setTimeout(() => el.classList.add('active'), 10);
        }
        if (backToMenuBtn) {
            backToMenuBtn.style.display = viewId === 'mainMenu' ? 'none' : 'inline-block';
        }
    }

    window.toggleButtonLoading = function(btn, isLoading) {
        if (btn) {
            btn.classList.toggle('loading', isLoading);
            btn.disabled = isLoading;
        }
    }

    window.setupDragDrop = function(areaId, inputId) {
        const area = document.getElementById(areaId);
        const input = document.getElementById(inputId);
        if (!area || !input) return;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        area.addEventListener('dragover', () => area.classList.add('dragover'));
        area.addEventListener('dragleave', () => area.classList.remove('dragover'));
        area.addEventListener('drop', e => {
            area.classList.remove('dragover');
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change'));
        });
    }

    document.querySelectorAll('.menu-choice').forEach(btn => {
        btn.addEventListener('click', () => showView(btn.dataset.target));
    });

    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            showView('mainMenu');
        });
    }

    // --- LOGIKA MODAL (POP-UP) ---
    const modal = document.getElementById('appModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    
    window.openModal = function(title, contentHTML) {
        if (modal && modalTitle && modalBody) {
            modalTitle.textContent = title;
            modalBody.innerHTML = contentHTML;
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
        }
    }

    window.closeModal = function() {
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                if (modalBody) modalBody.innerHTML = '';
            }, 200);
        }
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    window.formatCellValue = function(value) {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'number') {
            return new Intl.NumberFormat('id-ID').format(value);
        }
        return value;
    }

    // --- TITIK MASUK UTAMA ---
    // Panggil fungsi inisialisasi dari file lain
    if (typeof initTarifGenerator === 'function') {
        initTarifGenerator();
    }
    if (typeof initVlookupKustom === 'function') {
        initVlookupKustom();
    }

    // Tampilkan menu utama saat aplikasi pertama kali dimuat
    showView('mainMenu');
});