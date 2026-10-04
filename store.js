/* Storage adapter. Phase 1 keeps everything in this browser's localStorage; a later live-sync
   backend replaces this module behind the same function names. Every access is wrapped because
   storage can be blocked (private mode, sandboxed previews). */
(function (root) {
  "use strict";
  var KEYS = { mine: "bwn.myProfile.v1", family: "bwn.family.v1", hide: "bwn.hideFamily.v1" };
  var FORMAT = "bharatwealth-nexus/profile";

  function read(key, fallback) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function newProfile() {
    var now = new Date().toISOString();
    return { id: uid(), version: 1, createdAt: now, updatedAt: now, consentAt: null, completedAt: null, step: 0,
      about: {}, income: {}, spending: {}, assets: {}, loans: [], insurance: {}, goals: [], risk: {}, skipped: {} };
  }

  // ---- This device's own profile ----
  function loadMine() { return read(KEYS.mine, null); }
  function saveMine(p) { p.updatedAt = new Date().toISOString(); return write(KEYS.mine, p); }
  function clearMine() { remove(KEYS.mine); }

  // ---- Profiles the advisor imported (keyed by profile id; a newer import replaces the older one) ----
  function listFamily() { return read(KEYS.family, []); }
  function upsertFamily(p) {
    var list = listFamily(), i = list.findIndex(function (x) { return x.id === p.id; });
    var entry = Object.assign({}, p, { importedAt: new Date().toISOString() });
    var replaced = i >= 0;
    if (replaced) {
      if (list[i].updatedAt && p.updatedAt && list[i].updatedAt > p.updatedAt) return { ok: false, reason: "older" };
      list[i] = entry;
    } else list.push(entry);
    return { ok: write(KEYS.family, list), replaced: replaced };
  }
  function deleteFamily(id) { write(KEYS.family, listFamily().filter(function (x) { return x.id !== id; })); }
  function getFamily(id) { return listFamily().find(function (x) { return x.id === id; }) || null; }

  function isFamilyHidden() { return read(KEYS.hide, false) === true; }
  function setFamilyHidden(v) { write(KEYS.hide, !!v); }

  // ---- Transfer format: JSON file, or a text code that survives WhatsApp ----
  function envelope(p) { return { format: FORMAT, exportedAt: new Date().toISOString(), profile: p }; }
  function toJson(p) { return JSON.stringify(envelope(p), null, 2); }
  function toCode(p) {
    var bytes = new TextEncoder().encode(JSON.stringify(envelope(p)));
    var bin = ""; bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return "BWN1:" + btoa(bin);
  }
  // Accepts JSON text or a BWN1 code. Returns {profile} or {error}.
  function parseTransfer(text) {
    text = String(text || "").trim();
    var obj;
    try {
      if (text.indexOf("BWN1:") === 0) {
        var bin = atob(text.slice(5).replace(/\s/g, ""));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        obj = JSON.parse(new TextDecoder().decode(bytes));
      } else obj = JSON.parse(text);
    } catch (e) { return { error: "This doesn't look like a BharatWealth profile. Ask for the file again." }; }
    if (!obj || obj.format !== FORMAT || !obj.profile || !obj.profile.id) return { error: "This file is not a BharatWealth profile." };
    return { profile: obj.profile };
  }

  var api = { newProfile: newProfile, loadMine: loadMine, saveMine: saveMine, clearMine: clearMine,
    listFamily: listFamily, upsertFamily: upsertFamily, deleteFamily: deleteFamily, getFamily: getFamily,
    isFamilyHidden: isFamilyHidden, setFamilyHidden: setFamilyHidden, toJson: toJson, toCode: toCode, parseTransfer: parseTransfer, FORMAT: FORMAT };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Store = api;
})(typeof window !== "undefined" ? window : this);
