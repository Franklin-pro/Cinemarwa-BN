# Payment & Access System - Visual Flow Diagram

## Complete User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER WANTS TO WATCH MOVIE                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Check if free movie │
                    └─────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
           YES (FREE)                    NO (PAID)
                │                            │
                ▼                            ▼
        ┌───────────────┐          ┌──────────────────┐
        │ Grant access  │          │ Show payment form│
        │ automatically │          └──────────────────┘
        └───────────────┘                   │
                │                            ▼
                │                  ┌────────────────────┐
                │                  │ User pays (MoMo)   │
                │                  │ or Stripe          │
                │                  └────────────────────┘
                │                            │
                │                            ▼
                │                  ┌────────────────────┐
                │                  │ Payment callback   │
                │                  │ paymentStatus=     │
                │                  │ 'succeeded'        │
                │                  └────────────────────┘
                │                            │
                │                            ▼
                │              ┌─────────────────────────────────┐
                │              │ CREATE UserAccess RECORD:       │
                │              │ - userId: buyer                 │
                │              │ - movieId: content              │
                │              │ - status: 'active'              │
                │              │ - expiresAt: calculated         │
                │              │ - paymentId: payment record     │
                │              └─────────────────────────────────┘
                │                            │
                └────────────┬───────────────┘
                             │
                             ▼
                  ┌──────────────────────────┐
                  │ User tries to watch      │
                  │ Calls getMovieById()     │
                  └──────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │           CHECK USER ACCESS                │
        │ ┌──────────────────────────────────────┐   │
        │ │ [1] Individual UserAccess record?    │   │
        │ │  WHERE userId = user                 │   │
        │ │    AND movieId = movie               │   │
        │ │    AND status = 'active'             │   │
        │ │    AND (expiresAt IS NULL            │   │
        │ │         OR expiresAt > NOW)          │   │
        │ └──────────────────────────────────────┘   │
        │           ↓ (if episode)                   │
        │ ┌──────────────────────────────────────┐   │
        │ │ [2] Series UserAccess record?        │   │
        │ │  WHERE userId = user                 │   │
        │ │    AND seriesId = series             │   │
        │ │    AND status = 'active'             │   │
        │ │    AND (expiresAt IS NULL            │   │
        │ │         OR expiresAt > NOW)          │   │
        │ └──────────────────────────────────────┘   │
        │           ↓                                 │
        │ ┌──────────────────────────────────────┐   │
        │ │ [3] Is user the filmmaker?           │   │
        │ │  WHERE movie.filmmakerId = userId    │   │
        │ └──────────────────────────────────────┘   │
        │           ↓                                 │
        │ ┌──────────────────────────────────────┐   │
        │ │ [4] Does user have subscription?     │   │
        │ │  WHERE user.isUpgraded = true        │   │
        │ │    AND subscription.endDate > NOW    │   │
        │ └──────────────────────────────────────┘   │
        └────────────────────────────────────────────┘
                             │
        ┌────────────────────┴──────────────────────┐
        │                                            │
     FOUND                                       NOT FOUND
        │                                            │
        ▼                                            ▼
┌──────────────────┐                      ┌──────────────────┐
│ hasAccess: true  │                      │ hasAccess: false │
│ accessType: ...  │                      │ requiresPurchase │
│ expiresAt: ...   │                      └──────────────────┘
│                  │                               │
│ ✅ Allow access  │                      ❌ Deny access
│ Increment views  │                      Show payment form
│ Return 200       │                      Return 200 (with
│                  │                      requiresPurchase)
└──────────────────┘
        │
        ▼
   USER CAN WATCH!
```

---

## Payment Flow - Detailed

```
┌───────────────────────────────────────┐
│ POST /api/payments/pay-with-momo      │
└───────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────┐
│ Validate payment request              │
│ - Check movie exists                  │
│ - Check filmmaker setup               │
│ - Calculate distribution              │
└───────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────┐
│ Call Lanari Pay API (MoMo)            │
│ requestToPay()                        │
└───────────────────────────────────────┘
            │
            ▼
    ┌───────┴────────┐
    │                │
 SUCCESS          FAILURE
    │                │
    ▼                ▼
┌─────┐        ┌──────────┐
│ YES │        │ REJECTED │
└──┬──┘        └──────────┘
   │
   ▼
┌───────────────────────────────────────┐
│ Create Payment record in database     │
│ - paymentStatus: 'succeeded'          │
│ - filmmakerId: from movie             │
│ - amount: with distribution           │
│ - all required metadata               │
└───────────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────────┐
│ [CRITICAL] grantMovieAccess()         │
│                                       │
│ 1. Get user & movie                   │
│ 2. Calculate expiresAt                │
│ 3. Update user watchlist/downloads    │
│ 4. ✅ CREATE UserAccess RECORD        │
│    - All required fields              │
│    - status = 'active'                │
│    - expiresAt calculated             │
│ 5. Increment movie views/revenue      │
└───────────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────────┐
│ updateFilmmakerRevenue()              │
│ - Add to pending balance              │
│ - Update total earned                 │
└───────────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────────┐
│ processAutomaticWithdrawals()         │
│ - Create withdrawal records           │
│ - Distribute funds                    │
│ - Send MoMo payouts                   │
└───────────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────────┐
│ Return Success Response               │
│ - transactionId                       │
│ - status: 'SUCCESSFUL'                │
│ - access: granted info                │
│ - withdrawals: payout info            │
└───────────────────────────────────────┘
```

---

## Series Purchase Flow

```
┌─────────────────────────────────────┐
│ POST /api/payments/pay-series        │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Validate request                    │
│ - Series exists                     │
│ - Price matches tier                │
│ - Filmmaker setup valid             │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Call Lanari Pay API                 │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Create Payment record               │
│ - type: 'series_access'             │
│ - seriesId: set                     │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ grantSeriesAccess()                 │
│                                     │
│ 1. Get series & episodes list       │
│ 2. Calculate expiry date            │
│ 3. ✅ CREATE UserAccess (SERIES)    │
│    - seriesId: set                  │
│    - movieId: NULL                  │
│    - status: 'active'               │
│ 4. ✅ CREATE UserAccess (EPISODES)  │
│    - For each episode in series     │
│    - seriesId: set                  │
│    - movieId: set                   │
│    - Same expiryDate as series      │
│ 5. Update series revenue            │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ processAutomaticWithdrawals()       │
│ - Create withdrawal records         │
│ - Send payouts                      │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Return Success Response             │
│ - seriesId                          │
│ - episodeCount                      │
│ - accessPeriod                      │
└─────────────────────────────────────┘
```

---

## Database State Transitions

### Before Payment
```
Users:
├── id: user-123
├── isUpgraded: false
└── subscription: null

Payments: (empty)

UserAccesses: (empty)
```

### After Movie Payment (Successful)
```
Users:
├── id: user-123
├── isUpgraded: false
├── subscription: null
└── watchlist: [                    ← Updated here
    {
      movie: movie-456,
      grantedAt: 2024-12-11,
      expiresAt: 2024-12-13,
      transactionId: payment-789
    }
  ]

Payments:
├── id: payment-789
├── userId: user-123
├── movieId: movie-456
├── paymentStatus: 'succeeded'      ← CREATED
├── amount: 1000
├── filmmakerId: filmmaker-111
└── ...

UserAccesses:
├── id: access-xxx                  ← CREATED ✅
├── userId: user-123
├── movieId: movie-456
├── status: 'active'
├── expiresAt: 2024-12-13
├── paymentId: payment-789
└── ...
```

### After Series Payment (Successful)
```
UserAccesses:
├── [0] Series record
│   ├── userId: user-123
│   ├── seriesId: series-789
│   ├── movieId: NULL
│   ├── status: 'active'
│   └── expiresAt: 2024-01-10
│
├── [1] Episode 1 record
│   ├── userId: user-123
│   ├── seriesId: series-789
│   ├── movieId: episode-001
│   ├── status: 'active'
│   └── expiresAt: 2024-01-10
│
├── [2] Episode 2 record
│   ├── userId: user-123
│   ├── seriesId: series-789
│   ├── movieId: episode-002
│   ├── status: 'active'
│   └── expiresAt: 2024-01-10
│
└── ... (more episodes)
```

### After Subscription Payment
```
Users:
├── id: user-123
├── isUpgraded: true                ← UPDATED ✅
└── subscription: {                 ← UPDATED ✅
    planId: 'pro',
    planName: 'Pro Plan',
    status: 'active',
    endDate: 2025-01-11,
    maxDevices: 4
  }

Payments:
├── id: payment-890
├── userId: user-123
├── type: 'subscription_upgrade'
├── planId: 'pro'
├── paymentStatus: 'succeeded'
└── ...

UserAccesses: (empty)               ← NO RECORDS CREATED
                                    ← (checked from User model instead)
```

---

## Key Points

✅ **UserAccess is the source of truth** for movie/episode access
✅ **User model stores subscription** state for platform-wide access
✅ **Both are checked in getMovieById** for complete access determination
✅ **Expiry is properly validated** for both NULL (permanent) and future dates
✅ **Series purchases create N+1 records** (series + all episodes)
✅ **Access types are clear**: individual, series, owner, subscription

---

**Last Updated:** December 11, 2025
