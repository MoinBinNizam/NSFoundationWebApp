export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'NS Foundation Cooperative Society Management System API',
    version: '1.0.0',
    description:
      'Complete interactive API testing suite for NS Foundation. Authenticate using the Authorize button above with your Bearer JWT token from /api/auth/login.',
    contact: {
      name: 'NS Foundation IT & Governance',
      email: 'tech@nsfoundation.org',
    },
  },
  servers: [
    ...(process.env.API_URL
      ? [
          {
            url: process.env.API_URL,
            description: 'Active API Environment',
          },
        ]
      : []),
    {
      url: '/',
      description: 'Current Relative Host (Automatic)',
    },
    {
      url: 'http://localhost:5000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token (without "Bearer " prefix) obtained from POST /api/auth/login.',
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Authentication, session management & profile' },
    { name: 'Members', description: 'Member roster, registration & status management' },
    { name: 'Shares', description: 'Share allocations, historical changes & annual accounts' },
    { name: 'Payments & Contributions', description: 'Contribution receipts, member summaries & ledgers' },
    { name: 'Custody & Reserves', description: 'Accountant custody holdings & immutable movement ledger' },
    { name: 'Investments', description: 'Investment projects, capital deployment & ROI returns' },
    { name: 'Expenses', description: 'Operational expense vouchers & custody outflows' },
    { name: 'Governance & Exit Settlements', description: 'Member departure settlements, refund tracking & policies' },
    { name: 'Reports & Audit', description: 'Financial dashboard, 2024 Authoritative Audit Statement & CSV export' },
    { name: 'Health & Readiness', description: 'System health checks & background worker readiness' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health & Readiness'],
        summary: 'Check API and Database Health',
        security: [],
        responses: {
          200: { description: 'System is healthy and database is connected' },
          503: { description: 'Database is disconnected or degraded' },
        },
      },
    },
    '/api/ready': {
      get: {
        tags: ['Health & Readiness'],
        summary: 'Deep Readiness Probe (DB, Latency & Job Worker Heartbeat)',
        security: [],
        responses: {
          200: { description: 'System is fully ready for traffic' },
          503: { description: 'Worker degraded or database unreachable' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with Email and Password',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'moin@nsfoundation.org' },
                  password: { type: 'string', example: 'Password123!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful. Returns JWT token and user profile.' },
          401: { description: 'Invalid credentials or inactive account.' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get Authenticated User Profile & Role Scope',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Profile details returned successfully.' },
          401: { description: 'Unauthorized or token expired.' },
        },
      },
    },
    '/api/members': {
      get: {
        tags: ['Members'],
        summary: 'List Members with Search, Filter & Pagination',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by ID (e.g. NSF020), name, or phone' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'DROPPED', 'INACTIVE'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          200: { description: 'Member list returned successfully.' },
        },
      },
      post: {
        tags: ['Members'],
        summary: 'Register a New Member',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['memberId', 'name', 'phone', 'initialShares'],
                properties: {
                  memberId: { type: 'string', example: 'NSF036' },
                  name: { type: 'string', example: 'Kamrul Hasan' },
                  phone: { type: 'string', example: '+8801711223344' },
                  initialShares: { type: 'number', example: 2 },
                  joinDate: { type: 'string', format: 'date', example: '2025-01-01' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Member registered successfully.' },
          400: { description: 'Validation failed or duplicate memberId.' },
        },
      },
    },
    '/api/members/{id}': {
      get: {
        tags: ['Members'],
        summary: 'Get Member Details by ID',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Member details returned.' },
          404: { description: 'Member not found.' },
        },
      },
    },
    '/api/payments': {
      post: {
        tags: ['Payments & Contributions'],
        summary: 'Post a New Member Contribution Receipt',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['memberId', 'custodyAccountId', 'totalAmount', 'paymentDate'],
                properties: {
                  memberId: { type: 'string', description: 'MongoDB ObjectId of Member' },
                  custodyAccountId: { type: 'string', description: 'Destination Custody Account ID' },
                  totalAmount: { type: 'number', example: 1000 },
                  principalAmount: { type: 'number', example: 1000 },
                  penaltyAmount: { type: 'number', example: 0 },
                  cashoutCharge: { type: 'number', example: 0 },
                  paymentMethod: { type: 'string', enum: ['CASH', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'OTHER'], example: 'BKASH' },
                  paymentDate: { type: 'string', format: 'date-time' },
                  notes: { type: 'string', example: 'Regular monthly contribution' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Payment recorded and allocated.' },
        },
      },
    },
    '/api/payments/member-summary/{memberId}': {
      get: {
        tags: ['Payments & Contributions'],
        summary: 'Get Member Payment Summary, 2024 Audit Remarks & Dues',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'memberId', in: 'path', required: true, schema: { type: 'string' }, example: 'NSF020' },
          { name: 'year', in: 'query', schema: { type: 'string' }, example: '2024' },
        ],
        responses: {
          200: { description: 'Member payment and due breakdown returned.' },
        },
      },
    },
    '/api/custody/summary': {
      get: {
        tags: ['Custody & Reserves'],
        summary: 'Get Custody Cash & Bank Reserves Summary',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Custody balances returned.' },
        },
      },
    },
    '/api/custody/movements': {
      get: {
        tags: ['Custody & Reserves'],
        summary: 'Get Immutable Custody Movement Audit Ledger',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'movementType', in: 'query', schema: { type: 'string', enum: ['IN', 'OUT'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          200: { description: 'Custody movements returned.' },
        },
      },
    },
    '/api/investments/projects': {
      get: {
        tags: ['Investments'],
        summary: 'List All Investment Projects',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Projects list returned.' },
        },
      },
    },
    '/api/expenses': {
      get: {
        tags: ['Expenses'],
        summary: 'List Operational Expenses',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Expenses returned.' },
        },
      },
      post: {
        tags: ['Expenses'],
        summary: 'Record an Expense Voucher with Custody Outflow',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['custodyAccountId', 'amount', 'category', 'description'],
                properties: {
                  custodyAccountId: { type: 'string' },
                  amount: { type: 'number', example: 500 },
                  category: { type: 'string', example: 'COMMUNICATION' },
                  date: { type: 'string', format: 'date' },
                  description: { type: 'string', example: 'Mobile internet allowance' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Expense recorded.' },
        },
      },
    },
    '/api/governance/exit-settlements': {
      get: {
        tags: ['Governance & Exit Settlements'],
        summary: 'List Departed Member Exit Settlements & Refunds',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Exit settlements returned.' },
        },
      },
    },
    '/api/reports/dashboard': {
      get: {
        tags: ['Reports & Audit'],
        summary: 'Get Executive Society Dashboard Metrics & Net Worth',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Dashboard metrics returned.' },
        },
      },
    },
    '/api/reports/data/audit2024': {
      get: {
        tags: ['Reports & Audit'],
        summary: 'Get Official 2024 Authoritative Audit Statement (35 Members)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search member ID or name' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          200: { description: 'Complete 35-member audit report with dues and refunds returned.' },
        },
      },
    },
    '/api/reports/data/audit2024/export': {
      get: {
        tags: ['Reports & Audit'],
        summary: 'Export 2024 Annual Audit Statement as CSV',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Returns CSV file attachment for direct download.',
            content: { 'text/csv': {} },
          },
        },
      },
    },
  },
};
