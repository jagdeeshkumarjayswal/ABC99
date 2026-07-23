/**
 * Services.gs
 * Services CRUD for public page + admin panel
 */

function listServices() {
  try {
    const rows = readRows(SHEET_TABS.SERVICES);
    const safe = rows.map(function (s) {
      return {
        id: s.id,
        title: s.title,
        icon: s.icon,
        description: s.description,
        capability: s.capability,
      };
    });
    return jsonResponse(true, safe);
  } catch (err) {
    return jsonResponse(true, []);
  }
}

function addService(title, description, icon, capability, execUrl) {
  if (!title || !description) return jsonResponse(false, null, 'title and description required');

  try {
    const id = generateId();
    appendRow(SHEET_TABS.SERVICES, {
      id: id,
      title: title,
      description: description,
      icon: icon || '⚙️',
      capability: capability || '',
      execUrl: execUrl || '',
    });
    return jsonResponse(true, { id: id });
  } catch (err) {
    return jsonResponse(false, null, String(err));
  }
}

function deleteService(id) {
  try {
    deleteRowById(SHEET_TABS.SERVICES, id);
    return jsonResponse(true, { id: id });
  } catch (err) {
    return jsonResponse(false, null, String(err));
  }
}
