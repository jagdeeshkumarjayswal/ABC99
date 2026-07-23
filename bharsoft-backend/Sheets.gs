/**
 * Sheets.gs
 * Google Sheet datastore helpers
 */

function listLinkedSheets() {
  const list = JSON.parse(PROPS.getProperty('LINKED_SHEETS') || '[]');
  return jsonResponse(true, list);
}

function linkSheet(ecosystemId, sheetUrl) {
  if (!ecosystemId || !sheetUrl) return jsonResponse(false, null, 'ecosystemId and sheetUrl required');

  let ss;
  try {
    ss = SpreadsheetApp.openByUrl(sheetUrl);
  } catch (err) {
    return jsonResponse(false, null, 'Could not open sheet — check URL and permissions');
  }

  if (ecosystemId === PRIMARY_ECOSYSTEM_ID) {
    ensureTabs(ss);
    PROPS.setProperty('DATA_SHEET_ID', ss.getId());
  }

  const list = JSON.parse(PROPS.getProperty('LINKED_SHEETS') || '[]');
  const existing = list.find(function (s) { return s.ecosystemId === ecosystemId; });
  if (existing) { existing.sheetUrl = sheetUrl; existing.valid = true; }
  else list.push({ ecosystemId: ecosystemId, sheetUrl: sheetUrl, valid: true });
  
  PROPS.setProperty('LINKED_SHEETS', JSON.stringify(list));
  return jsonResponse(true, { ecosystemId: ecosystemId, sheetUrl: sheetUrl });
}

function ensureTabs(ss) {
  Object.keys(REQUIRED_HEADERS).forEach(function (tabName) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(REQUIRED_HEADERS[tabName]);
    }
  });
}

function getDataSheet(tabName) {
  const sheetId = PROPS.getProperty('DATA_SHEET_ID');
  if (!sheetId) throw new Error('No database linked — link a Google Sheet first');
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('Tab "' + tabName + '" not found');
  return sheet;
}

function readRows(tabName) {
  const sheet = getDataSheet(tabName);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  return values
    .filter(function (row) { return row.some(function (cell) { return cell !== ''; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function appendRow(tabName, rowObj) {
  const sheet = getDataSheet(tabName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sheet.appendRow(row);
}

function deleteRowById(tabName, id) {
  const sheet = getDataSheet(tabName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idCol]) === String(id)) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

function updateRowById(tabName, id, updates) {
  const sheet = getDataSheet(tabName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(id)) {
      Object.keys(updates).forEach(function (key) {
        const col = headers.indexOf(key);
        if (col >= 0) sheet.getRange(r + 1, col + 1).setValue(updates[key]);
      });
      return true;
    }
  }
  return false;
}

function generateId() {
  return Utilities.getUuid();
}
