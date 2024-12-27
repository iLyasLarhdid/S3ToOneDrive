const AWS = require('aws-sdk');
const path = require("path");
const fs = require('fs').promises;
const axios = require('axios');
require('dotenv').config();

// remove this for production
// AWS S3 Configuration
const awsConfig = {
    endpoint: "http://host.docker.internal:4566", // Change to actual endpoint if needed
    region: "us-east-1",
    accessKeyId: "test",
    secretAccessKey: "test",
    s3ForcePathStyle: true,
};
AWS.config.update(awsConfig);

// Function to fetch a new access token using the refresh token
async function getOneDriveAccessToken() {
    console.log('Fetching OneDrive access token...');
    const refreshToken = process.env.ONEDRIVE_REFRESH_TOKEN;

    try {
        const response = await axios.post(
            `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: process.env.AZURE_CLIENT_ID,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
                scope: 'Files.ReadWrite.All offline_access',
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );

        if (response.status === 200) {
            console.log('Access token retrieved successfully.');
            return response.data.access_token;
        } else {
            console.error('Error retrieving access token:', response.data);
            throw new Error('Failed to fetch OneDrive access token.');
        }
    } catch (err) {
        console.error('Error in fetching access token:', err.message);
        throw err;
    }
}

// Function to resolve a shared folder using its name
async function resolveSharedFolder(folderName) {
    console.log(`Resolving shared folder: ${folderName}`);
    const accessToken = await getOneDriveAccessToken();

    try {
        // Get the list of shared items
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/me/drive/sharedWithMe`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        // Find the folder by name
        const sharedFolder = response.data.value.find(
            (item) => item.name === folderName && item.folder
        );

        if (!sharedFolder) {
            throw new Error(`Shared folder "${folderName}" not found.`);
        }

        console.log(`Shared folder resolved: ${JSON.stringify(sharedFolder)}`);
        return {
            driveId: sharedFolder.remoteItem.parentReference.driveId,
            itemId: sharedFolder.remoteItem.id,
        };
    } catch (err) {
        console.error('Error resolving shared folder:', err.message);
        throw err;
    }
}

// Function to upload a file to the shared folder
async function uploadFileToSharedFolder(driveId, folderItemId, filePath, fileName) {
    console.log(`Uploading file: ${filePath} to shared folder: driveId=${driveId}, folderItemId=${folderItemId}`);
    const accessToken = await getOneDriveAccessToken();

    try {
        const fileBuffer = await fs.readFile(filePath);

        // Upload the file to the shared folder
        const response = await axios.put(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderItemId}:/${fileName}:/content`,
            fileBuffer,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/octet-stream',
                },
            }
        );

        if (response.status === 201 || response.status === 200) {
            console.log('File uploaded successfully to shared folder.');
            return response.data;
        } else {
            console.error('Error uploading file to shared folder:', response.data);
            throw new Error('Failed to upload file to shared folder.');
        }
    } catch (err) {
        console.error('Error during file upload to shared folder:', err.message);
        throw err;
    }
}

// Helper function to download file from S3
async function downloadFileFromS3(bucketName, fileKey, downloadPath) {
    console.log(`Downloading file from S3 bucket: ${bucketName}, key: ${fileKey}`);
    const s3 = new AWS.S3();
    const params = { Bucket: bucketName, Key: fileKey };

    const fileStream = s3.getObject(params).createReadStream();
    const writeStream = require('fs').createWriteStream(downloadPath);

    return new Promise((resolve, reject) => {
        fileStream.pipe(writeStream);
        fileStream.on('error', (error) => {
            console.error('Error downloading file from S3:', error);
            reject(error);
        });
        writeStream.on('finish', async () => {
            try {
                const stats = await fs.stat(downloadPath);
                console.log(`File downloaded successfully to: ${downloadPath}, size: ${stats.size} bytes`);
                resolve();
            } catch (err) {
                console.error(`Error verifying downloaded file: ${err.message}`);
                reject(err);
            }
        });
        writeStream.on('error', (error) => {
            console.error('Error writing file to local path:', error);
            reject(error);
        });
    });
}

// Main Lambda handler
exports.handler = async (event) => {
    console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));
    try {
        const record = event.Records[0];
        const bucketName = record.s3.bucket.name;
        console.log("key : ",record.s3.object.key)
        const fileKey = decodeURIComponent(record.s3.object.key);
        console.log(`Processing bucket: ${bucketName}, file: ${fileKey}`);

        const timestamp = Date.now();
        const originalExtension = path.extname(fileKey);

        const downloadPath = path.join("/tmp", `download-${timestamp}${originalExtension}`);
        console.log('Starting file download from S3...');
        await downloadFileFromS3(bucketName, fileKey, downloadPath);
        console.log('File downloaded successfully from S3.');

        const fileStats = await fs.stat(downloadPath);
        if (fileStats.size === 0) {
            throw new Error('Downloaded file is empty.');
        }

        console.log('Resolving shared folder on OneDrive...');
        const sharedFolderName = process.env.ONEDRIVE_SHARED_FOLDER;
        const sharedFolder = await resolveSharedFolder(sharedFolderName);

        console.log('Uploading file to shared folder on OneDrive...');
        const uploadSuccess = await uploadFileToSharedFolder(
            sharedFolder.driveId,
            sharedFolder.itemId,
            downloadPath,
            fileKey
        );

        if (!uploadSuccess) {
            throw new Error('Failed to upload file to shared folder on OneDrive.');
        }

        console.log('File uploaded successfully to shared folder.');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `File uploaded successfully to shared folder "${sharedFolderName}"` }),
        };
    } catch (err) {
        console.error('Error in processing:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to process shared folder', error: err.message }),
        };
    }
};