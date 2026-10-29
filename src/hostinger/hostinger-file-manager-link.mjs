const FILE_MANAGER_BASE = 'https://srv801-files.hstgr.io/d967fd1cf0fed38d/files/';
const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function hostingerFileManagerUrl(path) {
  const rawPath = String(path ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = rawPath ? rawPath.split('/') : [];
  if (!segments.length || segments.some(segment => !/^[\p{L}\p{N}._ -]+$/u.test(segment) || segment === '.' || segment === '..')) return null;
  return `${FILE_MANAGER_BASE}${segments.map(encodeURIComponent).join('/')}/`;
}

export function hostingerPreSellFileManagerUrl({ parentDomain, directory } = {}) {
  const host = String(parentDomain ?? '').trim().replace(/^\.+|\.+$/g, '').toLowerCase();
  const rawDirectory = String(directory ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!HOST_PATTERN.test(host)) return null;
  const segments = rawDirectory ? rawDirectory.split('/') : [];
  if (segments.some(segment => !/^[\p{L}\p{N}._ -]+$/u.test(segment) || segment === '.' || segment === '..')) return null;
  return hostingerFileManagerUrl(`domains/${host}/public_html/${rawDirectory}`);
}
