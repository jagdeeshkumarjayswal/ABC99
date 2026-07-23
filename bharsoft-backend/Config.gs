/**
 * Config.gs
 * Central configuration for Bharsoft backend
 * TWO-PHASE AUTHENTICATION SYSTEM
 */

const API_KEY = 'e1fb64d81916506830dd0ba2fc481d799b5bd0b847aa33da4873d7112521c7f4';
const PROPS = PropertiesService.getScriptProperties();

const PRIMARY_ECOSYSTEM_ID = 'bharsoft-main';

const SHEET_TABS = {
  SERVICES: 'Services',
  MEMBERS: 'Members',
  MESSAGES: 'Messages',
  ADMINS: 'Admins',
};

const REQUIRED_HEADERS = {
  Services: ['id', 'title', 'icon', 'description', 'capability', 'execUrl'],
  Members: ['id', 'name', 'execUrl', 'signingSecret', 'capabilities', 'siteUrl', 'linkedAt'],
  Messages: ['id', 'type', 'name', 'email', 'message', 'delivered', 'attempted', 'timestamp'],
  Admins: ['username', 'passwordHash', 'createdAt', 'type'],
};

// ============ TWO-PHASE AUTHENTICATION ============

function setup() {
  if (!PROPS.getProperty('BOOTSTRAP_USERNAME')) {
    const username = 'admin';
    const password = generateBootstrapPassword();
    PROPS.setProperty('BOOTSTRAP_USERNAME', username);
    PROPS.setProperty('BOOTSTRAP_PASSWORD', password);
    PROPS.setProperty('BOOTSTRAP_OTP', '000000');
    PROPS.setProperty('AUTH_PHASE', 'BOOTSTRAP');
    
    Logger.log('═════════════════════════════════════════════════════');
    Logger.log('✓ BOOTSTRAP SETUP COMPLETE - PHASE 1 READY');
    Logger.log('═════════════════════════════════════════════════════');
    Logger.log('');
    Logger.log('📋 PHASE 1: BOOTSTRAP (First-Time Setup)');
    Logger.log('   Login with LOCAL DEMO credentials:');
    Logger.log('   ├─ Username: ' + username);
    Logger.log('   ├─ Password: ' + password);
    Logger.log('   └─ OTP (Demo): 000000');
    Logger.log('');
    Logger.log('✅ Use these to:');
    Logger.log('   1. Link Google Sheet as database');
    Logger.log('   2. Create REAL admin account (with Gmail)');
    Logger.log('');
    Logger.log('🔐 After creating real admin:');
    Logger.log('   • BOOTSTRAP auth DISABLED');
    Logger.log('   • Only email-based login allowed');
    Logger.log('   • OTP sent to Gmail inbox');
    Logger.log('   • Username = Gmail address');
    Logger.log('');
    Logger.log('🔑 API Key: ' + API_KEY);
    Logger.log('═════════════════════════════════════════════════════');
  }
}

function generateBootstrapPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 14; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function getBootstrapCreds() {
  return {
    username: PROPS.getProperty('BOOTSTRAP_USERNAME'),
    password: PROPS.getProperty('BOOTSTRAP_PASSWORD'),
    otp: PROPS.getProperty('BOOTSTRAP_OTP'),
  };
}

function getAuthPhase() {
  return PROPS.getProperty('AUTH_PHASE') || 'BOOTSTRAP';
}

function setAuthPhase(phase) {
  PROPS.setProperty('AUTH_PHASE', phase);
  Logger.log('🔄 Auth phase changed to: ' + phase);
}

function isBootstrapMode() {
  return getAuthPhase() === 'BOOTSTRAP';
}

function isProductionMode() {
  return getAuthPhase() === 'PRODUCTION';
}

function isValidSession(e) {
  const token = e && e.parameter && e.parameter.sessionToken;
  if (!token) return false;
  const session = CacheService.getScriptCache().get('session_' + token);
  return !!session;
}

function getCurrentUser(e) {
  const token = e && e.parameter && e.parameter.sessionToken;
  if (!token) return null;
  return CacheService.getScriptCache().get('session_' + token);
}

function isTrustedCaller(e) {
  const secret = e && e.parameter && e.parameter.secret;
  if (!secret) return false;
  const trusted = JSON.parse(PROPS.getProperty('TRUSTED_CALLERS') || '[]');
  return trusted.indexOf(secret) >= 0;
}

function registerTrustedCaller(secret) {
  if (!secret) return;
  const trusted = JSON.parse(PROPS.getProperty('TRUSTED_CALLERS') || '[]');
  if (trusted.indexOf(secret) < 0) {
    trusted.push(secret);
    PROPS.setProperty('TRUSTED_CALLERS', JSON.stringify(trusted));
  }
}

function jsonResponse(success, data, error) {
  return ContentService
    .createTextOutput(JSON.stringify({ 
      success: success, 
      data: data !== undefined ? data : null, 
      error: error || null 
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
