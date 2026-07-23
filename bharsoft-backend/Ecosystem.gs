/**
 * Ecosystem.gs
 * Ecosystem member handshake and relay
 */

function listEcosystemMembers() {
  try {
    const rows = readRows(SHEET_TABS.MEMBERS);
    const safe = rows.map(function (m) {
      return {
        id: m.id,
        name: m.name,
        siteUrl: m.siteUrl,
        capabilities: String(m.capabilities || '').split(',').filter(Boolean),
        linkedAt: m.linkedAt,
      };
    });
    return jsonResponse(true, safe);
  } catch (err) {
    return jsonResponse(true, []);
  }
}

function addEcosystemMember(name, execUrl) {
  if (!name || !execUrl) return jsonResponse(false, null, 'name and execUrl required');

  try {
    const signingSecret = Utilities.getUuid();
    const sep = execUrl.indexOf('?') >= 0 ? '&' : '?';
    const handshakeUrl = execUrl + sep + 'action=capabilities'
      + '&callerSecret=' + encodeURIComponent(signingSecret);

    const resp = UrlFetchApp.fetch(handshakeUrl, { method: 'get', muteHttpExceptions: true, timeout: 8000 });
    const body = JSON.parse(resp.getContentText());
    
    if (!body.success) return jsonResponse(false, null, 'Member handshake failed: ' + (body.error || 'unknown'));

    const id = generateId();
    const capabilities = (body.data && body.data.capabilities) || [];
    const siteUrl = (body.data && body.data.siteUrl) || '';
    
    appendRow(SHEET_TABS.MEMBERS, {
      id: id,
      name: name,
      execUrl: execUrl,
      signingSecret: signingSecret,
      capabilities: capabilities.join(','),
      siteUrl: siteUrl,
      linkedAt: new Date().toISOString(),
    });

    return jsonResponse(true, { id: id, capabilities: capabilities, siteUrl: siteUrl });
  } catch (err) {
    return jsonResponse(false, null, 'Handshake failed: ' + String(err));
  }
}

function removeEcosystemMember(id) {
  try {
    deleteRowById(SHEET_TABS.MEMBERS, id);
    return jsonResponse(true, { id: id });
  } catch (err) {
    return jsonResponse(false, null, String(err));
  }
}

function callMemberByCapability(capability, action, payload) {
  let rows;
  try { 
    rows = readRows(SHEET_TABS.MEMBERS); 
  } catch (err) { 
    return null; 
  }

  const member = rows.find(function (m) {
    return String(m.capabilities || '').split(',').indexOf(capability) >= 0;
  });
  
  if (!member) return null;

  try {
    const sep = member.execUrl.indexOf('?') >= 0 ? '&' : '?';
    const url = member.execUrl + sep + 'action=' + encodeURIComponent(action)
      + '&secret=' + encodeURIComponent(member.signingSecret);
    
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload || {}),
      muteHttpExceptions: true,
      timeout: 8000
    });
    
    return JSON.parse(resp.getContentText());
  } catch (err) {
    return null;
  }
}
