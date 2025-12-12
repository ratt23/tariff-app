const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');
const https = require('https');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload a file to Cloudinary
 * @param {string} filePath - Local path to file
 * @param {string} folder - Folder in Cloudinary (default: tariff-app/output)
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadFile = async (filePath, folder = 'tariff-app/output') => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            resource_type: 'raw', // Use 'raw' for non-image files like Excel
            folder: folder,
            use_filename: true,
            unique_filename: true
        });
        return result;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
};

/**
 * Get a temporary download URL for a private file (if needed)
 * or just return the secure_url
 */
const getDownloadUrl = (publicId) => {
    return cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true
    });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file
 */
const deleteFile = async (publicId) => {
    try {
        // For raw files, we need to specify resource_type: 'raw'
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        // Don't throw, just log
    }
};

/**
 * Extract public ID from a Cloudinary URL
 * This is a helper if we only have the URL
 */
const getPublicIdFromUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return null;
    try {
        // Example: https://res.cloudinary.com/demo/raw/upload/v1234567890/tariff-app/output/myfile.xlsx
        const parts = url.split('/upload/');
        if (parts.length < 2) return null;

        const pathParts = parts[1].split('/');
        // Remove version if present (starts with v)
        if (pathParts[0].startsWith('v')) {
            pathParts.shift();
        }
        // Join the rest to get public_id (including folder)
        // Note: For raw files, the extension is part of the public_id in some contexts, 
        // but verify based on how it was uploaded. 
        // Usually for raw resources, public_id includes the extension.
        return decodeURIComponent(pathParts.join('/'));
    } catch (e) {
        console.error('Error parsing public ID:', e);
        return null;
    }
};

/**
 * Download a file from a URL to a local temporary file
 * @param {string} url - The URL to download
 * @returns {Promise<string>} Path to the downloaded local file
 */
const downloadToTemp = (url) => {
    return new Promise((resolve, reject) => {
        if (!url) return reject(new Error('No URL provided'));

        // Handle local paths for backward compatibility or testing
        if (!url.startsWith('http')) {
            return resolve(url);
        }

        const ext = path.extname(url.split('?')[0]) || '.xlsx';
        // Use os.tmpdir() for system temp directory which works on Netlify/Lambda
        const os = require('os');
        const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`);

        const file = fs.createWriteStream(tempPath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(tempPath));
            });
        }).on('error', (err) => {
            fs.unlink(tempPath, () => { });
            reject(err);
        });
    });
};

module.exports = {
    cloudinary,
    uploadFile,
    getDownloadUrl,
    deleteFile,
    getPublicIdFromUrl,
    downloadToTemp
};
