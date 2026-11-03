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

## One-time setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (the free plan is enough for testing).
2. Open **SQL Editor → New query**. Paste the whole of `supabase/migrations/0001_core.sql` and press **Run**.
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

Free-plan notes:
- The project **pauses after 7 days with no activity**. Open the Supabase dashboard and press "Restore" if that happens. No data is lost.
- Supabase's built-in email sender only allows a few emails per hour. That's fine for two testers.
  For more users, connect your own email provider under **Authentication → Emails → SMTP**.

### 2. Vercel

1. At [vercel.com](https://vercel.com), choose **Add New → Project** and import this GitHub repo.
2. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy. Every push to `main` deploys again automatically.

Note: Vercel's free Hobby plan is for non-commercial use only. Upgrade or move hosts before charging money.

### 3. Put it on your phone

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
| `supabase/test/` | Runs the migration in an in-memory Postgres and plays two partners |
| `src/lib/` | Game logic: answer checking, spaced repetition, quiz builder, streaks, prompts |
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
