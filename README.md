# GraphiWorks - Tariff App (Job-Based Version)

Excel processing application dengan chunked processing untuk Netlify deployment.

## 🚀 Features

- **Job-Based Processing**: Semua operasi berat dijalankan async dengan job tracking
- **Chunked Processing**: Break down large files menjadi chunks untuk menghindari timeout
- **Progress Tracking**: Real-time progress updates untuk setiap job
- **File-Based Persistence**: Jobs disimpan di filesystem untuk Netlify compatibility
- **Auto Cleanup**: Automatic cleanup untuk old jobs dan uploaded files

## 📋 Prerequisites

- Node.js >= 14.0.0
- npm atau yarn
- Google Chrome (untuk PDF generation)

## 🛠 Installation

```bash
npm install --legacy-peer-deps
```

## 🏃 Running Locally

### Development Mode (Old Sync Server)
```bash
npm start
```
Server akan berjalan di `http://localhost:3000`

### Job-Based Server (New)
```bash
node server-jobified.js
```

## 🌐 Deployment ke Netlify

### 1. Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit with chunked processing"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Connect ke Netlify

1. Login ke [Netlify](https://netlify.com)
2. Click "New site from Git"
3. Pilih repository GitHub Anda
4. Build settings akan auto-detected dari `netlify.toml`
5. Click "Deploy site"

### 3. Environment Variables (Optional)

Di Netlify dashboard > Site settings > Environment variables:

```
STORAGE_TYPE=file
STORAGE_PATH=/tmp/jobs
NODE_VERSION=18
```

## 📁 Struktur File

```
tariff-app/
├── config.js                    # Configuration untuk chunking
├── jobManager.js                # Job queue manager
├── chunkProcessor.js            # Chunk processing utilities
├── server.js                    # Original synchronous server
├── server-jobified.js           # New job-based server
├── processExcel.js              # Excel processing (chunked)
├── generate.js                  # PDF generation
├── report-constructor-engine.js # Report builder (chunked)
├── public/
│   ├── index.html              # Frontend HTML
│   └── jobPoller.js            # Frontend polling utility
├── netlify/
│   └── functions/
│       └── api.js              # Netlify function wrapper
├── netlify.toml                # Netlify configuration
└── package.json
```

## 🔌 API Endpoints

### Job Management

- `POST /jobs/start-inspection` - Start file inspection
- `POST /jobs/start-processing` - Start file processing
- `POST /jobs/start-double-check` - Start double check comparison
- `POST /jobs/start-source-inspection` - Start source inspection
- `POST /jobs/start-report-build` - Build report
- `POST /jobs/start-template-inspection` - Inspect template
- `GET /jobs/:jobId/status` - Get job status
- `DELETE /jobs/:jobId` - Cancel job

### Response Format

**Starting a job:**
```json
{
  "ok": true,
  "jobId": "uuid-here"
}
```

**Job status:**
```json
{
  "ok": true,
  "id": "uuid-here",
  "type": "processing",
  "status": "processing",
  "progress": 75,
  "message": "Processing chunk 3/4",
  "result": null,
  "error": null
}
```

**Completed job:**
```json
{
  "ok": true,
  "status": "completed",
  "progress": 100,
  "result": {
    "excel": "/output/file.xlsx",
    "diagnostics": {...}
  }
}
```

## 🎯 Frontend Usage Example

```javascript
// Include jobPoller.js in your HTML
<script src="/jobPoller.js"></script>

// Start a job
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('mappings', JSON.stringify(mappings));
// ... other params

const jobId = await startJob('/jobs/start-processing', formData);

// Poll for status
const progressDiv = document.getElementById('progress');

jobPoller.startPolling(
  jobId,
  (progress, message) => {
    updateProgressUI(progressDiv, progress, message);
  },
  (result) => {
    console.log('Success:', result);
    // Show download links for result.excel, result.pdf
  },
  (error) => {
    alert('Error: ' + error.message);
  }
);
```

## ⚙️ Configuration

Edit `config.js` untuk customize:

```javascript
CHUNK_SIZES: {
  EXCEL_INSPECTION: 1000,   // Rows per chunk
  EXCEL_PROCESSING: 500,
  REPORT_BUILDING: 500,
  DOUBLE_CHECK: 500
},
JOB_MAX_AGE: 3600000,       // 1 hour
```

## 🐛 Troubleshooting

### Timeout di Netlify
- Pastikan menggunakan `server-jobified.js` (job-based version)
- Check CHUNK_SIZES di config.js - reduce jika masih timeout
- Netlify free plan: max 10 detik per function call

### Jobs Hilang Setelah Deploy
- Gunakan `STORAGE_TYPE=file` (default)
- Jobs disimpan di `/tmp` yang persistent selama function instance hidup

### Memory Issues
- Reduce CHUNK_SIZES

## 🚀 Features

- **Job-Based Processing**: Semua operasi berat dijalankan async dengan job tracking
- **Chunked Processing**: Break down large files menjadi chunks untuk menghindari timeout
- **Progress Tracking**: Real-time progress updates untuk setiap job
- **File-Based Persistence**: Jobs disimpan di filesystem untuk Netlify compatibility
- **Auto Cleanup**: Automatic cleanup untuk old jobs dan uploaded files

## 📋 Prerequisites

- Node.js >= 14.0.0
- npm atau yarn
- Google Chrome (untuk PDF generation)

## 🛠 Installation

```bash
npm install --legacy-peer-deps
```

## 🏃 Running Locally

### Development Mode (Old Sync Server)
```bash
npm start
```
Server akan berjalan di `http://localhost:3000`

### Job-Based Server (New)
```bash
node server-jobified.js
```

## 🌐 Deployment ke Netlify

### 1. Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit with chunked processing"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Connect ke Netlify

1. Login ke [Netlify](https://netlify.com)
2. Click "New site from Git"
3. Pilih repository GitHub Anda
4. Build settings akan auto-detected dari `netlify.toml`
5. Click "Deploy site"

### 3. Environment Variables (Optional)

Di Netlify dashboard > Site settings > Environment variables:

```
STORAGE_TYPE=file
STORAGE_PATH=/tmp/jobs
NODE_VERSION=18
```

## 📁 Struktur File

```
tariff-app/
├── config.js                    # Configuration untuk chunking
├── jobManager.js                # Job queue manager
├── chunkProcessor.js            # Chunk processing utilities
├── server.js                    # Original synchronous server
├── server-jobified.js           # New job-based server
├── processExcel.js              # Excel processing (chunked)
├── generate.js                  # PDF generation
├── report-constructor-engine.js # Report builder (chunked)
├── public/
│   ├── index.html              # Frontend HTML
│   └── jobPoller.js            # Frontend polling utility
├── netlify/
│   └── functions/
│       └── api.js              # Netlify function wrapper
├── netlify.toml                # Netlify configuration
└── package.json
```

## 🔌 API Endpoints

### Job Management

- `POST /jobs/start-inspection` - Start file inspection
- `POST /jobs/start-processing` - Start file processing
- `POST /jobs/start-double-check` - Start double check comparison
- `POST /jobs/start-source-inspection` - Start source inspection
- `POST /jobs/start-report-build` - Build report
- `POST /jobs/start-template-inspection` - Inspect template
- `GET /jobs/:jobId/status` - Get job status
- `DELETE /jobs/:jobId` - Cancel job

### Response Format

**Starting a job:**
```json
{
  "ok": true,
  "jobId": "uuid-here"
}
```

**Job status:**
```json
{
  "ok": true,
  "id": "uuid-here",
  "type": "processing",
  "status": "processing",
  "progress": 75,
  "message": "Processing chunk 3/4",
  "result": null,
  "error": null
}
```

**Completed job:**
```json
{
  "ok": true,
  "status": "completed",
  "progress": 100,
  "result": {
    "excel": "/output/file.xlsx",
    "diagnostics": {...}
  }
}
```

## 🎯 Frontend Usage Example

```javascript
// Include jobPoller.js in your HTML
<script src="/jobPoller.js"></script>

// Start a job
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('mappings', JSON.stringify(mappings));
// ... other params

const jobId = await startJob('/jobs/start-processing', formData);

// Poll for status
const progressDiv = document.getElementById('progress');

jobPoller.startPolling(
  jobId,
  (progress, message) => {
    updateProgressUI(progressDiv, progress, message);
  },
  (result) => {
    console.log('Success:', result);
    // Show download links for result.excel, result.pdf
  },
  (error) => {
    alert('Error: ' + error.message);
  }
);
```

## ⚙️ Configuration

Edit `config.js` untuk customize:

```javascript
CHUNK_SIZES: {
  EXCEL_INSPECTION: 1000,   // Rows per chunk
  EXCEL_PROCESSING: 500,
  REPORT_BUILDING: 500,
  DOUBLE_CHECK: 500
},
JOB_MAX_AGE: 3600000,       // 1 hour
```

## 🐛 Troubleshooting

### Timeout di Netlify
- Pastikan menggunakan `server-jobified.js` (job-based version)
- Check CHUNK_SIZES di config.js - reduce jika masih timeout
- Netlify free plan: max 10 detik per function call

### Jobs Hilang Setelah Deploy
- Gunakan `STORAGE_TYPE=file` (default)
- Jobs disimpan di `/tmp` yang persistent selama function instance hidup

### Memory Issues
- Reduce CHUNK_SIZES
- Pastikan file cleanup berjalan (check AUTO_CLEANUP_ENABLED)

### Jobs Hilang

**Issue**: Job status returns 404 setelah beberapa saat

**Cause**: Different function instances tidak share memory

**Solution**:
- File-based storage sudah implemented ✅
- Jobs di `/tmp` persistent selama instance hidup
- Auto cleanup setelah 1 jam

## 📝 License

MIT

## 🤝 Contributing

Pull requests are welcome!
