# Nocturne Archive

Static GitHub Pages site with a private Discogs synchronisation.

## One-time GitHub setup

1. Create a new empty GitHub repository called `nocturne-archive`.
2. Upload these files to its main branch.
3. In **Settings → Secrets and variables → Actions**, add a repository secret named `DISCOGS_TOKEN` and paste the personal token created in Discogs.
4. In **Settings → Pages**, select **Deploy from a branch**, then select `main` and the root folder.
5. In the **Actions** tab, open **Sync Discogs collection** and select **Run workflow** once.

The action then refreshes the public collection each day. The token is stored only in GitHub Secrets and is never included in the published site.
