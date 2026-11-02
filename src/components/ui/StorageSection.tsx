'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatFileSize } from '@/engine/engineManifest';
import { useMessages } from '@/i18n/useMessages';
import {
  clearEngineFileCaches,
  getStorageReport,
  requestPersistentStorage,
  type StorageReport,
} from '@/lib/storage';

/**
 * Storage section of the Settings drawer (Prompt 9): per-area usage
 * (downloaded engine files, saved reviews, position cache, browser total),
 * persistent-storage request, and a confirmed clear of the engine files.
 */
export default function StorageSection() {
  const { t } = useMessages();
  const [report, setReport] = useState<StorageReport | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    void getStorageReport().then((r) => {
      setReport(r);
      // Persisted storage is never revoked mid-session: once granted (here
      // or via the first saved review), don't let a later report read
      // downgrade the displayed state.
      setPersisted((prev) => (prev === true ? true : r.persisted));
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    void clearEngineFileCaches().then(refresh);
  };

  const handlePersist = () => {
    void requestPersistentStorage().then((ok) => {
      setPersisted(ok);
      refresh();
    });
  };

  return (
    <div className="py-2 text-sm">
      <dl className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">{t('settings.storageEngineFiles')}</dt>
          <dd className="tabular-nums text-ink">
            {report ? formatFileSize(report.engineBytes) : '…'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">{t('settings.storageSavedReviews')}</dt>
          <dd className="tabular-nums text-ink">
            {report
              ? t('settings.countAndSize', {
                  count: report.reviewsCount,
                  size: formatFileSize(report.reviewsApproxBytes),
                })
              : '…'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">{t('settings.storagePositionCache')}</dt>
          <dd className="tabular-nums text-ink">
            {report
              ? t('settings.countAndSize', {
                  count: report.positionsCount,
                  size: formatFileSize(report.positionsApproxBytes),
                })
              : '…'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">{t('settings.storageTotal')}</dt>
          <dd className="tabular-nums text-ink">
            {report?.totalUsage != null
              ? report.totalQuota != null
                ? t('settings.storageTotalFull', {
                    usage: formatFileSize(report.totalUsage),
                    quota: formatFileSize(report.totalQuota),
                  })
                : t('settings.storageTotalOnly', { usage: formatFileSize(report.totalUsage) })
              : t('common.notReported')}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">{t('settings.storagePersistent')}</dt>
          <dd className="text-ink">
            {persisted == null ? t('common.unknown') : persisted ? t('common.on') : t('common.off')}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePersist}
          className="rounded bg-panel2 px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line transition-colors hover:bg-hover"
        >
          {t('settings.keepPersistent')}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className={`rounded px-3 py-2 text-sm font-semibold ring-1 transition-colors ${
            confirmingClear
              ? 'bg-[#ca3431] text-white ring-[#ca3431]'
              : 'bg-panel2 text-ink ring-line hover:bg-hover'
          }`}
        >
          {confirmingClear ? t('settings.confirmClear') : t('settings.clearEngineFiles')}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        {t('settings.storageClearHelp')}
      </p>
    </div>
  );
}
