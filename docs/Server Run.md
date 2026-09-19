Ran command: `curl -s http://localhost:5000/api/health`
Used tool: manage_task
Used tool: manage_task
Ran command: `Invoke-RestMethod -Uri http://localhost:5000/api/health`
Ran command: `Invoke-RestMethod -Uri http://localhost:5000/api/shares/stats`
Viewed package.json:1-13

Yes! **Opening two separate terminal windows (or tabs) is the standard best practice** in web development. This lets you observe backend API logs/database queries in one terminal and frontend compilation/Vite hot-reloading in the other.

---

### Why the Backend Needs a Restart Right Now
Notice in your terminal that an old process has been running for over 2 hours:
> `npm start (in c:\TechVelly\NSFoundationWebApp\backend)`

Because `npm start` runs the compiled snapshot from earlier today, it does **not** have the new **Issue #3 (Auth)**, **Issue #4 (Members)**, and **Issue #5 (Shares)** routes loaded yet. We will restart it in **watch/dev mode** so any new changes auto-reload instantly!

---

### Step-by-Step Guide to Run Both and View in Browser

#### Step 1: Stop the Old Backend Server
In the terminal where `npm start` is currently running:
1. Click into the terminal window.
2. Press **`Ctrl + C`** (and type `Y` if prompted) to terminate the old process.

---

#### Step 2: Seed the Admin & Accountant Accounts (One-Time Setup)
Run this command from the root directory to populate the database with the initial staff logins:
```bash
npm run seed:users --prefix backend
```
> This creates:
> - **Primary Admin & Accountant (Moin):** `admin@nsfoundation.org` / `Admin@123456`
> - **Assistant Accountant (Samrat):** `assistant@nsfoundation.org` / `Assistant@123456`

---

#### Step 3: Start the Backend (Terminal 1)
In your first terminal, run:
```bash
npm run dev:backend
```
*(Or navigate to `cd backend` and run `npm run dev`)*
* Output will confirm:
  ```text
  [Server] HTTP server running on port 5000
  [Database] Connected successfully to MongoDB
  ```
* Because this uses `tsx watch`, any edits you make to the backend will automatically reload!

---

#### Step 4: Start the Frontend (Terminal 2)
Open a second terminal window (or click the `+` icon in your terminal panel to open a new tab) and run:
```bash
npm run dev:frontend
```
*(Or navigate to `cd frontend` and run `npm run dev`)*
* Output will display:
  ```text
    VITE v5.x.x  ready in 300 ms

    ➜  Local:   http://localhost:5173/
    ➜  Network: use --host to expose
  ```

---

#### Step 5: Open in Your Browser
1. Open your browser and navigate to:
   👉 **[http://localhost:5173](http://localhost:5173)**
2. You will be automatically redirected to the **Sign In** screen.
3. You can either type your credentials or click the **One-Click Dev Seeded Credentials** buttons:
   - Click **"Primary Admin"** $\to$ automatically fills `admin@nsfoundation.org` and signs in as Moin.
   - Click **"Assistant Acc."** $\to$ automatically fills `assistant@nsfoundation.org` and signs in as Samrat.
4. Once signed in, you can test:
   - **Member Management (`/members`)**: View live KPI cards, test the 300ms debounced search, filter by status (`ACTIVE`, `INACTIVE`, `DROPPED`), or click **"Add Member"** to register a new member with an auto-generated `NSF001` sequential ID.
   - **Shares & Annual Account (`/shares`)**: Switch between Member Shares, the immutable Share Event Timeline, and the 2024 Annual Reconciliation ledger. Test adjusting shares or transferring shares between members!