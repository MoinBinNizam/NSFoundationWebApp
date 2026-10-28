# NS Foundation Cooperative Society Management System
## REST API Specification & Reference Manual

Version: 1.0.0  
Architecture: RESTful JSON over HTTPS  
Base URL: `http://localhost:5000/api` (Development) / `https://api.nsfoundation.org/api` (Production)  
Interactive Swagger UI: `http://localhost:5000/api/docs`

---

### Global Standards

#### Authentication
All protected endpoints require an HTTP `Authorization` header containing a valid JSON Web Token (JWT):
```http
Authorization: Bearer <jwt-token>
```

#### Standard Error Response Format
All error responses adhere to the standard envelope:
```json
{
  "success": false,
  "message": "Human-readable error description.",
  "errors": ["Specific validation error item", "Field is required"]
}
```

#### HTTP Status Codes
* `200 OK`: Request succeeded.
* `201 Created`: Resource successfully created.
* `400 Bad Request`: Validation failure or malformed payload.
* `401 Unauthorized`: Missing, invalid, or expired JWT token.
* `403 Forbidden`: Insufficient role or unauthorized scope.
* `404 Not Found`: Target entity does not exist.
* `409 Conflict`: Duplicate key or concurrent conflict.
* `500 Internal Server Error`: Unexpected server exception.

---

### 1. Authentication & Sessions (`/api/auth`)

#### `POST /api/auth/login`
Authenticates a user and issues a signed JWT token.
* **Access**: Public
* **Request Body**:
```json
{
  "email": "moin@nsfoundation.org",
  "password": "Password123!"
}
```
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "6abb8e11bec2a63bd3a924dd",
      "name": "Moin Uddin",
      "email": "moin@nsfoundation.org",
      "role": "ACCOUNTANT",
      "accountantType": "PRIMARY",
      "designation": "ACCOUNTANT"
    }
  }
}
```

#### `GET /api/auth/me`
Retrieves the profile and permissions of the currently authenticated user.
* **Access**: Authenticated

#### `POST /api/auth/change-password`
Changes the user's password and revokes existing sessions.
* **Access**: Authenticated
* **Request Body**:
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewStrongPassword456!"
}
```

---

### 2. Member Management (`/api/members`)

#### `GET /api/members`
Lists all cooperative members with search, status filtering, and pagination.
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`
* **Query Parameters**:
  - `search` (string): Search by name, memberId (e.g. `NSF020`), or phone.
  - `status` (string): Filter by `ACTIVE`, `DROPPED`, `INACTIVE`.
  - `page` (number): Page number (default: 1).
  - `limit` (number): Items per page (default: 50).
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "6abb8e11bec2a63bd3a924f6",
      "memberId": "NSF001",
      "name": "Salah Uddin Shuvo -Director",
      "phone": "+8801521213224",
      "designation": "DIRECTOR",
      "status": "ACTIVE",
      "currentShares": 5,
      "cashoutDue": 0,
      "auditRemarks2024": "All Paid"
    }
  ],
  "pagination": { "total": 35, "page": 1, "limit": 50, "totalPages": 1 }
}
```

#### `POST /api/members`
Registers a new cooperative member.
* **Access**: `ADMIN`, `SUPER_ADMIN`
* **Request Body**:
```json
{
  "memberId": "NSF036",
  "name": "Kamrul Hasan",
  "phone": "+8801711223344",
  "initialShares": 2,
  "joinDate": "2025-01-01",
  "designation": "GENERAL_MEMBER"
}
```

---

### 3. Share History & Annual Accounts (`/api/shares`)

#### `GET /api/shares/member/:memberId`
Returns complete share history ledger and annual accounts for a member.
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`, or Owner `MEMBER`

#### `GET /api/shares/year-account/:memberId/:year`
Returns the audited annual baseline account for a given year.
* **Access**: Authenticated
* **Example**: `/api/shares/year-account/NSF020/2024`
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "year": 2024,
    "annualObligation": 6000,
    "totalPrincipalPaid": 2525,
    "totalPenaltyPaid": 0,
    "totalCashoutPaid": 0,
    "cashoutDue": 20,
    "shortfall": 3500,
    "finalShares": 1,
    "notes": "Due June-Dec payment+May cash out charge 20 tk",
    "isSettled": false
  }
}
```

---

### 4. Contributions & Payments (`/api/payments`)

#### `POST /api/payments`
Records an official contribution payment receipt from a member.
* **Access**: `ACCOUNTANT`, `ADMIN`, `SUPER_ADMIN`
* **Request Body**:
```json
{
  "memberId": "6abb8e11bec2a63bd3a92536",
  "custodyAccountId": "6abb8e12bec2a63bd3a92574",
  "paymentDate": "2025-01-01T00:00:00.000Z",
  "totalAmount": 3130,
  "principalAmount": 3000,
  "penaltyAmount": 120,
  "cashoutCharge": 10,
  "paymentMethod": "BKASH",
  "notes": "Paid May cash out charge 10 tk + June-Dec dues + penalty"
}
```

#### `GET /api/payments/member-summary/:memberId`
Returns comprehensive payment summary, 2024 audit remarks, and month-by-month ledger for a member.
* **Query Parameters**:
  - `year`: (optional, e.g. `2024`, `2025`)
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "member": {
      "memberId": "NSF020",
      "name": "Nasim Billah Rafi",
      "currentShares": 1,
      "cashoutDue": 20,
      "auditRemarks2024": "Due June-Dec payment+May cash out charge 20 tk"
    },
    "summary": {
      "totalPayments": 2525,
      "totalPrincipalPaid": 2525,
      "totalPrincipalDue": 3500,
      "totalPenaltyDue": 120,
      "cashoutDue": 20,
      "totalDues": 3640
    },
    "monthlyLedgers": [...]
  }
}
```

---

### 5. Custody & Cash Reserves (`/api/custody`)

#### `GET /api/custody/summary`
Returns current balance by channel and account holder.
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "totalLiquid": 385215,
    "cashInHand": 5000,
    "bankBalance": 120000,
    "mfsBalance": 260215,
    "accounts": [
      {
        "_id": "6abb8e12bec2a63bd3a92574",
        "name": "bKash Society Merchant/Agent",
        "channel": "BKASH",
        "balance": 260215,
        "holder": "Moin Uddin"
      }
    ]
  }
}
```

#### `GET /api/custody/movements`
Returns the immutable custody movement audit ledger with filtering by account and movement type (`IN` / `OUT`).
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`

---

### 6. Investment Projects & Reinvestments (`/api/investments`)

#### `GET /api/investments/projects`
Lists all investment projects (Agro, Fisheries, Livestock, Trade).
* **Access**: `ADMIN`, `SUPER_ADMIN`, Primary `ACCOUNTANT`

#### `POST /api/investments/projects`
Creates a new investment project and funds capital from custody.

---

### 7. Expenses & Operational Vouchers (`/api/expenses`)

#### `GET /api/expenses`
Lists all operational expenses with custody account attribution.
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`

#### `POST /api/expenses`
Records an approved operational expense and creates a corresponding custody outflow (`OUT`).
* **Request Body**:
```json
{
  "custodyAccountId": "6abb8e12bec2a63bd3a92576",
  "amount": 350,
  "category": "MEETING",
  "date": "2024-04-12",
  "description": "Snacks and water for annual general meeting"
}
```

---

### 8. Governance & Member Exit Settlements (`/api/governance`)

#### `GET /api/governance/exit-settlements`
Lists all member exit settlements (including settled refunds).
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": [
    {
      "memberId": { "memberId": "NSF032", "name": "Ahsan Ul Tanvir" },
      "eligibleAmount": 2000,
      "deductionAmount": 198,
      "netAmount": 1802,
      "paymentMethod": "BKASH",
      "authorizerName": "Moin Uddin",
      "status": "SETTLED",
      "installments": [
        {
          "dueDate": "2026-01-11T00:00:00.000Z",
          "amount": 1802,
          "paidAmount": 1802,
          "paidAt": "2026-01-11T00:00:00.000Z",
          "custodyMovementId": "6abb8e14bec2a63bd3a92588"
        }
      ]
    },
    {
      "memberId": { "memberId": "NSF007", "name": "Bayzid Hasan" },
      "eligibleAmount": 1500,
      "deductionAmount": 500,
      "netAmount": 1000,
      "paymentMethod": "BKASH",
      "authorizerName": "Moin Uddin",
      "status": "SETTLED",
      "installments": [
        {
          "dueDate": "2026-01-15T00:00:00.000Z",
          "amount": 1000,
          "paidAmount": 1000,
          "paidAt": "2026-01-15T00:00:00.000Z",
          "custodyMovementId": "6abb8e14bec2a63bd3a92589"
        }
      ]
    }
  ]
}
```

---

### 9. Reporting & 2024 Annual Audit Statement (`/api/reports`)

#### `GET /api/reports/dashboard`
Returns the real-time organization dashboard summary (Net Worth, Collections, Dues, Custody by Channel).
* **Access**: Authenticated

#### `GET /api/reports/data/audit2024`
Returns the complete, authoritative 35-member 2024 Annual Audit Statement exactly matching the official Audit 2024 Report.
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`
* **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "type": "audit2024",
    "summary": {
      "totalMembers": 35,
      "totalShares": 70,
      "totalAnnualFee": 420000,
      "totalPaid": 388975,
      "paidPrincipal": 387030,
      "totalPenaltyPaid": 1900,
      "coChargePaid": 45,
      "dueAmount": 32440,
      "duePrincipal": 31000,
      "duePenalty": 1410,
      "dueCashout": 30,
      "advanceBalance": 2500,
      "settledExits": [
        { "memberId": "NSF032", "name": "Ahsan Ul Tanvir", "amount": 1802, "method": "BKASH", "status": "SETTLED" },
        { "memberId": "NSF007", "name": "Bayzid Hasan", "amount": 1000, "method": "BKASH", "status": "SETTLED" }
      ]
    },
    "rows": [...35 audited members...],
    "pagination": { "total": 35, "page": 1, "limit": 100, "totalPages": 1 }
  }
}
```

#### `GET /api/reports/data/audit2024/export`
Exports the complete 35-member 2024 Annual Audit Statement as a UTF-8 CSV spreadsheet download.
* **Access**: `ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`

---

### 10. Historical Staging & System Readiness (`/api/health`, `/api/ready`)

#### `GET /api/health`
Health check endpoint returning uptime, timestamp, and database connectivity.
* **Access**: Public
* **Response**: `{ "status": "ok", "uptime": 4589.2, "timestamp": "2026-10-28T12:00:00.000Z" }`

#### `GET /api/ready`
Readiness probe verifying background job workers, Redis/Queue health, and storage integrity.
* **Access**: Public
* **Response**: `{ "status": "ready", "checks": { "db": true, "worker": true } }`
