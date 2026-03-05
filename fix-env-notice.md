# Environment Variable Fix Needed

Please fix the following line in your .env file:

**Current (incorrect):**
```
B2_S3_ENDPOINT = https://cinemarwanda.s3.us-east-005.backblazeb2.com
```

**Should be (no spaces around =):**
```
B2_S3_ENDPOINT=https://cinemarwanda.s3.us-east-005.backblazeb2.com
```

After fixing this, you can revert the getDirectB2Url function to use:
```javascript
return `${process.env.B2_S3_ENDPOINT}/${clean}`;
```

Until then, the hardcoded URL will work correctly.
