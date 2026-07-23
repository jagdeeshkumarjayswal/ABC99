/**
 * Code.gs
 * Main request handler / router
 */

function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    let payload = {};
    
    if (e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } 
      catch (err) { /* no JSON body */ }
    }

    switch (action) {
      // Ecosystem handshake (public)
      case 'capabilities':
        return handleCapabilities(e);
      
      // Auth (setup flow)
      case 'sendOTP':
        return sendOTP(payload.username, payload.password);
      case 'verifyOTP':
        return verifyOTP(payload.username, payload.otp);
      case 'getAuthPhase':
        return jsonResponse(true, { phase: getAuthPhase() });
      
      // Database link (admin)
      case 'linkSheet':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return linkSheet(payload.ecosystemId, payload.sheetUrl);
      
      // Services (admin + public relay)
      case 'listServices':
        return listServices();
      case 'addService':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return addService(payload.title, payload.description, payload.icon, payload.capability, payload.execUrl);
      case 'deleteService':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return deleteService(payload.id);
      
      // Ecosystem members (admin + handshake relay)
      case 'listEcosystemMembers':
        return listEcosystemMembers();
      case 'addEcosystemMember':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return addEcosystemMember(payload.name, payload.execUrl);
      case 'removeEcosystemMember':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return removeEcosystemMember(payload.id);
      
      // Admins (admin only)
      case 'addAdmin':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return addAdmin(payload.username, payload.password);
      case 'listAdmins':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return listAdmins();
      case 'listLinkedSheets':
        if (!isValidSession(e)) return jsonResponse(false, null, 'Not authenticated');
        return listLinkedSheets();
      
      // Contact messages (public relay + admin)
      case 'submitContactMessage':
        if (!isTrustedCaller(e)) return jsonResponse(false, null, 'Untrusted caller');
        return submitContactMessage(payload);
      
      // Public ping
      case 'ping':
        return jsonResponse(true, { pong: true });
      
      default:
        return jsonResponse(false, null, 'Unknown action: ' + action);
    }
  } catch (err) {
    Logger.log('Error in handle: ' + err);
    return jsonResponse(false, null, String(err));
  }
}

function handleCapabilities(e) {
  const callerSecret = e.parameter.callerSecret;
  if (callerSecret) registerTrustedCaller(callerSecret);
  
  return jsonResponse(true, {
    capabilities: ['services', 'ecosystem', 'contact'],
    siteUrl: ScriptApp.getService().getUrl()
  });
}
