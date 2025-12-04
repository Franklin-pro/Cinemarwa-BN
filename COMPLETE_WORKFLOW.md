# Complete Workflow: User Registration → Movie Management → Payment

This guide shows the complete data flow and relationships in your PostgreSQL system.

## Database Relationships Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           USER                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ id (UUID)                                                │   │
│  │ email, name, password                                   │   │
│  │ role (viewer, filmmaker, admin)                         │   │
│  │ isBlocked, blockedBy (self-ref)                         │   │
│  │ approvalStatus, approvalHistory (JSON)                  │   │
│  │ activeDevices (JSON array)                              │   │
│  │ filmmaker profile data (filmmmakerBio, etc)             │   │
│  │ filmmaker stats (filmmmakerStatsTotalMovies, etc)       │   │
│  │ filmmaker finance (filmmmakerFinancePendingBalance)     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
    │                        │                      │
    │ has (1:N)             │ has (1:N)            │ has (1:N)
    │ filmmakerId           │ userId               │ userId
    ▼                        ▼                      ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    MOVIE     │    │    REVIEW    │    │   PAYMENT    │
│──────────────│    │──────────────│    │──────────────│
│ id (UUID)    │    │ id (UUID)    │    │ id (UUID)    │
│ title        │    │ rating (1-10)│    │ amount       │
│ overview     │    │ comment      │    │ currency     │
│ status       │    │ createdAt    │    │ paymentMethod│
│ viewPrice    │    │ movieId ─────┼────┼─ movieId    │
│ downloadPrice│    │ userId ──────┼────┼─ userId     │
│ totalViews   │◄───┼─ reviews (1:N)    │ paymentStatus│
│ totalDownloads   │                 │ paymentDate  │
│ totalRevenue │    └──────────────┘    │ createdAt    │
│ avgRating    │                        └──────────────┘
│ reviewCount  │
└──────────────┘

Additional: OTP table for login verification
```

---

## Complete User Flow: Registration to Payment

### Phase 1: User Registration & Authentication

#### 1.1 User Registers (Viewer Role)

```javascript
// Controller: authController.register()
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secure_password",
  "role": "viewer"  // optional, defaults to "viewer"
}

// Database Operations:
1. Check if User with email exists
   Query: User.findOne({ where: { email: 'john@example.com' } })

2. Hash password with bcryptjs
   hashedPassword = bcrypt.hash(password, salt)

3. Create User record
   Query: User.create({
     id: UUID,
     name: "John Doe",
     email: "john@example.com",
     password: hashedPassword,
     role: "viewer",
     authProvider: "local",
     isUpgraded: false,
     maxDevices: 1,
     activeDevices: [],
     // All other fields get default values
   })

// Response:
{
  "message": "User registered successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "viewer",
    "isUpgraded": false,
    "maxDevices": 1
  },
  "token": "jwt_token_here"
}
```

#### 1.2 User Logs In (OTP Verification)

```javascript
// Step 1: Login with email & password
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "secure_password"
}

// Database Operations:
1. Find User by email
   Query: User.findOne({ where: { email } })

2. Verify password
   isMatch = bcrypt.compare(password, user.password)

3. Create and send OTP
   Query: OTP.create({
     id: UUID,
     email: "john@example.com",
     otp: "123456",
     expiresAt: Date.now() + 10*60*1000,  // 10 minutes
     attempts: 0,
     maxAttempts: 3,
     isVerified: false
   })

   // Send OTP via email

// Response:
{
  "message": "OTP sent to your email. Please verify to login.",
  "email": "john@example.com",
  "expiresIn": 600  // seconds
}

// Step 2: Verify OTP
POST /api/auth/verify-otp
{
  "email": "john@example.com",
  "otp": "123456"
}

// Database Operations:
1. Find and verify OTP
   Query: OTP.findOne({ where: { email } })

2. Check expiry and attempts

3. Generate JWT token with device info

4. Add/update device in activeDevices array
   deviceId = hash(userAgent + ipAddress)
   Query: user.update({
     activeDevices: [
       {
         deviceId: "device_hash_123",
         token: "jwt_token_here",
         loginAt: new Date(),
         userAgent: "Mozilla/5.0...",
         ipAddress: "192.168.1.1",
         lastActive: new Date()
       }
     ]
   })

5. Delete OTP (one-time use)
   Query: OTP.destroy({ where: { email } })

// Response:
{
  "message": "User logged in successfully",
  "user": { ... },
  "token": "jwt_token_here"
}
```

---

### Phase 2: Filmmaker Profile Setup

#### 2.1 User Upgrades to Filmmaker

```javascript
// Controller: filmmmakerController.upgradeToFilmmaker()
POST /api/filmmaker/upgrade
Authorization: Bearer jwt_token
{
  "bio": "Independent filmmaker",
  "website": "https://example.com",
  "momoPhoneNumber": "+250790019543",
  "bankDetails": {
    "accountName": "John Doe",
    "accountNumber": "1234567890",
    "bankName": "BPR",
    "country": "Rwanda",
    "swiftCode": "BPRMRWRW"
  }
}

// Database Operations:
1. Find User
   Query: User.findByPk(userId)

2. Update User with filmmaker info
   Query: user.update({
     role: "filmmaker",
     approvalStatus: "pending",
     filmmmakerIsVerified: false,
     filmmmakerBio: "Independent filmmaker",
     filmmmakerWebsite: "https://example.com",
     filmmmakerMomoPhoneNumber: "+250790019543",
     filmmmakerBankDetails: {
       accountName: "John Doe",
       accountNumber: "1234567890",
       bankName: "BPR",
       country: "Rwanda",
       swiftCode: "BPRMRWRW"
     },
     approvalHistory: [
       {
         status: "pending",
         approvedAt: new Date()
       }
     ]
   })

3. Admin reviews and approves filmmaker
   Query: user.update({
     approvalStatus: "approved",
     filmmmakerIsVerified: true,
     filmmmakerVerifiedAt: new Date(),
     approvalHistory: [
       ...existingHistory,
       {
         status: "approved",
         approvedBy: adminUserId,
         approvedAt: new Date()
       }
     ]
   })

// Response:
{
  "message": "Profile updated successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "role": "filmmaker",
    "approvalStatus": "pending",
    "filmmmakerBio": "Independent filmmaker",
    ...
  }
}
```

---

### Phase 3: Movie Upload & Management

#### 3.1 Filmmaker Creates Movie

```javascript
// Controller: movieController.createMovie()
POST /api/movies
Authorization: Bearer jwt_token (filmmaker only)
{
  "title": "My Awesome Film",
  "overview": "A story about...",
  "release_date": "2024-01-15",
  "viewPrice": 5.99,
  "downloadPrice": 9.99,
  "currency": "USD",
  "categories": ["Drama", "Sci-Fi"],
  "tags": ["indie", "rwandan-cinema"],
  "language": "English",
  "videoUrl": "https://example.com/video.mp4"
}

// Database Operations:
1. Find User (filmmaker)
   Query: User.findByPk(userId)

2. Create Movie record
   Query: Movie.create({
     id: UUID,
     title: "My Awesome Film",
     overview: "A story about...",
     release_date: "2024-01-15",
     filmmakerId: userId,
     filmmmakerName: user.name,
     filmmmakerBio: user.filmmmakerBio,
     filmmmakerProfileImage: user.filmmmakerProfileImage,
     viewPrice: 5.99,
     downloadPrice: 9.99,
     currency: "USD",
     royaltyPercentage: 95,  // Filmmaker gets 95%
     categories: ["Drama", "Sci-Fi"],
     tags: ["indie", "rwandan-cinema"],
     language: "English",
     slug: "my-awesome-film",
     videoUrl: "https://example.com/video.mp4",
     status: "draft",  // Not published yet
     processingStatus: "pending"
   })

3. Update filmmaker stats
   Query: user.update({
     filmmmakerStatsTotalMovies: user.filmmmakerStatsTotalMovies + 1
   })

// Response:
{
  "message": "Movie created successfully",
  "movie": {
    "id": "650e8400-e29b-41d4-a716-446655440001",
    "title": "My Awesome Film",
    "filmmakerId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "draft",
    ...
  }
}
```

#### 3.2 Filmmaker Submits Movie for Approval

```javascript
// Controller: movieController.submitMovie()
PUT /api/movies/:movieId/submit
Authorization: Bearer jwt_token
{}

// Database Operations:
1. Find Movie
   Query: Movie.findByPk(movieId, { include: 'filmmaker' })

2. Update Movie status
   Query: movie.update({
     status: "submitted",
     submittedAt: new Date()
   })

3. Notify admin about new submission

// Response:
{
  "message": "Movie submitted for approval",
  "movie": {
    "id": "650e8400-e29b-41d4-a716-446655440001",
    "status": "submitted",
    "submittedAt": "2024-01-20T10:00:00Z",
    ...
  }
}
```

#### 3.3 Admin Approves Movie

```javascript
// Controller: adminController.approveMovie()
PUT /api/admin/movies/:movieId/approve
Authorization: Bearer jwt_token (admin only)
{}

// Database Operations:
1. Find Movie with filmmaker info
   Query: Movie.findByPk(movieId, { include: 'filmmaker' })

2. Update Movie
   Query: movie.update({
     status: "approved",
     approvedBy: adminUserId,
     approvedAt: new Date()
   })

// Response:
{
  "message": "Movie approved successfully",
  "movie": {
    "id": "650e8400-e29b-41d4-a716-446655440001",
    "status": "approved",
    "approvedAt": "2024-01-20T11:00:00Z",
    ...
  }
}
```

---

### Phase 4: Viewers Watch & Review Movies

#### 4.1 Viewer Watches Movie

```javascript
// Controller: movieController.watchMovie()
POST /api/movies/:movieId/watch
Authorization: Bearer jwt_token
{}

// Database Operations:
1. Find Movie
   Query: Movie.findByPk(movieId)

2. Check if user needs to pay
   if (movie.viewPrice > 0) {
     // Check if payment exists and is completed
     Query: Payment.findOne({
       where: {
         movieId: movieId,
         userId: userId,
         paymentStatus: "completed"
       }
     })

     if (!payment) {
       // Redirect to payment
     }
   }

3. Increment view count
   Query: movie.increment('totalViews', { by: 1 })
   // or: await movie.incrementViews()

// Response:
{
  "message": "Streaming URL",
  "streamingUrl": "https://cdn.example.com/stream.m3u8",
  "videoQuality": "720p",
  "videoDuration": 5400  // seconds
}
```

#### 4.2 Viewer Writes Review

```javascript
// Controller: reviewController.createReview()
POST /api/reviews
Authorization: Bearer jwt_token
{
  "movieId": "650e8400-e29b-41d4-a716-446655440001",
  "rating": 8,
  "comment": "Amazing film! Loved the cinematography."
}

// Database Operations:
1. Verify user watched/paid for movie
   Query: Payment.findOne({
     where: {
       movieId: movieId,
       userId: userId,
       paymentStatus: "completed"
     }
   })

2. Create Review
   Query: Review.create({
     id: UUID,
     movieId: movieId,
     userId: userId,
     rating: 8,
     comment: "Amazing film! Loved the cinematography.",
     createdAt: new Date()
   })

3. Update Movie rating and review count
   Query: movie.update({
     reviewCount: movie.reviewCount + 1,
     avgRating: calculateAverage()  // Recalculate from all reviews
   })

// Response:
{
  "message": "Review created successfully",
  "review": {
    "id": "750e8400-e29b-41d4-a716-446655440002",
    "movieId": "650e8400-e29b-41d4-a716-446655440001",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "rating": 8,
    "comment": "Amazing film! Loved the cinematography.",
    "createdAt": "2024-01-22T15:00:00Z"
  }
}
```

---

### Phase 5: Payment Processing

#### 5.1 Viewer Initiates Payment

```javascript
// Controller: paymentController.initiatePayment()
POST /api/payments/initiate
Authorization: Bearer jwt_token
{
  "movieId": "650e8400-e29b-41d4-a716-446655440001",
  "type": "view",  // or "download"
  "paymentMethod": "stripe"  // or "paypal", "momo"
}

// Database Operations:
1. Find Movie
   Query: Movie.findByPk(movieId)

2. Determine amount based on type
   amount = type === "view" ? movie.viewPrice : movie.downloadPrice

3. Create Payment record (pending)
   Query: Payment.create({
     id: UUID,
     movieId: movieId,
     userId: userId,
     amount: amount,
     currency: movie.currency,
     paymentMethod: "stripe",
     paymentStatus: "pending",
     paymentDate: new Date()
   })

4. Initiate payment gateway (Stripe, PayPal, MoMo)
   // Stripe example
   const session = stripe.checkout.sessions.create({
     payment_method_types: ['card'],
     line_items: [{
       price_data: {
         currency: movie.currency.toLowerCase(),
         product_data: {
           name: movie.title
         },
         unit_amount: amount * 100  // in cents
       },
       quantity: 1
     }]
   })

// Response:
{
  "message": "Payment initiated",
  "paymentId": "750e8400-e29b-41d4-a716-446655440003",
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_live_xxx",
  "amount": 5.99,
  "currency": "USD"
}
```

#### 5.2 Payment Webhook (Payment Completed)

```javascript
// Controller: paymentController.handlePaymentWebhook()
POST /api/payments/webhook
// Triggered by Stripe/PayPal/MoMo when payment completes

// Database Operations:
1. Verify webhook signature

2. Find Payment record
   Query: Payment.findOne({
     where: { id: paymentId }
   })

3. Update Payment status
   Query: payment.update({
     paymentStatus: "completed",
     paymentDate: new Date()
   })

4. Update Movie revenue
   Query: movie.update({
     totalRevenue: movie.totalRevenue + payment.amount
   })
   // or: await movie.updateRevenue(payment.amount)

5. Update Filmmaker finance
   Query: filmmaker.update({
     filmmmakerFinancePendingBalance:
       filmmaker.filmmmakerFinancePendingBalance +
       (payment.amount * 95 / 100)  // 95% to filmmaker
   })

// Response (to payment provider):
{
  "status": "success",
  "message": "Payment processed"
}
```

#### 5.3 Filmmaker Views Earnings

```javascript
// Controller: filmmmakerController.getEarnings()
GET /api/filmmaker/earnings
Authorization: Bearer jwt_token

// Database Operations:
1. Find Filmmaker User
   Query: User.findByPk(userId)

2. Get all payments for their movies
   Query: Payment.findAll({
     include: {
       model: Movie,
       where: { filmmakerId: userId }
     }
   })

3. Calculate statistics
   - Total payments received
   - Pending balance (unpaid)
   - Withdrawn balance
   - Payment breakdown by movie

// Response:
{
  "filmmmakerStats": {
    "totalMovies": 3,
    "totalViews": 1250,
    "totalDownloads": 45,
    "totalRevenue": 299.50,
    "totalEarnings": 284.53  // After 5% platform fee
    "averageRating": 8.2,
    "totalReviews": 25
  },
  "financeInfo": {
    "pendingBalance": 150.00,  // Available to withdraw
    "withdrawnBalance": 134.53,  // Already paid out
    "totalEarned": 284.53,
    "payoutMethod": "bank_transfer",
    "minimumWithdrawalAmount": 50
  },
  "moviesBreakdown": [
    {
      "movieId": "650e8400-e29b-41d4-a716-446655440001",
      "title": "My Awesome Film",
      "totalRevenue": 150.00,
      "filmmmakerEarnings": 142.50,
      "adminEarnings": 7.50,
      "views": 500,
      "downloads": 20
    },
    // ... more movies
  ]
}
```

#### 5.4 Filmmaker Requests Withdrawal

```javascript
// Controller: filmmmakerController.requestWithdrawal()
POST /api/filmmaker/withdrawal
Authorization: Bearer jwt_token
{
  "amount": 100.00
}

// Database Operations:
1. Find Filmmaker User
   Query: User.findByPk(userId)

2. Validate withdrawal
   - amount >= minimumWithdrawalAmount (50)
   - amount <= pendingBalance

3. Create Withdrawal record (or update existing)

4. Update filmmaker finance
   Query: user.update({
     filmmmakerFinancePendingBalance:
       user.filmmmakerFinancePendingBalance - 100,
     filmmmakerFinanceLastWithdrawalDate: new Date()
   })

5. Process payout based on payoutMethod
   - bank_transfer: Call bank API
   - paypal: Call PayPal API
   - stripe: Call Stripe API
   - momo: Call MoMo API

// Response:
{
  "message": "Withdrawal processed",
  "withdrawalId": "850e8400-e29b-41d4-a716-446655440004",
  "amount": 100.00,
  "payoutMethod": "bank_transfer",
  "status": "processing",
  "estimatedDate": "2024-01-27T00:00:00Z"
}
```

---

## Query Examples

### Get Movie with All Reviews and Filmmaker Info

```javascript
const movie = await Movie.findByPk(movieId, {
  include: [
    {
      model: User,
      as: 'filmmaker',
      attributes: ['id', 'name', 'filmmmakerBio', 'filmmmakerProfileImage']
    },
    {
      model: Review,
      as: 'reviews',
      include: {
        model: User,
        as: 'author',
        attributes: ['id', 'name']
      }
    }
  ]
});

/*
Result:
{
  id: "...",
  title: "My Awesome Film",
  viewPrice: 5.99,
  downloadPrice: 9.99,
  avgRating: 8.2,
  reviewCount: 25,
  filmmaker: {
    id: "...",
    name: "John Doe",
    filmmmakerBio: "Independent filmmaker",
    filmmmakerProfileImage: "url"
  },
  reviews: [
    {
      id: "...",
      rating: 8,
      comment: "Amazing film!",
      author: {
        id: "...",
        name: "Jane Smith"
      }
    },
    ...
  ]
}
*/
```

### Get All Movies by Filmmaker with Earnings

```javascript
const filmmaker = await User.findByPk(userId, {
  include: {
    model: Movie,
    as: 'createdMovies',
    include: {
      model: Payment,
      as: 'payments',
      where: { paymentStatus: 'completed' }
    }
  }
});

/*
Result includes:
- User info with all filmmaker data
- All their movies
- All completed payments for each movie
*/
```

### Get Payment Details with Movie and Filmmaker

```javascript
const payment = await Payment.findByPk(paymentId, {
  include: [
    {
      model: Movie,
      as: 'movie'
    },
    {
      model: User,
      as: 'user',
      attributes: ['id', 'name', 'email']
    }
  ]
});

// Calculate earnings breakdown
const breakdown = payment.getEarningsBreakdown();
/*
{
  totalAmount: 5.99,
  filmmmakerEarnings: 5.69,  // 95%
  adminEarnings: 0.30,       // 5%
  currency: "USD"
}
*/
```

---

## Data Flow Summary

```
User Registration
    ↓
User Logs In (OTP)
    ↓
User Upgrades to Filmmaker (if desired)
    ↓
Admin Approves Filmmaker
    ↓
Filmmaker Creates Movie
    ↓
Filmmaker Submits Movie for Approval
    ↓
Admin Approves Movie
    ↓
Movie Published (status: approved)
    ↓
Viewers can find and watch movie
    ↓
Viewer Initiates Payment
    ↓
Payment Gateway Processes Payment
    ↓
Payment Webhook Updates Database
    ↓
Filmmaker Earnings Updated
    ↓
Viewer Can Download/Stream Movie
    ↓
Viewer Writes Review
    ↓
Movie Rating Updated
    ↓
Filmmaker Requests Withdrawal
    ↓
Payout Processed
    ↓
Filmmaker Receives Money
```

This complete workflow shows how all entities are connected and how data flows through your system!
