# Sabaq — Supabase Auth, Dashboards & Credits — Deploy Package

Everything in this zip goes into the ROOT of your Mathaversity GitHub repo,
in the exact folder structure it's already in:

```
your-repo/
├── index.html              ← REPLACES your current index.html
├── login.html               (new)
├── signup.html               (new)
├── forgot-password.html      (new)
├── reset-password.html       (new)
├── teacher-dashboard.html    (new)
├── student-dashboard.html    (new)
├── lib/
│   ├── supabaseClient.js     (new)
│   ├── auth-guard.js         (new)
│   ├── auth-theme.css        (new)
│   └── sabaq-usage.js        (new)
├── api/
│   ├── claude.js            ← REPLACES your current api/claude.js
│   ├── package.json         ← REPLACES your current api/package.json
│   └── track-usage.js        (new)
└── sql/
    └── schema.sql            (run this in Supabase, not part of the deploy)
```

## Steps

1. **Run `sql/schema.sql` in Supabase** — SQL Editor → New Query → paste the
   whole file → Run. Creates all 13 tables + RLS + the auto-profile trigger.
   One-time only.

2. **Get your Supabase service-role key** — Project Settings → API →
   `service_role` (secret, not `anon`). Keep it out of GitHub and chat —
   it only ever goes into Vercel.

3. **Vercel → Settings → Environment Variables**, add:
   - `SUPABASE_URL` = `https://xonpimiptnkdzbipkxgs.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = *(the secret key from step 2)*

4. **Supabase → Authentication → URL Configuration:**
   - Site URL = your real deployed domain (e.g. `https://your-project.vercel.app`)
   - Redirect URLs = same domain + `/reset-password.html`

5. **Copy every file in this zip into your repo**, in the paths shown above.
   The three marked "REPLACES" overwrite existing files — everything else is new.

6. **Commit and push** — Vercel auto-deploys on push to your connected branch.
   Watch the Deployments tab for "Ready". If it fails, check the two env var
   names are spelled exactly right.

7. **Test:** go to `/signup.html`, create a Teacher account, confirm you land
   on `/teacher-dashboard.html` with 20 credits. Go to `/index.html` →
   Lesson Studio → generate a lesson → confirm credits drop from 20 to 15.
   Refresh the dashboard → confirm the lesson shows up in Recent Activity.

## Known gap (expected, not a bug)

The Student Dashboard's progress bars, streak, and weak/strong topics will
show empty until practice-question attempts get logged — nothing in the app
writes to `practice_attempts` yet. That's a follow-up step, not part of this
package.
