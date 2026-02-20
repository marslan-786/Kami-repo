const http = require("http");
const https = require("https");
const zlib = require("zlib");
const querystring = require("querystring");

const CONFIG = {
  baseUrl: "http://145.239.130.45/ints",
  username: "Kami526",
  password: "Kamran52",
  userAgent: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36"
};

let sessionCookies = [];

const makeRequest = (method, url, data = null, extraHeaders = {}) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const headers = {
      "User-Agent": CONFIG.userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "en-US,en;q=0.9,ur-PK;q=0.8",
      "Connection": "keep-alive",
      "Cookie": sessionCookies.join("; "),
      ...extraHeaders
    };

    if (method === "POST" && data) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = lib.request(url, { method, headers }, (res) => {
      if (res.headers["set-cookie"]) {
        res.headers["set-cookie"].forEach((c) => {
          const part = c.split(";")[0];
          sessionCookies = sessionCookies.filter(e => !e.startsWith(part.split('=')[0]));
          sessionCookies.push(part);
        });
      }

      let chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers["content-encoding"];
        try {
          let body = encoding === "gzip" ? zlib.gunzipSync(buffer).toString() :
                     encoding === "deflate" ? zlib.inflateSync(buffer).toString() :
                     buffer.toString();
          resolve({ body, headers: res.headers, statusCode: res.statusCode });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", (e) => reject(e));
    if (method === "POST" && data) req.write(data);
    req.end();
  });
};

const formatDate = (date) => {
  const pad = (n) => (n < 10 ? "0" + n : n);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

module.exports = async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const type = urlObj.searchParams.get("type");

  if (!type) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Missing type parameter" }));
  }

  try {
    // --- LOGIN ---
    const loginPage = await makeRequest("GET", `${CONFIG.baseUrl}/login`);
    const captchaMatch = loginPage.body.match(/What is (\d+) \+ (\d+)/);
    let captchaAns = 10;
    if (captchaMatch) {
        captchaAns = parseInt(captchaMatch[1]) + parseInt(captchaMatch[2]);
    }

    const loginData = querystring.stringify({ username: CONFIG.username, password: CONFIG.password, capt: captchaAns });
    await makeRequest("POST", `${CONFIG.baseUrl}/signin`, loginData, {
      "Referer": `${CONFIG.baseUrl}/login`,
      "Upgrade-Insecure-Requests": "1"
    });

    let resultData;

    // --- NUMBERS ---
    if (type === "numbers") {
      const numResp = await makeRequest("GET", `${CONFIG.baseUrl}/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=8&sColumns=%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=false&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=false&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1`, null, { "Referer": `${CONFIG.baseUrl}/agent/MySMSNumbers`, "X-Requested-With": "XMLHttpRequest" });
      
      try {
        let jsonData = JSON.parse(numResp.body);
        if (jsonData.aaData && Array.isArray(jsonData.aaData)) {
          jsonData.aaData = jsonData.aaData.map(row => {
            let cleanRow = row.slice(1);
            if (cleanRow[3] && typeof cleanRow[3] === 'string' && cleanRow[3].includes('<br')) {
                let parts = cleanRow[3].split(/<br\s*\/?>/i);
                let duration = parts[0].trim();
                let price = parts[1] ? parts[1].replace(/<[^>]*>?/gm, '').trim() : "$ 0"; 
                cleanRow.splice(3, 1, duration, price);
            }
            return cleanRow;
          });
          resultData = JSON.stringify(jsonData);
        } else {
          resultData = numResp.body;
        }
      } catch (e) {
        resultData = numResp.body;
      }

    } 
    // --- SMS ---
    else if (type === "sms") {
      const reportPage = await makeRequest("GET", `${CONFIG.baseUrl}/agent/SMSCDRReports`, null, { "Referer": `${CONFIG.baseUrl}/agent/SMSDashboard` });
      const tokenMatch = reportPage.body.match(/csstr=([a-f0-9]+)/);
      const csstrToken = tokenMatch ? tokenMatch[1] : "2ce343229d8eab16a44e5af782ea9fc9";

      const now = new Date();
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      const fdate1 = formatDate(yesterday).split(' ')[0] + " 00:00:00";
      const fdate2 = formatDate(tomorrow).split(' ')[0] + " 23:59:59";

      const smsUrl = `${CONFIG.baseUrl}/agent/res/data_smscdr.php?` + querystring.stringify({
        fdate1, fdate2, frange: "", fclient: "", fnum: "", fcli: "", fg: "0", csstr: csstrToken, sEcho: 1, iDisplayLength: 100
      });

      const smsResp = await makeRequest("GET", smsUrl, null, {
        "Referer": `${CONFIG.baseUrl}/agent/SMSCDRReports`,
        "X-Requested-With": "XMLHttpRequest"
      });

      try {
        let jsonData = JSON.parse(smsResp.body);
        if (jsonData.aaData && Array.isArray(jsonData.aaData)) {
          const cleanedData = jsonData.aaData
            .filter(row => !row[0].includes(","))
            .map(row => [row[0], row[1], row[2], row[3], row[5], row[6], row[7]]);
          
          jsonData.aaData = cleanedData;
          jsonData.iTotalRecords = cleanedData.length;
          jsonData.iTotalDisplayRecords = cleanedData.length;
          resultData = JSON.stringify(jsonData);
        } else {
          resultData = smsResp.body;
        }
      } catch (e) {
        resultData = smsResp.body;
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(resultData);

  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
};
