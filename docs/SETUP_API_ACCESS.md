# Getting API access

Easiest path: configure the OAuth app(s) below once on the server, then use the **Connect** button next to each channel on *Pages & Fetch*. You can always paste a token under **Advanced** instead. Register these redirect URIs (replace the host with `APP_BASE_URL`):

```
https://dashboard.example.com/api/oauth/google/callback
https://dashboard.example.com/api/oauth/meta/callback
https://dashboard.example.com/api/oauth/linkedin/callback
```

## Google Analytics 4 (service account, recommended)
1. Google Cloud Console → IAM → Service accounts → create one → Keys → add JSON key.
2. Enable the **Google Analytics Data API** in the project.
3. GA4 → Admin → Property access management → add the service-account email as **Viewer**.
4. In the dashboard add a *Website (GA4)* channel, enter the numeric **Property ID** (Admin → Property settings), open **Advanced** and paste the JSON key (or set `GOOGLE_APPLICATION_CREDENTIALS`). Access tokens are minted automatically.

## YouTube
1. Google Cloud → enable **YouTube Data API v3** and **YouTube Analytics API**.
2. OAuth consent screen + OAuth client (Web). Put the client ID/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
3. Add the channel (ID starts with `UC`, from youtube.com/account_advanced), press **Connect with Google** with the account that owns the channel. Scopes: `youtube.readonly`, `yt-analytics.readonly`.
4. An API key alone only returns the subscriber count and videos — views/watch time need OAuth.

## Facebook & Instagram (Meta)
1. developers.facebook.com → create an app (Business). Add **Facebook Login**. Put `META_APP_ID` / `META_APP_SECRET` in `.env`.
2. Instagram must be a Business/Creator account linked to a Facebook Page. Instagram insights need ≥ 100 followers and return ~30 days of daily history.
3. Permissions: `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` (App Review is required for use beyond your own accounts).
4. Page ID: Page → About → Page transparency; Instagram Business account ID: Graph API Explorer `GET /{page-id}?fields=instagram_business_account`.
5. Press **Connect with Meta**. Page tokens do not expire; user tokens are extended automatically ~10 days before expiry.
Meta retired `impressions`/`page_impressions` metrics; the dashboard uses the current *views* / *media view* metrics.

## LinkedIn
1. linkedin.com/developers → create an app and request the **Community Management API** product (needed for organization analytics).
2. Put `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` in `.env`. Scopes: `r_organization_social`, `r_organization_admin`.
3. Organization ID: the number in `linkedin.com/company/<id>/admin`. The connecting user must be an admin of the page.
4. LinkedIn only keeps ~12 months of share statistics; the first fetch backfills what exists. Refresh tokens are only issued to approved partners — otherwise reconnect when the (60-day) token expires; you are emailed 7 days before.

## When something shows "Needs reconnect"
The authorization expired or was revoked. Press **Reconnect**. Details for admins are on *Fetch history → Details*.
