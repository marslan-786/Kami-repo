const express = require("express");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const querystring = require("querystring");

const app = express();

const CONFIG = {
  baseUrl: "http://145.239.130.45/ints",
  username: "Kami526",
  password: "Kamran52",
  userAgent:
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
};

let sessionCookies = [];

const makeRequest = (method, url, data = null, extraHeaders = {}) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;

    const headers = {
      "User-Agent": CONFIG.userAgent,
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate",
      Cookie: sessionCookies.join("; "),
      Connection: "keep-alive",
      ...extraHeaders,
    };

    if (method === "POST" && data) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = lib.request(url, { method, headers }, (res) => {
      if (res.headers["set-cookie"]) {
        res.headers["set-cookie"].forEach((c) => {
          const part = c.split(";")[0];
          sessionCookies = sessionCookies.filter(
            (e) => !e.startsWith(part.split("=")[0])
          );
          sessionCookies.push(part);
        });
      }

      let chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));

      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers["content-encoding"];

        try {
          let body =
            encoding === "gzip"
              ? zlib.gunzipSync(buffer).toString()
              : encoding === "deflate"
              ? zlib.inflateSync(buffer).toString()
              : buffer.toString();

          resolve({ body, statusCode: res.statusCode });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
};

async function login() {
  sessionCookies = [];

  const loginPage = await makeRequest("GET", `${CONFIG.baseUrl}/login`);

  const match = loginPage.body.match(/What is (\d+) \+ (\d+)/);
  let capt = 10;

  if (match) capt = parseInt(match[1]) + parseInt(match[2]);

  const data = querystring.stringify({
    username: CONFIG.username,
    password: CONFIG.password,
    capt: capt,
  });

  await makeRequest("POST", `${CONFIG.baseUrl}/signin`, data, {
    Referer: `${CONFIG.baseUrl}/login`,
  });
}

app.get("/", async (req, res) => {
  const type = req.query.type;

  if (!type) return res.json({ error: "Missing type parameter" });

  try {
    await login();

    // ================= NUMBERS =================
    if (type === "numbers") {
      const response = await makeRequest(
        "GET",
        `${CONFIG.baseUrl}/ints/agent/res/data_smsnumbers.php?iDisplayLength=-1`,
        null,
        {
          Referer: `${CONFIG.baseUrl}/agent/MySMSNumbers`,
          "X-Requested-With": "XMLHttpRequest",
        }
      );

      return res.send(response.body);
    }

    // ================= SMS =================
    if (type === "sms") {
      const smsResp = await makeRequest(
        "GET",
        `${CONFIG.baseUrl}/ints/agent/res/data_smscdr.php?iDisplayLength=100`,
        null,
        {
          Referer: `${CONFIG.baseUrl}/agent/SMSCDRReports`,
          "X-Requested-With": "XMLHttpRequest",
        }
      );

      return res.send(smsResp.body);
    }

    res.json({ error: "Invalid type" });
  } catch (err) {
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
