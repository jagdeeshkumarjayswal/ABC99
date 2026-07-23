/**
 * Contact.gs
 * Contact form submission + mail relay
 */

function submitContactMessage(payload) {
  const type = payload && payload.type;
  const name = payload && payload.name;
  const email = payload && payload.email;
  const message = payload && payload.message;
  
  if (!name || !email || !message) return jsonResponse(false, null, 'name, email, message required');

  try {
    const id = generateId();
    appendRow(SHEET_TABS.MESSAGES, {
      id: id,
      type: type || 'contact',
      name: name,
      email: email,
      message: message,
      delivered: false,
      attempted: false,
      timestamp: new Date().toISOString(),
    });

    const relay = callMemberByCapability('mail', 'sendMail', {
      to: 'contact@bharsoft.email',
      subject: '[' + (type || 'contact') + '] from ' + name,
      body: message + '\n\nReply-to: ' + email,
    });

    const delivered = !!(relay && relay.success);
    const attempted = !!relay;
    
    if (attempted) {
      updateRowById(SHEET_TABS.MESSAGES, id, { 
        delivered: delivered, 
        attempted: true 
      });
    }

    return jsonResponse(true, { id: id, delivered: delivered, attempted: attempted });
  } catch (err) {
    return jsonResponse(false, null, String(err));
  }
}
