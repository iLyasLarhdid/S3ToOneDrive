# S3 to OneDrive File Uploader Lambda Function

## Overview
This Node.js Lambda function facilitates the transfer of files from an AWS S3 bucket to a shared folder on OneDrive. It:

1. Downloads a file from an S3 bucket upon a triggered event.
2. Resolves the shared folder on OneDrive.
3. Uploads the file to the resolved OneDrive shared folder.

## Prerequisites

1. **AWS Configuration**
   - Ensure the S3 bucket is configured to trigger the Lambda function on file uploads.
   - AWS credentials are not needed for LocalStack setup (used for development/testing).

2. **OneDrive API**
   - Register an application in the Azure portal to obtain:
     - `AZURE_CLIENT_ID`
     - `ONEDRIVE_REFRESH_TOKEN`
   - Grant appropriate permissions for OneDrive API (e.g., `Files.ReadWrite.All`).

3. **Environment Variables**
   The function uses environment variables for configuration. Add the following to your `.env` file:
   ```
   AZURE_CLIENT_ID=<your_client_id>
   ONEDRIVE_REFRESH_TOKEN=<your_refresh_token>
   ONEDRIVE_SHARED_FOLDER=<name_of_the_shared_folder>
   ```

4. **Local Development**
   - Set up [LocalStack](https://localstack.cloud/) for S3 endpoint testing.
   - Update `awsConfig` for development: `http://host.docker.internal:4566`.

5. **Lambda Execution Role**
   - Attach an IAM role to the Lambda function with permissions to access the S3 bucket.
   - Ensure the role includes `AmazonS3ReadOnlyAccess` or a custom policy with `s3:GetObject` permissions.

## Functionality

### AWS S3 Configuration
The function configures AWS SDK to connect to an S3 bucket. For local development, the `endpoint` is set to LocalStack.

```javascript
const awsConfig = {
    endpoint: "http://host.docker.internal:4566",
    region: "us-east-1",
    accessKeyId: "test",
    secretAccessKey: "test",
    s3ForcePathStyle: true,
};
AWS.config.update(awsConfig);
```

### OneDrive Access Token Retrieval
The function fetches a new access token using the provided refresh token:

```javascript
async function getOneDriveAccessToken() {
    const refreshToken = process.env.ONEDRIVE_REFRESH_TOKEN;
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
    return response.data.access_token;
}
```

### Shared Folder Resolution
The function locates the shared folder in OneDrive using the name provided in environment variables:

```javascript
async function resolveSharedFolder(folderName) {
    const accessToken = await getOneDriveAccessToken();
    const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/drive/sharedWithMe`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const sharedFolder = response.data.value.find(
        (item) => item.name === folderName && item.folder
    );
    return {
        driveId: sharedFolder.remoteItem.parentReference.driveId,
        itemId: sharedFolder.remoteItem.id,
    };
}
```

### File Upload to OneDrive
The file is uploaded to the resolved OneDrive shared folder:

```javascript
async function uploadFileToSharedFolder(driveId, folderItemId, filePath, fileName) {
    const accessToken = await getOneDriveAccessToken();
    const fileBuffer = await fs.readFile(filePath);
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
    return response.data;
}
```

### File Download from S3
The function uses the AWS S3 SDK to download the file to a temporary directory:

```javascript
async function downloadFileFromS3(bucketName, fileKey, downloadPath) {
    const s3 = new AWS.S3();
    const params = { Bucket: bucketName, Key: fileKey };
    const fileStream = s3.getObject(params).createReadStream();
    const writeStream = require('fs').createWriteStream(downloadPath);

    return new Promise((resolve, reject) => {
        fileStream.pipe(writeStream);
        fileStream.on('error', reject);
        writeStream.on('finish', resolve);
    });
}
```

### Lambda Handler
The Lambda handler orchestrates the steps:

1. Downloads the file from S3.
2. Resolves the shared folder.
3. Uploads the file to OneDrive.

```javascript
exports.handler = async (event) => {
    try {
        const record = event.Records[0];
        const bucketName = record.s3.bucket.name;
        const fileKey = decodeURIComponent(record.s3.object.key);

        const downloadPath = path.join("/tmp", `download-${Date.now()}${path.extname(fileKey)}`);
        await downloadFileFromS3(bucketName, fileKey, downloadPath);

        const sharedFolderName = process.env.ONEDRIVE_SHARED_FOLDER;
        const sharedFolder = await resolveSharedFolder(sharedFolderName);

        const uploadSuccess = await uploadFileToSharedFolder(
            sharedFolder.driveId,
            sharedFolder.itemId,
            downloadPath,
            fileKey
        );

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `File uploaded successfully to shared folder "${sharedFolderName}"` }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error processing file', error: err.message }),
        };
    }
};
```

## Error Handling

- Logs detailed error messages for debugging.
- Throws errors for missing or invalid configurations, network failures, or file-related issues.

## Notes

1. **Temporary Storage**: Files are downloaded to `/tmp`, which has a 512MB limit in AWS Lambda.
2. **Scaling**: Ensure OneDrive API rate limits are not exceeded.
3. **Production Deployment**: Remove LocalStack configurations and set proper AWS and Azure credentials.
4. **Monitoring and Logs**:
   - Use CloudWatch Logs to monitor function execution and debug issues.
   - Implement structured logging for easier log parsing.
5. **Testing and Debugging**:
   - Use AWS SAM or LocalStack for local testing.
   - Mock the OneDrive API in tests to simulate API behavior.

## Example Trigger Event
A sample S3 event to trigger the Lambda function:

```json
{
    "Records": [
        {
            "s3": {
                "bucket": {
                    "name": "my-s3-bucket"
                },
                "object": {
                    "key": "example.txt"
                }
            }
        }
    ]
}
```

