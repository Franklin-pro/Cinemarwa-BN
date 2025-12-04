# Quick Reference: Updating Controllers

## Import Models

Update all controller files to use the new models:

```javascript
// OLD
import User from "../models/User.modal.js";
import Movie from "../models/Movie.model.js";
import Review from "../models/Review.model.js";
import Payment from "../models/Payment.model.js";
import OTP from "../models/OTP.modal.js";

// NEW - Use this instead (recommended)
import { User, Movie, Review, Payment, OTP } from "../models/index.js";
```

The `models/index.js` includes all relationships, so you can use eager loading:
```javascript
Movie.findByPk(movieId, {
  include: ['filmmaker', 'reviews']
})
```

---

## Common Query Patterns

### Find Operations

```javascript
// USER QUERIES
User.findOne({ where: { email } })
User.findOne({ where: { email }, include: 'createdMovies' })
User.findByPk(userId)
User.findByPk(userId, { include: ['createdMovies', 'payments'] })
User.findAll({ where: { role: 'filmmaker' } })

// MOVIE QUERIES
Movie.findByPk(movieId)
Movie.findByPk(movieId, { include: ['filmmaker', 'reviews'] })
Movie.findAll({ where: { status: 'approved' } })
Movie.findAll({ where: { filmmakerId: userId } })
Movie.findAll({ where: { categories: sequelize.where(...) } })  // For JSON arrays

// REVIEW QUERIES
Review.findOne({ where: { movieId, userId } })
Review.findAll({ where: { movieId } })
Review.findAll({
  where: { movieId },
  include: { model: User, as: 'author' }
})

// PAYMENT QUERIES
Payment.findOne({ where: { userId, movieId, paymentStatus: 'completed' } })
Payment.findAll({ where: { userId } })
Payment.findAll({
  where: { paymentStatus: 'completed' },
  include: [{ model: Movie, as: 'movie' }]
})
```

### Create Operations

```javascript
// User
const user = await User.create({
  name, email, password, role, isUpgraded, maxDevices
})

// Movie
const movie = await Movie.create({
  title, overview, filmmakerId, filmmmakerName,
  viewPrice, downloadPrice, currency,
  status: 'draft'
})

// Review
const review = await Review.create({
  movieId, userId, rating, comment
})

// Payment
const payment = await Payment.create({
  movieId, userId, amount, currency,
  paymentMethod, paymentStatus, paymentDate
})

// OTP
const otp = await OTP.create({
  email, otp: otpCode, expiresAt, maxAttempts: 3
})
```

### Update Operations

```javascript
// Simple update
await user.update({ email, name })

// Update with array field
const newDevices = [
  ...user.activeDevices,
  { deviceId, token, loginAt: new Date() }
]
await user.update({ activeDevices: newDevices })

// Remove from array
await user.update({
  activeDevices: user.activeDevices.filter(d => d.deviceId !== deviceId)
})

// Increment numeric field
await movie.increment('totalViews', { by: 1 })
await movie.update({
  totalRevenue: movie.totalRevenue + amount
})

// Update JSON field (nested)
const newBankDetails = {
  ...user.filmmmakerBankDetails,
  isVerified: true
}
await user.update({ filmmmakerBankDetails: newBankDetails })
```

### Delete Operations

```javascript
// Delete single record
await user.destroy()

// Delete by condition
await OTP.destroy({ where: { email } })

// Delete multiple
await Review.destroy({ where: { movieId } })
```

---

## Field Name Mapping

### User Fields

| MongoDB | PostgreSQL |
|---------|-----------|
| `_id` | `id` |
| `filmmaker.bio` | `filmmmakerBio` |
| `filmmaker.profileImage` | `filmmmakerProfileImage` |
| `filmmaker.socialLinks` | `filmmmakerSocialLinks` (JSON) |
| `filmmaker.bankDetails` | `filmmmakerBankDetails` (JSON) |
| `filmmmakerStats.*` | `filmmmakerStats*` (separate columns) |
| `filmmmakerFinance.*` | `filmmmakerFinance*` (separate columns) |
| `activeDevices` | `activeDevices` (JSON) |
| `approvalHistory` | `approvalHistory` (JSON) |

### Movie Fields

| MongoDB | PostgreSQL |
|---------|-----------|
| `_id` | `id` |
| `filmmaker.filmamakerId` | `filmmakerId` |
| `filmmaker.name` | `filmmmakerName` |
| `filmmaker.bio` | `filmmmakerBio` |
| `filmmaker.profileImage` | `filmmmakerProfileImage` |
| `categories` | `categories` (JSON array) |
| `tags` | `tags` (JSON array) |
| `subtitles` | `subtitles` (JSON array) |
| `keywords` | `keywords` (JSON array) |
| `genre_ids` | `genre_ids` (JSON array) |

### Review Fields

| MongoDB | PostgreSQL |
|---------|-----------|
| `_id` | `id` |
| `movie` | `movieId` |
| `user` | `userId` |
| No change | `createdAt`, `updatedAt` |

### Payment Fields

| MongoDB | PostgreSQL |
|---------|-----------|
| `_id` | `id` |
| No change | All fields similar |
| Auto-added | `createdAt`, `updatedAt` |

---

## Helper Methods (Available from models/index.js)

These are convenience methods added to your models:

### User Methods
```javascript
// Get filmmaker statistics
const stats = await user.getFilmmakerStats()
// Returns: { totalMovies, totalViews, totalDownloads, totalRevenue, totalEarnings }

// Approve filmmaker
await user.approveFilmmaker(adminUserId)

// Reject filmmaker
await user.rejectFilmmaker(adminUserId, 'Reason for rejection')
```

### Movie Methods
```javascript
// Increment views
await movie.incrementViews()

// Increment downloads
await movie.incrementDownloads()

// Update revenue
await movie.updateRevenue(amount)
```

### Payment Methods
```javascript
// Get earnings breakdown
const breakdown = payment.getEarningsBreakdown()
// Returns: { totalAmount, filmmmakerEarnings, adminEarnings, currency }
```

---

## Accessing Related Data

### Access Filmmaker through Movie
```javascript
const movie = await Movie.findByPk(movieId, {
  include: { model: User, as: 'filmmaker' }
})

// Access filmmaker info
console.log(movie.filmmaker.name)
console.log(movie.filmmaker.filmmmakerBio)
console.log(movie.filmmaker.filmmmakerProfileImage)
```

### Access All Movies by Filmmaker
```javascript
const filmmaker = await User.findByPk(userId, {
  include: { model: Movie, as: 'createdMovies' }
})

// Loop through movies
filmmaker.createdMovies.forEach(movie => {
  console.log(movie.title, movie.totalViews)
})
```

### Access Reviews with Authors
```javascript
const movie = await Movie.findByPk(movieId, {
  include: {
    model: Review,
    as: 'reviews',
    include: { model: User, as: 'author' }
  }
})

// Access review and author
movie.reviews.forEach(review => {
  console.log(review.author.name, review.rating, review.comment)
})
```

### Access All Payments for Filmmaker's Movies
```javascript
const filmmaker = await User.findByPk(userId, {
  include: {
    model: Movie,
    as: 'createdMovies',
    include: { model: Payment, as: 'payments' }
  }
})

// Calculate total revenue
let totalRevenue = 0
filmmaker.createdMovies.forEach(movie => {
  movie.payments.forEach(payment => {
    if (payment.paymentStatus === 'completed') {
      totalRevenue += payment.amount
    }
  })
})
```

---

## Error Handling

```javascript
try {
  const user = await User.findByPk(userId)
  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }
  // ... continue
} catch (error) {
  console.error('Database error:', error)
  return res.status(500).json({
    message: 'Server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  })
}
```

---

## Type Casting for JSON Fields

When working with JSON fields in Sequelize, be explicit:

```javascript
// Store array
await user.update({
  activeDevices: JSON.parse(JSON.stringify(arrayValue))
})

// Retrieve and parse if needed
const devices = user.activeDevices
if (typeof devices === 'string') {
  const parsed = JSON.parse(devices)
}
```

---

## Controllers to Update (Priority Order)

1. **authController.js** - Core auth operations
2. **movieController.js** - Movie CRUD
3. **reviewController.js** - Review operations
4. **paymentController.js** - Payment handling
5. **filmmmakerController.js** - Filmmaker profile/earnings
6. **adminController.js** - Admin operations
7. **googleOAuthController.js** - OAuth handling
8. **adminDashboardController.js** - Dashboard stats

---

## Testing Your Updates

```bash
# Test with curl
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "role": "viewer"
  }'

# Check database
SELECT * FROM "Users" WHERE email = 'test@example.com';
SELECT * FROM "Movies" WHERE status = 'approved';
SELECT * FROM "Reviews" LIMIT 10;
SELECT * FROM "Payments" WHERE "paymentStatus" = 'completed';
```

---

## PostgreSQL vs MongoDB Differences

### Data Types
- MongoDB: Flexible, dynamic
- PostgreSQL: Strict, enforced types

### Queries
- MongoDB: Document-based with `$` operators
- PostgreSQL: SQL-based with WHERE clauses

### Relationships
- MongoDB: Embedded or manual references
- PostgreSQL: Foreign keys with Sequelize

### Transactions
- MongoDB: Recently added
- PostgreSQL: Built-in, reliable ACID

### Scaling
- MongoDB: Horizontal sharding
- PostgreSQL: Vertical scaling, read replicas

---

## Performance Tips

1. **Use indexes on frequently queried fields**
   - email, movieId, userId, filmmakerId, status

2. **Include related data in queries** (avoid N+1 problem)
   ```javascript
   // Good
   Movie.findByPk(movieId, { include: ['filmmaker', 'reviews'] })

   // Bad - causes N queries
   const movie = await Movie.findByPk(movieId)
   const filmmaker = await User.findByPk(movie.filmmakerId)
   const reviews = await Review.findAll({ where: { movieId } })
   ```

3. **Paginate large result sets**
   ```javascript
   Movie.findAll({
     where: { status: 'approved' },
     limit: 20,
     offset: 0,
     order: [['createdAt', 'DESC']]
   })
   ```

4. **Cache frequently accessed data**
   - Filmmaker stats
   - Popular movies
   - Ratings/reviews

5. **Use transactions for critical operations**
   ```javascript
   const t = await sequelize.transaction()
   try {
     await payment.update({ paymentStatus: 'completed' }, { transaction: t })
     await movie.update({ totalRevenue: ... }, { transaction: t })
     await t.commit()
   } catch (error) {
     await t.rollback()
   }
   ```

This reference should help you quickly update all your controllers!
