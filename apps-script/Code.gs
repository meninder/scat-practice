// SCAT practice webhook. Script Properties required:
//   SCAT_TOKEN  — sha256 of pinSalt + PIN + ":webhook" (derived client-side at unlock; not stored in the repo)
//   SHEET_ID    — Google Sheet for the attempt log
//   GH_PAT      — fine-grained PAT, Contents R/W on the scat-practice repo (for regeneration)
//   GH_REPO     — e.g. "meninder/scat-practice"
const PARENT_EMAIL = "meninder.purewal@gmail.com";
const CC_EMAIL = "psjaiswal@gmail.com";
const TOPUP_TO = 26;   // regeneration tops each low strand-tier up to this many items

function prop(k){ return PropertiesService.getScriptProperties().getProperty(k); }

function doPost(e){
  let data;
  try{ data = JSON.parse(e.postData.contents); }
  catch(err){ return out({ok: false, error: "bad json"}); }
  if(!data || data.token !== prop("SCAT_TOKEN")) return out({ok: false, error: "bad token"});

  // Idempotency. The client retries anything it couldn't confirm — including posts we
  // already handled — so without this one sitting can email the parent and append a
  // Sheet row several times over. Must run before the rate counter: a replay is not
  // new work and shouldn't spend the budget. ok:true so the client stops retrying.
  if(alreadyHandled(data.postId)) return out({ok: true, duplicate: true});

  var cache = CacheService.getScriptCache();
  var posts = Number(cache.get("posts") || 0) + 1;
  cache.put("posts", String(posts), 21600);
  if(posts > 30) return out({ok: false, error: "rate limited"});

  logToSheet(data);
  sendEmail(data);
  let dispatched = false;
  if((data.lowTiers || []).length && prop("GH_PAT")) dispatched = triggerGeneration(data);
  return out({ok: true, dispatched: dispatched});
}

// True if this postId was handled before. First sighting records it and returns false.
// Cache is the fast path; Script Properties is the durable one (cache entries expire and
// a kid can re-open the app days later with a stuck queue item). Undated posts from an
// older client can't be deduped — let them through rather than swallow a real sitting.
const SEEN_KEEP = 300;
function alreadyHandled(postId){
  if(!postId) return false;
  const cache = CacheService.getScriptCache();
  if(cache.get("post:" + postId)) return true;

  const lock = LockService.getScriptLock();
  try{ lock.waitLock(10000); }
  catch(err){ return false; }   // couldn't lock — prefer a possible duplicate over a lost sitting
  try{
    const props = PropertiesService.getScriptProperties();
    let seen = (props.getProperty("seenPostIds") || "").split(",").filter(String);
    if(seen.indexOf(postId) !== -1){
      cache.put("post:" + postId, "1", 21600);
      return true;
    }
    seen.push(postId);
    if(seen.length > SEEN_KEEP) seen = seen.slice(-SEEN_KEEP);
    props.setProperty("seenPostIds", seen.join(","));
    cache.put("post:" + postId, "1", 21600);
    return false;
  } finally { lock.releaseLock(); }
}

function out(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logToSheet(d){
  const sh = SpreadsheetApp.openById(prop("SHEET_ID")).getSheets()[0];
  if(sh.getLastRow() === 0)
    sh.appendRow(["When","Kid","Level","Verbal","Quant","Total","Seconds","V tier","Q tier","Comebacks","Low tiers"]);
  sh.appendRow([new Date(d.ts), d.kid, d.level, d.v, d.q, d.v + d.q, d.sec,
    d.levels.v, d.levels.q, d.beaten || 0, JSON.stringify(d.lowTiers || [])]);
}

// --- one-off cleanup, run by hand from the Apps Script editor ---
// The duplicate-post bug left repeated rows in the log. A replay reproduces the original
// sitting exactly, so identical (When, Kid, Total, Seconds) means the same sitting logged
// twice — two real sittings can't share a millisecond timestamp. Keeps the first of each.
// Run previewSheetDuplicates() first; it only reports.
function previewSheetDuplicates(){ return dedupeSheetLog_(true); }
function dedupeSheetLog(){ return dedupeSheetLog_(false); }

function dedupeSheetLog_(dryRun){
  const sh = SpreadsheetApp.openById(prop("SHEET_ID")).getSheets()[0];
  const last = sh.getLastRow();
  const first = String(sh.getRange(1, 1).getValue()) === "When" ? 2 : 1;
  if(last < first) return "empty log";

  const rows = sh.getRange(first, 1, last - first + 1, 7).getValues();
  const seen = {}, dupRows = [];
  rows.forEach(function(r, i){
    const when = r[0] instanceof Date ? r[0].getTime() : String(r[0]);
    const key = [when, r[1], r[5], r[6]].join("|");   // When, Kid, Total, Seconds
    if(seen[key]) dupRows.push(first + i);
    else seen[key] = true;
  });

  if(!dryRun) dupRows.slice().reverse().forEach(function(r){ sh.deleteRow(r); });
  const msg = (dryRun ? "Would delete " : "Deleted ") + dupRows.length +
              " duplicate row(s) of " + rows.length + "; " +
              Object.keys(seen).length + " distinct sittings remain.";
  Logger.log(msg);
  return msg;
}

function sendEmail(d){
  const mins = Math.floor(d.sec / 60), secs = ("0" + (d.sec % 60)).slice(-2);
  const frame = d.v + d.q >= 12 ? "a strong sitting" : d.v + d.q >= 9 ? "solid — above the bar for this stretch test" : "a tough one; the test is pitched above grade level on purpose";
  let body = d.kid + " finished sitting on " + new Date(d.ts).toLocaleString() + " — " + frame + ".\n\n" +
    "Verbal " + d.v + "/8 · Quant " + d.q + "/8 · Total " + (d.v + d.q) + "/16 · " + mins + ":" + secs + "\n" +
    "Challenge tiers now: Verbal " + d.levels.v + "/3, Quant " + d.levels.q + "/3" +
    (d.leveledUp && d.leveledUp.length ? "  (moved up: " + d.leveledUp.join(", ") + " 🔥)" : "") + "\n" +
    (d.beaten ? d.kid + " beat " + d.beaten + " question(s) that beat them before.\n" : "") +
    (d.personalBest ? "New personal best.\n" : "");
  const strip = function(s){ return (s || "").replace(/<[^>]+>/g, ""); };
  if((d.studyItems || []).length){
    var review = [], rest = [];
    d.studyItems.forEach(function(it){
      if(it.wasCorrect === false || it.flagged) review.push(it);
      else rest.push(it);
    });
    body += "\nStudy guide — go through this with " + d.kid + ".\n";
    if(review.length){
      body += "\n=== Review together (missed or flagged) ===\n";
      review.forEach(function(it, i){
        body += "\n" + (i + 1) + ". [" + it.type + "] " + it.text + "\n";
        if(it.flagged) body += "   🤔 flagged — didn't understand" + (it.wasCorrect ? " (but answered correctly)" : "") + "\n";
        body += "   answered: " + (it.your || "(blank)") + " · correct: " + it.correct + "\n";
        body += "   " + strip(it.why) + "\n";
      });
    }
    if(rest.length){
      body += "\n=== Full run-through (got these right) ===\n";
      rest.forEach(function(it, i){
        body += "\n" + (i + 1) + ". [" + it.type + "] " + it.text + "\n";
        body += "   correct: " + it.correct + "\n";
        body += "   " + strip(it.why) + "\n";
      });
    }
  } else if((d.misses || []).length){
    body += "\nTo review together:\n";
    d.misses.forEach(function(m, i){
      body += "\n" + (i + 1) + ". [" + m.type + "] " + m.text + "\n   answered: " + m.your +
              " · correct: " + m.correct + "\n   " + strip(m.why) + "\n";
    });
  }
  if((d.lowTiers || []).length) body += "\n(Question bank running low for " + d.kid + " — new questions are being generated automatically.)\n";
  MailApp.sendEmail(PARENT_EMAIL, "SCAT: " + d.kid + " " + (d.v + d.q) + "/16" +
    (d.leveledUp && d.leveledUp.length ? " · leveled up 🔥" : ""), body, {cc: CC_EMAIL});
}

function triggerGeneration(d){
  const needs = (d.lowTiers || []).map(function(t){
    return {strand: t.strand, tier: t.tier, count: Math.max(8, TOPUP_TO - t.unseen)};
  });
  var cache2 = CacheService.getScriptCache();
  var disp = Number(cache2.get("dispatches") || 0) + 1;
  cache2.put("dispatches", String(disp), 21600);
  if(disp > 3) return false;
  const resp = UrlFetchApp.fetch("https://api.github.com/repos/" + prop("GH_REPO") + "/dispatches", {
    method: "post",
    contentType: "application/json",
    headers: {Authorization: "Bearer " + prop("GH_PAT"), Accept: "application/vnd.github+json"},
    payload: JSON.stringify({event_type: "bank_low", client_payload: {level: d.level, needs: needs}}),
    muteHttpExceptions: true
  });
  return resp.getResponseCode() === 204;
}
