const GOOGLE_ADS_RESOURCE_PATH = /^\/aw\/assetreport\/associations\/?$/i;
const GOOGLE_ADS_CAMPAIGNS_PATH = /^\/aw\/campaigns\/?$/i;
const GOOGLE_ADS_MANAGER_ACCOUNTS_PATH = /^\/aw\/(?:manager-accounts\/)?accounts\/?$/i;

function normalizedFolderName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

function validResourceBookmark(node) {
  const title = String(node?.title || '').trim().slice(0, 240);
  const rawUrl = String(node?.url || '').trim().slice(0, 4096);
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== 'https://ads.google.com' || !GOOGLE_ADS_RESOURCE_PATH.test(parsed.pathname)
        || parsed.username || parsed.password) return null;
    return { title, url: rawUrl };
  } catch {
    return null;
  }
}

function validCampaignBookmark(node) {
  const title = String(node?.title || '').trim().slice(0, 240);
  const rawUrl = String(node?.url || '').trim().slice(0, 4096);
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== 'https://ads.google.com' || !GOOGLE_ADS_CAMPAIGNS_PATH.test(parsed.pathname) || parsed.username || parsed.password) return null;
    return { title, url: rawUrl };
  } catch { return null; }
}

function validManagerAccountsBookmark(node) {
  const title = String(node?.title || '').trim().slice(0, 240);
  const rawUrl = String(node?.url || '').trim().slice(0, 4096);
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== 'https://ads.google.com' || !GOOGLE_ADS_MANAGER_ACCOUNTS_PATH.test(parsed.pathname)
        || parsed.username || parsed.password) return null;
    return { title, url: rawUrl };
  } catch { return null; }
}

function collectDescendantBookmarks(folder, output, campaignOutput, managerOutput) {
  for (const child of Array.isArray(folder?.children) ? folder.children : []) {
    const bookmark = validResourceBookmark(child);
    if (bookmark) output.push(bookmark);
    else {
      const campaignBookmark = validCampaignBookmark(child);
      if (campaignBookmark) campaignOutput.push(campaignBookmark);
      else {
        const managerBookmark = validManagerAccountsBookmark(child);
        if (managerBookmark) managerOutput.push(managerBookmark);
        else if (Array.isArray(child?.children)) collectDescendantBookmarks(child, output, campaignOutput, managerOutput);
      }
    }
  }
}

export function readGoogleAdsResourceBookmarkFolder(tree) {
  const bookmarks = [];
  const campaignBookmarks = [];
  const managerBookmarks = [];
  let folderCount = 0;
  let accountsFolderCount = 0;
  const visit = (node, parentTitle = '') => {
    const title = normalizedFolderName(node?.title);
    if (!node?.url && title === 'contas') {
      accountsFolderCount += 1;
      for (const child of Array.isArray(node?.children) ? node.children : []) {
        const managerBookmark = validManagerAccountsBookmark(child);
        const campaignBookmark = validCampaignBookmark(child);
        if (managerBookmark) managerBookmarks.push(managerBookmark);
        else if (campaignBookmark) campaignBookmarks.push(campaignBookmark);
        else if (!child?.url && normalizedFolderName(child?.title) === 'pag recursos') {
          folderCount += 1;
          collectDescendantBookmarks(child, bookmarks, campaignBookmarks, managerBookmarks);
        }
      }
      return;
    }
    if (!node?.url && title === 'pag recursos' && parentTitle === 'contas') {
      folderCount += 1;
      collectDescendantBookmarks(node, bookmarks, campaignBookmarks, managerBookmarks);
      return;
    }
    for (const child of Array.isArray(node?.children) ? node.children : []) visit(child, title);
  };
  for (const root of Array.isArray(tree) ? tree : []) visit(root);

  const unique = new Map();
  for (const bookmark of bookmarks) {
    const key = `${bookmark.url}\u0000${bookmark.title.toLocaleLowerCase()}`;
    if (!unique.has(key)) unique.set(key, bookmark);
  }
  const uniqueCampaigns = new Map();
  for (const bookmark of campaignBookmarks) {
    const key = `${bookmark.url}\u0000${bookmark.title.toLocaleLowerCase()}`;
    if (!uniqueCampaigns.has(key)) uniqueCampaigns.set(key, bookmark);
  }
  const uniqueManagers = new Map();
  for (const bookmark of managerBookmarks) {
    const key = `${bookmark.url}\u0000${bookmark.title.toLocaleLowerCase()}`;
    if (!uniqueManagers.has(key)) uniqueManagers.set(key, bookmark);
  }
  return { folderFound: accountsFolderCount > 0 || folderCount > 0, folderCount, accountsFolderCount, bookmarks: [...unique.values()], campaignBookmarks: [...uniqueCampaigns.values()], managerBookmarks: [...uniqueManagers.values()] };
}
