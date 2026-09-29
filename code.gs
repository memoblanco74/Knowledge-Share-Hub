var ROOT_FOLDER_ID = "1UVvi1a98zK-nd-D9eN_XhhC06Qkzetvf";
var ROOT_FOLDER_NAME = "Home";
// Migrated to Supabase (KSlogs / folder_counts / providers / printers tables) - kept for reference only.
// var LOGS_DB_ID = "1RplUNp__FL-dUc3KHQTSfsYR3RwvXnF4uWw2px8Gm88";
// var WARRANTY_DB_ID = "1O8DxCDGFNu2mcTNIZFXbZE4Fc5lcWMivQSWBf3EYuPo";
// var PRINTERS_DB_ID = "1siZ1qcMaBdMWKQTjc8-cHcRZk7zM8yNfyNpnLRWMj2c";
var PENDING_FOLDER_NAME = "_Pending_Approvals";
const SUPABASE_URL = "https://auurmvfaqkxaxowxoqkl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1dXJtdmZhcWt4YXhvd3hvcWtsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY2OTgyNCwiZXhwIjoyMDkzMjQ1ODI0fQ.q7QhImOJu--YdHZo4KIi4Cm2PVoHriJBiInLbGMuS9c";

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Knowledge Share Hub').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getRootFolder() {
  return DriveApp.getFolderById(ROOT_FOLDER_ID);
}

function syncAllFolderCountsFast() {
  var rootId = ROOT_FOLDER_ID;
  var allFolders = {}, filesCount = {}, childrenMap = {};
  var pageToken = null;
  
  do {
    var res = Drive.Files.list({ q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false", pageSize: 1000, pageToken: pageToken, fields: "nextPageToken, files(id, name, parents)" });
    if (res.files) {
      res.files.forEach(function(f) {
        allFolders[f.id] = f.name;
        var pId = (f.parents && f.parents.length > 0) ? f.parents[0] : null;
        if (pId) { if (!childrenMap[pId]) childrenMap[pId] = []; childrenMap[pId].push(f.id); }
      });
    }
    pageToken = res.nextPageToken;
  } while (pageToken);

  var projectFolders = {};
  function markDescendants(id) {
    projectFolders[id] = allFolders[id] || "Unknown";
    var children = childrenMap[id] || [];
    children.forEach(markDescendants);
  }
  markDescendants(rootId);

  pageToken = null;
  do {
    var res = Drive.Files.list({ q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false", pageSize: 1000, pageToken: pageToken, fields: "nextPageToken, files(parents)" });
    if (res.files) {
      res.files.forEach(function(f) {
        var pId = (f.parents && f.parents.length > 0) ? f.parents[0] : null;
        if (pId && projectFolders[pId]) filesCount[pId] = (filesCount[pId] || 0) + 1;
      });
    }
    pageToken = res.nextPageToken;
  } while (pageToken);

  var finalCounts = {};
  function getCount(fId) {
    if (finalCounts[fId] !== undefined) return finalCounts[fId];
    var count = filesCount[fId] || 0;
    var children = childrenMap[fId] || [];
    children.forEach(function(cId) {
      if (allFolders[cId] !== PENDING_FOLDER_NAME && projectFolders[cId]) count += getCount(cId);
    });
    finalCounts[fId] = count;
    return count;
  }
  
  getCount(rootId);
  for (var id in projectFolders) { if (finalCounts[id] === undefined) getCount(id); }

  var rows = [];
  for (var id in finalCounts) {
    if (projectFolders[id] && projectFolders[id] !== PENDING_FOLDER_NAME) {
      rows.push({ folder_id: id, folder_name: projectFolders[id], file_count: finalCounts[id] });
    }
  }
  fetchSupabase("folder_counts?folder_id=not.is.null", "DELETE");
  var chunkSize = 500;
  for (var i = 0; i < rows.length; i += chunkSize) {
    fetchSupabase("folder_counts", "POST", rows.slice(i, i + chunkSize));
  }
  return true;
}

function fetchSupabase(e,m,p){var opt={method:m||"GET",headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json","Prefer":"return=representation"},muteHttpExceptions:true};if(p){opt.payload=JSON.stringify(p);}var r=UrlFetchApp.fetch(SUPABASE_URL+"/rest/v1/"+e,opt);var c=r.getResponseCode(),t=r.getContentText();if(c>=200&&c<300)return t?JSON.parse(t):null;throw new Error("Supabase Error: "+t);}

function getUsersData(){var d=fetchSupabase("users?select=*"),o={};if(!d)return o;for(var i=0;i<d.length;i++){var e=String(d[i].username).trim().toLowerCase();if(!e)continue;var p={},f=[];try{p=typeof d[i].ks_permissions_json==='string'?JSON.parse(d[i].ks_permissions_json):(d[i].ks_permissions_json||{});}catch(x){}try{f=typeof d[i].favorites_json==='string'?JSON.parse(d[i].favorites_json):(d[i].favorites_json||[]);}catch(x){}o[e]={id:d[i].id,password:d[i].password_encoded,permissions:p,comment:d[i].comment||"",favorites:f};}return o;}

function handleLogin(e,p){var u=getUsersData(),c=String(e).trim().toLowerCase();if(u[c]&&String(u[c].password)===String(p)){logAction(c,"Login","User logged in successfully");return{valid:true,permissions:u[c].permissions,comment:u[c].comment,favorites:u[c].favorites};}return{valid:false,message:"Invalid credentials"};}

function toggleFavorite(e,f){var c=String(e).trim().toLowerCase(),d=fetchSupabase("users?username=eq."+encodeURIComponent(c)+"&select=id,favorites_json");if(d&&d.length>0){var u=d[0],v=[];try{v=typeof u.favorites_json==='string'?JSON.parse(u.favorites_json):(u.favorites_json||[]);}catch(x){}var i=v.findIndex(function(x){return x.id===f.id;}),a="";if(i!==-1){v.splice(i,1);a="Remove Favorite";}else{v.push(f);a="Add Favorite";}fetchSupabase("users?id=eq."+u.id,"PATCH",{favorites_json:JSON.stringify(v)});logAction(c,a,"File: "+f.name,f.id);return{success:true,favorites:v};}return{success:false};}

function changeUserPassword(e,p,a){var c=e.toLowerCase(),d=fetchSupabase("users?username=eq."+encodeURIComponent(c)+"&select=id");if(d&&d.length>0){fetchSupabase("users?id=eq."+d[0].id,"PATCH",{password_encoded:p});logAction(a||e,"Change Password","For user: "+e);return{success:true,message:"Updated"};}return{success:false,message:"User not found"};}

function getAllUsersList(){var d=fetchSupabase("users?select=*"),l=[];if(!d)return l;for(var i=0;i<d.length;i++){if(!d[i].username)continue;var p={};try{p=typeof d[i].ks_permissions_json==='string'?JSON.parse(d[i].ks_permissions_json):(d[i].ks_permissions_json||{});}catch(x){}l.push({email:d[i].username,permissions:p,comment:d[i].comment});}return l;}

function saveUserRecord(u,a){var c=u.email.toLowerCase(),d=fetchSupabase("users?username=eq."+encodeURIComponent(c)+"&select=id"),p={username:u.email,ks_permissions_json:JSON.stringify(u.perms),comment:u.comment};if(u.newPassword)p.password_encoded=u.newPassword;if(d&&d.length>0){fetchSupabase("users?id=eq."+d[0].id,"PATCH",p);logAction(a,"Update User",c);}else{if(!u.newPassword)p.password_encoded="123456";fetchSupabase("users","POST",p);logAction(a,"Create User",c);}return{success:true,message:"Saved"};}

function logAction(userEmail, action, details, fileId) {
  fetchSupabase("KSlogs", "POST", {
    created_at: new Date().toISOString(),
    username: userEmail,
    action: action,
    details: details,
    file_id: fileId || ""
  });
}

function logUploadSuccess(userEmail, fileName, isPending, fileId, targetFolderId) {
  if (!fileId) {
    try {
      var folderId = isPending ? getPendingFolder().getId() : (targetFolderId || ROOT_FOLDER_ID);
      var files = DriveApp.getFolderById(folderId).getFilesByName(fileName);
      var latestTime = 0;
      while (files.hasNext()) {
        var f = files.next();
        var cTime = f.getDateCreated().getTime();
        if (cTime > latestTime) {
          latestTime = cTime;
          fileId = f.getId();
        }
      }
    } catch(e) {}
  }
  var actionType = isPending ? "Upload (Pending)" : "Upload";
  logAction(userEmail, actionType, "File: " + fileName, fileId || "");
  if (!isPending) {
    var destId = targetFolderId || ROOT_FOLDER_ID;
    updateAncestorCounts(destId, 1);
  } else {
    try { notifyAdminsPendingUpload(fileName, userEmail, fileId); } catch(e) {}
  }
}

function getAdminEmails() {
  var users = getUsersData(), list = [];
  for (var email in users) {
    if (users[email].permissions && users[email].permissions.approve) list.push(email);
  }
  return list;
}

function notifyAdminsPendingUpload(fileName, uploaderEmail, fileId) {
  var admins = getAdminEmails();
  if (!admins.length) return;
  var appUrl = "";
  try { appUrl = ScriptApp.getService().getUrl(); } catch(e) {}
  var driveLink = fileId ? "https://drive.google.com/file/d/" + fileId + "/view" : "";
  var subject = "New Pending Approval: " + fileName;
  var htmlBody = "<div style='font-family: Arial, sans-serif; font-size: 14px; color: #222;'>" +
    "<p>A new file was uploaded and is waiting for approval:</p>" +
    "<p><b>File:</b> " + fileName + "<br><b>Uploaded by:</b> " + uploaderEmail + "</p>" +
    (appUrl ? "<p><a href='" + appUrl + "' style='background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;'>Open Knowledge Share Hub</a></p>" : "") +
    (driveLink ? "<p><a href='" + driveLink + "'>View file directly in Drive</a></p>" : "") +
    "</div>";
  admins.forEach(function(adminEmail) {
    try {
      MailApp.sendEmail({ to: adminEmail, subject: subject, htmlBody: htmlBody });
    } catch(e) {}
  });
}

function logLogout(email) {
  logAction(email, "Logout", "User logged out");
}

function getPendingFolder() {
  var root = getRootFolder(), folders = root.getFoldersByName(PENDING_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : root.createFolder(PENDING_FOLDER_NAME);
}

function checkSingleDuplicate(fileName, fileSize, targetFolderId, isPending) {
  try {
    var folder = isPending ? getPendingFolder() : (targetFolderId ? DriveApp.getFolderById(targetFolderId) : getRootFolder());
    var existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) {
      var f = existing.next();
      if (f.getSize() === fileSize) return true;
    }
    return false;
  } catch (e) { return false; }
}

function getFolderContents(folderId, pageToken) {
  var rootId = ROOT_FOLDER_ID;
  var targetFolderId = folderId ? folderId : rootId;
  var isHome = (targetFolderId === rootId);
  var parentId = null, pathSequence = [], subFolders = [], filesList = [], nextToken = null;
  var currentFolderName = isHome ? "Recent Uploads" : "";

  if (!pageToken) {
    var tempId = targetFolderId;
    while (tempId && tempId !== rootId) {
      try {
        var fData = Drive.Files.get(tempId, {fields: "id, name, parents"});
        pathSequence.unshift({ id: fData.id, name: fData.name });
        tempId = (fData.parents && fData.parents.length > 0) ? fData.parents[0] : null;
      } catch(e) { break; }
    }
    pathSequence.unshift({ id: rootId, name: ROOT_FOLDER_NAME });
    if (!isHome && pathSequence.length > 0) {
      currentFolderName = pathSequence[pathSequence.length - 1].name;
      if (pathSequence.length > 1) parentId = pathSequence[pathSequence.length - 2].id;
    }
  }

  if (!pageToken) {
    try {
      var qFolders = "'" + targetFolderId + "' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name != '" + PENDING_FOLDER_NAME + "'";
      var foldersRes = Drive.Files.list({q: qFolders, pageSize: 1000, fields: "files(id, name)"});
      var countsMap = {};
      try {
        var countsData = fetchSupabase("folder_counts?select=folder_id,file_count");
        if (countsData) countsData.forEach(function(r) { countsMap[r.folder_id] = r.file_count; });
      } catch(e) {}
      if (foldersRes.files) {
        subFolders = foldersRes.files.map(function(f) { 
          return { id: f.id, name: f.name, count: countsMap[f.id] }; 
        });
      }
    } catch(e) {}
  }

  if (isHome && !folderId && !pageToken) {
    var seenIds = new Set();
    try {
      var recentLogs = fetchSupabase("KSlogs?select=action,details,file_id&order=created_at.desc&limit=500");
      if (recentLogs) {
        for (var i = 0; i < recentLogs.length; i++) {
          var action = recentLogs[i].action, fId = recentLogs[i].file_id;
          if ((action === "Upload" || action === "Approve & Move") && fId) {
            if (!seenIds.has(fId)) {
              try {
                var fData = Drive.Files.get(fId, {fields: "id, name, createdTime, size, mimeType, description, trashed, parents"});
                if (!fData.trashed && isDescendant(fId, rootId)) {
                  filesList.push({ id: fData.id, name: fData.name, date: new Date(fData.createdTime).toLocaleDateString(), timestamp: new Date(fData.createdTime).getTime(), size: fData.size ? parseInt(fData.size) : 0, mimeType: fData.mimeType, path: "Recent", tags: parseTags(fData.description) });
                  seenIds.add(fId);
                }
              } catch (e) {}
            }
          }
          if (filesList.length >= 20) break;
        }
      }
    } catch(e) {}
  } else {
    try {
      var qFiles = "'" + targetFolderId + "' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'";
      var opts = { q: qFiles, pageSize: 50, fields: "nextPageToken, files(id, name, createdTime, size, mimeType, description)" };
      if (pageToken) opts.pageToken = pageToken;
      var filesRes = Drive.Files.list(opts);
      if (filesRes.files) {
        filesList = filesRes.files.map(function(f) { return { id: f.id, name: f.name, date: new Date(f.createdTime).toLocaleDateString(), timestamp: new Date(f.createdTime).getTime(), size: f.size ? parseInt(f.size) : 0, mimeType: f.mimeType, path: currentFolderName, tags: parseTags(f.description) }; });
      }
      nextToken = filesRes.nextPageToken || null;
    } catch(e) {}
  }

  return { currentFolderName: currentFolderName, currentFolderId: targetFolderId, parentId: parentId, folders: subFolders, files: filesList, nextPageToken: nextToken, pathSequence: pathSequence };
}

function parseTags(desc) {
  if (!desc) return [];
  var match = desc.match(/\[Tags: (.*?)\]/);
  return match ? match[1].split(',').map(t => t.trim()) : [];
}

function updateFileTags(id, tagsString, userEmail) {
  var file = DriveApp.getFileById(id), desc = file.getDescription() || "";
  desc = desc.replace(/\[Tags: .*?\]/, "").trim();
  if (tagsString) desc += " [Tags: " + tagsString + "]";
  file.setDescription(desc);
  logAction(userEmail, "Add/Update Tags", "File: " + file.getName() + " | Tags: " + tagsString, id);
}

function getFolderFileCountAsyncOptimized(id, name) {
  try {
    var existing = fetchSupabase("folder_counts?folder_id=eq." + encodeURIComponent(id) + "&select=file_count");
    if (existing && existing.length > 0) return existing[0].file_count;
    var folder = DriveApp.getFolderById(id);
    var count = countFilesRecursive(folder);
    fetchSupabase("folder_counts", "POST", { folder_id: id, folder_name: name || folder.getName(), file_count: count });
    return count;
  } catch(e) { return "?"; }
}

function updateAncestorCounts(folderId, delta) {
  if (!folderId || delta === 0) return;
  var rootId = ROOT_FOLDER_ID;
  var currentId = folderId;
  while (currentId) {
    try {
      var existing = fetchSupabase("folder_counts?folder_id=eq." + encodeURIComponent(currentId) + "&select=id,file_count");
      if (existing && existing.length > 0) {
        var newCount = Math.max(0, parseInt(existing[0].file_count) + delta);
        fetchSupabase("folder_counts?id=eq." + existing[0].id, "PATCH", { file_count: newCount });
      }
    } catch(e) {}
    if (currentId === rootId) break;
    try {
      var parents = DriveApp.getFolderById(currentId).getParents();
      currentId = parents.hasNext() ? parents.next().getId() : null;
    } catch(e) { break; }
  }
}

function countFilesRecursive(folder) {
  var total = 0, files = folder.getFiles();
  while (files.hasNext()) { files.next(); total++; }
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    if (s.getName() !== PENDING_FOLDER_NAME) total += countFilesRecursive(s);
  }
  return total;
}

function searchScoped(term, folderId, includeContent) {
  var isTagSearch = term.startsWith("#");
  var searchOperator = (includeContent === false && !isTagSearch) ? "name" : "fullText";
  try {
    return runScopedSearch(term, folderId, searchOperator);
  } catch (e) {
    try {
      // Only retry with a different operator if the chosen one genuinely failed (not just empty results), to avoid doubling search time.
      return runScopedSearch(term, folderId, searchOperator === "name" ? "fullText" : "name");
    } catch (e2) {
      return [];
    }
  }
}

function runScopedSearch(term, folderId, searchOperator) {
  var query = "trashed = false";
  var isTagSearch = false;
  var tagToMatch = "";
  
  if (term.startsWith("#")) {
    isTagSearch = true;
    tagToMatch = term.substring(1).trim();
    term = tagToMatch; 
  }
  
  var safeTerm = term.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  query += " and " + searchOperator + " contains '" + safeTerm + "'";
  
  // Absolute ceiling: results must always live inside the Home folder tree, no matter what scope is passed.
  var homeIds = getHomeDescendantIds();
  var scope = folderId || ROOT_FOLDER_ID;
  var narrowIds = (scope === ROOT_FOLDER_ID) ? homeIds : getDescendantFolderIds(scope);

  var files = DriveApp.searchFiles(query), results = [], checked = 0;
  while (files.hasNext() && results.length < 40 && checked < 500) {
    var f = files.next();
    checked++;
    var parents = f.getParents();
    var directParent = parents.hasNext() ? parents.next() : null;
    if (!directParent) continue;
    var pid = directParent.getId();
    // Must be inside Home AND inside the requested (possibly narrower) scope.
    if (homeIds[pid] && (pid === scope || narrowIds[pid])) {
      var parsedTags = parseTags(f.getDescription());
      
      if (isTagSearch) {
        var hasExactTag = false;
        for (var i = 0; i < parsedTags.length; i++) {
          if (parsedTags[i].toLowerCase() === tagToMatch.toLowerCase()) {
            hasExactTag = true;
            break;
          }
        }
        if (!hasExactTag) continue; 
      }
      
      results.push({ id: f.getId(), name: f.getName(), date: f.getDateCreated().toLocaleDateString(), timestamp: f.getDateCreated().getTime(), size: f.getSize(), mimeType: f.getMimeType(), path: directParent.getName(), tags: parsedTags });
    }
  }
  return results;
}

// Home's folder tree, cached briefly since it's reused by every search and rarely changes minute-to-minute.
function getHomeDescendantIds() {
  var cache = CacheService.getScriptCache();
  try {
    var cached = cache.get('home_descendant_ids');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  var ids = getDescendantFolderIds(ROOT_FOLDER_ID);
  try { cache.put('home_descendant_ids', JSON.stringify(ids), 300); } catch (e) {} // may exceed 100KB cache limit on huge trees - fine, just skips caching
  return ids;
}

// Batched, breadth-first collection of every folder ID nested under rootId.
// Far faster than checking ancestry one file at a time (the old isDescendant-per-result approach),
// since it does a handful of Drive.Files.list calls total instead of one+ per search result.
function getDescendantFolderIds(rootId) {
  var ids = {};
  ids[rootId] = true;
  var frontier = [rootId];
  var safetyRounds = 0;
  while (frontier.length > 0 && safetyRounds < 25) {
    safetyRounds++;
    var newFrontier = [];
    for (var i = 0; i < frontier.length; i += 30) {
      var chunk = frontier.slice(i, i + 30);
      var orClause = chunk.map(function(id) { return "'" + id + "' in parents"; }).join(" or ");
      var q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false and (" + orClause + ")";
      var pageToken = null;
      do {
        var res = Drive.Files.list({ q: q, pageSize: 1000, pageToken: pageToken, fields: "nextPageToken, files(id)" });
        (res.files || []).forEach(function(f) {
          if (!ids[f.id]) { ids[f.id] = true; newFrontier.push(f.id); }
        });
        pageToken = res.nextPageToken;
      } while (pageToken);
    }
    frontier = newFrontier;
  }
  return ids;
}

function isDescendant(itemId, rootId) {
  if (itemId === rootId) return true;
  try {
    var curr = DriveApp.getFileById(itemId);
    var parents = curr.getParents(), limit = 0;
    while (parents.hasNext() && limit < 15) {
      var p = parents.next();
      if (p.getId() === rootId) return true;
      parents = p.getParents();
      limit++;
    }
  } catch(e) {
    try {
      var currF = DriveApp.getFolderById(itemId);
      var parentsF = currF.getParents(), limitF = 0;
      while (parentsF.hasNext() && limitF < 15) {
        var pF = parentsF.next();
        if (pF.getId() === rootId) return true;
        parentsF = pF.getParents();
        limitF++;
      }
    } catch(err) {}
  }
  return false;
}

function renameItem(id, name, type, userEmail) {
  var item = (type === 'folder') ? DriveApp.getFolderById(id) : DriveApp.getFileById(id);
  var oldName = item.getName();
  item.setName(name);
  logAction(userEmail, "Rename", type + ": " + oldName + " to " + name, id);
}

function deleteItem(id, type, userEmail) {
  var name = "", parentId = null, subCount = 1;
  if (type === 'folder') {
    var f = DriveApp.getFolderById(id);
    name = f.getName();
    if (f.getParents().hasNext()) parentId = f.getParents().next().getId();
    subCount = countFilesRecursive(f);
    f.setTrashed(true);
  } else {
    var fi = DriveApp.getFileById(id);
    name = fi.getName();
    if (fi.getParents().hasNext()) parentId = fi.getParents().next().getId();
    fi.setTrashed(true);
  }
  logAction(userEmail, "Delete", type + ": " + name, id);
  if (parentId) updateAncestorCounts(parentId, -subCount);
}

function deleteItems(items, userEmail) {
  items.forEach(i => deleteItem(i.id, i.type, userEmail));
}

function createNewFolder(pId, name, userEmail) {
  var p = pId ? DriveApp.getFolderById(pId) : getRootFolder();
  p.createFolder(name);
  logAction(userEmail, "Create Folder", name + " in " + p.getName());
}

function initiateUploadSession(name, mime, fId, isP, email) { 
  var target = isP ? getPendingFolder().getId() : (fId || ROOT_FOLDER_ID); 
  var meta = { name: name, mimeType: mime, parents: [target] }; 
  if (isP) meta.description = email; 
  var res = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", { method: "post", contentType: "application/json", payload: JSON.stringify(meta), headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }); 
  var headers = res.getHeaders(); 
  return headers ? headers["Location"] : null; 
}

function getPendingFilesList() {
  var folder = getPendingFolder(), iter = folder.getFiles(), list = [];
  while(iter.hasNext()) {
    var f = iter.next();
    list.push({ id: f.getId(), name: f.getName(), uploader: f.getDescription() || 'Unknown', date: f.getDateCreated().toLocaleDateString(), size: f.getSize() });
  }
  return list;
}

function moveItem(id, destId, type, userEmail) {
  var dest = destId ? DriveApp.getFolderById(destId) : getRootFolder();
  var item = (type === 'folder') ? DriveApp.getFolderById(id) : DriveApp.getFileById(id);
  var itemName = item.getName();
  var oldParentId = item.getParents().hasNext() ? item.getParents().next().getId() : null;
  var parentName = oldParentId ? DriveApp.getFolderById(oldParentId).getName() : "";
  var actionType = (parentName === PENDING_FOLDER_NAME) ? "Approve & Move" : "Move";
  var subCount = (type === 'folder') ? countFilesRecursive(item) : 1;
  item.moveTo(dest);
  logAction(userEmail, actionType, type + ": " + itemName + " to " + dest.getName(), id);
  if (parentName === PENDING_FOLDER_NAME) updateAncestorCounts(dest.getId(), subCount);
  else { if (oldParentId) updateAncestorCounts(oldParentId, -subCount); updateAncestorCounts(dest.getId(), subCount); }
}

function moveItems(items, destId, userEmail) {
  items.forEach(i => moveItem(i.id, destId, i.type, userEmail));
}

function getFullFolderTreeFast() {
  var rootId = ROOT_FOLDER_ID;
  var allFolders = [];
  var pageToken = null;
  do {
    var res = Drive.Files.list({ q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false", pageSize: 1000, pageToken: pageToken, fields: "nextPageToken, files(id, name, parents)" });
    if (res.files) allFolders = allFolders.concat(res.files);
    pageToken = res.nextPageToken;
  } while (pageToken);
  var childrenMap = {};
  allFolders.forEach(function(f) {
    var pId = (f.parents && f.parents.length > 0) ? f.parents[0] : null;
    if (pId) { if (!childrenMap[pId]) childrenMap[pId] = []; childrenMap[pId].push(f); }
  });
  var list = [];
  function traverse(fId, fName, level) {
    list.push({ id: fId, name: fName, level: level });
    var children = childrenMap[fId] || [];
    children.sort((a, b) => a.name.localeCompare(b.name)).forEach(child => traverse(child.id, child.name, level + 1));
  }
  traverse(rootId, ROOT_FOLDER_NAME, 0);
  return list;
}

function getAllFoldersList() {
  return getFullFolderTreeFast().map(function(f) {
    var prefix = "";
    for(var i = 0; i < f.level; i++) prefix += "— ";
    return { id: f.id, name: prefix + f.name };
  });
}

function getAdminStats() {
  var logs = [];
  try {
    var logData = fetchSupabase("KSlogs?select=created_at,username,action,details&order=created_at.desc&limit=100");
    if (logData) {
      logs = logData.map(function(r) {
        return {
          time: Utilities.formatDate(new Date(r.created_at), "GMT+2", "dd/MM/yyyy HH:mm:ss"),
          user: r.username,
          action: r.action,
          details: r.details
        };
      });
    }
  } catch(e) {}
  var stats = { storageUsed: DriveApp.getStorageUsed(), storageLimit: DriveApp.getStorageLimit() };
  var pF = getPendingFolder(), it = pF.getFiles(), pc = 0;
  while(it.hasNext()) { it.next(); pc++; }
  stats.pendingCount = pc;
  stats.totalUsers = Object.keys(getUsersData()).length;
  stats.totalFiles = countFilesRecursive(getRootFolder());
  return { success: true, data: stats, logs: logs };
}

function searchWarranty(serialNumber){if(!serialNumber)return{success:false,message:"Please enter a Serial Number."};try{var searchSerial=String(serialNumber).trim();var res=fetchSupabase("data?serial_number=ilike."+encodeURIComponent(searchSerial)+"&select=*");if(!res||res.length===0){try{var assetRes=fetchSupabase("assets?serial_number=ilike."+encodeURIComponent(searchSerial)+"&select=*");if(assetRes&&assetRes.length>0){var a=assetRes[0];return{success:false,isCompanyAsset:true,message:"This serial number belongs to a company asset, but no warranty record was found for it.",assetInfo:{brand:a.brand||"Unknown",model:a.model||"Unknown",serialNumber:a.serial_number||searchSerial}};}}catch(assetErr){}return{success:false,isCompanyAsset:false,message:"Serial number not found in the warranty database, and it does not match any known company asset."};}var d=res[0],provName=d.provider||"Not Specified",provEmail="No email registered";try{var providers=fetchSupabase("providers?select=provider_name,provider_email");if(providers){var providersObj={};for(var p=0;p<providers.length;p++){if(providers[p].provider_name)providersObj[String(providers[p].provider_name).trim().toLowerCase()]=providers[p].provider_email;}provEmail=providersObj[String(provName).trim().toLowerCase()]||"No email registered";}}catch(err){}var commentsArr=[];if(d.comments)commentsArr.push(d.comments);if(d.column3)commentsArr.push(d.column3);var comments=commentsArr.length>0?commentsArr.join(" | "):"No comments",receiveDateStr=d.dis,warrantyYears=parseInt(d.warranty_years)||0,computedStatus="Unknown",computedRemainingDays=0,computedEndOfWarranty="-";if(receiveDateStr&&warrantyYears>0){var receiveDate=new Date(receiveDateStr),endDate=new Date(receiveDate);endDate.setFullYear(endDate.getFullYear()+warrantyYears);computedEndOfWarranty=Utilities.formatDate(endDate,"GMT+2","dd/MM/yyyy");var today=new Date();today.setHours(0,0,0,0);endDate.setHours(0,0,0,0);var timeDiff=endDate.getTime()-today.getTime(),daysDiff=Math.ceil(timeDiff/(1000*3600*24));if(daysDiff>0){computedStatus="In Warranty";computedRemainingDays=daysDiff;}else{computedStatus="Out of Warranty";computedRemainingDays=0;}}else{computedStatus=d.warranty_status||"Unknown";computedRemainingDays=d.remaining_days||0;computedEndOfWarranty=d.end_of_warranty||"-";}return{success:true,data:{item:d.item||"Unknown",model:d.asset_description||"Unknown",status:computedStatus,endOfWarranty:computedEndOfWarranty,remainingDays:computedRemainingDays,providerName:provName,providerEmail:provEmail,warrantyYears:warrantyYears,comments:comments}};}catch(e){return{success:false,message:"Database connection error: "+e.message};}}

var PRINTER_HEADERS = ["ID", "Printer Model", "Printer Name In AD", "Department", "Printer IP", "Site", "Current Location", "User", "Password", "Modified"];
var PRINTER_FIELD_MAP = {
  "ID": "printer_id",
  "Printer Model": "printer_model",
  "Printer Name In AD": "printer_name_ad",
  "Department": "department",
  "Printer IP": "printer_ip",
  "Site": "site",
  "Current Location": "current_location",
  "User": "status",
  "Password": "password",
  "Modified": "is_modified"
};

function getPrintersData() {
  try {
    var data = fetchSupabase("printers?select=*&order=id.asc");
    var printers = (data || []).map(function(p) {
      var rowObj = {
        "ID": p.printer_id,
        "Printer Model": p.printer_model,
        "Printer Name In AD": p.printer_name_ad,
        "Department": p.department,
        "Printer IP": p.printer_ip,
        "Site": p.site,
        "Current Location": p.current_location,
        "User": p.status,
        "Password": p.password,
        "Modified": p.is_modified ? "Yes" : ""
      };
      rowObj._rowIndex = p.id;
      return rowObj;
    });
    return { success: true, data: printers, headers: PRINTER_HEADERS };
  } catch (e) { return { success: false, message: e.message }; }
}

function updatePrinterData(rowIndex, updatedValues, userEmail) {
   try {
    var payload = {};
    for (var i = 0; i < PRINTER_HEADERS.length; i++) {
      var field = PRINTER_FIELD_MAP[PRINTER_HEADERS[i]];
      var val = updatedValues[i];
      payload[field] = (field === "is_modified") ? (String(val).trim().toLowerCase() === "yes") : val;
    }
    fetchSupabase("printers?id=eq." + rowIndex, "PATCH", payload);
    logAction(userEmail, "Update Printer", "Printer ID " + rowIndex + " updated.");
    return { success: true, message: "Updated successfully" };
   } catch (e) { return { success: false, message: e.message }; }
}

function deletePrinterData(rowIndex, userEmail) {
   try {
    fetchSupabase("printers?id=eq." + rowIndex, "DELETE");
    logAction(userEmail, "Delete Printer", "Printer ID " + rowIndex + " deleted.");
    return { success: true, message: "Deleted successfully" };
   } catch (e) { return { success: false, message: e.message }; }
}

function addPrinterData(newValues, userEmail) {
   try {
    var payload = {};
    for (var i = 0; i < PRINTER_HEADERS.length; i++) {
      var field = PRINTER_FIELD_MAP[PRINTER_HEADERS[i]];
      var val = newValues[i];
      payload[field] = (field === "is_modified") ? (String(val).trim().toLowerCase() === "yes") : val;
    }
    fetchSupabase("printers", "POST", payload);
    logAction(userEmail, "Add Printer", "New printer added: " + (newValues[1] || newValues[0] || ""));
    return { success: true, message: "Added successfully" };
   } catch (e) { return { success: false, message: e.message }; }
}

function logPrintersExport(userEmail) {
  logAction(userEmail, "Export Printers", "Exported printers list to Excel");
}

/* ---- Vendors / Providers (used by Warranty Clarification) ---- */

function getProvidersData() {
  try {
    var data = fetchSupabase("providers?select=*&order=provider_name.asc");
    return { success: true, data: data || [] };
  } catch (e) { return { success: false, message: e.message }; }
}

function saveProviderData(provider, userEmail) {
  try {
    var payload = { provider_name: provider.provider_name, provider_email: provider.provider_email };
    if (provider.id) {
      fetchSupabase("providers?id=eq." + provider.id, "PATCH", payload);
      logAction(userEmail, "Update Vendor", "Vendor: " + provider.provider_name);
    } else {
      fetchSupabase("providers", "POST", payload);
      logAction(userEmail, "Add Vendor", "Vendor: " + provider.provider_name);
    }
    return { success: true, message: "Saved successfully" };
  } catch (e) { return { success: false, message: e.message }; }
}

function deleteProviderData(id, providerName, userEmail) {
  try {
    fetchSupabase("providers?id=eq." + id, "DELETE");
    logAction(userEmail, "Delete Vendor", "Vendor: " + (providerName || id));
    return { success: true, message: "Deleted successfully" };
  } catch (e) { return { success: false, message: e.message }; }
}

function getTopViewedMedia() {
  var counts = {};
  try {
    var now = new Date();
    var monthStart = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), "GMT+2", "yyyy-MM-dd") + "T00:00:00+02:00";
    var data = fetchSupabase("KSlogs?action=eq." + encodeURIComponent("View Media") + "&created_at=gte." + encodeURIComponent(monthStart) + "&select=details,file_id");
    if (data) {
      for (var i = 0; i < data.length; i++) {
        var fId, fName, detailsVal = String(data[i].details), idVal = String(data[i].file_id || "");
        if (detailsVal.indexOf("::") !== -1) { var parts = detailsVal.split("::"); fId = parts[0]; fName = parts[1]; } else { fName = detailsVal; fId = idVal; }
        if (fId && fName) { if (!counts[fId]) counts[fId] = { id: fId, name: fName, views: 0 }; counts[fId].views++; }
      }
    }
  } catch(e) {}
  var topFiles = Object.keys(counts).map(key => counts[key]);
  topFiles.sort((a, b) => b.views - a.views);
  return topFiles.slice(0, 20);
}
