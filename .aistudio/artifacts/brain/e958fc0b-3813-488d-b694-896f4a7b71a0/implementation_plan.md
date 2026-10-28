# Mobile Optimization Implementation Plan (375px Primary Baseline)

## Project Context
- **Project Type:** Point of Sale (POS), Inventory & Store Operations Web App (PWA)
- **Stack:** React 19, TypeScript, Tailwind CSS v4, Express full-stack dev server (`tsx server.ts`), Firebase Firestore & Offline Storage
- **Key Screens:** Login/Auth, POS Register, Inventory Management, Sales Ledger, Store Credit Accounts, Expense Tracker, Barcode & QR Studio, Analytics/Reports, Staff & Roles, Activity Audit Logs, Store Settings
- **Must-Not-Change:** Brand palette (Forest Green `#064e3b`, Parchment `#fdfbf7`, Dim Dark `#12100e`, Emerald `#6ee7b7`), existing data structures, offline-first logic, desktop multi-column layouts and density

---

## 1. Audit Findings (Grouped by the 5 Categories)

### Category 1: Wide Tables / Data Grids → Cards (< 640px)
- **`src/views/InventoryView.tsx` (`InventoryView`):** 7-column table (`Select`, `Product Name/SKU/Category`, `Barcode/QR`, `Cost/Selling Price`, `Current Stock`, `Status`, `Actions`) forces severe horizontal page scrolling on screens under 640px.
- **`src/views/SalesLedgerView.tsx` (`SalesLedgerView`):** 8-column table (`Receipt #`, `Date & Time`, `Cashier`, `Customer`, `Payment Split`, `Grand Total`, `Status`, `Actions`) forces horizontal swiping on mobile.
- **`src/views/CreditAccountsView.tsx` (`CreditAccountsView`):** Customer Transaction Ledger table has 6 columns (`Date & Time`, `Type`, `Description`, `Amount`, `Balance After`, `Staff`) causing overflow in the mobile drawer/detail view.
- **`src/views/ExpensesView.tsx` (`ExpensesView`):** 6-column table (`Date`, `Category`, `Description/Ref`, `Payment Method`, `Amount`, `Actions`) causes horizontal scroll on small viewports.
- **`src/views/AuditLogsView.tsx` (`AuditLogsView`):** 5-column audit table (`Timestamp`, `Staff Member`, `Action`, `Category`, `Details`) overflows at 375px.

### Category 2: Large Numbers / KPIs / Badges Must Never Wrap
- **`src/views/DashboardView.tsx` (`DashboardView`):**
  - KPI summary metric cards (`grid grid-cols-2 lg:grid-cols-4`) contain currency values where the number and currency symbol (e.g., `ETB`) can wrap to two lines on 320px/375px screens.
  - "Daily Highlights" card spotlight numbers lack `white-space: nowrap` and `font-variant-numeric: tabular-nums`.
- **`src/views/PosRegisterView.tsx` (`PosRegisterView`):**
  - Cart totals footer grand total (`{grandTotal.toFixed(2)} {settings.currency}`) can separate number from currency unit if wrapped.
  - Mobile switcher tab button badge and subtotal (`Cart (X) • 1500 ETB`) can wrap onto two lines.
- **`src/views/ReportsView.tsx` (`ReportsView`):**
  - Financial metric cards (Revenue, COGS, Gross Profit, Store Credit) lack fluid `clamp()` sizing and `whitespace-nowrap` on currency text.
- **`src/views/ExpensesView.tsx` (`ExpensesView`):**
  - Total Expenses header banner (`{totalExpenseSum.toFixed(2)} {settings.currency}`) lacks `whitespace-nowrap`.
- **`src/views/CreditAccountsView.tsx` (`CreditAccountsView`):**
  - Customer directory debt tags and balance cards in statement header can wrap currency units on narrow viewports.

### Category 3: Form Inputs: 16px Minimum + Correct Keyboard
- **`index.html`:**
  - `<meta name="viewport" ...>` currently contains `maximum-scale=1.0, user-scalable=no` (disables accessibility zoom) and lacks `viewport-fit=cover`.
- **Global Input Font Size (`src/index.css`):**
  - Many input, select, and textarea elements use `text-xs` (12px) or `text-sm` (14px). On iOS Safari, any field font size `< 16px` triggers automatic page zooming, distorting the mobile layout.
- **Input Attributes:**
  - `src/views/LoginView.tsx`: Missing `inputmode="email"`, `autocomplete="username"`, `enterkeyhint="next"`, and `autocomplete="current-password"`, `enterkeyhint="go"`. PIN input missing `inputmode="numeric" pattern="[0-9]*"`.
  - `src/views/PosRegisterView.tsx`: Fast search input missing `type="search"`, `inputmode="search"`, `enterkeyhint="search"`.
  - `src/views/InventoryView.tsx`: Search input missing `inputmode="search"`. Add/Edit product price & stock numeric inputs missing `inputmode="decimal"` and `inputmode="numeric"`.
  - `src/views/CreditAccountsView.tsx`: Phone input missing `inputmode="tel"` and `autocomplete="tel"`. Repay input missing `inputmode="decimal"`.
  - `src/views/ExpensesView.tsx`: Expense amount missing `inputmode="decimal"`.

### Category 4: Touch Targets: 44px on Touch Devices Only
- **`src/index.css`:**
  - No `@media (pointer: coarse)` rule enforcing minimum 44px tap targets for buttons, icon triggers, checkboxes, and menu items on touch devices.
- **Icon Buttons & Action Triggers:**
  - Close buttons (`<X className="w-3.5 h-3.5" />`), clear search triggers, table action icons (`Edit`, `Trash2`, `Printer`, `RotateCcw`), and inventory item checkboxes are currently ~28–32px visual and hit size.
  - Quantity stepper buttons (`+` and `-`) in `PosRegisterView` are ~24px without tap expansion on touch devices.
- **Desktop Density Preservation:**
  - When pointer is fine (`@media (pointer: fine)`), compact mouse UI must remain untouched.

### Category 5: Fixed/Sticky Bars Must Not Hide Content
- **`index.html`:**
  - Missing `viewport-fit=cover` in `<meta name="viewport">`.
- **`src/index.css` & `src/components/layout/MobileNav.tsx`:**
  - Need explicit CSS safe-area variables (`env(safe-area-inset-bottom)`, `env(safe-area-inset-top)`).
  - Ensure all scrollable views have clearance (`pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]`) so the final card, button, or row is completely reachable above the bottom navigation bar.
- **Modals & Flyouts:**
  - `PinModal.tsx`, `CameraScannerModal.tsx`, `UserProfileModal.tsx`, and `MasterPasscodeSignupModal.tsx` need `max-h-[90dvh]` and safe-area padding to avoid being cut off by the mobile software keyboard.

---

## 2. Targeted Fix Plan

### Step 1: Base Configuration & Global Mobile CSS Rules
1. **`index.html`**:
   - Update viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />` (remove `user-scalable=no` / `maximum-scale=1.0`).
2. **`src/index.css`**:
   - Add `@media (max-width: 639px) { input, select, textarea { font-size: 16px !important; } }` to eliminate iOS Safari auto-zoom without affecting desktop sizing.
   - Add `@media (pointer: coarse)` rules ensuring `min-height: 44px; min-width: 44px;` for buttons, links, and touch-target expands, while preserving desktop density under `pointer: fine`.
   - Add `.tabular-kpi` utility ensuring `white-space: nowrap; font-variant-numeric: tabular-nums; font-size: clamp(1.25rem, 5vw, 1.875rem);`.
   - Add safe-area utility variables for notch and home bar insets.

### Step 2: Transform Wide Tables to Stacked Cards (< 640px)
1. **`src/views/InventoryView.tsx`**:
   - Add responsive card view below 640px (`block sm:hidden`): each product displayed as a compact tactile card with title/SKU, category, price tag, stock pill, and action buttons. Keep `hidden sm:table` for tablets/desktops.
2. **`src/views/SalesLedgerView.tsx`**:
   - Add responsive card list below 640px (`block sm:hidden`): receipt # + status badge on top, cashier & timestamp, items summary, grand total in bold nowrap, and quick action buttons. Keep table at `sm:`.
3. **`src/views/CreditAccountsView.tsx`**:
   - In transaction history, render stacked cards on `< sm` and standard table on `>= sm`.
4. **`src/views/ExpensesView.tsx`**:
   - Render expense records as cards on `< sm` and table on `>= sm`.
5. **`src/views/AuditLogsView.tsx`**:
   - Render audit events as structured cards on `< sm` and table on `>= sm`.

### Step 3: Enforce Non-Wrapping Numbers & Fluid KPIs
1. **`src/views/DashboardView.tsx`**:
   - Enforce `whitespace-nowrap font-mono-numbers` on all metric cards and daily highlight spotlights. Apply `clamp()` font sizes.
2. **`src/views/PosRegisterView.tsx`**:
   - Ensure cart totals, discount tags, and top tab bar indicators never wrap or break currency symbols onto new lines.
3. **`src/views/ReportsView.tsx`**:
   - Wrap financial values in `whitespace-nowrap inline-flex items-baseline`.

### Step 4: Correct Form Input Attributes & Keyboards
1. **`src/views/LoginView.tsx`**:
   - Add `inputmode="email"`, `autocomplete="username"`, `enterkeyhint="next"` to email field.
   - Add `autocomplete="current-password"`, `enterkeyhint="go"` to password field.
   - Add `inputmode="numeric" pattern="[0-9]*"` to PIN inputs.
2. **`src/views/PosRegisterView.tsx` & `src/views/InventoryView.tsx`**:
   - Add `type="search" inputmode="search" enterkeyhint="search"` to search bars.
   - Add `inputmode="decimal"` and `inputmode="numeric"` to price and stock adjustment inputs.
3. **`src/views/CreditAccountsView.tsx` & `src/views/ExpensesView.tsx`**:
   - Add `type="tel" inputmode="tel" autocomplete="tel"` and `inputmode="decimal"` to phone and monetary fields.

### Step 5: Touch Targets & Fixed Navigation Clearance
1. **Hit Area Expansion**:
   - Enhance steppers, icon buttons, and checkboxes with minimum 44px touch targets on touch devices.
2. **Bottom Clearance & Safe Areas**:
   - Verify all view scroll containers feature `pb-[calc(5rem+env(safe-area-inset-bottom,0px))]`.
   - Update `MobileNav.tsx` with safe-area padding.

---

## 3. Verification & Breakpoint Testing
- Test across viewports: **320px** (iPhone SE 1st gen), **375px** (iPhone SE/13 mini / primary baseline), **414px** (iPhone XR/Plus), **768px** (iPad mini), and **1280px+** (Desktop).
- Confirm zero horizontal page scroll at any width.
- Run `lint_applet` and `compile_applet`.
