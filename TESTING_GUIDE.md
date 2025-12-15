# Complete Payment & Access Flow - Testing Guide

## Summary of Fixes

### Fix 1: Payment Controller - Create UserAccess Records
**File:** `controllers/paymentController.js`
- ✅ Added UserAccess import
- ✅ Updated `grantMovieAccess()` to create UserAccess records
- ✅ Updated `grantSeriesAccess()` to create UserAccess records for series + episodes

### Fix 2: Movie Controller - Check UserAccess Properly
**File:** `controllers/movieController.js`
- ✅ Added User model import
- ✅ Fixed series access check to handle NULL expiresAt
- ✅ Added subscription access check
- ✅ Proper access type detection

---

## Complete Flow Testing

### Test 1: Movie Purchase (Watch)

**Step 1: Initiate Payment**
```bash
POST /api/payments/pay-with-momo
{
  "amount": 1000,
  "phoneNumber": "+250790000000",
  "userId": "user-123",
  "movieId": "movie-456",
  "type": "watch",
  "currency": "RWF",
  "accessPeriod": "24h"
}
```

**Expected Response:**
```json
{
  "success": true,
  "status": "SUCCESSFUL",
  "transactionId": "payment-789",
  "access": { "success": true }
}
```

**Step 2: Check Database**
```sql
-- Payment record
SELECT * FROM "Payments" WHERE id = 'payment-789';
-- Expected: paymentStatus = 'succeeded'

-- UserAccess record
SELECT * FROM "UserAccesses" 
WHERE "userId" = 'user-123' AND "movieId" = 'movie-456';
-- Expected: 1 row with status = 'active'
```

**Step 3: Get Movie Details**
```bash
GET /api/movies/movie-456
Headers: { Authorization: Bearer <token> }
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "movie-456",
    "title": "Movie Title",
    "viewPrice": 1000,
    "userAccess": {
      "hasAccess": true,           // ✅ KEY: This should be TRUE
      "accessType": "individual",
      "expiresAt": "2024-12-13T10:30:00Z",
      "requiresPurchase": false,
      "price": 1000
    }
  }
}
```

---

### Test 2: Series Purchase

**Step 1: Initiate Series Payment**
```bash
POST /api/payments/pay-series-with-momo
{
  "amount": 2000,
  "phoneNumber": "+250790000000",
  "userId": "user-123",
  "seriesId": "series-789",
  "currency": "RWF",
  "accessPeriod": "30d"
}
```

**Expected Response:**
```json
{
  "success": true,
  "status": "SUCCESSFUL",
  "access": {
    "success": true,
    "seriesId": "series-789",
    "accessPeriod": "30d",
    "episodeCount": 10
  }
}
```

**Step 2: Check Database**
```sql
-- Series UserAccess
SELECT COUNT(*) FROM "UserAccesses" 
WHERE "userId" = 'user-123' 
AND "seriesId" = 'series-789' 
AND "status" = 'active';
-- Expected: 1 (series itself)

-- Episode UserAccess
SELECT COUNT(*) FROM "UserAccesses" 
WHERE "userId" = 'user-123' 
AND "seriesId" = 'series-789' 
AND "movieId" IS NOT NULL
AND "status" = 'active';
-- Expected: N (number of episodes)
```

**Step 3: Get Episode (Should Have Access)**
```bash
GET /api/movies/episode-001
Headers: { Authorization: Bearer <token> }
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "episode-001",
    "contentType": "episode",
    "seriesId": "series-789",
    "userAccess": {
      "hasAccess": true,           // ✅ KEY: True because of series access
      "accessType": "series",
      "expiresAt": "2024-01-10T10:30:00Z",
      "requiresPurchase": false
    }
  }
}
```

---

### Test 3: Subscription Access

**Step 1: Purchase Subscription**
```bash
POST /api/payments/pay-subscription-with-momo
{
  "amount": 5000,
  "phoneNumber": "+250790000000",
  "userId": "user-123",
  "planId": "pro",
  "period": "month",
  "currency": "RWF",
  "type": "subscription_upgrade"
}
```

**Expected Response:**
```json
{
  "success": true,
  "status": "SUCCESSFUL",
  "subscription": {
    "planId": "pro",
    "startDate": "2024-12-11T...",
    "endDate": "2025-01-11T...",
    "maxDevices": 4
  }
}
```

**Step 2: Check User Update**
```sql
SELECT id, isUpgraded, subscription, maxDevices FROM "Users" 
WHERE id = 'user-123';
-- Expected: isUpgraded = true, subscription = {...}, maxDevices = 4
```

**Step 3: Get Any Movie (Should Have Access)**
```bash
GET /api/movies/any-movie-123
Headers: { Authorization: Bearer <token> }
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "any-movie-123",
    "userAccess": {
      "hasAccess": true,           // ✅ KEY: True because of subscription
      "accessType": "subscription",
      "expiresAt": "2025-01-11T...",
      "requiresPurchase": false
    }
  }
}
```

---

### Test 4: Filmmaker Viewing Own Content

**Step 1: Get Filmmaker's Movie**
```bash
GET /api/movies/filmmaker-movie-456
Headers: { Authorization: Bearer <filmmaker-token> }
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "filmmaker-movie-456",
    "filmmakerId": "filmmaker-uuid",
    "userAccess": {
      "hasAccess": true,           // ✅ KEY: True because they're the creator
      "accessType": "owner",
      "expiresAt": null,           // ✅ No expiration for owner
      "requiresPurchase": false
    }
  }
}
```

---

### Test 5: No Access Scenario

**Step 1: Get Movie Without Purchase/Subscription**
```bash
GET /api/movies/expensive-movie-999
Headers: { Authorization: Bearer <random-user-token> }
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "expensive-movie-999",
    "viewPrice": 5000,
    "userAccess": {
      "hasAccess": false,          // ✅ KEY: False - no access
      "accessType": null,
      "expiresAt": null,
      "requiresPurchase": true,
      "price": 5000
    }
  }
}
```

---

## Database Verification Checklist

### After Movie Purchase:
- [ ] `Payments` table has 1 new row with `paymentStatus = 'succeeded'`
- [ ] `UserAccesses` table has 1 new row with:
  - `userId` = buyer ID
  - `movieId` = movie ID
  - `status` = 'active'
  - `expiresAt` = 48 hours from now (for watch)
  - `pricePaid` = amount paid
- [ ] `Withdrawals` table has 2 rows (filmmaker + admin)

### After Series Purchase:
- [ ] `Payments` table has 1 new row
- [ ] `UserAccesses` table has N+1 rows (1 series + N episodes)
- [ ] All have same `expiresAt` date
- [ ] Series row has `seriesId` set, `movieId` = NULL
- [ ] Episode rows have both `seriesId` and `movieId` set

### After Subscription:
- [ ] `Payments` table has 1 new row with `type = 'subscription_upgrade'`
- [ ] `Users` table updated: `isUpgraded = true`, `subscription` object exists
- [ ] No rows in `UserAccesses` (subscription check is different)

---

## Common Issues & Solutions

### Issue: hasAccess = false after payment succeeded

**Check:**
1. ✅ Verify Payment.paymentStatus = 'succeeded' in database
2. ✅ Verify UserAccess record exists in database
3. ✅ Verify UserAccess.status = 'active'
4. ✅ Verify UserAccess.expiresAt is NULL or in the future
5. ✅ Check browser console for API response
6. ✅ Clear browser cache

### Issue: UserAccess table is empty

**Check:**
1. ✅ Verify paymentController.js has `import UserAccess`
2. ✅ Verify `grantMovieAccess()` calls `UserAccess.create()`
3. ✅ Check server logs for errors
4. ✅ Verify payment actually reached 'succeeded' status

### Issue: Series episodes show hasAccess = false

**Check:**
1. ✅ Verify UserAccess rows exist for episodes with seriesId set
2. ✅ Verify series UserAccess record has matching seriesId
3. ✅ Verify movieController checks series access for episodes
4. ✅ Check expiresAt is not in the past

### Issue: Subscription users can't access content

**Check:**
1. ✅ Verify User.isUpgraded = true
2. ✅ Verify User.subscription object exists
3. ✅ Verify subscription.endDate > now
4. ✅ Verify movieController subscription check is enabled

---

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/payments/pay-with-momo` | POST | Movie purchase |
| `/api/payments/pay-series-with-momo` | POST | Series purchase |
| `/api/payments/pay-subscription-with-momo` | POST | Subscription purchase |
| `/api/payments/confirm/:paymentId` | POST | Confirm pending payment |
| `/api/movies/:movieId` | GET | Get movie + access status |
| `/api/movies/:movieId` | GET | Get series + access status |

---

**Last Updated:** December 11, 2025
**Status:** All fixes implemented ✅
