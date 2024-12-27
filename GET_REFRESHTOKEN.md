# How to Obtain a Refresh Token for OneDrive API

This guide explains the process of obtaining a refresh token for the OneDrive API. The refresh token is necessary to authenticate your application and retrieve an access token.

---

## Step 1: Register an Application in Azure Portal
1. Log in to the [Azure Portal](https://portal.azure.com/).
2. Navigate to **App registrations** and click **New registration**.
3. Provide a name for your app (e.g., `fileUploader`).
4. Set the supported account types:
   - Choose "Accounts in any organizational directory and personal Microsoft accounts".
5. Enter a redirect URI (e.g., `https://login.microsoftonline.com/common/oauth2/nativeclient` for native clients).
6. Click **Register**.

---

## Step 2: Configure API Permissions
1. In the Azure Portal, go to **API permissions**.
2. Add the following permissions: ( Microsoft Graph -> Delegated permissions)
   - `Files.ReadWrite.All` (Delegated)
   - `offline_access` (Delegated)
   - `User.Read` (Delegated)
3. Click **Grant admin consent** for your application.

---

## Step 3: Create a Client Secret
1. Navigate to **Certificates & secrets** in your app.
2. Under the **Client secrets** tab, click **New client secret**.
3. Provide a description (e.g., `fileUploaderSecret`) and set an expiration period.
4. Click **Add** and note down the **Value** and **Secret ID**. The client secret value will only be visible once, so make sure to save it securely.


---

## Step 4: Get the Authorization Code
1. Use the following URL in a browser to get the authorization code:
   ```plaintext
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=<YOUR_CLIENT_ID>&response_type=code&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&scope=Files.ReadWrite.All offline_access
   ```
   Replace `<YOUR_CLIENT_ID>` with the client ID of your registered application.
2. Sign in with your Microsoft account and consent to the requested permissions.
3. Copy the authorization code from the URL query parameters returned after successful login.

---

## Step 5: Exchange the Authorization Code for a Refresh Token
1. Use a tool like Postman to make a POST request to the token endpoint:
   ```plaintext
   https://login.microsoftonline.com/common/oauth2/v2.0/token
   ```
2. Set the request body as `x-www-form-urlencoded` with the following parameters:
   - `code`: The authorization code obtained from the previous step.
   - `client_id`: Your app's client ID.
   - `client_secret`: The secret value from **Certificates & secrets**.
   - `grant_type`: `authorization_code`
   - `redirect_uri`: `https://login.microsoftonline.com/common/oauth2/nativeclient`
3. Send the request.

### Example Request in Postman
- **Endpoint**: `https://login.microsoftonline.com/common/oauth2/v2.0/token`
- **Method**: POST
- **Headers**:
  - Content-Type: `application/x-www-form-urlencoded`
- **Body**:
   ```
   code=<AUTHORIZATION_CODE>
   client_id=<YOUR_CLIENT_ID>
   client_secret=<YOUR_CLIENT_SECRET>
   grant_type=authorization_code
   redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient
   ```

---

## Step 6: Save the Refresh Token
1. The response will include the refresh token.
2. Store the refresh token securely. It will be used to request access tokens without requiring user login.

---

## Notes
- Ensure the `redirect_uri` used in all steps matches the one set during app registration.
- The refresh token can be used to generate new access tokens by following the token refresh flow.
- Keep your client secret and refresh token secure to prevent unauthorized access.

If you have any issues, refer to the official [Microsoft Graph API documentation](https://learn.microsoft.com/en-us/graph/).
