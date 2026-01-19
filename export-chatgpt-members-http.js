(async function () {
  // ====== Config ======
  const ACCOUNT_ID = "3753c460-1902-4366-96e2-e5b65d0531c6";
  const BASE = `https://chatgpt.com/backend-api/accounts/${ACCOUNT_ID}/users`;

  const LIMIT = 25;
  const QUERY = ""; // keep empty for all users

  // IMPORTANT: paste your Bearer token locally, do not share it
  const AUTH_TOKEN = "PASTE_YOUR_BEARER_TOKEN_HERE";

  // Minimal headers (keep required ones)
  const COMMON_HEADERS = {
    "accept": "*/*",
    "authorization": `Bearer ${AUTH_TOKEN}`,
    "chatgpt-account-id": ACCOUNT_ID
  };

  // ====== Helpers ======
  function toISODate(v) {
    if (!v) return "";
    try {
      const d = new Date(v);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    } catch (e) {}
    return String(v).trim();
  }

  function extractUsers(json) {
    // Try common shapes
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.users)) return json.users;
    if (json && Array.isArray(json.items)) return json.items;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && json.data && Array.isArray(json.data.users)) return json.data.users;
    if (json && json.data && Array.isArray(json.data.items)) return json.data.items;
    return [];
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] != null) return obj[k];
    }
    return null;
  }

  function normalizeUser(u) {
    const email = pick(u, ["email", "user_email", "primary_email", "username"]);
    const addedRaw = pick(u, ["added_on", "added_at", "date_added", "created_at", "createdAt", "joined_at", "joinedAt"]);
    return {
      email: (email || "").toString().toLowerCase(),
      added_on: toISODate(addedRaw)
    };
  }

  async function fetchPage(offset) {
    const url = `${BASE}?offset=${offset}&limit=${LIMIT}&query=${encodeURIComponent(QUERY)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: COMMON_HEADERS,
      credentials: "include",
      mode: "cors"
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} offset=${offset} body=${text.slice(0, 200)}`);
    }
    return res.json();
  }

  function exportCSV(rows) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["email,added_on"];
    for (const r of rows) lines.push([esc(r.email), esc(r.added_on)].join(","));
    const csv = lines.join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chatgpt_business_members_all_pages.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ====== Main ======
  const seen = new Set();
  const all = [];

  let offset = 0;
  while (true) {
    console.log(`Fetching offset=${offset} limit=${LIMIT} ...`);
    const json = await fetchPage(offset);
    const users = extractUsers(json);

    if (!users.length) {
      console.log("No more users returned, stopping.");
      break;
    }

    for (const u of users) {
      const row = normalizeUser(u);
      if (row.email && !seen.has(row.email)) {
        seen.add(row.email);
        all.push(row);
      }
    }

    // Stop when last page
    if (users.length < LIMIT) {
      console.log(`Last page reached: got ${users.length} < ${LIMIT}`);
      break;
    }

    offset += LIMIT;

    // Gentle pacing to avoid rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`Total unique emails: ${all.length}`);
  exportCSV(all);
})();
