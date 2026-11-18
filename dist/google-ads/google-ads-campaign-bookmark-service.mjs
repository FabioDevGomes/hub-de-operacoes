import {
  loadGoogleAdsCampaignBookmarks,
  matchGoogleAdsCampaignBookmark,
  saveGoogleAdsCampaignBookmarks,
} from './google-ads-campaign-bookmarks.mjs?v=2';
import {
  openGoogleAdsResourcesViaExtension,
  readGoogleAdsResourceBookmarksViaExtension,
} from './google-ads-resources-bridge.mjs?v=2';

export function loadOverviewCampaignBookmarks(storage = globalThis.localStorage) {
  return loadGoogleAdsCampaignBookmarks(storage);
}

export function matchOverviewCampaignBookmark(bookmarks, accountId, accountName = '') {
  return matchGoogleAdsCampaignBookmark(bookmarks, { accountId, accountName });
}

export async function beginOverviewCampaignBookmarkSync({ document = globalThis.document, window = globalThis.window } = {}) {
  const storage = window?.localStorage;
  const bookmarks = loadGoogleAdsCampaignBookmarks(storage);
  const refresh = readGoogleAdsResourceBookmarksViaExtension({ document, window })
    .then(snapshot => {
      if (snapshot?.ok !== true || snapshot.folderFound !== true) return { bookmarks, snapshot, refreshed: false };
      const saved = saveGoogleAdsCampaignBookmarks(snapshot.campaignBookmarks, storage);
      return { bookmarks: saved.bookmarks, snapshot, refreshed: saved.ok };
    })
    .catch(error => ({ bookmarks, error, refreshed: false }));
  return { bookmarks, refresh };
}

export function saveOverviewCampaignBookmarkSnapshot(snapshot, storage = globalThis.localStorage) {
  if (snapshot?.folderFound !== true) return loadGoogleAdsCampaignBookmarks(storage);
  return saveGoogleAdsCampaignBookmarks(snapshot.campaignBookmarks, storage).bookmarks;
}

export function openOverviewCampaignBookmark({ document = globalThis.document, window = globalThis.window, accountId, resourceUrl } = {}) {
  return openGoogleAdsResourcesViaExtension({ document, window, accountId, resourceUrl });
}
