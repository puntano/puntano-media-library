import { create } from 'zustand';
import { getVersion } from '@tauri-apps/api/app';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri, tauriApi } from '../services/tauriApi';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  releaseUrl: string;
  canInstallInApp: boolean;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number;
}

interface CheckUpdateOptions {
  silent?: boolean;
  openModalOnAvailable?: boolean;
}

interface UpdaterState {
  currentVersion: string;
  status: UpdaterStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress;
  lastCheckedAt: number | null;
  errorMessage: string | null;
  isUpdateModalOpen: boolean;

  initUpdater: () => Promise<void>;
  checkForUpdates: (options?: CheckUpdateOptions) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdatePrompt: () => void;
  setUpdateModalOpen: (open: boolean) => void;
  openReleaseInBrowser: () => Promise<void>;
}

const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/puntano/puntano-media-library/releases/latest';
const GITHUB_RELEASES_BASE =
  'https://github.com/puntano/puntano-media-library/releases';
const DISMISSED_VERSION_STORAGE_KEY = 'puntano_dismissed_update_version';

let activeNativeUpdate: Update | null = null;

function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, '');
}

/**
 * Compares two semver strings (e.g. "0.4.2" vs "0.4.1").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const cleanA = normalizeVersion(a).split('-')[0];
  const cleanB = normalizeVersion(b).split('-')[0];
  const partsA = cleanA.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

async function releaseNativeUpdateResource(): Promise<void> {
  if (activeNativeUpdate) {
    const prev = activeNativeUpdate;
    activeNativeUpdate = null;
    try {
      await prev.close();
    } catch {
      // Ignore already-closed resource errors
    }
  }
}

function getDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  currentVersion: '0.4.2',
  status: 'idle',
  updateInfo: null,
  downloadProgress: {
    downloadedBytes: 0,
    totalBytes: null,
    percent: 0,
  },
  lastCheckedAt: null,
  errorMessage: null,
  isUpdateModalOpen: false,

  initUpdater: async () => {
    if (isTauri()) {
      try {
        const ver = await getVersion();
        if (ver) {
          set({ currentVersion: normalizeVersion(ver) });
        }
      } catch {
        // Keep fallback version
      }
    }
  },

  checkForUpdates: async (options?: CheckUpdateOptions) => {
    const silent = options?.silent ?? false;
    const openModalOnAvailable = options?.openModalOnAvailable ?? false;

    const currentStatus = get().status;
    if (
      currentStatus === 'checking' ||
      currentStatus === 'downloading' ||
      currentStatus === 'installing' ||
      currentStatus === 'restarting'
    ) {
      return;
    }

    await get().initUpdater();
    const localVersion = get().currentVersion;

    set({
      status: 'checking',
      errorMessage: null,
    });

    // 1. Primary path: Tauri native signed updater (checks latest.json & verifies Minisign pubkey)
    if (isTauri()) {
      try {
        const update = await check({ timeout: 15_000 });
        await releaseNativeUpdateResource();

        if (update) {
          activeNativeUpdate = update;
          const cleanRemote = normalizeVersion(update.version);
          const info: UpdateInfo = {
            version: cleanRemote,
            currentVersion: normalizeVersion(update.currentVersion || localVersion),
            date: update.date,
            body: update.body,
            releaseUrl: `${GITHUB_RELEASES_BASE}/tag/v${cleanRemote}`,
            canInstallInApp: true,
          };

          const wasDismissed = getDismissedVersion() === cleanRemote;
          set({
            status: 'available',
            updateInfo: info,
            lastCheckedAt: Date.now(),
            errorMessage: null,
            isUpdateModalOpen:
              openModalOnAvailable || (!silent && true) || (silent && !wasDismissed),
          });
          return;
        }

        set({
          status: 'up-to-date',
          updateInfo: null,
          lastCheckedAt: Date.now(),
          errorMessage: null,
        });
        return;
      } catch (nativeErr: unknown) {
        const rawErrMsg =
          nativeErr instanceof Error ? nativeErr.message : String(nativeErr);

        // Fallback check against GitHub Releases REST API (handles releases published prior to latest.json
        // or verifies whether the installed version is already the newest published tag)
        try {
          const resp = await fetch(GITHUB_LATEST_RELEASE_API, {
            headers: { Accept: 'application/vnd.github+json' },
          });
          if (resp.ok) {
            const releaseJson = (await resp.json()) as {
              tag_name?: string;
              body?: string;
              published_at?: string;
              html_url?: string;
              draft?: boolean;
              prerelease?: boolean;
            };

            if (releaseJson.tag_name && !releaseJson.draft && !releaseJson.prerelease) {
              const remoteVersion = normalizeVersion(releaseJson.tag_name);
              await releaseNativeUpdateResource();

              if (compareSemver(remoteVersion, localVersion) <= 0) {
                set({
                  status: 'up-to-date',
                  updateInfo: null,
                  lastCheckedAt: Date.now(),
                  errorMessage: null,
                });
                return;
              }

              const info: UpdateInfo = {
                version: remoteVersion,
                currentVersion: localVersion,
                date: releaseJson.published_at,
                body: releaseJson.body,
                releaseUrl:
                  releaseJson.html_url || `${GITHUB_RELEASES_BASE}/tag/v${remoteVersion}`,
                canInstallInApp: false,
              };

              const wasDismissed = getDismissedVersion() === remoteVersion;
              set({
                status: 'available',
                updateInfo: info,
                lastCheckedAt: Date.now(),
                errorMessage: null,
                isUpdateModalOpen:
                  openModalOnAvailable || (!silent && true) || (silent && !wasDismissed),
              });
              return;
            }
          }
        } catch {
          // Ignore fallback network error and handle below
        }

        if (silent) {
          // Stay completely non-intrusive when offline on startup
          set({ status: 'idle', errorMessage: null });
          return;
        }

        tauriApi.logFrontendEvent(
          'warn',
          'updater.check',
          `Update check failed: ${rawErrMsg}`
        );
        set({
          status: 'error',
          lastCheckedAt: Date.now(),
          errorMessage:
            'Could not reach the GitHub update server. Please verify your internet connection and try again.',
        });
        return;
      }
    }

    // 2. Browser dev/preview fallback: read-only GitHub Releases check
    try {
      const resp = await fetch(GITHUB_LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!resp.ok) {
        throw new Error(`GitHub API HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as {
        tag_name?: string;
        body?: string;
        published_at?: string;
        html_url?: string;
      };
      const remoteVersion = normalizeVersion(data.tag_name || localVersion);
      if (compareSemver(remoteVersion, localVersion) > 0) {
        set({
          status: 'available',
          updateInfo: {
            version: remoteVersion,
            currentVersion: localVersion,
            date: data.published_at,
            body: data.body,
            releaseUrl: data.html_url || `${GITHUB_RELEASES_BASE}/tag/v${remoteVersion}`,
            canInstallInApp: false,
          },
          lastCheckedAt: Date.now(),
          errorMessage: null,
          isUpdateModalOpen: openModalOnAvailable || !silent,
        });
      } else {
        set({
          status: 'up-to-date',
          updateInfo: null,
          lastCheckedAt: Date.now(),
          errorMessage: null,
        });
      }
    } catch {
      if (silent) {
        set({ status: 'idle', errorMessage: null });
      } else {
        set({
          status: 'error',
          lastCheckedAt: Date.now(),
          errorMessage: 'Unable to check GitHub Releases from browser preview.',
        });
      }
    }
  },

  installUpdate: async () => {
    const { updateInfo, status } = get();
    if (!updateInfo) return;
    if (status === 'downloading' || status === 'installing' || status === 'restarting') {
      return;
    }

    if (!activeNativeUpdate || !updateInfo.canInstallInApp) {
      await tauriApi.openReleasePage(updateInfo.releaseUrl);
      return;
    }

    let downloaded = 0;
    let total: number | null = null;

    set({
      status: 'downloading',
      errorMessage: null,
      downloadProgress: {
        downloadedBytes: 0,
        totalBytes: null,
        percent: 0,
      },
    });

    try {
      await activeNativeUpdate.download((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
          set({
            downloadProgress: {
              downloadedBytes: 0,
              totalBytes: total,
              percent: 0,
            },
          });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          const percent =
            total && total > 0
              ? Math.min(99, Math.round((downloaded / total) * 100))
              : 0;
          set({
            downloadProgress: {
              downloadedBytes: downloaded,
              totalBytes: total,
              percent,
            },
          });
        } else if (event.event === 'Finished') {
          set({
            downloadProgress: {
              downloadedBytes: downloaded,
              totalBytes: total ?? downloaded,
              percent: 100,
            },
          });
        }
      });

      set({ status: 'installing' });

      // Gracefully stop background workers, checkpoint SQLite WAL, and flush puntano.log
      await tauriApi.prepareForUpdateRestart(updateInfo.version);

      // Verify cryptographic signature & apply OS installer
      // (On Windows NSIS, install() launches the passive installer and exits the app automatically;
      // on macOS/Linux, install() extracts the bundle and returns so relaunch() restarts the app.)
      await activeNativeUpdate.install();

      set({ status: 'restarting' });
      await relaunch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      tauriApi.logFrontendEvent(
        'error',
        'updater.install',
        `Failed to install update v${updateInfo.version}: ${msg}`
      );
      set({
        status: 'error',
        errorMessage: `Update installation failed: ${msg}`,
      });
    }
  },

  dismissUpdatePrompt: () => {
    const version = get().updateInfo?.version;
    if (version) {
      try {
        localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, version);
      } catch {
        // Ignore storage errors
      }
    }
    set({ isUpdateModalOpen: false });
  },

  setUpdateModalOpen: (open: boolean) => set({ isUpdateModalOpen: open }),

  openReleaseInBrowser: async () => {
    const url =
      get().updateInfo?.releaseUrl || `${GITHUB_RELEASES_BASE}/latest`;
    await tauriApi.openReleasePage(url);
  },
}));
