# Payment Access Issue - Root Cause & Fix

## Problem
After successful payment:
- ✅ Payment status = `succeeded`
- ❌ User `hasAccess` = `false`
- ❌ `userAccesses` table = 0 rows for that user

## Root Cause
The `paymentController.js` was missing **UserAccess database imports and creation logic**.

### What was happening:
1. Payment succeeds → `confirmPayment()` calls `grantMovieAccess(payment)`
2. `grantMovieAccess()` was only updating the User model with JSON arrays:
   - `user.watchlist` (JSON array)
   - `user.downloads` (JSON array)
   - `user.seriesAccess` (JSON array)
3. The movieController checks for **UserAccess database records**, not JSON arrays
4. Since UserAccess records were never created → `hasAccess = false`

### Code Flow Comparison:

**BEFORE (Broken):**
```
Payment succeeded 
  → grantMovieAccess()
    → Save user.watchlist JSON array ❌
    → NO UserAccess record created ❌
  → checkUserAccessToMovie() 
    → Query UserAccess table → 0 rows ❌
    → hasAccess = false
```

**AFTER (Fixed):**
```
Payment succeeded 
  → grantMovieAccess()
    → Save user.watchlist JSON array ✅
    → Create UserAccess record ✅
  → checkUserAccessToMovie()
    → Query UserAccess table → record found ✅
    → hasAccess = true
```

## Changes Made

### 1. **Added UserAccess Import**
```javascript
// Line 6 in paymentController.js
import UserAccess from "../models/userAccess.model.js";
```

### 2. **Updated grantMovieAccess() Function**
- Now creates a UserAccess record for each purchase
- Properly sets accessType based on payment type
- Sets expiresAt based on accessPeriod
- For 'watch' type: expires in 48 hours
- For 'download' type: permanent (one-time)

```javascript
// 🔥 CREATE UserAccess RECORD IN DATABASE
await UserAccess.create({
  userId: payment.userId,
  movieId: payment.movieId,
  accessType: accessType,
  accessPeriod: payment.accessPeriod || 'one-time',
  pricePaid: payment.amount,
  currency: payment.currency || 'RWF',
  expiresAt: expiresAt,
  paymentId: payment.id,
  status: 'active'
});
```

### 3. **Updated grantSeriesAccess() Function**
- Creates UserAccess record for the series
- Creates UserAccess records for all episodes in the series
- All records expire at the same time (based on series access period)

```javascript
// Series access
await UserAccess.create({
  userId: payment.userId,
  seriesId: series.id,
  accessType: 'series',
  ...
});

// Individual episode access
episodes.map(episode => {
  return UserAccess.create({
    userId: payment.userId,
    movieId: episode.id,
    seriesId: series.id,
    ...
  });
});
```

## Why This Matters
The `userAccess` table is the **single source of truth** for checking user access:

- **movieController.js** (line ~870) queries UserAccess:
  ```javascript
  const individualAccess = await UserAccess.findOne({
    where: {
      userId,
      movieId: movie.id,
      status: "active",
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ]
    },
  });
  ```

- User access arrays in the User model are for display/tracking only
- The database UserAccess records are what determine actual access permissions

## Testing
After this fix:
1. Make a payment
2. Confirm payment status = 'succeeded'
3. Check `userAccesses` table → should have 1+ records
4. Try accessing the movie → `hasAccess` should be true

## Related Tables
- **Payments** - Transaction records
- **UserAccess** - Permission records (CRITICAL)
- **Users** - User JSON arrays (supplementary)

---
**Status:** Fixed ✅
**Files Modified:** `controllers/paymentController.js`
