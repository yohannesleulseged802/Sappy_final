# Fix User Persistence & Full A4 Invoice Receipt Generation

## Summary
Resolve the bug that causes newly registered staff and administrator accounts to be automatically removed upon creation or page reload, and implement a full A4 / Letter printable invoice receipt generator with PDF download and direct print capability accessible manually from the Sales Ledger.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product decisions were confirmed through interactive clarification and are locked into this plan:

- **Confirmed Decision 1 (Receipt Format & Layout)**: Full A4 or Letter invoice layout with high-resolution PDF download and printable styling, replacing thermal-only slips with a professional business stationery tax invoice format.
- **Confirmed Decision 2 (Trigger Workflow & Location)**: Receipts and tax invoices will be generated **manually from the Sales Ledger** on-demand (both from table action buttons and inside the Transaction Inspector modal), keeping the checkout POS terminal quick and uncluttered.
- **Confirmed Decision 3 (User Retention & Persistence)**: Eliminate the premature wipe trigger in `syncStaffWithFirestore` and `syncStaffFromBackend` that was wiping newly created accounts whenever remote Firestore snapshots were empty or delayed by write quota limits.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **User Account Permanence**: Guarantees that any staff or administrator account created (either locally, via server, or during initial setup) is permanently persisted in `localStorage` and synchronized with the backend. New accounts created after a wipe timestamp are protected from being discarded by empty Firestore snapshots or quota timeouts.
  2. **Full A4 Invoice Receipt Generator**: Provides store operators with an official, print-ready A4/Letter invoice generator directly from the Sales Ledger. Each transaction can be previewed in an interactive A4 sheet modal, downloaded as an official PDF document via `jsPDF` and `jspdf-autotable`, or printed directly to any connected laser/inkjet printer.
- **Target Audience**: Store owners, cashiers, and accountants at Sappy Stationary needing reliable staff login persistence and commercial-grade tax invoices for walk-in and corporate clients.
- **Key Value**: Reliable, uninterrupted staff operations without unexpected account logouts, paired with professional corporate invoices that meet tax and accounting standards.

---

### 2. User Experience & Visual Design

#### A. Key User Flows
1. **User Creation & Login**:
   - Administrator registers a new cashier/manager from the Staff screen or Initial Setup.
   - Account is saved locally and synced to backend.
   - On page refresh or navigation, the user profile and credentials persist permanently without disappearing.
2. **Generating an A4 Invoice from Sales Ledger**:
   - Operator navigates to **Sales Ledger** via sidebar or top navigation.
   - In the sales transactions table, each row features a dedicated **"Invoice / Receipt"** button (alongside the quick PDF download icon).
   - Clicking opens the **A4 Invoice Preview Modal**, rendering a realistic, scaled A4 document with authentic typography:
     - Header: Sappy Stationary logo/wordmark, business tagline, TIN, full physical address, phone, and email.
     - Document Title: Official Tax Invoice / Sales Receipt with invoice number, transaction date/time, and cashier ID.
     - Customer Block: Walk-in customer or named client with phone and credit balance.
     - Itemized Table: Description & SKU, Quantity, Unit, Unit Price, Line Discount, and Total.
     - Financial Summary: Subtotal, VAT / Tax breakdown, Net Discount, Grand Total in ETB, and Payment Tendered breakdown (Cash, Card, Telebirr/CBE Mobile Transfer, Store Credit).
     - Security & Footer: High-resolution QR verification code, barcode, payment status stamp ("PAID / COMPLETED"), return policy, and store signature/stamp line.
   - Two prominent actions: **"Download PDF Invoice"** (saves high-res `.pdf`) and **"Print Document"** (triggers browser print stylesheet optimized for A4 paper).

#### B. Visual Identity & Theme
- **Document Aesthetic**: Clean, architectural Swiss-modern invoice design. Crisp typography (`Plus Jakarta Sans` / `Inter` headings, `JetBrains Mono` for tabular numerals and amounts).
- **Color Discipline**: Deep Forest Green primary brand accent (`#064e3b`), dark neutral slate text (`#1e293b`), subtle warm-gray table grid borders (`#e2e8f0`), and crisp white sheet background.
- **Print Optimization**: `@media print` CSS rules hiding background navigation, sidebars, and action buttons, focusing strictly on the centered A4 sheet with zero margin waste.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Root Cause & Fix for Automatic User Removal
- **Problem Identified**:
  1. In `src/services/storage.ts` (`syncStaffWithFirestore`), when Firestore returned an empty snapshot (`snapDocs.length === 0` or after filtering), it executed:
     ```ts
     this.saveStaffList([]);
     localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
     ```
     Because Firebase free-tier write quotas were exceeded, new accounts could not immediately write to Firestore, causing the remote collection to appear empty. The real-time listener then immediately wiped local users.
  2. In `syncStaffFromBackend()` and `syncAllDataWithBackend()`, if `activeWipeTs > 0` and the server user list was temporarily empty, it unconditionally wiped local users without checking whether the local users were created *after* the wipe.
- **Solution**:
  - Update `syncStaffWithFirestore` so an empty remote list **never** deletes local users whose `createdAt` timestamp is greater than `wipeTs`.
  - In `syncStaffFromBackend` and `syncAllDataWithBackend`, preserve all valid users with `createdAt > activeWipeTs`.
  - When a user is added via `addStaffAccount`, push it directly to `/api/pos/sync` so the local server stores it immediately as a persistent source of truth.

#### Decision 2: Pure Client-Side Vector PDF Generation (`jsPDF` + `autoTable`)
- **Chosen Approach**: Use the installed `jspdf` and `jspdf-autotable` libraries in `ExportService` to generate crisp vector A4 documents that download instantly in under 150ms without server round-trips.
- **Interactive UI Preview**: Provide an in-browser HTML/CSS A4 preview modal mirroring the exact PDF layout, allowing the user to inspect the invoice, copy details, or print immediately via `window.print()`.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          SALES LEDGER VIEW                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Sales Table Rows: [Inspect] [Generate A4 Invoice] [Download PDF] │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     A4 INVOICE PREVIEW MODAL                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ A4 Document Sheet (CSS-rendered preview + @media print styles)   │  │
│  │  - Store Header: Sappy Stationary & TIN                          │  │
│  │  - Bill To / Customer Details                                    │  │
│  │  - Itemized Sales Table (tabular-nums)                           │  │
│  │  - Financial Summary (Subtotal, Tax, Discounts, Grand Total ETB) │  │
│  │  - Payment Tender Splits & Cashier Signature                     │  │
│  │  - Barcode & QR Verification Stamp                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Actions: [Download A4 PDF Invoice]  [Print Document]  [Close]    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EXPORT SERVICE (jsPDF)                          │
│  - ExportService.generateA4InvoicePDF(sale, settings)                  │
│  - Generates official vector A4 PDF with exact margins and tables      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                  STORAGE & USER PERSISTENCE PIPELINE                   │
│                                                                        │
│  storage.addStaffAccount(newStaff)                                     │
│     │                                                                  │
│     ├── 1. Writes to localStorage (safeguarded)                        │
│     ├── 2. POST /api/pos/sync (persists to backend server immediately) │
│     └── 3. Quota-safe Firestore write attempt                          │
│                                                                        │
│  syncStaffWithFirestore / syncStaffFromBackend                         │
│     └── Checks: Does local user have createdAt > wipeTimestamp?        │
│          ├── YES: PRESERVE local user! Never wipe by empty remote.     │
│          └── NO: Only wipe if created before the wipe event.          │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 5. Implementation Steps

1. **Fix User Persistence in `src/services/storage.ts`**:
   - In `syncStaffWithFirestore`: Remove the destructive `else { this.saveStaffList([]); }` branch. Instead, check if local staff have `createdAt > wipeTs`; if so, preserve them and push them to the server.
   - In `syncStaffFromBackend`: Only wipe local staff if **all** existing local staff have `createdAt <= activeWipeTs`. If valid newer staff exist, keep them and push them to the backend.
   - In `syncAllDataWithBackend`: Prevent clearing local staff when valid accounts exist.
   - In `addStaffAccount`: Ensure new staff timestamps are set to current `Date.now()` and immediately pushed to `/api/pos/sync`.
2. **Build Full A4 Invoice Generator in `src/services/export.ts`**:
   - Implement `generateA4InvoicePDF(sale: Sale, settings: StoreSettings)` using standard A4 dimensions ($210\text{mm} \times 297\text{mm}$).
   - Render clean header, invoice metadata, customer block, tabular autoTable with currency alignment, subtotal, tax breakdown, discount, total, payment breakdown, and QR/barcode stamp.
3. **Create `A4InvoiceModal.tsx` in `src/components/pos/`**:
   - Provide a responsive, high-fidelity A4 document modal with zoom/fit controls, clean print stylesheet, and direct "Download PDF" and "Print Invoice" buttons.
4. **Wire A4 Invoice Actions into `src/views/SalesLedgerView.tsx`**:
   - Add a "Generate Invoice" action on each sale row and inside the existing Transaction Inspector modal.
   - Connect click handlers to open `A4InvoiceModal` with the selected sale.
5. **Verification & Resolution**:
   - Fixed obsolete unconditional purge hook in `init()` (`src/services/storage.ts`) that previously wiped all staff on new tabs or sessions.
   - Hardened `getStaffList()` and `saveStaffList()` to only exclude accounts that are explicitly registered in `deletedUserIds` with no re-creation timestamp, never dropping active accounts or the logged-in user.
   - Eliminated destructive `this.saveStaffList([])` and `resetAllUsersLocally()` calls in `syncStaffWithFirestore`, `mergeRemoteStaff`, `syncStaffFromBackend`, and `syncAllDataWithBackend`.
   - Updated `mergeServerUsersWithLocal` to perform a non-destructive bidirectional union so local accounts created offline or during sync transitions are never overwritten.
   - Hardened `server.ts` (`GET /api/auth/system-status` and `POST /api/pos/sync`) so valid accounts are never purged based solely on legacy wipe timestamps.
   - Hardened `LoginView.tsx` `subscribeAutoSync` listener to fall back to local stored staff before clearing form inputs or switching tabs.
   - Built full A4 / Letter tax invoice generator (`generateA4InvoicePDF` in `src/services/export.ts`) and interactive preview modal (`A4InvoiceModal.tsx`) accessible from the Sales Ledger.
   - Tested and verified with `lint_applet` (0 errors), `compile_applet` (build succeeded), and live server API verification.

