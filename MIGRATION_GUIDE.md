# MongoDB to PostgreSQL Migration Guide

This document guides you through the changes made during the migration from MongoDB with Mongoose to PostgreSQL with Sequelize.

## Completed Changes

### 1. Dependencies Updated
- ✅ Removed: `mongoose` (^7.5.0), `connect-mongo` (^5.1.0)
- ✅ Added: `sequelize` (^6.35.2), `pg` (^8.11.3), `pg-hstore` (^2.3.4), `connect-session-sequelize` (^7.1.7)

### 2. Database Configuration
- ✅ Created: `config/database.js` - PostgreSQL connection using Sequelize
- ✅ Removed: `config/db.js` (MongoDB connection)
- ✅ Updated: `.env` file with PostgreSQL credentials instead of MongoDB URI

### 3. Models Converted
All models have been converted from Mongoose schemas to Sequelize models:

- ✅ `models/User.modal.js` - User model with UUID primary key
- ✅ `models/Movie.model.js` - Movie model with UUID primary key
- ✅ `models/Review.model.js` - Review model with UUID primary key
- ✅ `models/Payment.model.js` - Payment model with UUID primary key
- ✅ `models/OTP.modal.js` - OTP model with UUID primary key

**Key Changes in Models:**
- Mongoose ObjectId references → UUID
- Nested objects (e.g., `filmmaker: {...}`) → flattened column names with prefix (e.g., `filmmmakerBio`, `filmmmakerProfileImage`)
- Array fields → JSON columns (e.g., `activeDevices`, `categories`, `approvalHistory`)
- TTL indexes → manual cleanup required for OTP model

### 4. Server Configuration
- ✅ Updated: `server.js`
  - Changed session store from `connect-mongo` to `connect-session-sequelize`
  - Wrapped startup logic in `startServer()` async function
  - Added database sync and session store sync

## Remaining Tasks (Manual Updates Required)

### Controllers to Update

The following controllers interact with the database and need to be updated to use Sequelize syntax instead of Mongoose:

1. **authController.js** - User registration, login, device management
   - Mongoose: `User.findOne({email})` → Sequelize: `User.findOne({where: {email}})`
   - Mongoose: `new User({...})` → Sequelize: `User.create({...})`
   - Mongoose: `await user.save()` → Sequelize: `await user.update({...})`

2. **movieController.js** - Movie CRUD operations
   - Update find queries to use Sequelize `where` syntax
   - Update create operations using Sequelize model methods

3. **reviewController.js** - Review creation/retrieval/deletion
4. **paymentController.js** - Payment processing
5. **filmmmakerController.js** - Filmmaker profile and earnings
6. **adminController.js** - Admin operations
7. **googleOAuthController.js** - OAuth user handling
8. **adminDashboardController.js** - Dashboard analytics

### Database Setup Instructions

1. **Install PostgreSQL** on your system if not already installed
2. **Create Database:**
   ```sql
   CREATE DATABASE cinemarwa_db;
   ```
3. **Update .env file** with your PostgreSQL credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=cinemarwa_db
   DB_USER=postgres
   DB_PASSWORD=your_password_here
   ```
4. **Run the application** - It will automatically create tables via Sequelize sync

### Important Notes

#### Nested Object Handling
MongoDB allowed nested objects like:
```javascript
// MongoDB
filmmaker: {
  bio: "...",
  profileImage: "...",
  socialLinks: { twitter: "...", instagram: "..." }
}
```

Sequelize flattens these:
```javascript
// Sequelize
filmmmakerBio: "...",
filmmmakerProfileImage: "...",
filmmmakerSocialLinks: { twitter: "...", instagram: "..." } // JSON column
```

When updating controllers, access these as:
```javascript
// Instead of: user.filmmaker.bio
user.filmmmakerBio

// For JSON nested values:
user.filmmmakerSocialLinks.twitter
```

#### Array Fields
Arrays are now stored as JSON:
```javascript
// Sequelize
activeDevices: [
  { deviceId: "...", token: "...", loginAt: Date, ... }
]
user.update({ activeDevices: newDevicesArray })
```

#### Foreign Key References
MongoDB used ObjectId references:
```javascript
// MongoDB
approvedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User"
}

// Sequelize - now just UUID
approvedBy: DataTypes.UUID
```

To get related data, use Sequelize associations (need to be added in models).

#### OTP Expiration
MongoDB had automatic TTL index to delete expired OTPs. In PostgreSQL/Sequelize:
- OTP model has `expiresAt` column and `expiresAt` index
- Implement a scheduled job (using `node-cron` or similar) to delete expired OTPs:
  ```javascript
  OTP.destroy({
    where: {
      expiresAt: {
        [Op.lt]: new Date()
      }
    }
  });
  ```

## Migration Checklist

- [ ] Install PostgreSQL and create database
- [ ] Update .env file with correct credentials
- [ ] Test: `npm install` works without errors
- [ ] Test: Server starts (`npm run dev`)
- [ ] Test: Database tables are created
- [ ] Update authController.js
- [ ] Update movieController.js
- [ ] Update reviewController.js
- [ ] Update paymentController.js
- [ ] Update filmmmakerController.js
- [ ] Update adminController.js
- [ ] Update googleOAuthController.js
- [ ] Update adminDashboardController.js
- [ ] Add Sequelize associations between models (if needed for eager loading)
- [ ] Test all API endpoints
- [ ] Set up OTP cleanup job
- [ ] Run comprehensive tests

## Reference: Mongoose to Sequelize Query Patterns

### Find Operations
```javascript
// Mongoose
User.findByPk(id)
User.findOne({ email })
User.find({ role: 'filmmaker' })

// Sequelize
User.findByPk(id)
User.findOne({ where: { email } })
User.findAll({ where: { role: 'filmmaker' } })
```

### Create Operations
```javascript
// Mongoose
const user = new User({ name, email });
await user.save();

// Sequelize
const user = await User.create({ name, email });
```

### Update Operations
```javascript
// Mongoose
user.email = 'new@email.com';
await user.save();

// Sequelize
await user.update({ email: 'new@email.com' });
```

### Delete Operations
```javascript
// Mongoose
await User.deleteOne({ _id: id })

// Sequelize
await User.destroy({ where: { id } })
```

### Complex Queries
```javascript
// Mongoose
User.find({ role: 'filmmaker', isBlocked: false })

// Sequelize
User.findAll({
  where: {
    role: 'filmmaker',
    isBlocked: false
  }
})
```

## Support

For more information on Sequelize:
- Docs: https://sequelize.org/docs/v6/
- Query API: https://sequelize.org/docs/v6/core-concepts/model-querying-basics/
