# LingoSwap (working name)

A light, async game for two people who teach each other a language.
One partner sends a small lesson or challenge. The other learns it and earns points.
Learned words become flashcards, in the teacher's own voice.

Built with Next.js (web app, works on phones), Supabase (database, login, audio storage) and Vercel (hosting).

## What works in v1

- **Sign in** with an email link or a 6-digit code. No passwords.
- **Pairing** with an invite link or code.
- **Teach:** word sets (up to 10 words) and "phrase of the day", with text, notes and voice recordings.
- **Idea prompts** (🎲) and **partner requests** ("Teach me how to order coffee").
- **Challenges:** auto-built quiz, fill the gap, translate (typed), and "say it back" (recorded and rated by the teacher).
- **Flashcards** with spaced repetition (Leitner boxes). Box 4 = mastered.
- **Points** for teaching and learning, plus a weekly pair streak.
- **Arabic and English** text shown in the right direction. Answer checks ignore harakat, tatweel,
  alef variants, accents, case and punctuation.
- **Email notifications** when your partner sends a lesson, a challenge, an answer, a rating or a request.
  Several things at once arrive as one email. Each person can turn emails off on the "You" page.

## One-time setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (the free plan is enough for testing).
2. Open **SQL Editor → New query**. Paste the whole of `supabase/migrations/0001_core.sql` and press **Run**.
   Then do the same with `supabase/migrations/0002_notifications.sql`. Always run the files in number order.
3. Open **Authentication → URL Configuration**:
   - **Site URL:** your Vercel address, for example `https://lingoswap.vercel.app`
   - **Redirect URLs:** add `https://lingoswap.vercel.app/**` and `http://localhost:3000/**`
4. Open **Authentication → Emails → Magic Link** and add the code to the template, for example:
   ```html
   <h2>Sign in</h2>
   <p><a href="{{ .ConfirmationURL }}">Tap here to sign in</a></p>
   <p>Or type this code in the app: <b>{{ .Token }}</b></p>
   ```
   Do the same for the **Confirm signup** template. The code matters on iPhone: an app added to the
   home screen doesn't share its login with Safari, so the link alone won't sign you in there.
5. Copy **Project URL** and the **anon public key** from **Project Settings → API**.
   Also copy the **secret key** (on older projects: the **service_role** key). Only the server uses it, to send emails.
   It can read and change everything in the database. Never put it in a `NEXT_PUBLIC_` variable, in the code, or in a chat.

Free-plan notes:
- The project **pauses after 7 days with no activity**. Open the Supabase dashboard and press "Restore" if that happens. No data is lost.
- Supabase's built-in email sender only allows a few emails per hour. That's fine for two testers.
  For more users, connect your own email provider under **Authentication → Emails → SMTP**.

### 2. Vercel

1. At [vercel.com](https://vercel.com), choose **Add New → Project** and import this GitHub repo.
2. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   For emails, also add the variables in step 4 of "Email notifications" below. The app works without them.
3. Deploy. Every push to `main` deploys again automatically.

Note: Vercel's free Hobby plan is for non-commercial use only. Upgrade or move hosts before charging money.

### 3. Email notifications

The app sends emails through SMTP (the standard way to send email). A free Gmail account is enough for testing.
Gmail allows about 500 emails per day.

1. Use a Gmail account that has **2-Step Verification** turned on. A new account just for the app is best.
2. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and create an app password.
   Google shows 16 letters. Copy them. This is not your normal Gmail password.
3. Make a long random text for `CRON_SECRET`, for example with `openssl rand -hex 32`.
4. In Vercel, add these environment variables, then deploy again:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_SERVICE_ROLE_KEY` | The Supabase secret key from setup step 5 |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | The Gmail address |
   | `SMTP_PASS` | The 16-letter app password |
   | `EMAIL_FROM` | Optional, for example `LingoSwap <you@gmail.com>` |
   | `APP_URL` | Optional. Your site address, for example `https://lingoswap.vercel.app`. Used in email links |
   | `CRON_SECRET` | The random text from step 3 |

How it works:
- When someone sends something, a database trigger adds a row to the `notifications` table (an "outbox").
- The app then calls `/api/notify`. The server reads the outbox, sends one email per person, and marks the rows as sent.
- The call carries no data. So nobody can use it to send their own emails.
- If a call fails, a Vercel Cron job (see `vercel.json`) empties the outbox once a day at 07:00 UTC.
- No email goes out for something that is already done. Example: Dad opened and finished the lesson before the email was sent.
- Without these variables, emails stay in the outbox. They go out after you add the variables.

To check: in Supabase, open **Table Editor → notifications**. The `result` column shows `sent`, `opted_out` or `stale`
(already done or deleted). An empty `result` means "still waiting". In Vercel, **Logs** shows lines that start with `[notify]`.

### 4. Put it on your phone

Open the site on your phone. On iPhone: Share → **Add to Home Screen**. On Android: menu → **Install app**.

## Local development

```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev                  # http://localhost:3000
npm test                     # logic tests + database rule tests (runs Postgres in memory)
```

## How the code is organised

| Path | What it does |
| --- | --- |
| `supabase/migrations/0001_core.sql` | Tables, security rules (RLS), points and flashcard logic |
| `supabase/migrations/0002_notifications.sql` | Email outbox, its triggers, and the functions the server uses |
| `src/app/api/notify/route.ts` | Sends the waiting emails (SMTP) |
| `supabase/test/` | Runs the migration in an in-memory Postgres and plays two partners |
| `src/lib/` | Game logic: answer checking, spaced repetition, quiz builder, streaks, prompts, email text |
| `src/app/` | Screens: home, create, teach, lesson, challenge, cards, onboarding, login |
| `src/components/` | Shared pieces: audio recorder and player, buttons, cards, app state |

The app name lives in `src/lib/config.ts` (`APP_NAME`).

## Points (first guesses, tune after testing)

| Action | Who | Points |
| --- | --- | --- |
| Send a lesson or challenge | Teacher | 5 (max 3 per day) |
| Each item with your own voice | Teacher | +2 |
| Partner finishes your lesson | Teacher | 10 |
| Partner masters one of your cards | Teacher | 5 |
| Rate a partner's answer | Teacher | 3 |
| Finish a lesson | Learner | 10 |
| Pass a quiz or typed challenge (60% or more) | Learner | 10 + up to 10 by score |
| Recording rated Perfect / Close / Try again | Learner | 20 / 15 / 5 |
| First flashcard review of the day | Learner | 5 |
