/**
 * Auth.gs
 * TWO-PHASE AUTHENTICATION:
 * 1. BOOTSTRAP: Local demo credentials (admin / password / OTP 000000)
 * 2. PRODUCTION: Email-based admin accounts (Gmail / password / random OTP)
 */

function sendOTP(username, password) {
  if (!username || !password) {
    return jsonResponse(false, null, 'username and password required');
  }

  Logger.log('📧 OTP Request: ' + username + ' | Phase: ' + getAuthPhase());

  // ============ RATE LIMITING ============
  const attemptsKey = 'login_attempts_' + username.toLowerCase();
  let attempts = JSON.parse(CacheService.getScriptCache().get(attemptsKey) || '{"count":0,"lockedUntil":0}');
  
  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    const remainSecs = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
    Logger.log('⛔ Login locked for: ' + username + ' (' + remainSecs + 's remaining)');
    return jsonResponse(false, null, 'Too many attempts. Try again in ' + remainSecs + ' seconds.');
  }

  // ============ PHASE 1: BOOTSTRAP MODE ============
  if (isBootstrapMode()) {
    const boot = getBootstrapCreds();
    
    if (username === boot.username && password === boot.password) {
      Logger.log('✅ BOOTSTRAP login successful: ' + username);
      CacheService.getScriptCache().remove(attemptsKey);
      const otp = '000000';
      CacheService.getScriptCache().put('otp_' + username, otp, 300);
      Logger.log('🎫 Demo OTP generated: ' + otp);
      return jsonResponse(true, { 
        sent: true, 
        message: 'Demo OTP: 000000 (no email in bootstrap mode)',
        phase: 'BOOTSTRAP'
      });
    } else {
      attempts.count++;
      if (attempts.count >= 5) {
        attempts.lockedUntil = Date.now() + 60000;
        attempts.count = 0;
      }
      CacheService.getScriptCache().put(attemptsKey, JSON.stringify(attempts), 300);
      Logger.log('❌ Bootstrap login failed for: ' + username);
      return jsonResponse(false, null, 'Invalid username or password');
    }
  }

  // ============ PHASE 2: PRODUCTION MODE ============
  if (isProductionMode()) {
    let admin = null;
    try {
      const rows = readRows(SHEET_TABS.ADMINS);
      admin = rows.find(function (a) { return a.username === username; });
    } catch (err) {
      Logger.log('⚠️ Database not linked yet');
      return jsonResponse(false, null, 'Database not linked. Contact administrator.');
    }

    if (!admin) {
      attempts.count++;
      if (attempts.count >= 5) {
        attempts.lockedUntil = Date.now() + 60000;
        attempts.count = 0;
      }
      CacheService.getScriptCache().put(attemptsKey, JSON.stringify(attempts), 300);
      Logger.log('❌ Admin not found: ' + username);
      return jsonResponse(false, null, 'Invalid username or password');
    }

    const hash = hashPassword(password);
    if (hash !== admin.passwordHash) {
      attempts.count++;
      if (attempts.count >= 5) {
        attempts.lockedUntil = Date.now() + 60000;
        attempts.count = 0;
      }
      CacheService.getScriptCache().put(attemptsKey, JSON.stringify(attempts), 300);
      Logger.log('❌ Password incorrect for: ' + username);
      return jsonResponse(false, null, 'Invalid username or password');
    }

    CacheService.getScriptCache().remove(attemptsKey);

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    CacheService.getScriptCache().put('otp_' + username, otp, 300);

    try {
      const emailSubject = 'Bharsoft Login Code';
      const emailBody = 'Your one-time code is: ' + otp + '\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, please ignore this email.';
      MailApp.sendEmail(username, emailSubject, emailBody);
      Logger.log('✉️ OTP sent via email to: ' + username);
    } catch (err) {
      Logger.log('⚠️ Email failed, OTP: ' + otp + ' for ' + username);
    }

    return jsonResponse(true, { 
      sent: true, 
      message: 'OTP sent to ' + username,
      phase: 'PRODUCTION'
    });
  }

  return jsonResponse(false, null, 'Unknown auth phase');
}

function verifyOTP(username, otp) {
  if (!username || !otp) {
    return jsonResponse(false, null, 'username and otp required');
  }

  Logger.log('🔐 OTP Verification: ' + username + ' | Phase: ' + getAuthPhase());

  const cached = CacheService.getScriptCache().get('otp_' + username);
  
  if (!cached || cached !== otp) {
    Logger.log('❌ OTP mismatch for: ' + username);
    return jsonResponse(false, null, 'Invalid or expired OTP');
  }

  CacheService.getScriptCache().remove('otp_' + username);

  if (isBootstrapMode()) {
    const boot = getBootstrapCreds();
    if (username === boot.username) {
      Logger.log('✅ Bootstrap login verified');
      const sessionToken = Utilities.getUuid();
      CacheService.getScriptCache().put('session_' + sessionToken, username, 21600);
      return jsonResponse(true, { 
        sessionToken: sessionToken,
        phase: 'BOOTSTRAP',
        message: 'Bootstrap mode. Set up database and create real admin account.'
      });
    }
  }

  if (isProductionMode()) {
    try {
      const rows = readRows(SHEET_TABS.ADMINS);
      const admin = rows.find(function (a) { return a.username === username; });
      
      if (!admin) {
        Logger.log('❌ Admin not found during OTP verify: ' + username);
        return jsonResponse(false, null, 'Admin account not found');
      }

      Logger.log('✅ OTP verified for: ' + username);
      const sessionToken = Utilities.getUuid();
      CacheService.getScriptCache().put('session_' + sessionToken, username, 21600);
      Logger.log('🔑 Session created: ' + sessionToken.substring(0, 8) + '... for ' + username);

      return jsonResponse(true, { 
        sessionToken: sessionToken,
        phase: 'PRODUCTION',
        username: username
      });
    } catch (err) {
      Logger.log('⚠️ Database error during verify: ' + err);
      return jsonResponse(false, null, 'Database error. Contact administrator.');
    }
  }

  return jsonResponse(false, null, 'Unknown auth phase');
}

function findAdmin(username) {
  try {
    const rows = readRows(SHEET_TABS.ADMINS);
    return rows.find(function (a) { return a.username === username; }) || null;
  } catch (err) {
    return null;
  }
}

function hashPassword(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}
