# Quick Reference - Payment & Access System

## The Problem (FIXED ✅)
```
Payment succeeded ✅
BUT
hasAccess = false ❌
userAccesses table = empty ❌
```

## The Root Cause
- PaymentController never created UserAccess database records
- MovieController couldn't find any access records
- Result: No access granted despite payment success

## The Solution

### 1. PaymentController - Create Records on Payment
```javascript
// When payment succeeds, create UserAccess record
await UserAccess.create({
  userId: payment.userId,
  movieId: payment.movieId,
  status: 'active',
  expiresAt: expiresAt,  // Calculated from accessPeriod
  paymentId: payment.id,
  // ... other fields
});
```

### 2. MovieController - Check Records Properly
```javascript
// Get movie by ID and check access
const userAccess = await UserAccess.findOne({
  where: {
    userId: userId,
    movieId: movieId,
    status: 'active',
    [Op.or]: [
      { expiresAt: null },              // Permanent
      { expiresAt: { [Op.gt]: new Date() } }  // Not expired
    ]
  }
});

if (userAccess) {
  hasAccess = true;
  accessType = 'individual';
}
```

## Key Files Changed

### paymentController.js
- Line 6: Added UserAccess import
- Lines 198-265: Updated grantMovieAccess()
- Lines 270-380: Updated grantSeriesAccess()

### movieController.js
- Line 3: Added User import
- Lines 865-930: Updated access checks in getMovieById()

## Access Check Priority

1. **Individual Access** - Bought this movie/episode
2. **Series Access** - Bought the series (for episodes)
3. **Filmmaker** - Created this content
4. **Subscription** - Has active subscription plan
5. **Free Content** - viewPrice = 0

## Quick API Test

```bash
# 1. Make payment
curl -X POST http://localhost:5000/api/payments/pay-with-momo \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "phoneNumber": "+250790000000",
    "userId": "user-123",
    "movieId": "movie-456",
    "type": "watch",
    "currency": "RWF"
  }'

# 2. Check response for paymentStatus: "succeeded"

# 3. Get movie details
curl -X GET http://localhost:5000/api/movies/movie-456 \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Check response for hasAccess: true
```

## Quick Database Check

```sql
-- Check if UserAccess records exist
SELECT * FROM "UserAccesses" 
WHERE "userId" = 'user-123' 
ORDER BY "createdAt" DESC;
```

## Common Issues & Fixes

| Issue | Check | Fix |
|-------|-------|-----|
| hasAccess = false | UserAccess table empty | Verify grantMovieAccess() called |
| Payment succeeded but no access | Payment.paymentStatus = 'succeeded' | Check payment confirmation logic |
| Series doesn't grant episode access | UserAccess seriesId matches | Verify grantSeriesAccess() creates episode records |
| Subscription doesn't grant access | User.isUpgraded = true | Verify subscription check in getMovieById() |

## Database Schema (UserAccess)

```
id (UUID) - Primary key
userId (UUID) - Who has access
movieId (UUID) - What movie (or NULL for series)
seriesId (UUID) - What series (or NULL for movie)
accessType (ENUM) - "view", "download", "series"
accessPeriod (ENUM) - "one-time", "24h", "7d", etc.
status (ENUM) - "active", "expired", "cancelled"
expiresAt (DATE) - When access expires (NULL = permanent)
paymentId (STRING) - Link to payment
pricePaid (DECIMAL) - Amount paid for this access
currency (STRING) - Currency of payment
createdAt (DATE) - When record created
updatedAt (DATE) - When last updated
```

## Response Format

### Movie with Access
```json
{
  "userAccess": {
    "hasAccess": true,
    "accessType": "individual",
    "expiresAt": "2024-12-13T10:00:00Z",
    "requiresPurchase": false,
    "price": 1000
  }
}
```

### Movie without Access
```json
{
  "userAccess": {
    "hasAccess": false,
    "accessType": null,
    "expiresAt": null,
    "requiresPurchase": true,
    "price": 1000
  }
}
```

## Performance Notes

- Individual access check: 1 DB query
- Series check (if episode): +1 query
- Subscription check: +1 query
- Total: 1-3 queries per getMovieById()

All have database indexes for fast lookup.

## Testing Scenarios

### ✅ Should have access
- [x] Bought movie with active access
- [x] Bought series + viewing episode
- [x] Has active subscription
- [x] Is the filmmaker/creator
- [x] Movie is free (viewPrice = 0)

### ❌ Should NOT have access
- [x] Didn't purchase + no subscription
- [x] Access expired (expiresAt in past)
- [x] Wrong user ID

## Related Documentation

- `COMPLETE_FIX_SUMMARY.md` - Full technical details
- `TESTING_GUIDE.md` - Comprehensive test cases
- `FLOW_DIAGRAM.md` - Visual flow charts
- `IMPLEMENTATION_CHECKLIST.md` - Deployment checklist

## Emergency Contacts

**Issue:** UserAccess records not being created
1. Check paymentController.js line 246: `await UserAccess.create()`
2. Check server logs for creation messages
3. Verify payment actually reached 'succeeded' status

**Issue:** hasAccess still false despite record
1. Check record exists in database
2. Verify status = 'active'
3. Verify expiresAt is NULL or in future
4. Clear browser cache
5. Check movieController subscription logic

---

**Last Updated:** December 11, 2025
**Status:** Ready to Use ✅
