# 🚀 Deployment Guide: Netlify + GitHub

Panduan lengkap deploy aplikasi GraphiWorks ke Netlify dengan GitHub.

## 📋 Prerequisites

- [x] Akun GitHub
- [x] Akun Netlify (gratis)
- [x] Git terinstall di komputer
- [x] Aplikasi sudah di-test local

## 🔧 Step 1: Persiapan Repository GitHub

### 1.1 Initialize Git Repository

```bash
cd "d:\backup app\tariff app"
git init
git add .
git commit -m "Initial commit: Job-based processing with chunking"
```

### 1.2 Create GitHub Repository

1. Buka https://github.com/new
2. Repository name: `tariff-app` (atau nama lain)
3. Visibility: **Public** atau **Private**
4. **JANGAN** initialize dengan README (sudah ada)
5. Click **Create repository**

### 1.3 Push ke GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/tariff-app.git
git branch -M main
git push -u origin main
```

## 🌐 Step 2: Deploy ke Netlify

### 2.1 Login ke Netlify

1. Buka https://app.netlify.com/
2. Login dengan GitHub account (recommended)

### 2.2 Create New Site

1. Click **"Add new site"** → **"Import an existing project"**
2. Choose **"Deploy with GitHub"**
3. Authorize Netlify untuk access GitHub
4. Pilih repository `tariff-app`

### 2.3 Configure Build Settings

Netlify akan auto-detect dari `netlify.toml`, tapi verify:

- **Build command**: `npm install`
- **Publish directory**: `public`
- **Functions directory**: `netlify/functions`

### 2.4 Environment Variables (Optional)

Di **Site settings** → **Environment variables**, add:

```
STORAGE_TYPE=file
NODE_VERSION=18
```

### 2.5 Deploy!

1. Click **"Deploy site"**
2. Wait 2-3 minutes untuk build & deploy
3. Site akan accessible di: `https://random-name-xxxxx.netlify.app`

## ⚙️ Step 3: Configure Custom Domain (Optional)

1. **Site settings** → **Domain management**
2. Click **"Add custom domain"**
3. Follow instructions untuk point DNS

## 🧪 Step 4: Testing di Production

### 4.1 Test Basic Endpoints

```bash
# Replace with your Netlify URL
export SITE_URL="https://your-site.netlify.app"

# Test health check
curl $SITE_URL

# Test job status endpoint (should return 404)
curl $SITE_URL/jobs/test-id/status
```

### 4.2 Test File Upload

1. Buka `https://your-site.netlify.app`
2. Upload test Excel file
3. Verify progress bar muncul
4. Wait for completion
5. Download hasil Excel/PDF

### 4.3 Monitor Function Logs

Di Netlify dashboard:
1. Go to **Functions** tab
2. Click pada function `api`
3. View **Function log** untuk debug

## ⚠️ Known Limitations di Netlify Free Plan

### 1. Function Timeout
- **Max: 10 seconds** per function call
- Solution: Chunking sudah implemented ✅
- Monitor jika masih timeout, reduce `CHUNK_SIZES` di config.js

### 2. Bandwidth
- **100GB/month** (usually cukup)
- Monitor di Netlify dashboard

### 3. Build Minutes
- **300 minutes/month**
- Each deployment ~2-3 minutes

### 4. Functions Invocations
- **125k requests/month**
- Each file upload = multiple function calls (polling)

## 🔧 Troubleshooting

### ❌ Build Fails

**Error**: `npm install` fails

**Solution**:
```bash
# Locally
npm install --legacy-peer-deps
git add package-lock.json
git commit -m "Update package-lock"
git push
```

### ❌ Function Timeout

**Error**: `Task timed out after 10.00 seconds`

**Solution**: Reduce chunk sizes di `config.js`:
```javascript
CHUNK_SIZES: {
  EXCEL_INSPECTION: 500,  // was 1000
  EXCEL_PROCESSING: 250,  // was 500
  // etc
}
```

### ❌ PDF Generation Fails

**Error**: Chrome/Puppeteer tidak work di Netlify

**Solution**: Puppeteer **tidak supported** di Netlify Functions.

Options:
1. **Remove PDF generation** (only provide Excel)
2. **Use external service** like:
   - https://gotenberg.dev/ (self-hosted)
   - https://pdfshift.io/ (API)
3. **Deploy backend ke Railway/Render** instead

### ❌ Files Tidak Tersimpan

**Error**: Uploaded files hilang

**Cause**: Netlify Functions stateless, `/tmp` cleared between invocations

**Current Implementation**: Files di-cleanup immediately after processing ✅

### ❌ Jobs Hilang

**Error**: Job status returns 404 setelah beberapa saat

**Cause**: Different function instances

**Solution**: 
- File-based storage sudah implemented ✅
- Jobs di `/tmp` persistent selama instance hidup
- Auto cleanup setelah 1 jam

## 📊 Monitoring

### Netlify Analytics

Enable di: **Site settings** → **Analytics**
- Page views
- Function calls
- Bandwidth usage

### Custom Monitoring

Add to frontend:
```javascript
// Track job completion rate
fetch('/api/analytics', {
  method: 'POST',
  body: JSON.stringify({
    event: 'job_completed',
    jobId: jobId,
    duration: completedAt - startedAt
  })
});
```

## 🔄 Continuous Deployment

Setiap kali push ke GitHub `main` branch, Netlify akan auto-deploy:

```bash
# Make changes
git add .
git commit -m "Fix: reduce chunk size"
git push

# Netlify will auto-deploy in ~2 minutes
```

### Preview Deployments

Untuk test sebelum merge:
```bash
git checkout -b feature/new-feature
# make changes
git push origin feature/new-feature

# Create Pull Request di GitHub
# Netlify will create preview deployment
```

## 🎯 Production Checklist

Before going live:

- [ ] Test dengan berbagai ukuran file (small, medium, large)
- [ ] Verify semua endpoints work
- [ ] Test progress polling
- [ ] Test cancel functionality
- [ ] Monitor function execution time
- [ ] Set up custom domain (optional)
- [ ] Enable HTTPS (auto di Netlify)
- [ ] Add error tracking (Sentry, etc)
- [ ] Set up monitoring alerts

## 🆘 Support

Jika ada issues:

1. Check **Function logs** di Netlify dashboard
2. Check **Browser console** untuk frontend errors
3. Run `npm test` locally
4. Verify `netlify.toml` configuration
5. Contact Netlify support jika perlu

---

## 📚 Resources

- [Netlify Docs](https://docs.netlify.com/)
- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [Serverless HTTP](https://github.com/dougmoscrop/serverless-http)

Good luck! 🚀
