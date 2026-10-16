This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup

### Environment

Create `.env.local` with the Firebase web config and the owner email:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_OWNER_EMAIL=you@example.com
```

### PIN (one-time, in the Firebase console)

The PIN is the password of a single Firebase Auth user. Firebase checks it server-side and throttles repeated wrong guesses. It is never stored by the app.

1. Authentication → Sign-in method: enable **Email/Password**.
2. Authentication → Users → Add user: use `NEXT_PUBLIC_OWNER_EMAIL` as the email and your PIN as the password. Firebase requires at least 6 characters; 8+ or letters and digits are much harder to guess.
3. Note the new user's **User UID**.
4. Deploy the rules with that uid (see [Firestore rules](#firestore-rules) below).
5. Optional: Authentication → Settings → User actions, turn off **Enable create (sign-up)**.
6. Firestore → Data: delete the old `pin` collection.

To change the PIN, change that user's password in the console.

The session is kept in memory only, so every refresh or new tab asks for the PIN again and nothing stays on a shared PC.

### Tests

- `npm test` runs the unit tests.
- `npm run test:rules` runs the Firestore security rules tests against the emulator. It needs JDK 21+.
- `npm run typecheck` runs `tsc --noEmit`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the rules tests on every PR and push to `main`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

### App (Vercel)

The Vercel GitHub integration builds every push. The Firebase env vars are set in the Vercel project, not in the repo.

- **PRs** get a preview deployment.
- **`main`** gets a production build. It is only promoted to the production domain once all five CI checks (`lint`, `typecheck`, `unit-tests`, `build`, `rules-tests`) pass on that commit, via Vercel [Deployment Checks](https://vercel.com/docs/deployment-checks). **Force Promote** on the deployment page bypasses this.

One-time setup in the Vercel dashboard:

1. Project → Settings → Environments → Production: make sure automatic aliasing for production is on.
2. Project → Settings → Build and Deployment → Deployment Checks → **Add Checks** → **GitHub** → select `lint`, `typecheck`, `unit-tests`, `build`, `rules-tests`.

Vercel matches checks by job name, so renaming a CI job means updating this list.

### Firestore rules

The rules are deployed by hand, because the real owner uid must never be committed:

1. Paste the owner's User UID into `ownerUid()` in `firestore.rules`, replacing `REPLACE_WITH_OWNER_UID`.
2. `npm run deploy:rules -- --project <project-id>`. It refuses while `REPLACE_WITH_OWNER_UID` is still there.
3. `git restore firestore.rules`.
