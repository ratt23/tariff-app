const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('./cloudinaryConfig');

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'tariff-app/uploads',
        resource_type: 'raw', // Important for Excel files
        public_id: (req, file) => {
            // Use jobId if provided, otherwise timestamp
            const prefix = req.body.jobId || Date.now();
            // Remove extension from filename for public_id because Cloudinary adds it for raw files sometimes,
            // but for 'raw' resource_type, we often want to control the filename.
            // Let's keep it simple: prefix + original name
            // Sanitize filename to be safe
            const sanitize = require('sanitize-filename');
            const safeName = sanitize(file.originalname).replace(/\s+/g, '_');
            return `${prefix}_${safeName}`;
        },
    },
});

module.exports = storage;
