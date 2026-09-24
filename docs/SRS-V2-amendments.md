# BentaTrack SRS V2: Amendments for V2.1

Changes to make in `docs/SRS V2.pdf`, based on the owner/team decisions of 2026-09-24.
Each item names the section to edit, what is wrong or missing, and suggested replacement text.
Once these are applied, bump the SRS to **Version 2.1.0**.

Legend: **FIX** = contradiction or error · **ADD** = missing requirement or field · **EDIT** = clarification or wording

---

## A. Contradictions and errors

### A1. FIX: Payment methods (FR-018)
- **Where:** §4.5, FR-018
- **Problem:** FR-018 says "cash, GCash, and bank transfer", but §6.1 (Sales table) and Figure 1 list only cash and GCash.
- **Decision:** Cash and GCash only.
- **Replace FR-018 with:** "The system shall record the payment method used, limited to cash and GCash."
- Also check §1.3 ("payment method (Section 4.5)"), which needs no change.

### A2. EDIT: Deleting discontinued products vs. keeping out-of-stock products (FR-004, FR-006)
- **Where:** §4.2, FR-004 and FR-006; §6.2.2 Figure 2 ("Remove Product")
- **Problem:** The two requirements read as if they conflict. They don't, but the SRS never says so. It also doesn't say what happens to past sales of a deleted product.
- **Replace FR-004 with:** "The system shall allow the Owner/Administrator to permanently delete a product record when the product is discontinued. Past sales and inventory history for the deleted product shall be kept, showing the product's name and code as they were at the time."
- **Add to FR-006:** "An out-of-stock product is not discontinued and shall not be deleted automatically."
- **Implementation note (for §6.1):** Sale items and history rows store a copy of the product name and code, so they still read correctly after the product is deleted.

### A3. ADD: Barcode missing from product fields (FR-002)
- **Where:** §4.2, FR-002; §1.3, first bullet
- **Problem:** The §6.1 Product table has a Barcode field, but FR-002 and the §1.3 scope list leave it out.
- **Replace FR-002 with:** "Each product record shall include product name, code, barcode (optional, unique when provided), category, brand, supplier, purchase price, selling price, stock quantity, low stock threshold, expiration date (optional), image, and date added."
- **§1.3 bullet 1:** Add "barcode" and "low stock threshold" to the list.

### A4. FIX: Sales table stores only one product per transaction (§6.1)
- **Where:** §6.1 Sales / Transaction Table
- **Problem:** The table has one "Product Sold" per transaction, but Figure 1 adds several items to one sale, and a real checkout sells several items at once.
- **Fix:** Split it into two tables: **Sale** (the header) and **Sale Item** (one row per product). See C2 for the fields.

### A5. FIX: Inventory History has no quantity, user or "Sale" type (§6.1)
- **Where:** §6.1 Inventory History Table
- **Problems:**
  1. FR-012 requires history of "customer purchases", but Change Type has no "Sale" value.
  2. It records no quantity, so you can see *that* stock changed but not *by how much*.
  3. There is no user field, but §5.2 says "Actions are tied to the account of the user who performed them."
- **Fix:** See C3.

### A6. EDIT: Staff dashboard is undefined (FR-023, FR-024)
- **Where:** §4.6, FR-023; §3.1 Dashboard row
- **Problem:** FR-023 defines the dashboard "for the Owner/Administrator" only, and Figure 3 gives staff no report access.
- **Add FR-023a:** "The system shall show Inventory/Sales Staff a dashboard limited to today's sales, low stock items, and recent transactions, without sales reports, purchase prices, or profit figures."

### A7. EDIT: Staff permissions need to be listed precisely (FR-032, Figure 3)
- **Where:** §4.8, FR-032; §6.2.3 Figure 3
- **Problem:** "Inventory and sales functions" is vague. Following Figure 3, staff can record sales and update inventory, but cannot remove products.
- **Replace FR-032 with:** "The system shall grant Inventory/Sales Staff access to record sales, process refunds, restock products, and add or edit product details. Staff shall not be able to delete products, view supplier information or purchase prices, view sales reports, manage categories, or manage user accounts and passwords."
- **Follow-on:** Staff can add products but cannot see purchase prices or suppliers, so those two fields stay hidden from staff and are optional on staff-created products. The owner fills them in later. Products with no purchase price are left out of profit figures (FR-047) and listed on the owner's dashboard as "needs cost".
- **Figure 3:** Change the staff box to "Record Sales, Refunds, Restock, Add/Edit Products" and add "No product deletion" to the "No Access" box.

---

## B. New functional requirements

Add these to §4 using the next free IDs (FR-037 onward).

### B1. ADD: Low stock threshold (new FR in §4.3)
- **Where:** §4.3 Low Stock Alerts (FR-008 says "low stock level" but never defines it)
- **FR-037:** "Each product shall have a low stock threshold, set by the user, defaulting to 5 units. A product's status shall be *Low Stock* when its quantity is greater than zero and at or below its threshold, *Out of Stock* when its quantity is zero, and *Active* otherwise."
- **§6.1 Product table:** Add the field `Low Stock Threshold | Number | Default 5`.
- **Figure 2:** "Low Stock Level" now means this threshold.

### B2. ADD: Restock (new FR in §4.2)
- **Where:** §4.2 Inventory Management (the SRS logs restocks in FR-012 but has no way to *do* one)
- **FR-038:** "The system shall allow authorized users to restock a product by entering the quantity received and an optional note. The stock quantity shall increase by that amount, and the change shall be logged in the inventory history as a Restock."
- **§3.1 Screens:** Add "Restock" to the Product / Inventory Management row.

### B3. ADD: Refunds (new §4.10 or add to §4.5)
- **Where:** §4.5 Sales Management (FR-012 mentions returns and refunds, but no feature exists)
- **FR-039:** "The system shall allow authorized users to refund all or part of a recorded sale. Refunded quantities shall be returned to stock, and the refund shall be logged in the inventory history as a Refund, linked to the original sale."
- **FR-040:** "A sale item shall not be refunded for more than the quantity originally sold."
- **§6.1 Inventory History:** Change Type values become `Sale / Restock / Edit / Refund / Removal`. "Return" is merged into "Refund", because there is only one returns process.

### B4. ADD: Supplier management (new FRs in §4.8 or a new §4.11)
- **Where:** FR-031 and §5.2 mention "supplier contact information", but suppliers are only a text field on the product.
- **FR-041:** "The system shall allow the Owner/Administrator to add, edit, and delete supplier records containing supplier name and contact details."
- **FR-042:** "Each product shall reference one supplier record. Supplier details shall be visible only to the Owner/Administrator."
- **§6.1:** Add a **Supplier Table** (C4) and change Product → Supplier to "Reference to Supplier".

### B5. ADD: Category management (new FR)
- **Where:** §1.3 and §6.1 treat Category as free text, but the owner manages the categories.
- **FR-043:** "The system shall allow the Owner/Administrator to add, rename, and delete product categories. A category that still has products cannot be deleted."
- **§6.1:** Add a **Category Table** (C5) and change Product → Category to "Reference to Category".

### B6. ADD: User account management (new FRs in §4.8)
- **Where:** §4.8. §3.1 lists a "User Accounts (Owner only)" screen, but no FR says what it does, and the User table has no login name.
- **FR-044:** "Users shall log in with a unique email address and password."
- **FR-045:** "The Owner/Administrator shall be able to create staff accounts, reset staff passwords, and deactivate or reactivate accounts. Deactivated users cannot log in, but their past records remain."
- **FR-046:** "Passwords shall be at least 8 characters and stored only as a hash."
- **§6.1 User Accounts table:** Add `Email | Text, unique` and `Active | Yes/No`.

### B7. ADD: Report rules (edit FR-021, FR-022)
- **Where:** §4.6
- **Add to FR-021:** "Report periods use Philippine time (Asia/Manila). Weeks run Monday to Sunday. Amounts are in Philippine pesos (₱)."
- **FR-047:** "Sales reports shall show gross profit (selling price minus purchase price) to the Owner/Administrator only."
- **FR-048:** "Report export (PDF/CSV) is not required for the initial version." (Add this to the §1.3 "will not include" list too.)

### B8. EDIT: Discounts (FR-017)
- **Replace FR-017 with:** "The system shall allow a discount on the whole sale, entered either as a fixed peso amount or as a percentage. The discount shall not exceed the sale subtotal."

### B9. EDIT: Customer information (FR-016)
- **Add to FR-016:** "Customer information is optional free text (name and/or contact). No customer accounts are kept."

### B10. EDIT: Offline scope (§4.9)
- **Where:** §4.9 and Figure 4 don't say *which* actions work offline.
- **FR-049:** "Recording sales, refunds, and restocks shall work offline. Adding, editing, or deleting products, suppliers, categories, and user accounts requires an internet connection."
- **FR-050:** "A user must log in online at least once on a device before offline use. The session then stays available offline."
- **FR-051:** "The system shall show whether it is online or offline and how many changes are waiting to sync." (This supports §3.4 bullet 4.)
- **§2.6 Assumptions:** Add "The store uses the system from one device at a time, so conflicting offline edits from multiple devices are not handled."

---

## C. Database schema changes (§6.1)

### C1. Product Table: add or change these fields
| Field | Data Type | Description |
|---|---|---|
| Barcode | Text, optional, unique | *(already in §6.1; now also in FR-002)* |
| Category | Reference to Category | *(was Text)* |
| Supplier | Reference to Supplier | *(was Text)* |
| Low Stock Threshold | Number, default 5 | Used for Low Stock status (FR-037) |

### C2. Replace "Sales / Transaction Table" with two tables

**Sale Table**
| Field | Data Type | Description |
|---|---|---|
| Sale ID | Unique ID | Identifier for each sale |
| Date and Time | Date and time | When the sale happened (device time if recorded offline) |
| Staff | Reference to User | Who processed the sale *(was "Staff Name, Text")* |
| Customer Information | Text, optional | Free text |
| Subtotal | Number, currency | Sum of item totals |
| Discount Type | Amount / Percent, optional | |
| Discount Value | Number, optional | |
| Total Amount | Number, currency | Subtotal minus discount |
| Payment Method | Cash / GCash | |

**Sale Item Table**
| Field | Data Type | Description |
|---|---|---|
| Sale Item ID | Unique ID | |
| Sale | Reference to Sale | |
| Product | Reference to Product, optional | Empty if the product was later deleted |
| Product Name / Code (snapshot) | Text | Copied at time of sale (FR-004) |
| Quantity Sold | Number | |
| Unit Price | Number, currency | Selling price at time of sale |
| Unit Cost | Number, currency | Purchase price at time of sale (for profit, FR-047) |
| Refunded Quantity | Number, default 0 | FR-039/040 |

### C3. Inventory History Table: add or change these fields
| Field | Data Type | Description |
|---|---|---|
| Change Type | Sale / Restock / Edit / Refund / Removal | *(Sale added, Return merged into Refund)* |
| Quantity Change | Number (+/-) | e.g. -2 for a sale, +10 for a restock |
| Stock After | Number | Stock level after the change |
| User | Reference to User | Who made the change (§5.2) |
| Related Refund | Reference to Refund, optional | Linked refund, when applicable |
| Product Name / Code (snapshot) | Text | Keeps history readable after deletion |

### C4. New Supplier Table
| Field | Data Type | Description |
|---|---|---|
| Supplier ID | Unique ID | |
| Name | Text | |
| Contact Person | Text, optional | |
| Phone | Text, optional | |
| Email | Text, optional | |
| Address | Text, optional | |

### C5. New Category Table
| Field | Data Type | Description |
|---|---|---|
| Category ID | Unique ID | |
| Name | Text, unique | e.g. Bags, Accessories, Perfumes |

### C6. User Accounts Table: add these fields
| Field | Data Type | Description |
|---|---|---|
| Email | Text, unique | Login name (FR-044) |
| Active | Yes/No | Deactivated users cannot log in (FR-045) |

### C7. New Refund and Refund Item Tables
Reports must subtract refunds on the day they happen (not the day of the original sale), so each refund needs its own dated record.

**Refund Table**
| Field | Data Type | Description |
|---|---|---|
| Refund ID | Unique ID | |
| Sale | Reference to Sale | The original sale |
| Date and Time | Date and time | When the refund was given |
| User | Reference to User | Who processed it |
| Amount | Number, currency | Money returned to the customer |
| Note | Text, optional | Reason |

**Refund Item Table**
| Field | Data Type | Description |
|---|---|---|
| Refund Item ID | Unique ID | |
| Refund | Reference to Refund | |
| Sale Item | Reference to Sale Item | Which line was refunded |
| Quantity | Number | Units returned to stock |
| Amount | Number, currency | Money returned for this line |

Also update the §6.1 intro from "four main tables" to "nine tables: Product, Category, Supplier, Sale, Sale Item, Refund, Refund Item, Inventory History, User Accounts".

---

## D. Scope, environment and assumptions

### D1. EDIT: Guest user is out of scope (§1.2, §2.3)
- Change the Guest rows to: "Not a system user. No public catalog or guest-facing feature is included in this version." Also add "Public product catalog for guests" to the §1.3 "will not include" list.

### D2. EDIT: Operating environment (§2.4)
| Category | Change |
|---|---|
| Frontend | Replace `next-pwa` with `Serwist (@serwist/next)`, the maintained successor. `next-pwa` does not support the current Next.js App Router. Add `next-themes`, `lucide-react` (icons), `sonner` (pop-up notifications). |
| Backend | Replace `bcrypt` with `bcryptjs` (same algorithm, no native build step on Windows or Vercel). Use NextAuth.js **v4** (stable), credentials provider. |
| Database | Add "Hosted on Neon Postgres (via Vercel) in production; Docker PostgreSQL for local development." |
| File storage | New row: "Vercel Blob for product images." |
| Region / Locale | New row: "Philippine peso (₱), Asia/Manila time zone." |

### D3. EDIT: Assumptions (§2.6)
- Add: "Until the owner supplies the official logo, a simple text wordmark ('Estetika') is used as a placeholder."
- Add: "One device at a time" (see B10).

### D4. EDIT: Make performance targets measurable (§5.1)
- "almost instantly" → "within 500 ms for a catalog of up to 5,000 products".
- "load in under 2 seconds under normal conditions" → add "measured on a mid-range phone over a 4G connection after first visit".

### D5. EDIT: Secure connection (§3.4)
- Bullets 1 and 3: specify "HTTPS (TLS)". Vercel provides this automatically.

---

## E. Editorial fixes

- **Title page:** "…System for Multi-Category Retail Management System" repeats "System". Suggest: "BentaTrack: A Web-Based Inventory and Sales Management System for Multi-Category Retail".
- **Title page:** Status reads "Draft / Approved". Pick one (it's a **Draft** until §7 is signed).
- **§3 intro and §3.3:** The text says "the Estetika system". Use "BentaTrack" for the software and "Estetika" for the store, consistently.
- **§1.4 Definitions:** Add *Restock*, *Refund*, *Low Stock Threshold*, *Discontinued*, and *Gross Profit*.
- **§7 Sign-off:** Still unsigned. Sign it after the V2.1 changes are applied.
