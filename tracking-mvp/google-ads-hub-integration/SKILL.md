---
name: google-ads-hub-integration
description: Planejar, diagnosticar e implementar a integração Google Ads do Hub: relatórios, ações de campanha, acesso MCC e envio/preparação de conversões ClickBank ou GuruMedia. Use para esse fluxo; não para gestão de anúncios fora do Hub.
---

# Google Ads integration for the Hub

Use this skill when the user asks about connecting the Hub to Google Ads, automating Hub reports or ClickBank conversion imports, or expanding that integration.

## Start with the current system state

- Read [the integration research and roadmap](references/integration-research-and-roadmap.md) for the current architecture, decisions, prerequisites, capability map, and official sources.
- Treat its recorded state as dated project evidence, not proof of current server or Google Cloud configuration. The user reported that server deployments were completed; that report is the working assumption unless newer evidence supersedes it, but do not claim live verification.
- For implementation in the local Hub, also follow `$painel-operacao-google-ads` and `$repo-change-commit-flow`. Preserve unrelated working changes and never test with the active IndexedDB or real sales data.

## Current capability map and API choice

- The Hub's Google Ads integration is **not read-only overall**. Keep its separate surfaces distinct:
  - `google-ads-readonly.php` / `google-ads-readonly-service.php` read accounts, reports, configuration, search terms, geographic data, tracking coverage, final URLs, and conversion-action inventory. Reading a conversion action does not create or change it.
  - `google-ads-campaign-action.php` / `google-ads-campaign-action-service.php` make guarded campaign/resource changes, including campaign pause/resume, campaign creation, and supported targeting, URL, sitelink, keyword, CPA, asset, and duplication operations. Writes require server-side feature switches and MCC allowlists, plus operation-specific validation and UI confirmation.
- GuruMedia's per-MCC selector reads existing actions and stores the selected `resource_name` in this browser. A separate action now synchronizes Track → MCC → action routes to the private server; syncing disables automatic sending for review. It does not create or modify Google Ads actions.
- The local GuruMedia implementation now sends eligible sales through Data Manager API: one exact Hub outbound click, at least one real `gclid`/`gbraid`/`wbraid` (all captured types may be sent together), original conversion time, positive commission and valid currency. It rejects duplicate click rows, invalid IDs, and conflicting values of the same ID type. It has a `validateOnly` step, explicit manual send, one-sale outbox and asynchronous status polling in the existing worker/Cron. Automatic sending is off by default and handles only new sales; no backfill. Conversion MCCs use the private allowlist `tracking_google_ads_conversion_upload_manager_customer_ids`, isolated from campaign-write MCCs.
- On 2026-11-07, the user's authorized `validateOnly` attempt for the real GuruMedia sale was blocked locally before the Data Manager request because the prior service required exactly one identifier type. The local fix accepts the captured identifiers together; only `gurumedia-sales-service.php` remains to be published for this correction. See the current package README before deployment.
- The ClickBank export API prepares/downloads a manual CSV; it is not an automatic Google Ads upload and remains ClickBank-only. The GuruMedia service/worker and SQL migration are staged locally in `tracking-mvp/deploy/staging/gurumedia-sales/`; do not claim this increment is live until the user deploys/runs it.
- If the Hub needs to send offline conversions, use the **Data Manager API** as the current documented path. Do not build a new workflow around the restricted legacy `UploadClickConversions` method without rechecking Google's current guidance and the project's eligibility.
- For ClickBank, compare the existing integração externa sender with ClickBank's official native Google Ads S2S integration before building or changing an upload path. That native integration is ClickBank-specific. GuruMedia has a separate local Data Manager sender; verify its route, sale eligibility and duplicate-sender state independently.
- Keep Hub page-view/outbound tracking, ClickBank INS v8 ingestion, GuruMedia postbacks, Google Ads reporting, campaign/resource changes, and conversion uploading as distinct flows. Join them only through verified identifiers and explicit mappings.

## Current and next steps

1. Treat campaign/resource writes as an existing Hub capability, but verify the exact server feature switches, MCC allowlists, and deployment state before relying on a specific live operation. Their existence does not make the conversion sender operational.
2. For a GuruMedia sale, verify the sale-to-outbound-click association and whether that exact click contains a real `gclid`, `gbraid`, or `wbraid`. Keep `sub6`/Hub `click_id`, `gclid`, `extclid`, `affSub1`, ClickBank `clickId`, and TID distinct.
3. Determine which sender is currently active for the conversion action (integração externa, network-native, or Hub). Select one sender per action and prevent duplicates before enabling any Hub upload.
4. For the implemented Hub sender, apply the SQL in the Tracking MVP database, deploy only the changed files listed at the top of the package README, synchronize routes, validate the exact real sale without sending, then verify integração externa/other senders before explicit manual send. Follow the package README; do not create a second Cron or use archived files.
5. Keep ClickBank's manual CSV as its existing fallback. Do not treat it as a GuruMedia export. Do not enable automatic sending until a single-sender plan is confirmed for each action. No historical backfill, integração externa cutover or conversion-goal change without explicit authorization. A manual GuruMedia upload still requires confirmation because Google will receive a real conversion that cannot be undone from the Hub.

## Safety and implementation boundaries

- Keep OAuth refresh tokens, client secrets, and any API credentials on the private server side; never put them in browser code, Hub static files, source control, or logs.
- Use minimum required access for each feature. Any live conversion upload, account authorization, MCC changes, conversion-action changes, campaign mutation, or integração externa cutover requires explicit user authorization at the point of action.
- Do not upload checkout impressions, tests, ambiguous sales, or inferred GCLIDs as purchases. A Hub `extclid` is not a Google click ID by itself.
- The project data contract defines the affiliate commission (`totalAccountAmount`, USD) as conversion value for a future sale upload. Preserve that decision unless the user explicitly revises it; never silently substitute gross checkout value.
- Avoid collecting or sending buyer personal data for enhanced conversions unless the user explicitly asks for that design and privacy, consent, and security handling have been reviewed.
- Recheck official documentation during implementation because Google access rules, APIs, and versions change. Separate confirmed facts, local evidence, assumptions, and recommendations in the response.

## Hostinger deployment packaging

- When a Google Ads integration change needs server publication, read `tracking-mvp/deploy/PADRAO-DEPLOY-SERVIDOR.md` and that increment's package README before giving upload instructions.
- Keep each incremental release in its own staging package. The destination-specific upload folder (for example, `hostinger-private-tools`) must contain only the files the user needs to copy for that release. Keep README and SQL/config instructions outside that upload folder; do not mix in artifacts from earlier deployments, backups, credentials, or unrelated files.
- The package README is authoritative for exact filenames and server destinations. Never ask the user to upload an entire staging tree. Present files grouped by server destination, with the local folder shown once per shared folder, clickable file links, upload order when relevant, and publication status.
- Preserve the public/private boundary in implementation and package instructions. In the user-facing deploy walkthrough, do not repeat a generic “keep outside `public_html`” warning when the exact destination is already identified as `private-tools`; mention the separation only when the destination is ambiguous or the package requires distinguishing public and private files. Credentials never belong in a deploy package.

## Automatic pause email rule reasons

- The initial email deployment supported only `automatic_negative_remaining`. The local Hub now sends a separate context for each of the four rules: `negative_remaining`, `product_performance`, `campaign_age`, and `campaign_zero_impressions`.
- The incremental package `deploy/staging/google-ads-pause-email-rule-reasons/` adds `pause_reason` to the existing outbox and replaces the private email helper and campaign action endpoint. The migration gives previously queued rows the legacy `negative_remaining` reason. The existing worker, SMTP configuration, Cron, and public wrapper remain unchanged.
- Status on 2026-10-30: package is prepared locally; no upload, schema change, or server validation has been reported. The user must run the idempotent SQL package in the existing private tracking database and replace the two private PHP files in the listed order before the updated emails can be sent.

