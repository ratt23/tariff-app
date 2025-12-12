# Cloudinary Integration Guide

This application uses Cloudinary for storing uploaded Excel files and generated reports. This replaces the local filesystem storage to support serverless environments like Netlify.

## Configuration

The integration relies on the following environment variables in your `.env` file:

```env
CLOUDINARY_CLOUD_NAME=Root
CLOUDINARY_API_KEY=325335631379199
CLOUDINARY_API_SECRET=2snKgSI3b-rwh8WlzjowmoVmONc
```

## How It Works

1.  **Uploads**: When you upload a file via the web interface, it is sent directly to Cloudinary storage (`tariff-app/uploads` folder).
2.  **Processing**: The server receives a Cloudinary URL instead of a local file path.
3.  **Downloading**: The server temporarily downloads the file from Cloudinary to a local `tmp/` directory to process it with `exceljs`.
4.  **Output**: Generated Excel reports are saved temporarily to `tmp/` and then uploaded to Cloudinary (`tariff-app/output` folder).
5.  **Cleanup**: Local temporary files are automatically deleted after processing/uploading.

## Troubleshooting

### File Upload Fails
- Check your internet connection.
- Verify the Cloudinary credentials in `.env`.
- Check the server logs for specific error messages from Cloudinary.

### Processing Fails
- Ensure the file is a valid Excel file.
- Check if the file was correctly uploaded to Cloudinary (you can check your Cloudinary dashboard).
- If you see "No URL provided" error, the upload might have failed silently or the file object structure is incorrect.

### Cleanup
- Files in Cloudinary are **NOT** automatically deleted by the application to prevent data loss. You may want to set up a retention policy in your Cloudinary dashboard or manually clean up old files in the `tariff-app` folder.
