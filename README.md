# Pocket Loky setup

Pocket Loky uses React, CSS, and Framer Motion. Supabase handles Google sign-in and stores encrypted logins. This folder contains the app and its database setup. To connect it, you’ll need your own Supabase and Google Cloud projects.

## 1. Get the code running on your computer

Install Node.js 22.12 or newer, then unzip Pocket Loky. Open the unzipped folder in your editor. In the editor’s terminal, run:

```sh
npm install
npm run dev
```

Open the local address the terminal prints, usually `http://localhost:5173`. You can see the sign-in page right away. The Google button becomes available after the Supabase settings are in place.

## 2. Create the Supabase database

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. In your project's **SQL Editor**, choose **New query**.
3. Open the file `supabase/migrations/202611150001_pocket_loky.sql` from this folder. Copy all its contents into the query and click **Run** once.
4. In the project’s **Connect** dialog or **API Keys** page, copy the **Project URL** and **Publishable key**.
5. In this folder, copy `.env.example` to a new file called `.env.local`, and replace its two example values. Use the publishable key here. Keep Supabase secret and service-role keys out of this file and the frontend.

## 3. Turn on Google sign-in

1. In Supabase, open **Authentication → Sign In / Providers → Google** and copy the callback URL shown there.
2. In the [Google Cloud console](https://console.cloud.google.com/), create or select a project and configure the **Google Auth Platform** consent screen. Use **Pocket Loky** as the app name.
3. Create an OAuth client with the application type **Web application**. Paste the Supabase callback URL into Google’s **Authorized redirect URIs**. That URL comes from Supabase and ends with `/auth/v1/callback`.
4. Copy the Google client ID and secret back into the Google provider panel in Supabase. Enable and save the provider. Keep the Google client secret in Supabase.
5. In Supabase **Authentication → URL Configuration**, add your app’s local URL, with its port, to **Redirect URLs**. Use the same local URL as your **Site URL** while testing. If Google’s consent screen is in testing mode, add your Google account as a test user.
6. Stop the local server and run `npm run dev` again so it picks up `.env.local`. Open Pocket Loky and choose **Continue with Google**.

[Supabase Google sign-in instructions](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [Redirect URL settings](https://supabase.com/docs/guides/auth/redirect-urls)

## 4. Try it with a fake password

1. Sign in. Your Google display name should appear beside **Sign out**.
2. Select **Create vault**. Save the generated recovery key in a secure place outside Pocket Loky. You won’t type it on this browser for regular use.
3. Add a test login. Select it, choose **Show**, and then **Copy**. Sign out and sign in again to confirm the entry is still there.
4. Open the app in a second browser. Sign in to the same Google account and use your recovery key there to open the same vault. You can read the key from a trusted browser’s **Recovery key** button if needed.
5. Sign in with a second Google account and confirm its vault starts empty. In the Supabase table editor, confirm that login records contain encrypted payloads instead of readable names, usernames, or passwords.

## 5. Put it online

Use any static web host with HTTPS for the React frontend. Keep Supabase as the backend. Run `npm run build`, then publish the generated `dist` folder. If your host builds for you, set the same two public Supabase variables in its build settings. Set the deployed site address as your Supabase **Site URL** and add it to your **Redirect URLs**. Test with fake entries on the actual HTTPS address before inviting users.

## What the encryption protects

The browser encrypts the full login record before upload. Supabase holds the encrypted records and a copy of the vault key encrypted under the user’s recovery key. It stores neither readable login fields nor the raw keys. Database access alone doesn’t reveal the passwords. Anyone who can change the live frontend could modify it to capture passwords when users type or reveal them. Treat the app as a prototype and get a security review before storing real passwords. If all trusted browsers and the recovery key are lost, the saved passwords cannot be recovered through Google.

Run `npm test` to check the encryption and recovery code.
