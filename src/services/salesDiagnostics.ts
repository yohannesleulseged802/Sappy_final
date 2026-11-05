import { db } from './firebaseAuth';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { storage } from './storage';
import { indexedDbService } from './indexedDb';
import {
  Sale,
  DiagnosticDiscrepancy,
  DiagnosticIssueType,
  SalesDiagnosticReport,
  SyncQueueItem,
} from '../types';

class SalesDiagnosticsService {
  /**
   * Run a full comparative diagnostic scan between:
   * 1. Local IndexedDB store ('sales')
   * 2. Local fallback / LocalStorage cache
   * 3. Cloud Firestore collection ('sales')
   * 4. Offline sync queue ('sappy_pos_sync_queue_v1')
   */
  async runSalesDiagnostics(): Promise<SalesDiagnosticReport> {
    const startTime = performance.now();
    const discrepancies: DiagnosticDiscrepancy[] = [];

    // 1. Load Local State from IndexedDB (fallback / merged with localStorage)
    let localSales = await indexedDbService.getAllSales();
    const localStorageSales = storage.getSales();

    // If IndexedDB was empty or behind localStorage, synchronize them
    if (localSales.length < localStorageSales.length) {
      localSales = await indexedDbService.syncLocalStorageAndIndexedDB(localStorageSales);
    } else if (localStorageSales.length < localSales.length) {
      storage.saveSales(localSales);
    }

    // 2. Load Local Sync Queue Items
    const syncQueue = storage.getSyncQueue();
    const saleQueueItems = syncQueue.filter((item) => item.entityType === 'sale');

    // 3. Query Cloud Firestore Live Collection
    const cloudSales: Sale[] = [];
    let isCloudAccessible = true;
    let cloudFetchError: string | null = null;

    try {
      const snap = await getDocs(collection(db, 'sales'));
      const wipeTs = storage.getCatalogWipeTimestamp();
      snap.docs.forEach((d) => {
        const s = d.data() as Sale;
        if (storage.isRecordValidAfterWipe(s, wipeTs)) {
          cloudSales.push(s);
        }
      });
    } catch (err: any) {
      isCloudAccessible = false;
      cloudFetchError = err?.message || 'Could not query Cloud Firestore';
      console.warn('Diagnostic Firestore query notice:', err);
    }

    // Build Maps for fast indexed lookup
    const localMap = new Map<string, Sale>();
    const localReceiptMap = new Map<string, Sale>();
    localSales.forEach((s) => {
      if (s?.id) localMap.set(s.id, s);
      if (s?.receiptNumber) localReceiptMap.set(s.receiptNumber, s);
    });

    const cloudMap = new Map<string, Sale>();
    const cloudReceiptMap = new Map<string, Sale>();
    cloudSales.forEach((s) => {
      if (s?.id) cloudMap.set(s.id, s);
      if (s?.receiptNumber) cloudReceiptMap.set(s.receiptNumber, s);
    });

    let healthyCount = 0;
    let orphanedLocalCount = 0;
    let orphanedCloudCount = 0;
    let mismatchCount = 0;

    // Check Local Sales vs Cloud Sales
    localSales.forEach((local) => {
      const cloudMatch = cloudMap.get(local.id) || cloudReceiptMap.get(local.receiptNumber);

      if (!cloudMatch) {
        orphanedLocalCount++;
        discrepancies.push({
          id: local.id,
          receiptNumber: local.receiptNumber,
          issueType: 'ORPHAN_LOCAL',
          title: 'Orphaned in Local IndexedDB',
          description: `Sale #${local.receiptNumber} (${local.grandTotal.toFixed(2)} ETB by ${local.cashierName}) exists locally in IndexedDB but is missing from Cloud Firestore.`,
          localSale: local,
          detectedAt: new Date().toISOString(),
          severity: 'high',
        });
      } else {
        // Compare status and financial totals
        const isStatusMismatch = local.status !== cloudMatch.status;
        const isTotalMismatch = Math.abs(local.grandTotal - cloudMatch.grandTotal) > 0.05;
        const isItemsMismatch = (local.items?.length || 0) !== (cloudMatch.items?.length || 0);

        if (isStatusMismatch || isTotalMismatch || isItemsMismatch) {
          mismatchCount++;
          const conflictDetails: string[] = [];
          if (isStatusMismatch) {
            conflictDetails.push(`Status: Local [${local.status}] vs Cloud [${cloudMatch.status}]`);
          }
          if (isTotalMismatch) {
            conflictDetails.push(`Total: Local [${local.grandTotal} ETB] vs Cloud [${cloudMatch.grandTotal} ETB]`);
          }
          if (isItemsMismatch) {
            conflictDetails.push(`Items count: Local [${local.items.length}] vs Cloud [${cloudMatch.items.length}]`);
          }

          discrepancies.push({
            id: local.id,
            receiptNumber: local.receiptNumber,
            issueType: 'STATUS_MISMATCH',
            title: 'Data Conflict / Field Mismatch',
            description: `Sale #${local.receiptNumber} exists in both stores but has discrepancies: ${conflictDetails.join(', ')}.`,
            localSale: local,
            cloudSale: cloudMatch,
            detectedAt: new Date().toISOString(),
            severity: 'medium',
          });
        } else {
          healthyCount++;
        }
      }
    });

    // Check Cloud Sales missing in Local
    cloudSales.forEach((cloud) => {
      const localMatch = localMap.get(cloud.id) || localReceiptMap.get(cloud.receiptNumber);
      if (!localMatch) {
        orphanedCloudCount++;
        discrepancies.push({
          id: cloud.id,
          receiptNumber: cloud.receiptNumber,
          issueType: 'ORPHAN_CLOUD',
          title: 'Orphaned in Cloud Firestore',
          description: `Sale #${cloud.receiptNumber} (${cloud.grandTotal.toFixed(2)} ETB) is present in Cloud Firestore but missing from local IndexedDB.`,
          cloudSale: cloud,
          detectedAt: new Date().toISOString(),
          severity: 'medium',
        });
      }
    });

    // Inspect Stuck Queue Items
    let stuckQueueCount = 0;
    saleQueueItems.forEach((item) => {
      stuckQueueCount++;
      const payloadSale = item.payload as Sale;
      discrepancies.push({
        id: item.id,
        receiptNumber: payloadSale?.receiptNumber || 'N/A',
        issueType: 'QUEUE_STUCK',
        title: 'Pending Offline Queue Item',
        description: `Sale mutation #${item.id} (${payloadSale?.receiptNumber || 'Unknown'}) is queued for upload with ${item.retries || 0} retry attempt(s).`,
        queueItem: item,
        localSale: payloadSale,
        detectedAt: new Date().toISOString(),
        severity: (item.retries || 0) > 2 ? 'high' : 'info',
      });
    });

    // If Cloud could not be contacted
    if (!isCloudAccessible) {
      discrepancies.unshift({
        id: 'cloud-connection-error',
        receiptNumber: 'ALERT',
        issueType: 'QUEUE_STUCK',
        title: 'Cloud Firestore Connection Warning',
        description: `Could not reach Cloud Firestore live collection: ${cloudFetchError}. Running in local-first mode.`,
        detectedAt: new Date().toISOString(),
        severity: 'high',
      });
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      scannedAt: new Date().toISOString(),
      durationMs,
      totalIndexedDbSales: localSales.length,
      totalCloudSales: cloudSales.length,
      healthyCount,
      orphanedLocalCount,
      orphanedCloudCount,
      mismatchCount,
      stuckQueueCount,
      discrepancies,
    };
  }

  /**
   * Push a single local sale to Cloud Firestore and mark as synced
   */
  async pushSingleSaleToCloud(sale: Sale): Promise<{ success: boolean; error?: string }> {
    if (storage.isQuotaExceeded()) {
      // Local-first persistence
      await indexedDbService.putSale({ ...sale, isSynced: false });
      return {
        success: false,
        error: 'Firestore daily free write quota reached (resets 00:00 UTC). Sale is preserved locally in IndexedDB & Express sync.',
      };
    }
    try {
      const updatedSale = { ...sale, isSynced: true };
      await setDoc(doc(db, 'sales', updatedSale.id), updatedSale, { merge: true });

      // Update in IndexedDB and LocalStorage
      await indexedDbService.putSale(updatedSale);
      const sales = storage.getSales();
      const updated = sales.map((s) => (s.id === updatedSale.id ? updatedSale : s));
      if (!sales.some((s) => s.id === updatedSale.id)) {
        updated.unshift(updatedSale);
      }
      storage.saveSales(updated);

      // Clean corresponding queue entry if exists
      this.removeSaleFromQueue(sale.id);

      return { success: true };
    } catch (err: any) {
      if (storage.handleFirestoreQuotaError(err)) {
        await indexedDbService.putSale({ ...sale, isSynced: false });
        return {
          success: false,
          error: 'Firestore daily write quota reached (resets 00:00 UTC). Preserved locally in IndexedDB.',
        };
      }
      return { success: false, error: err?.message || 'Failed to upload sale to Cloud Firestore' };
    }
  }

  /**
   * Pull a single cloud sale into local IndexedDB and LocalStorage
   */
  async pullSingleSaleToLocal(sale: Sale): Promise<{ success: boolean; error?: string }> {
    try {
      await indexedDbService.putSale(sale);
      const sales = storage.getSales();
      const idx = sales.findIndex((s) => s.id === sale.id || s.receiptNumber === sale.receiptNumber);
      let updated: Sale[];
      if (idx >= 0) {
        updated = sales.map((s, i) => (i === idx ? sale : s));
      } else {
        updated = [sale, ...sales];
      }
      updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      storage.saveSales(updated);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to pull cloud sale locally' };
    }
  }

  /**
   * Resolve a conflicting record between local and cloud
   */
  async resolveConflict(
    saleId: string,
    resolution: 'prefer_local' | 'prefer_cloud' | 'prefer_refunded',
    localSale?: Sale,
    cloudSale?: Sale
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!localSale && !cloudSale) {
        return { success: false, error: 'Cannot resolve conflict without record data' };
      }

      let authoritative: Sale;
      if (resolution === 'prefer_refunded') {
        if (localSale?.status === 'REFUNDED') {
          authoritative = localSale;
        } else if (cloudSale?.status === 'REFUNDED') {
          authoritative = cloudSale;
        } else {
          authoritative = localSale || cloudSale!;
        }
      } else if (resolution === 'prefer_cloud' && cloudSale) {
        authoritative = cloudSale;
      } else {
        authoritative = localSale || cloudSale!;
      }

      // Update cloud if quota allows
      if (!storage.isQuotaExceeded()) {
        try {
          await setDoc(doc(db, 'sales', authoritative.id), authoritative, { merge: true });
        } catch (fsErr) {
          storage.handleFirestoreQuotaError(fsErr);
        }
      }

      // Update local IndexedDB and LocalStorage
      await indexedDbService.putSale(authoritative);

      const sales = storage.getSales();
      const updated = sales.map((s) => (s.id === authoritative.id ? authoritative : s));
      if (!sales.some((s) => s.id === authoritative.id)) {
        updated.unshift(authoritative);
      }
      storage.saveSales(updated);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to resolve conflict' };
    }
  }

  /**
   * Re-sync all discrepancies found in diagnostic report:
   * 1. Batch pushes all local orphans to Firestore (if quota allows)
   * 2. Pulls all cloud orphans into IndexedDB & localStorage
   * 3. Resolves status conflicts (authoritative REFUNDED precedence)
   * 4. Cleans processed items from sync queue
   */
  async resyncAllDiscrepancies(report: SalesDiagnosticReport): Promise<{
    success: boolean;
    pushedCount: number;
    pulledCount: number;
    resolvedCount: number;
    queueClearedCount: number;
    error?: string;
  }> {
    let pushedCount = 0;
    let pulledCount = 0;
    let resolvedCount = 0;
    let queueClearedCount = 0;

    try {
      // 1. Batch Push Local Orphans (if quota not exceeded)
      const localOrphans = report.discrepancies
        .filter((d) => d.issueType === 'ORPHAN_LOCAL' && d.localSale)
        .map((d) => ({ ...d.localSale!, isSynced: true }));

      if (localOrphans.length > 0) {
        if (!storage.isQuotaExceeded()) {
          try {
            const CHUNK_SIZE = 400;
            for (let i = 0; i < localOrphans.length; i += CHUNK_SIZE) {
              const chunk = localOrphans.slice(i, i + CHUNK_SIZE);
              const batch = writeBatch(db);
              for (const s of chunk) {
                batch.set(doc(db, 'sales', s.id), s, { merge: true });
              }
              await batch.commit();
            }
            pushedCount = localOrphans.length;
          } catch (fsErr) {
            storage.handleFirestoreQuotaError(fsErr);
          }
        }
        await indexedDbService.putSalesBatch(localOrphans);
      }

      // 2. Pull Cloud Orphans
      const cloudOrphans = report.discrepancies
        .filter((d) => d.issueType === 'ORPHAN_CLOUD' && d.cloudSale)
        .map((d) => d.cloudSale!);

      if (cloudOrphans.length > 0) {
        await indexedDbService.putSalesBatch(cloudOrphans);
        const curSales = storage.getSales();
        const merged = [...curSales];
        cloudOrphans.forEach((cs) => {
          if (!merged.some((s) => s.id === cs.id)) {
            merged.push(cs);
          }
        });
        merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        storage.saveSales(merged);
        pulledCount = cloudOrphans.length;
      }

      // 3. Resolve Field Conflicts (Reflect refunds or newest state)
      const conflicts = report.discrepancies.filter(
        (d) => d.issueType === 'STATUS_MISMATCH' && (d.localSale || d.cloudSale)
      );

      for (const c of conflicts) {
        const res = await this.resolveConflict(
          c.id,
          'prefer_refunded',
          c.localSale,
          c.cloudSale
        );
        if (res.success) resolvedCount++;
      }

      // 4. Clear/Flush Stuck Queue Items
      const stuckItems = report.discrepancies.filter((d) => d.issueType === 'QUEUE_STUCK' && d.queueItem);
      if (stuckItems.length > 0) {
        const curQueue = storage.getSyncQueue();
        const stuckIds = new Set(stuckItems.map((s) => s.id));
        const filteredQueue = curQueue.filter((q) => !stuckIds.has(q.id));
        localStorage.setItem('sappy_pos_sync_queue_v1', JSON.stringify(filteredQueue));
        queueClearedCount = stuckItems.length;
      }

      storage.addAuditLog(
        'DIAGNOSTIC_RESYNC',
        'SALES',
        `Sales Ledger Diagnostics auto-resolved ${pushedCount + pulledCount + resolvedCount} discrepancy records.`
      );

      return {
        success: true,
        pushedCount,
        pulledCount,
        resolvedCount,
        queueClearedCount,
      };
    } catch (err: any) {
      return {
        success: false,
        pushedCount,
        pulledCount,
        resolvedCount,
        queueClearedCount,
        error: err?.message || 'Re-sync operation encountered an error',
      };
    }
  }

  /**
   * Remove a specific sale mutation from the sync queue
   */
  removeSaleFromQueue(saleId: string) {
    try {
      const queue = storage.getSyncQueue();
      const updated = queue.filter(
        (item) => !(item.entityType === 'sale' && (item.payload?.id === saleId || item.id === saleId))
      );
      if (updated.length !== queue.length) {
        localStorage.setItem('sappy_pos_sync_queue_v1', JSON.stringify(updated));
      }
    } catch (err) {
      console.warn('removeSaleFromQueue notice:', err);
    }
  }

  /**
   * Retry pushing a stuck item from the sync queue
   */
  async retryQueueItem(queueItemId: string): Promise<{ success: boolean; error?: string }> {
    if (storage.isQuotaExceeded()) {
      return {
        success: false,
        error:
          'Firestore daily write quota reached (resets 00:00 UTC). Item is safely stored in local queue & IndexedDB and will automatically sync after quota resets.',
      };
    }
    try {
      const queue = storage.getSyncQueue();
      const item = queue.find((q) => q.id === queueItemId);
      if (!item || item.entityType !== 'sale' || !item.payload) {
        return { success: false, error: 'Queue item not found or invalid' };
      }

      const sale = item.payload as Sale;
      await setDoc(doc(db, 'sales', sale.id), { ...sale, isSynced: true }, { merge: true });
      await indexedDbService.putSale(sale);

      this.removeSaleFromQueue(queueItemId);
      return { success: true };
    } catch (err: any) {
      if (storage.handleFirestoreQuotaError(err)) {
        return {
          success: false,
          error:
            'Firestore daily write quota reached (resets 00:00 UTC). Item will sync automatically after quota resets.',
        };
      }
      return { success: false, error: err?.message || 'Retry failed' };
    }
  }

  /**
   * Export the diagnostic report as formatted JSON
   */
  exportReportToJson(report: SalesDiagnosticReport): void {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `sappy_sales_diagnostics_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}

export const salesDiagnosticsService = new SalesDiagnosticsService();
