# Bharsoft — Ecosystem Platform

## Two-Phase Authentication System

### Phase 1: BOOTSTRAP (First-Time Setup)
- **Username:** `admin` (fixed)
- **Password:** Random (shown in logs)
- **OTP:** `000000` (fixed demo)
- **Purpose:** Set up database and create real admin account

### Phase 2: PRODUCTION (After Admin Created)
- **Username:** Gmail email address
- **Password:** Hashed SHA-256
- **OTP:** Random 6-digit sent to Gmail inbox
- **Security:** Full rate limiting, session verification, email-based authentication

## Files Structure

```
bharsoft-backend/
├── Config.gs          # Two-phase auth configuration
├── Code.gs            # Main router
├── Sheets.gs          # Google Sheet helpers
├── Auth.gs            # Login flow (OTP, rate limiting)
├── Admin.gs           # Admin management
├── Services.gs        # Services CRUD
├── Ecosystem.gs       # Ecosystem handshake & relay
└── Contact.gs         # Contact form with mail relay

bharsoft-frontend/
└── index.html         # Complete frontend with two-phase login UI
```

## Deployment Steps

1. **Backend Setup:**
   - Create Google Apps Script project
   - Add all `.gs` files
   - Run `setup()` function
   - Copy bootstrap credentials from logs
   - Deploy as Web App (Anyone access)
   - Copy Exec URL

2. **Frontend Setup:**
   - Update `index.html` with backend Exec URL
   - Deploy to HTTPS server
   - Open in browser

3. **First Login (Bootstrap):**
   - Username: `admin`
   - Password: From logs
   - OTP: `000000`

4. **Create Real Admin:**
   - Email: Your Gmail
   - Password: Your choice (6+ chars)
   - Bootstrap automatically disabled

5. **Production Login:**
   - Username: Your Gmail
   - Password: Your password
   - OTP: Sent to Gmail inbox

## Security Features

✅ SHA-256 password hashing
✅ Random 6-digit OTP with 5-minute expiry
✅ Rate limiting (5 attempts → 60-second lockout)
✅ Session tokens (6-hour expiry)
✅ Server-side session verification
✅ Generic error messages (no info leakage)
✅ Ecosystem handshake with signed secrets
✅ Data minimization (no internal details exposed)
✅ 8-second timeout on relay calls
✅ Automatic bootstrap-to-production transition

## API Endpoints

### Public
- `POST ?action=sendOTP` - Send OTP
- `POST ?action=verifyOTP` - Verify OTP
- `GET ?action=listServices` - List services
- `GET ?action=capabilities` - Handshake

### Admin (Session Required)
- `POST ?action=addAdmin` - Create admin
- `POST ?action=addService` - Add service
- `POST ?action=addEcosystemMember` - Link member

## Support

For detailed workflow documentation, see WORKING_FLOW.md
For security audit, see SECURITY_AUDIT.md
