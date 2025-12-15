# Testing the Payment Access Fix

## Quick Test Steps

### 1. Test Movie Purchase (Watch)
```bash
# Make a payment request for a movie
POST /api/payments/initiate-payment
{
  "amount": 1000,
  "phoneNumber": "+250790000000",
  "userId": "user-uuid",
  "movieId": "movie-uuid",
  "type": "watch",
  "currency": "RWF",
  "accessPeriod": "24h"
}
```

### 2. Confirm Payment
```bash
POST /api/payments/confirm/:paymentId
{
  "status": "succeeded"
}
```

### 3. Check Results

**In Database - Should see 1 row:**
```sql
SELECT * FROM "UserAccesses" 
WHERE "userId" = 'user-uuid' 
AND "movieId" = 'movie-uuid';
```

**Expected columns:**
- `id` - UUID
- `userId` - user-uuid
- `movieId` - movie-uuid
- `seriesId` - NULL
- `accessType` - "view"
- `accessPeriod` - "24h"
- `pricePaid` - 1000
- `currency` - "RWF"
- `expiresAt` - Date in future (24h from now)
- `paymentId` - payment-uuid
- `status` - "active"
- `createdAt` - current timestamp
- `updatedAt` - current timestamp

### 4. Test Movie Access

**Get Movie Details (should show access):**
```bash
GET /api/movies/:movieId
```

**Response should include:**
```json
{
  "success": true,
  "hasAccess": true,          // ✅ NOW TRUE!
  "accessType": "individual",
  "accessDetails": {
    "expiresAt": "2024-12-13T..."
  },
  ...
}
```

### 5. Test Series Purchase

```bash
POST /api/payments/initiate-payment
{
  "amount": 2000,
  "phoneNumber": "+250790000000",
  "userId": "user-uuid",
  "seriesId": "series-uuid",
  "type": "series_access",
  "currency": "RWF",
  "accessPeriod": "30d"
}
```

**Check Database - Should see multiple rows:**
```sql
SELECT COUNT(*) FROM "UserAccesses" 
WHERE "userId" = 'user-uuid' 
AND "seriesId" = 'series-uuid'
AND "status" = 'active';
```

**Expected:** 1 (series) + N (episodes in series) rows

---

## Troubleshooting

### If UserAccess is still empty:
1. ✅ Verify UserAccess import added: Line 6 of `paymentController.js`
2. ✅ Verify `grantMovieAccess()` updated: Should have `UserAccess.create()` call
3. ✅ Verify `grantSeriesAccess()` updated: Should create series + episode records
4. Check server logs for error messages
5. Ensure payment status is actually set to 'succeeded'

### If hasAccess is still false:
1. Check movieController checks UserAccess table (line ~870)
2. Verify UserAccess record has `status: 'active'`
3. Verify `expiresAt` is null OR in the future
4. Clear any browser cache

---

## What Changed

| Aspect | Before | After |
|--------|--------|-------|
| Import UserAccess | ❌ No | ✅ Yes |
| Create UserAccess on payment | ❌ No | ✅ Yes |
| Store in User.watchlist | ✅ Yes | ✅ Yes |
| hasAccess from DB query | ❌ Always false | ✅ True if record exists |
| userAccesses table rows | ❌ 0 | ✅ 1+ per purchase |

