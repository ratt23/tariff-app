const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('./cloudinaryConfig');

// Validate Cloudinary configuration
const requiredEnvVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    const errorMsg = `Missing required Cloudinary environment variables: ${missingVars.join(', ')}`;
    console.error('❌', errorMsg);
    console.error('Please set these variables in Netlify Dashboard > Site configuration > Environment variables');
    throw new Error(errorMsg);
}

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'tariff-app/uploads',
        resource_type: 'raw', // Important for Excel files
        public_id: (req, file) => {
            // Use jobId if provided, otherwise timestamp
            const prefix = req.body.jobId || Date.now();
            // Sanitize filename to be safe
            const sanitize = require('sanitize-filename');
            const safeName = sanitize(file.originalname).replace(/\s+/g, '_');
            return `${prefix}_${safeName}`;
        },
    },
});

console.log('✅ Cloudinary storage initialized successfully');
module.exports = storage;
