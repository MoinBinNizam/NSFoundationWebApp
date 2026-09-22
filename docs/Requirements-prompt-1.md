You are an expert full-stack developer. Write code, logic, and UI architectures based on the following functional specifications for the "NS Foundation Cooperative Society" application.

### SYSTEM REQ 1: Light & Dark Mode System
- Implement a global theme toggle changing a class (e.g., `.dark`) on the root element.
- Ensure all text, background colors, and active components meet WCAG AA contrast visibility requirements in both modes.

### SYSTEM REQ 2: Internationalization (English & Bangla Toggle)
- Default language must be English.
- Implement a language translation toggle. 
- For the Bangla locale, avoid highly complex or Sanskritized terminology. Use clear, everyday colloquial words that clearly explain the concepts (e.g., use simple terms for Shares, Disbursement, Principal Amount, and Expenses/Service Charges).

### SYSTEM REQ 3: Layout & Mobile-First Interface
- Apply a fully responsive, mobile-first design layout engine to all newly built modules. 
- Do not modify or break the existing desktop-only legacy modules already running in the platform.

### SYSTEM REQ 4: Browser Metadata
- Set the document browser tab title to: "NS Foundation Cooperative Society".
- Embed a clear favicon configuration alongside the tab title header.

### SYSTEM REQ 5: Dynamic Financial Disbursement Module
- Base all calculations on the final share adjustments calculated in January 2025.
- The module must calculate payouts by summing the member's principal contributions over a specific timeframe.
- The default timeframe starts in 2024 and goes through an adjustable operational End Year (initially set to 2028).
- Provide an admin UI setting to manually extend this End Year past 2028 if backed by voter consensus.
- Execution Formula: Net Payout = Total Principal Paid (2024 to End Year) minus operational expenses and service charges.

### SYSTEM REQ 6: Accountant & Assistant Accountant Provisioning
- Create an administrative configuration module to assign new user accounts to "Accountant" or "Assistant Accountant" roles.
- Tie respective payment gateways, unique API routing keys, and granular access control permissions to the newly provisioned staff profiles.

### SYSTEM REQ 7: Staff Offboarding & Access Revocation
- Create an administrative workflow to remove or terminate an "Accountant" or "Assistant Accountant".
- Upon termination, execute a full immediate cascade: invalidate all active session tokens, disconnect their linked payment gateways, and revoke all operational roles while preserving historical audit logs.

### SYSTEM REQ 8: One-Page Slip Generator
- Design a compact, comprehensive transaction receipt optimized for printing.
- Using CSS print rules (`@media print`), force the layout to fit on exactly one page.
- The sheet must display all transaction metadata fields and feature designated physical sign-off lines for the "Assistant Accountant" or handling officer.

### SYSTEM REQ 9: Fluid Data Table (Member List View)
- Optimize the Member List table for all viewports.
- Strip out verbose texts or actions and replace them with space-saving visual components or icons.
- Add an explicit horizontal scroll container (`overflow-x: auto`) for smaller mobile viewports to prevent layout breakages on long rows and the final Actions column. 
- On large screens, utilize empty white spaces effectively.

### SYSTEM REQ 10: System Hardening, Validation & Input Sanitization
- Enforce strict input validation, data sanitization, and parameterized query execution across all database entry endpoints to defend against SQL Injection (SQLi) and Cross-Site Scripting (XSS).
- The "Phone Number" input field must fully accept and parse international standard formatting (E.164 digits) to properly validate expatriate members living abroad.
