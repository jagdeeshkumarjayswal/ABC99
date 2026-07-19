======================================
   GATE99 backend — SINGLE FILE VERSION
   -----------------------------------------------------------------
   Poora backend isi ek file me hai (koi subfolder nahi) taaki GitHub
   par upload karte waqt koi file miss na ho. Sirf ye 2 files chahiye:
     - server.js   (ye file)
     - package.json
   Environment variables Railway ke "Variables" tab se set karni hain
   (.env file upload karne ki zaroorat nahi).
   ===================================================================== */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
const { parse } = require('csv-parse/sync');
const fetch = require('node-fetch');

const ADMIN_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9._-]*@gate99\.com$/;
const SETTINGS_TABLE = 'Settings';
const OTP_COLLECTION = '_otps';
const OTP_TTL_SECONDS = 600; // 10 minutes

// =====================================================================
// MongoDB connection
// =====================================================================
let mongoClient;
let db;

async function connectDb() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable set nahi hai (Railway > Variables tab).');
  mongoClient = new MongoClient(uri, {
    family: 4, // force IPv4 — Railway containers often fail SRV lookups over IPv6, which shows up as a TLS/SSL handshake error
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000
  });
  await mongoClient.connect();
  db = mongoClient.db(process.env.MONGODB_DB_NAME || 'gate99');
  console.log('[db] MongoDB Atlas se connect ho gaya:', db.databaseName);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database abhi connect nahi hui hai — thodi der me phir try karein.');
  return db;
}

async function listPublicCollections() {
  const cols = await getDb().listCollections({}, { nameOnly: true }).toArray();
  return cols.map((c) => c.name).filter((n) => !n.startsWith('_'));
}

async function ensureOtpIndex() {
  const col = getDb().collection(OTP_COLLECTION);
  await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: OTP_TTL_SECONDS });
  await col.createIndex({ key: 1 }, { unique: true });
}

// =====================================================================
// Small helpers
// =====================================================================
function hash(str) {
  return crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
}

async function readTableRows(tableName) {
  const rows = await getDb().collection(tableName).find({}).toArray();
  return rows.map((r) => { const c = Object.assign({}, r); delete c._id; return c; });
}

async function appendRow(tableName, record) {
  await getDb().collection(tableName).insertOne(Object.assign({}, record));
}

async function findRowByKey(tableName, keyField, keyValue) {
  const needle = String(keyValue).toLowerCase().trim();
  const rows = await readTableRows(tableName);
  return rows.find((r) => String(r[keyField] || '').toLowerCase().trim() === needle) || null;
}

async function getSettingsMap() {
  const rows = await readTableRows(SETTINGS_TABLE);
  const map = {};
  rows.forEach((r) => { map[r.key] = r.value; });
  return map;
}

// ---------- OTP store (MongoDB TTL collection) ----------
function otpKey(email, purpose) {
  return 'otp_' + (purpose || 'verify') + '_' + String(email).toLowerCase().trim();
}
async function putOtp(email, purpose, otp) {
  const col = getDb().collection(OTP_COLLECTION);
  const key = otpKey(email, purpose);
  await col.updateOne({ key }, { $set: { key, otp: String(otp), createdAt: new Date() } }, { upsert: true });
}
async function getOtp(email, purpose) {
  const doc = await getDb().collection(OTP_COLLECTION).findOne({ key: otpKey(email, purpose) });
  return doc ? doc.otp : null;
}
async function removeOtp(email, purpose) {
  await getDb().collection(OTP_COLLECTION).deleteOne({ key: otpKey(email, purpose) });
}

// ---------- Email (OTP) ----------
let transporter;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}
async function sendOtpEmail(email, otp, name) {
  const fromName = process.env.SMTP_FROM_NAME || 'GATE99';
  await getTransporter().sendMail({
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${fromName} — Your OTP code`,
    html: `Hi ${name || ''},<br><br>Your ${fromName} OTP is <b style="font-size:20px">${otp}</b>.<br>` +
          `It is valid for 10 minutes. If you did not request this, you can ignore this email.<br><br>— ${fromName}`
  });
}

// ---------- Google Sheet CSV reader (for PYQ test sheets / feedback) ----------
function toCsvExportUrl(sheetUrl, gid) {
  const m = String(sheetUrl).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error('Ye ek valid Google Sheets URL nahi lag raha.');
  const gidPart = gid ? `&gid=${encodeURIComponent(gid)}` : '';
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gidPart}`;
}
async function readGoogleSheetAsRows(sheetUrl, tabName) {
  const res = await fetch(toCsvExportUrl(sheetUrl, tabName));
  if (!res.ok) throw new Error('Google Sheet open nahi ho payi — "Anyone with the link" share karein. HTTP ' + res.status);
  return parse(await res.text(), { columns: true, skip_empty_lines: true });
}

// =====================================================================
// Express app
// =====================================================================
const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin === '*' ? true : allowedOrigin.split(',') }));
app.use(express.text({ type: ['text/plain', 'application/json'], limit: '2mb' }));

function jsonOut(res, obj) { res.json(obj); }
function err(res, message) { jsonOut(res, { status: 'error', message }); }

// ---------- GET (mirrors Code.gs doGet) ----------
app.get('/', async (req, res) => {
  const action = req.query.action;
  try {
    if (action === 'ping') {
      const tables = await listPublicCollections();
      return jsonOut(res, { status: 'ok', dbName: getDb().databaseName, tables });
    }
    if (action === 'listTables') {
      return jsonOut(res, { status: 'success', tables: await listPublicCollections() });
    }
    if (action === 'getAll') {
      const table = req.query.table;
      if (!table) return err(res, 'table parameter chahiye');
      const rows = await readTableRows(table);
      return jsonOut(res, { status: 'success', data: rows.map((r) => { const c = Object.assign({}, r); delete c.passwordHash; return c; }) });
    }
    if (action === 'checkAdminIdExists') {
      const aid = String(req.query.adminId || '').toLowerCase().trim();
      const rows = await readTableRows('Admin Logs');
      return jsonOut(res, { status: 'success', exists: rows.some((r) => String(r.adminId || '').toLowerCase().trim() === aid) });
    }
    if (action === 'sendOtp') {
      const { email, purpose, name } = req.query;
      if (!email) return err(res, 'email chahiye');
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await putOtp(email, purpose, otp);
      try { await sendOtpEmail(email, otp, name); }
      catch (mailErr) { return err(res, 'OTP email bhejne me dikkat hui: ' + mailErr.message); }
      return jsonOut(res, { status: 'success', message: 'OTP bhej diya gaya hai' });
    }
    if (action === 'verifyOtp') {
      const { email, otp, purpose } = req.query;
      if (!email || !otp) return err(res, 'email aur otp dono chahiye');
      const cached = await getOtp(email, purpose);
      if (!cached) return err(res, 'OTP expire ho gaya ya bheja hi nahi gaya. Dobara "Send OTP" try karein.');
      if (String(cached) !== String(otp).trim()) return err(res, 'OTP galat hai');
      await removeOtp(email, purpose);
      return jsonOut(res, { status: 'success', message: 'OTP verify ho gaya' });
    }
    if (action === 'login') {
      const { username, password, otp } = req.query;
      if (!username || !password || !otp) return err(res, 'Username, Password aur OTP teeno chahiye');
      const uname = username.trim().toLowerCase();
      const isAdmin = /@gate99\.com$/.test(uname);
      const tableName = isAdmin ? 'Admin Logs' : 'Students';
      const idField = isAdmin ? 'adminId' : 'email';
      const match = await findRowByKey(tableName, idField, uname);
      if (!match) return err(res, 'Username ya password galat hai');
      if (String(match.passwordHash) !== hash(password)) return err(res, 'Username ya password galat hai');
      const cachedOtp = await getOtp(match.email || uname, 'login');
      if (!cachedOtp || String(cachedOtp) !== String(otp).trim()) return err(res, 'OTP galat ya expire ho gaya hai');
      await removeOtp(match.email || uname, 'login');
      const profile = Object.assign({}, match);
      delete profile.passwordHash;
      return jsonOut(res, { status: 'success', role: isAdmin ? 'admin' : 'student', profile });
    }
    if (action === 'getSettings') {
      return jsonOut(res, { status: 'success', settings: await getSettingsMap() });
    }
    if (action === 'getPyqSheet') {
      const { sheetUrl, tabName } = req.query;
      if (!sheetUrl) return err(res, 'sheetUrl chahiye');
      try { return jsonOut(res, { status: 'success', questions: await readGoogleSheetAsRows(sheetUrl, tabName) }); }
      catch (e) { return err(res, e.message); }
    }
    if (action === 'getFeedback') {
      const settings = await getSettingsMap();
      try {
        const data = settings.feedbackSheetUrl ? await readGoogleSheetAsRows(settings.feedbackSheetUrl) : await readTableRows('Feedback');
        return jsonOut(res, { status: 'success', data });
      } catch (e) { return err(res, e.message); }
    }
    return err(res, 'Unknown action: ' + action);
  } catch (e) {
    return err(res, e.message);
  }
});

// ---------- POST (mirrors Code.gs doPost) ----------
app.post('/', async (req, res) => {
  let data;
  try { data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch (e) { return err(res, 'Body JSON parse nahi hui'); }

  const action = data.__action;
  try {
    if (action === 'writeRow') {
      if (!data.table || !data.data) return err(res, 'table aur data dono chahiye');
      await appendRow(data.table, data.data);
      return jsonOut(res, { status: 'success', message: data.table + ' me row add ho gayi' });
    }
    if (action === 'updateRow') {
      const { table, keyField, keyValue, patch } = data;
      const col = getDb().collection(table);
      const needle = String(keyValue).toLowerCase().trim();
      const target = (await col.find({}).toArray()).find((r) => String(r[keyField] || '').toLowerCase().trim() === needle);
      if (!target) return err(res, keyField + ' = ' + keyValue + ' nahi mila');
      await col.updateOne({ _id: target._id }, { $set: patch });
      return jsonOut(res, { status: 'success', message: 'Update ho gaya' });
    }
    if (action === 'deleteRow') {
      const { table, keyField, keyValue } = data;
      const col = getDb().collection(table);
      const needle = String(keyValue).toLowerCase().trim();
      const target = (await col.find({}).toArray()).find((r) => String(r[keyField] || '').toLowerCase().trim() === needle);
      if (!target) return err(res, keyField + ' = ' + keyValue + ' nahi mila');
      await col.deleteOne({ _id: target._id });
      return jsonOut(res, { status: 'success', message: 'Delete ho gaya' });
    }
    if (action === 'adminRegister') {
      const adminId = String(data.adminId || '').trim().toLowerCase();
      if (!ADMIN_ID_REGEX.test(adminId)) return err(res, 'Admin ID "name@gate99.com" format me hona chahiye');
      if (!data.adminName || !data.email || !data.mobile || !data.password) return err(res, 'Sabhi fields bharna zaroori hai');
      if (await findRowByKey('Admin Logs', 'adminId', adminId)) return err(res, 'Ye Admin ID pehle se registered hai');
      await appendRow('Admin Logs', { adminId, adminName: data.adminName, email: data.email, mobile: data.mobile, passwordHash: hash(data.password), registeredAt: new Date().toISOString() });
      return jsonOut(res, { status: 'success', message: 'Admin registered ho gaya', adminId });
    }
    if (action === 'generateCourse') {
      const courseId = String(data.courseId || '').trim().toUpperCase();
      if (!courseId || !data.courseName || data.fees === undefined || data.fees === '') return err(res, 'Course ID, Course Name aur Fees teeno chahiye');
      if (await findRowByKey('Courses', 'courseId', courseId)) return err(res, 'Course ID "' + courseId + '" pehle se maujood hai');
      await appendRow('Courses', { courseId, courseName: data.courseName, fees: Number(data.fees), videoLectures: JSON.stringify(data.videoLectures || []), createdAt: new Date().toISOString() });
      return jsonOut(res, { status: 'success', message: 'Course "' + courseId + '" generate ho gaya' });
    }
    if (action === 'updateCourse') {
      const courseId = String(data.courseId || '').trim().toUpperCase();
      if (!courseId) return err(res, 'courseId chahiye');
      const existing = await findRowByKey('Courses', 'courseId', courseId);
      if (!existing) return err(res, 'Course "' + courseId + '" nahi mila');
      const patch = {};
      if (data.courseName !== undefined) patch.courseName = data.courseName;
      if (data.fees !== undefined) patch.fees = Number(data.fees);
      if (data.videoLectures !== undefined) patch.videoLectures = JSON.stringify(data.videoLectures);
      if (data.fullLengthTests !== undefined) patch.fullLengthTests = JSON.stringify(data.fullLengthTests);
      if (data.subjectTests !== undefined) patch.subjectTests = JSON.stringify(data.subjectTests);
      if (data.topicTests !== undefined) patch.topicTests = JSON.stringify(data.topicTests);
      await getDb().collection('Courses').updateOne({ courseId: existing.courseId }, { $set: patch });
      return jsonOut(res, { status: 'success', message: 'Course update ho gaya' });
    }
    if (action === 'saveSetting') {
      const { key, value } = data;
      if (!key) return err(res, 'key chahiye');
      await getDb().collection(SETTINGS_TABLE).updateOne({ key }, { $set: { key, value } }, { upsert: true });
      return jsonOut(res, { status: 'success', message: 'Setting save ho gayi' });
    }
    if (action === 'studentRegister') {
      const email = String(data.email || '').trim().toLowerCase();
      if (!email || !data.name || !data.mobile || !data.password) return err(res, 'Naam, Email, Mobile aur Password sabhi zaroori hain');
      if (await findRowByKey('Students', 'email', email)) return err(res, 'Ye email pehle se registered hai — seedha login karein');
      await appendRow('Students', { sid: email, name: data.name, email, mobile: data.mobile, passwordHash: hash(data.password), registeredAt: new Date().toISOString() });
      return jsonOut(res, { status: 'success', message: 'Registration ho gaya — ab login karein' });
    }
    if (action === 'enrollCourse') {
      if (!data.sid || !data.cid) return err(res, 'sid aur cid dono chahiye');
      await appendRow('Enroll Logs', { sid: data.sid, cid: data.cid, fees: data.fees !== undefined ? Number(data.fees) : '', paymentId: data.paymentId || '', enrolledAt: new Date().toISOString() });
      return jsonOut(res, { status: 'success', message: 'Enrollment ho gayi — course ab unlock hai' });
    }
    if (action === 'submitTestAttempt') {
      if (!data.sid || !data.cid || !data.testName) return err(res, 'sid, cid aur testName chahiye');
      await appendRow('Test Attempts', { sid: data.sid, cid: data.cid, testName: data.testName, score: data.score, total: data.total, submittedAt: new Date().toISOString() });
      return jsonOut(res, { status: 'success', message: 'Attempt save ho gaya' });
    }
    if (action === 'submitFeedback') {
      await appendRow('Feedback', { sid: data.sid || '', sname: data.sname || '', cid: data.cid || '', cname: data.cname || '', mobile: data.mobile || '', email: data.email || '', message: data.message || '', submittedAt: new Date().toISOString() });
      return jsonOut(res, { status: 'success', message: 'Feedback submit ho gaya, dhanyawad!' });
    }
    return err(res, 'Unknown action: ' + action);
  } catch (e) {
    return err(res, e.message);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// =====================================================================
// Startup — server pehle start hota hai, Mongo background me retry
// karta hai. MONGODB_URI galat/missing hone par bhi process crash
// nahi hoga.
// =====================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[server] GATE99 backend chal raha hai: port ${PORT}`));

async function connectWithRetry(attempt = 1) {
  try {
    await connectDb();
    await ensureOtpIndex();
    console.log('[startup] MongoDB Atlas connected, OTP index ready.');
  } catch (e) {
    console.error(`[startup] MongoDB connect attempt ${attempt} fail hui:`, e.message);
    setTimeout(() => connectWithRetry(attempt + 1), Math.min(30000, attempt * 5000));
  }
}
connectWithRetry();
