// Supabase Edge Function: sync-vasto-students
// ------------------------------------------------------------
// TEMPORARY integration. Logs into Vasto Educator (server-rendered PHP) with
// stored credentials, fetches each day's trainer_day page, parses the AM/PM
// student counts, and upserts them into cbd_day_classes so they appear on the
// scheduler calendars automatically.
//
// SECURITY:
//  - Vasto credentials come ONLY from Supabase function secrets (never in code/git).
//  - Deploy with --no-verify-jwt and protect invocation with the x-sync-secret header.
//  - This whole function is meant to be deleted once Vasto exposes an API / the
//    integration is no longer needed.
//
// Invoke: POST with header  x-sync-secret: <VASTO_SYNC_SECRET>
// Scheduled by pg_cron (see setup notes) every few hours.
//
// Required secrets:
//   VASTO_USERNAME, VASTO_PASSWORD   - the first Vasto login (ideally read-only)
//   VASTO_SYNC_SECRET                - random string; also sent by the cron caller
//   CBD_SECRET_KEY                   - existing service-role key (already set)
// Extra Vasto logins (trainers each see only their own rostered days): add pairs
//   VASTO_USERNAME_2 / VASTO_PASSWORD_2, _3, ... — every account is scanned and the
//   results merged per day (a day's numbers come from whichever account can see it).
// Optional secrets:
//   VASTO_BASE_URL   (default https://vastosoft.com)
//   VASTO_DAYS_AHEAD (default 30)
//   VASTO_ACTOR_ID   (UUID for updated_by; default null)
//
// Notifications: when a day's numbers cross an assistant-staffing threshold
// (cbd_auto_roster_rules 8/16), the affected rostered staff are notified (and
// trainers via RLS). Pure enrolment wobble that doesn't change staffing is silent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; CBDScheduler-Sync/1.0)";
const BASE = (Deno.env.get("VASTO_BASE_URL") || "https://vastosoft.com").replace(/\/+$/, "");
const DAYS_AHEAD = parseInt(Deno.env.get("VASTO_DAYS_AHEAD") || "30", 10);
const ACTOR_ID = Deno.env.get("VASTO_ACTOR_ID") || null;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ---- minimal cookie jar (carries the PHP session across requests) ----
class Jar {
  private m = new Map<string, string>();
  absorb(resp: Response) {
    const anyHeaders = resp.headers as unknown as { getSetCookie?: () => string[] };
    const list = anyHeaders.getSetCookie
      ? anyHeaders.getSetCookie()
      : (resp.headers.get("set-cookie") ? [resp.headers.get("set-cookie")!] : []);
    for (const sc of list) {
      const first = sc.split(";")[0];
      const eq = first.indexOf("=");
      if (eq > 0) this.m.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }
  header() { return [...this.m.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
  get size() { return this.m.size; }
}

// Vasto URL wants a NON-padded date (e.g. 2026-9-16); the DB wants padded ISO (2026-09-16).
function isoDate(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function vastoDate(d: Date) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
// "Today" in Melbourne (the edge runtime is UTC, CBD College is AEST/AEDT), as a
// local-midnight Date we then read Y/M/D off. Keeps the window from sitting a day off.
function melbourneToday(): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const _WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const _MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${_WD[new Date(y, m - 1, d).getDay()]} ${d} ${_MON[m - 1]}`;
}

// Gather every configured Vasto login: VASTO_USERNAME/PASSWORD, then _2, _3, … until a pair is missing.
function collectAccounts(): { username: string; password: string; label: string }[] {
  const out: { username: string; password: string; label: string }[] = [];
  const u1 = Deno.env.get("VASTO_USERNAME"), p1 = Deno.env.get("VASTO_PASSWORD");
  if (u1 && p1) out.push({ username: u1, password: p1, label: u1 });
  for (let i = 2; i <= 10; i++) {
    const u = Deno.env.get(`VASTO_USERNAME_${i}`), p = Deno.env.get(`VASTO_PASSWORD_${i}`);
    if (u && p) out.push({ username: u, password: p, label: u });
  }
  return out;
}

// ============================================================
// Login flow (confirmed from browser capture):
//   - Login page:  GET  {BASE}/elearning/login.php        (primes the PHP session cookie)
//   - Login POST:  POST {BASE}/next/elearning/login       (jQuery $.ajax, JSON body, no CSRF)
//       body: {"username":"<email>","password":"...","s":<siteId>,"d":0,"o":0,"as_admin":0,"redir":""}
//   - On success it authenticates the session; browser then redirects to /elearning/index.php.
// VASTO_USERNAME must be the FULL email (e.g. name@cbdcollege.edu.au). VASTO_SITE_ID defaults to 158.
// ============================================================
const LOGIN_PAGE = `${BASE}/elearning/login.php`;
const LOGIN_POST = `${BASE}/next/elearning/login`;
const SITE_ID = parseInt(Deno.env.get("VASTO_SITE_ID") || "158", 10);

async function login(jar: Jar, username: string, password: string): Promise<void> {
  // 1) Prime the PHP session cookie.
  const page = await fetch(LOGIN_PAGE, { headers: { "User-Agent": UA }, redirect: "manual" });
  jar.absorb(page);

  // 2) POST credentials as JSON (exactly like the browser's $.ajax call).
  const payload = { username, password, s: SITE_ID, d: 0, o: 0, as_admin: 0, redir: "" };
  const res = await fetch(LOGIN_POST, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": jar.header(),
      "Referer": LOGIN_PAGE,
      "Origin": BASE,
    },
    body: JSON.stringify(payload),
    redirect: "manual",
  });
  jar.absorb(res);
  const bodyText = await res.text().catch(() => "");
  if (res.status >= 400) throw new Error(`Vasto login HTTP ${res.status}: ${bodyText.slice(0, 160)}`);
  // Endpoint typically returns JSON; treat an explicit failure flag as a rejection.
  if (/("success"\s*:\s*(false|0))|("error"\s*:\s*"[^"]+")|invalid|incorrect/i.test(bodyText)) {
    throw new Error(`Vasto login rejected: ${bodyText.slice(0, 160)}`);
  }

  // 3) Verify by requesting an authenticated page — if it bounces to login, we failed.
  const check = await fetch(`${BASE}/elearning/index.php`, {
    headers: { "User-Agent": UA, "Cookie": jar.header() },
    redirect: "manual",
  });
  jar.absorb(check);
  const loc = check.headers.get("location") || "";
  if ((check.status === 301 || check.status === 302) && /login/i.test(loc)) {
    throw new Error("Vasto login rejected (redirected back to login)");
  }
}

// ============================================================
// Day page parsing (confirmed from the trainer_day.php layout).
// Each class session renders as a card with a time range and an
// "Attendees: N Student(s)" / "Attendees: No students" line, e.g.:
//     08:00 - 11:00  ABS 3hrs ...            Attendees: 1 Student
//     08:00 - 11:00  BB 3 hrs ...            Attendees: 7 Students
//     12:00 - 14:00  ABS (Coffee Art) 2hrs   Attendees: No students
//     12:00 - 14:00  BB (Coffee Art) 2 hrs   Attendees: 6 Students
// We split sessions into morning (start < 12:00) and afternoon (>= 12:00) and
// SUM attendees within each half (concurrent classes -> total students needing
// coverage that session). Returns null/null only when the day has NO sessions
// at all, so a fetch glitch never overwrites good data with a blank.
// ============================================================
function parseDayCounts(html: string): { am: number | null; pm: number | null } {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
  // Pair each session's start time with the FIRST "Attendees:" line that follows it.
  const re = /(\d{1,2}):(\d{2})\s*[-–]\s*\d{1,2}:\d{2}[\s\S]{0,400}?Attendees:\s*(No\s+students?|\d{1,3})/gi;
  let m: RegExpExecArray | null;
  let am = 0, pm = 0, matched = 0;
  while ((m = re.exec(text)) !== null) {
    matched++;
    const startHour = parseInt(m[1], 10);
    const count = /no/i.test(m[3]) ? 0 : parseInt(m[3], 10);
    if (startHour < 12) am += count; else pm += count;
  }
  if (matched === 0) return { am: null, pm: null };
  return { am, pm };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Authorize the invocation (the cron job passes this header).
  const secret = Deno.env.get("VASTO_SYNC_SECRET");
  if (!secret || req.headers.get("x-sync-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  const accounts = collectAccounts();
  if (accounts.length === 0) return json({ error: "No Vasto accounts configured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("CBD_SECRET_KEY")!);

  try {
    // Build the date window [today, today+DAYS_AHEAD) anchored to Melbourne's date.
    const today = melbourneToday();
    const days: { iso: string; vasto: string }[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      days.push({ iso: isoDate(d), vasto: vastoDate(d) });
    }

    // Scan every configured Vasto account (the trainers each only see their own rostered
    // days) and merge per day: a day's numbers come from whichever account can see it. The
    // accounts are assumed not to overlap; if a day shows in more than one, the larger wins
    // (so identical full-day views are never double-counted).
    const merged = new Map<string, { am: number; pm: number }>();
    const accountStats: { account: string; scanned: number; failed: number; error?: string }[] = [];
    for (const acct of accounts) {
      const st: { account: string; scanned: number; failed: number; error?: string } =
        { account: acct.label, scanned: 0, failed: 0 };
      try {
        const jar = new Jar();
        await login(jar, acct.username, acct.password);
        if (jar.size === 0) throw new Error("no session cookie after login");
        for (const day of days) {
          let html = "";
          try {
            const r = await fetch(`${BASE}/elearning/trainer_day.php?date=${day.vasto}`, {
              headers: { "User-Agent": UA, "Cookie": jar.header() },
            });
            if (r.status !== 200) { st.failed++; continue; }
            html = await r.text();
          } catch (_) { st.failed++; continue; }
          st.scanned++;
          const { am, pm } = parseDayCounts(html);
          if (am === null && pm === null) continue; // this account has no class data for that day
          const cur = merged.get(day.iso);
          merged.set(day.iso, {
            am: Math.max(cur?.am ?? 0, am ?? 0),
            pm: Math.max(cur?.pm ?? 0, pm ?? 0),
          });
        }
      } catch (e) {
        st.error = String((e as Error).message || e); // one account failing must not sink the others
      }
      accountStats.push(st);
    }

    // Existing rows, for change detection (only write when a number actually changed).
    const { data: existing, error: exErr } = await supabase
      .from("cbd_day_classes")
      .select("date, students_am, students_pm")
      .gte("date", days[0].iso)
      .lte("date", days[days.length - 1].iso);
    if (exErr) throw exErr;
    const prev = new Map((existing || []).map((r: { date: string; students_am: number; students_pm: number }) => [r.date, r]));

    const changes: unknown[] = [];
    const upserts: Record<string, unknown>[] = [];
    for (const [iso, v] of merged) {
      const p = prev.get(iso) as { students_am: number; students_pm: number } | undefined;
      if (!p || (p.students_am ?? 0) !== v.am || (p.students_pm ?? 0) !== v.pm) {
        changes.push({ date: iso, from: p ? [p.students_am, p.students_pm] : null, to: [v.am, v.pm] });
        upserts.push({ date: iso, students_am: v.am, students_pm: v.pm, updated_by: ACTOR_ID });
      }
    }
    const scanned = accountStats.reduce((a, s) => a + s.scanned, 0);
    const failed = accountStats.reduce((a, s) => a + s.failed, 0);
    const parsedNone = days.length - merged.size;

    if (upserts.length) {
      const { error } = await supabase.from("cbd_day_classes").upsert(upserts, { onConflict: "date" });
      if (error) throw error;
    }

    // ---- Notify ONLY on staffing-relevant changes (assistant-count threshold crossed) ----
    // Pure enrolment wobble that doesn't change how many assistants a day needs stays silent.
    let notified = 0;
    let notifyError: string | undefined;
    try {
      const { data: rulesRow } = await supabase
        .from("cbd_auto_roster_rules")
        .select("min_students_for_one_assistant, min_students_for_two_assistants")
        .eq("id", 1).maybeSingle();
      const oneT = Number(rulesRow?.min_students_for_one_assistant ?? 8);
      const twoT = Number(rulesRow?.min_students_for_two_assistants ?? 16);
      const assistantsNeeded = (am: number, pm: number) => {
        const b = Math.max(am || 0, pm || 0);
        return b >= twoT ? 2 : (b >= oneT ? 1 : 0);
      };
      // Only changes to an EXISTING day (from != null) whose required assistant count moved.
      const staffing = (changes as { date: string; from: number[] | null; to: number[] }[])
        .filter((c) => c.from && assistantsNeeded(c.from[0], c.from[1]) !== assistantsNeeded(c.to[0], c.to[1]));

      if (staffing.length) {
        const dates = staffing.map((c) => c.date);
        const [staffRes, trainerRes, availRes] = await Promise.all([
          supabase.from("cbd_staff_members").select("id, user_id"),
          supabase.from("cbd_profiles").select("id").eq("role", "trainer"),
          supabase.from("cbd_availability").select("date, staff_id, status").in("date", dates).in("status", ["available", "partial"]),
        ]);
        const staffMap = new Map((staffRes.data || []).map((s: { id: string; user_id: string | null }) => [s.id, s.user_id]));
        const trainerIds = (trainerRes.data || []).map((t: { id: string }) => t.id);
        const byDate = new Map<string, Set<string>>();
        for (const a of (availRes.data || []) as { date: string; staff_id: string }[]) {
          const uid = staffMap.get(a.staff_id);
          if (!uid) continue;
          (byDate.get(a.date) ?? byDate.set(a.date, new Set<string>()).get(a.date)!).add(uid);
        }

        const rows: Record<string, unknown>[] = [];
        for (const c of staffing) {
          const nFrom = assistantsNeeded(c.from![0], c.from![1]);
          const nTo = assistantsNeeded(c.to[0], c.to[1]);
          const title = `Staffing changed — ${prettyDate(c.date)}`;
          const message = `Now AM ${c.to[0]} · PM ${c.to[1]} students — needs ${nTo} assistant${nTo === 1 ? "" : "s"} (was ${nFrom}).`;
          const data = { date: c.date, students_am: c.to[0], students_pm: c.to[1], needed_from: nFrom, needed_to: nTo, source: "vasto" };
          // Rostered staff on that day get it (trainers see it too via RLS); if nobody is
          // rostered yet, target one trainer so the change still reaches the trainers.
          const rostered = [...(byDate.get(c.date) || [])];
          const recipients = rostered.length ? rostered : trainerIds.slice(0, 1);
          for (const uid of recipients) rows.push({ type: "vasto_staffing_changed", title, message, data, target_user_id: uid });
        }

        if (rows.length) {
          const { error: nErr } = await supabase.from("cbd_notifications").insert(rows);
          if (nErr) throw nErr;
          notified = rows.length;
          // Best-effort Web Push — never let a push failure affect the sync.
          const pushUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`;
          const svc = Deno.env.get("CBD_SECRET_KEY")!;
          await Promise.all(rows.map((r) =>
            fetch(pushUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${svc}` },
              body: JSON.stringify({ title: r.title, body: r.message, data: r.data, tag: "cbd-vasto", target_user_id: r.target_user_id }),
            }).then(() => {}).catch(() => {})
          ));
        }
      }
    } catch (e) {
      notifyError = String((e as Error).message || e); // non-critical: numbers are already written
    }

    return json({ ok: true, scanned, failed, parsedNone, updated: upserts.length, notified, notifyError, accounts: accountStats, changes });
  } catch (err) {
    return json({ ok: false, error: String((err as Error).message || err) }, 500);
  }
});
