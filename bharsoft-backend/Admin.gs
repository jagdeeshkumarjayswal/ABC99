/**
 * Admin.gs
 * Admin management - PRODUCTION MODE ONLY
 * Creating first real admin switches from BOOTSTRAP to PRODUCTION
 */

function addAdmin(username, password) {
  if (!username || !password) {
    return jsonResponse(false, null, 'username and password required');
  }

  if (!isEmail(username)) {
    return jsonResponse(false, null, 'Username must be valid email address');
  }

  if (password.length < 6) {
    return jsonResponse(false, null, 'Password must be at least 6 characters');
  }

  try {
    const rows = readRows(SHEET_TABS.ADMINS);
    
    if (rows.find(function (a) { return a.username === username; })) {
      Logger.log('❌ Admin already exists: ' + username);
      return jsonResponse(false, null, 'Admin already exists');
    }

    const hash = hashPassword(password);
    
    appendRow(SHEET_TABS.ADMINS, {
      username: username,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
      type: 'PRODUCTION'
    });

    if (rows.length === 0) {
      setAuthPhase('PRODUCTION');
      Logger.log('🔄 ⚠️ AUTH PHASE SWITCHED: BOOTSTRAP → PRODUCTION');
      Logger.log('   Bootstrap credentials now DISABLED');
      Logger.log('   Email-based OTP authentication ENABLED');
    }

    Logger.log('✅ Admin created: ' + username);
    
    return jsonResponse(true, { username: username });
  } catch (err) {
    Logger.log('❌ Error creating admin: ' + err);
    return jsonResponse(false, null, String(err));
  }
}

function listAdmins() {
  try {
    const rows = readRows(SHEET_TABS.ADMINS);
    const safe = rows.map(function (a) {
      return { 
        username: a.username, 
        createdAt: a.createdAt,
        type: a.type || 'PRODUCTION'
      };
    });
    return jsonResponse(true, safe);
  } catch (err) {
    Logger.log('❌ Error listing admins: ' + err);
    return jsonResponse(false, null, String(err));
  }
}
