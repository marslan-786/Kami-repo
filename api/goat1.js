// api/goat.js
const express = require("express");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const querystring = require("querystring");

const router = express.Router();

const CONFIG = {
  baseUrl: "http://167.114.117.67/ints",
  username: "teamlegend097",  
  password: "teamlegend097",
  userAgent: "Mozilla/5.0 (Linux; Android 13; V2040) AppleWebKit/537.36 Chrome/144 Mobile Safari/537.36"
};

let cookies = [];

// Safe JSON parse
function safeJSON(text) {
  try { return JSON.parse(text); }
  catch { return { error: "Invalid JSON from server" }; }
}

// HTTP/HTTPS Request
function request(method, url, data = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;

    const headers = {
      "User-Agent": CONFIG.userAgent,
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate",
      Cookie: cookies.join("; "),
      ...extraHeaders
    };

    if (method === "POST" && data) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = lib.request(url, { method, headers }, res => {
      if (res.headers["set-cookie"]) {
        res.headers["set-cookie"].forEach(c => cookies.push(c.split(";")[0]));
      }

      let chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        let buffer = Buffer.concat(chunks);
        try { if(res.headers["content-encoding"]==="gzip") buffer = zlib.gunzipSync(buffer); } catch {}
        resolve(buffer.toString());
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// LOGIN
async function login() {
  cookies = [];
  const page = await request("GET", `${CONFIG.baseUrl}/login`);
  const match = page.match(/What is (\d+) \+ (\d+)/i);
  const ans = match ? Number(match[1])+Number(match[2]) : 10;

  const form = querystring.stringify({
    username: CONFIG.username,
    password: CONFIG.password,
    capt: ans
  });

  await request("POST", `${CONFIG.baseUrl}/signin`, form, { Referer: `${CONFIG.baseUrl}/login` });
}

// CLEAN NUMBERS
async function getNumbers() {
  const url = `${CONFIG.baseUrl}/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1`;
  const data = await request("GET", url, null, {
    Referer: `${CONFIG.baseUrl}/agent/MySMSNumbers`,
    "X-Requested-With": "XMLHttpRequest"
  });

  const parsed = safeJSON(data);
  if (!parsed.aaData) return parsed;

  // Map only relevant fields like example
  parsed.aaData = parsed.aaData.map(row => [
    row[0] || "",   // Date/time
    row[1] || "",   // Name
    row[2] || "",   // Number
    row[3] || "",   // Some code/ID
    (row[4] || "").replace(/<[^>]+>/g, "").trim(), // SMS text cleaned
    row[5] || "",   // Currency or symbol
    row[6] || 0,    // Amount
    row[7] || 0     // Extra field
  ]);

  return parsed;
}

// CLEAN SMS
function fixSMS(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map(row => {
    // If main message missing, use next column
    if (row[4] === null && row[5]) {
      row[4] = row[5];
      row.splice(5, 1);
    }
    // Remove unwanted text like "legendhacker"
    row[4] = (row[4] || "").replace(/legendhacker/gi, "").trim();
    return row;
  });

  return data;
}

// FETCH SMS
async function getSMS() {
  const today = new Date();
  const fdate1 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} 00:00:00`;
  const fdate2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} 23:59:59`;

  const url = `${CONFIG.baseUrl}/agent/res/data_smscdr.php?fdate1=${encodeURIComponent(fdate1)}&fdate2=${encodeURIComponent(fdate2)}&frange=&fclient=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgclient=&fgnumber=&fgcli=&fg=0&sEcho=1&iColumns=9&iDisplayStart=0&iDisplayLength=5000&iSortCol_0=0&sSortDir_0=desc&_=${Date.now()}`;
  
  const data = await request("GET", url, null, {
    Referer: `${CONFIG.baseUrl}/agent/SMSCDRReports`,
    "X-Requested-With": "XMLHttpRequest"
  });

  return fixSMS(safeJSON(data));
}

// API ROUTE
router.get("/", async (req,res)=>{
  const type = req.query.type;
  if (!type) return res.json({ error: "Use ?type=numbers or ?type=sms" });

  try {
    await login();

    let result;
    if(type==="numbers") result = await getNumbers();
    else if(type==="sms") result = await getSMS();
    else return res.json({ error:"Invalid type" });

    res.json(result);

  } catch(err) {
    res.json({ error: err.message });
  }
});

module.exports = router;
