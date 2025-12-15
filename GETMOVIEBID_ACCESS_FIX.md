# GetMovieById - UserAccess Check Fix

## Changes Made

### 1. **Fixed Series Access Check (movieController.js)**
Updated the series access check to handle both NULL and expiring dates properly:

**Before:**
```javascript
const seriesAccess = await UserAccess.findOne({
  where: {
    userId,
    seriesId: movie.seriesId,
    status: "active",
    expiresAt: { [Op.gt]: new Date() }  // ❌ Fails if expiresAt is NULL
  },
});
```

**After:**
```javascript
const seriesAccess = await UserAccess.findOne({
  where: {
    userId,
    seriesId: movie.seriesId,
    status: "active",
    [Op.or]: [
      { expiresAt: null },              // ✅ Handles permanent access
      { expiresAt: { [Op.gt]: new Date() } }  // ✅ Handles expiring access
    ]
  },
});
```

### 2. **Added Subscription Access Check (movieController.js)**
Added logic to grant access to all content for users with active subscriptions:

```javascript
// Check if user has active subscription
if (!userHasAccess) {
  const user = await User.findByPk(userId);
  if (user && user.isUpgraded && user.subscription) {
    const subscriptionEndDate = new Date(user.subscription.endDate || user.subscription.expiresAt);
    if (subscriptionEndDate > new Date()) {
      userHasAccess = true;
      accessType = "subscription";
      expiresAt = subscriptionEndDate;
      accessDetails = {
        id: user.id,
        plan: user.subscription.planId || user.subscription.planName,
        status: "active",
        expiresAt: subscriptionEndDate
      };
    }
  }
}
```

### 3. **Added User Model Import (movieController.js)**
Added missing import for User model to check subscription status:
```javascript
import User from "../models/User.modal.js";
```

## Access Check Priority (in getMovieById)

The function now checks access in this order:

1. **Individual Access** - User purchased this specific movie/episode
2. **Series Access** - User purchased the series (if this is an episode)
3. **Filmmaker/Owner** - User is the creator of this content
4. **Subscription** - User has an active subscription plan
5. **Free Content** - No purchase needed (viewPrice = 0)

If any of these conditions are true, `hasAccess` is set to `true`.

## Response Structure

The API now returns:

```json
{
  "success": true,
  "data": {
    "id": "movie-uuid",
    "title": "Movie Title",
    "userAccess": {
      "hasAccess": true,           // ✅ Boolean flag
      "accessType": "subscription",  // "individual", "series", "owner", "subscription"
      "expiresAt": "2025-01-11T...",
      "requiresPurchase": false,
      "price": 1000
    },
    // ... other movie data
  }
}
```

## Test Scenarios

### Scenario 1: Individual Movie Purchase
```
User buys a movie → UserAccess record created
getMovieById → Finds individual UserAccess record
Response: hasAccess: true, accessType: "individual"
```

### Scenario 2: Series Purchase (Watching Episode)
```
User buys series → UserAccess record created for series
getMovieById (episode) → Finds series UserAccess record
Response: hasAccess: true, accessType: "series"
```

### Scenario 3: Active Subscription
```
User has active subscription plan
getMovieById → Checks user.isUpgraded && user.subscription.endDate > now
Response: hasAccess: true, accessType: "subscription"
```

### Scenario 4: Filmmaker Viewing Own Content
```
User is the filmmaker → movie.filmmakerId === userId
getMovieById → Matches owner check
Response: hasAccess: true, accessType: "owner"
```

### Scenario 5: No Access
```
User has not purchased, no subscription
getMovieById → All checks fail
Response: hasAccess: false, accessType: null, requiresPurchase: true
```

## Edge Cases Handled

✅ Permanent access (expiresAt = NULL)
✅ Expiring access (expiresAt in future)
✅ Expired access (expiresAt in past)
✅ Active subscriptions with any end date format
✅ Free content (viewPrice = 0)
✅ Filmmakers viewing their own content
✅ Episodes with series access

---

**Status:** Fixed ✅
**Files Modified:** `controllers/movieController.js`
**Key Methods:** `getMovieById()`
