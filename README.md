# MEAL MANAGEMENT SYSTEM (Version 1.0)
### Local-First, Offline-Capable Mess & Meal Management Web Application
**Built for Mymensingh Engineering College — Omar Ekushe Hall (Sultan + Robiul Mess)**

---

## 🌟 Overview

The **MEAL MANAGEMENT SYSTEM** is a modern, high-performance web application engineered to replace and modernize traditional Excel-based mess management workbooks (such as `SULTAN MEAL.xlsx`). 

It provides an intuitive SaaS-grade interface for the Mess Manager/Admin to handle daily border attendance (Lunch/Dinner), market costs, individual member deposits, manager fees, and financial audits with zero backend dependencies.

### 🛡️ Local-First Architecture
- **No Backend / No API / No Cloud Database**: All application data is stored locally on the user's laptop browser using **IndexedDB** managed by **Dexie.js**.
- **100% Private**: Personal mess data and financial records never leave the user's browser.
- **Offline Capable**: Functions seamlessly offline with a registered Progressive Web App (PWA) service worker and local caching.
- **Static Deployment**: Can be deployed as static HTML/JS/CSS to Vercel, Netlify, or GitHub Pages. Each user or browser profile maintains its own independent, isolated database.
- **Persistent Storage**: Automatically requests persistent browser storage via the web Storage API to prevent browser storage eviction.

---

## 🏗️ Technology Stack

- **Frontend Framework**: React 18 + TypeScript + Vite
- **Styling & Design System**: Tailwind CSS, Deep navy sidebar, white/slate main cards, responsive layout
- **Database**: Dexie.js (IndexedDB wrapper with live reactivity)
- **Routing**: React Router DOM (v6)
- **Forms & Validation**: React Hook Form
- **Data Visualization**: Recharts (Monthly expense category breakdown, daily meal consumption curve, top dues)
- **Spreadsheet & PDF Processing**:
  - **SheetJS (`xlsx`)**: Bi-directional Excel import (`SULTAN MEAL.xlsx`) and multi-sheet Excel export
  - **jsPDF + jspdf-autotable**: A4 PDF export for all financial reports
- **Icons**: Lucide React

---

## 📋 Modules & Features

### 1. 📊 Dashboard
- **8 Core Real-time KPI Metric Cards**:
  1. *Total Members* (Active / Inactive breakdown)
  2. *Total Meals* (Consumed during the active month)
  3. *Total Market Expenses* (Raw grocery & utility costs)
  4. *Meal Rate* (Total market expenses / Total meals)
  5. *Total Deposits* (Payments collected from borders)
  6. *Total Meal Expenses* (Meals × Meal Rate, without manager fee)
  7. *Total Manager Fees* (Meals × 5 BDT default)
  8. *Total Outstanding Due* (Unpaid balances + Advance refund credits)
- **Interactive Visualizations**:
  - Daily Meal Consumption trend across days 1–31
  - Market Expense category breakdown pie chart
  - Top member outstanding dues comparison bar chart
- **Recent Activity Feeds**:
  - 5 most recent market purchases with categories
  - 5 most recent member deposits
- **Quick Action Bar**:
  - Add Meal Entry, Add Market Cost, Record Deposit, Add Member, Generate Monthly Report

### 2. 👥 Member Management
- Seeded directly with all **175 real members** and room assignments across 5 floors from `SULTAN MEAL.xlsx`.
- Supports multiple members per room (e.g. `ROOM-101`, `ROOM-102`, `ROOM-00`, `ROOM-201` to `ROOM-510`).
- Complete CRUD:
  - Add new border with Room, Floor, Phone, Joining Date, and Notes
  - Edit member information
  - One-click Active / Inactive toggle
  - Delete member with confirmation dialog (cascades meal/deposit cleanups)
- Search by name, room number, or phone number.
- Filter by floor (1st, 2nd, 3rd, 4th, 5th) and status (Active/Inactive).
- **Individual Member Profile & Statement**:
  - Personal financial statement (Meals, Meal cost, Manager fee, Total payable, Deposits, Net Due/Advance)
  - Monthly meal attendance history
  - Individual deposit ledger

### 3. 🍱 Meal Management
- **Spreadsheet Grid Mode**:
  - Faithful desktop rebuild of the original Excel `Meals` sheet.
  - Sticky Room & Name columns on the left.
  - Interactive day columns (1 through 28/29/30/31).
  - Single-click toggle: `Blank (-)` → `ON (1)` → `Double (2)` → `OFF (0)`.
  - Visual color indicators:
    - **ON (1 meal)**: Green badge
    - **Double (2 meals)**: Blue badge
    - **OFF (0 meals)**: Red badge
    - **Blank (no entry)**: Neutral slate
  - Real-time column totals at the bottom (Daily total meals).
  - Sticky Member Total column on the right.
  - Bottom-right Grand Monthly Meals total.
- **Daily Roll Call Mode**:
  - Mobile-friendly touch view grouped by room.
  - Quick status toggles for each border.
  - **Copy Previous Day**: One-click feature to duplicate previous day's attendance to today.
- **Bulk Update**:
  - Apply ON, Double, or OFF to entire mess or selected floor for any chosen date.

### 4. 🛒 Market & Expenses Management
- Faithful rebuild of the original `Costs` sheet.
- Fields: Date, Category (Market, Vegetables, Rice, Fish, Meat, Grocery, Gas, Other, or custom), Item Description, Amount in BDT (৳), and Notes.
- Custom Category Creator: Add custom categories dynamically.
- Filter by category, search by item title/notes, and filter by date range.
- Total Monthly Cost and daily average burn rate calculations.
- Add, Edit, and Delete expense with confirmation.

### 5. 💳 Transactions & Financial Management
- Faithful rebuild of the original `Transactions` sheet with a modern, flexible ledger.
- Individual deposit records (not restricted to 5 columns): Member, Date, Amount (৳), Payment Method (Cash, bKash, Nagad, Rocket, Bank Transfer), Notes/TrxID.
- **Strict Business Logic & Mathematical Formulas**:
  $$\text{Meal Rate} = \frac{\text{Total Monthly Market Expenses}}{\text{Total Monthly Meals}}$$
  $$\text{Meal Expense Without Fee} = \text{Member Total Meals} \times \text{Meal Rate}$$
  $$\text{Manager Fee} = \text{Member Total Meals} \times \text{Manager Fee Per Meal (5 BDT)}$$
  $$\text{Total Payable} = \text{Meal Expense Without Fee} + \text{Manager Fee}$$
  $$\text{Due} = \text{Total Payable} - \text{Total Deposits}$$
- **Clear Sign Convention**:
  - **Positive Due ($>0$)**: Member owes money to the mess.
  - **Negative Due ($<0$)**: Member has an advance credit / refundable balance (*DUE NEGATIVE থাকলে টাকা ফেরত পাবেন*).
- Tabbed interface:
  - *Member Financial Sheet*: Summary per member with instant status badges (`Due`, `Advance`, `Settled`).
  - *Deposit Transactions Ledger*: Full audit log of all individual payments.

### 6. 📈 Reports & Analytics
8 Real Database Reports:
1. **Monthly Summary Report**: High-level audit sheet.
2. **Monthly Meal Report**: Complete border attendance summary.
3. **Daily Meal Report**: Consumption totals and ON/Double/OFF breakdown per day.
4. **Monthly Market Expense Report**: Categorized cost ledger.
5. **Member-wise Deposit Report**: Payment receipts list.
6. **Member-wise Due Report**: Detailed list of borders with pending dues and advance balances.
7. **Full Financial Statement**: Multi-column accounting statement.
8. **Room-wise Meal Report**: Total meals consumed per room across all floors.
- Features: One-click **Export to Excel (`.xlsx`)** and **Export to PDF (A4)**.

### 7. 🖨️ Print Center
- Faithful recreation of the original Excel `Print` sheet.
- Professional A4 document layout with headers:
  - *Mymensingh Engineering College*
  - *Omar Ekushe Hall (Mess Meal) [Sultan + Robiul]*
  - *Date, Month, and Meal Cycle*
- Uniform room boxes (4 rooms per row) with Member Name, Lunch, Dinner, and Monthly Totals.
- Signatures section for Hall Manager and Mess Committee.
- Print-ready CSS: Hides navigation bars and unnecessary controls during browser print / PDF save.

### 8. 💾 Backup & Restore (Data Protection)
- **Complete JSON Backup**:
  - Exports a versioned JSON snapshot containing all members, meals, expenses, deposits, categories, and settings.
  - Updates the `lastBackupDate` timestamp in the database.
- **JSON Restore**:
  - Upload previous backup file.
  - Displays verification preview (schema version, records count).
  - Two restore options:
    1. *Replace All Existing Data*: Clean wipe and restore.
    2. *Merge With Existing Data*: Append & update matching records.
- **Excel Export**:
  - Generates multi-sheet workbook (`Summary`, `Member Financials`, `Meals`, `Costs`, `Deposits`, `Members`).
- **Excel Import**:
  - Directly imports `SULTAN MEAL.xlsx` or exported spreadsheets.
  - Parses Rooms, Members, Costs, Meals, and Transactions with verification preview.
- **Backup Status & Reminders**:
  - Prominent badge warning if no backup has been exported.

### 9. ⚙️ Settings
- Customizable Mess Name, Institution Name, and Hall Name.
- Configurable Manager Fee per Meal (default 5 BDT).
- Currency Code & Symbol configuration (BDT / ৳).
- Optional Client-side PIN Screen Lock (4-digit PIN for session privacy).
- Backup reminder frequency (days).
- One-click Reset to Defaults option.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ or v20+)
- npm or yarn

### Installation
```bash
# Clone or navigate to the project directory
cd "Meal Management System"

# Install dependencies
npm install

# Start development server
npm run dev
```
The application will be accessible at `http://localhost:3000/`.

### Production Build
```bash
# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 🌐 Static Deployment

The project builds to pure static client assets in `dist/`. No server-side code or Node.js runtime is needed on the hosting server.

### Deploying to Vercel
```bash
npm install -g vercel
vercel deploy --prod
```

### Deploying to Netlify
1. Connect your repository to Netlify.
2. Build command: `npm run build`
3. Publish directory: `dist`

### Deploying to GitHub Pages
1. In `vite.config.ts`, set `base: './'`.
2. Run `npm run build`.
3. Deploy the contents of `dist` to the `gh-pages` branch.

---

## 🔒 Security & Privacy Notice
All records are stored locally in the user's browser using **IndexedDB**. 
- No personal data or financial records are uploaded to any cloud server or third party.
- If the browser cache/site data is cleared, local data can be lost. Always export regular JSON backups using the **Backup & Restore** module.

---

## 📄 License
Created for academic and university mess management. Released under the MIT License.
