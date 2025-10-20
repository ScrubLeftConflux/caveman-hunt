# Caveman Hunt — React + Vite + Tailwind starter

This project is pre-configured so you can paste your existing Caveman Hunt code into `src/App.jsx` and run immediately.

## Quick start
```bash
# 1) unzip this folder
cd caveman-hunt-starter

# 2) install deps
npm install

# 3) run locally
npm run dev
# open the shown local URL (usually http://localhost:5173)

# 4) build for production
npm run build
npm run preview
```

## Using your existing code
1. Open `src/App.jsx` and replace its contents with the Caveman Hunt code from our other chat.
2. If your code imports components like `@/components/ui/button`, add shadcn/ui components with their CLI (optional but recommended).

### Add shadcn/ui components
This starter already has Tailwind. To generate UI components:

```bash
# inside the project folder
npx shadcn@latest init -d
# then add the ones you used (example set)
npx shadcn@latest add button card input label select badge scroll-area
```

The CLI will create files under `src/components/ui/*`, matching your old imports.
If your code uses other components, run `npx shadcn@latest add <name>` for each.

### Other libraries
Install any packages your app uses:
```bash
npm install framer-motion lucide-react
```

### Path alias "@"
The Vite config maps `@` to `src/`, so imports like `@/components/ui/button` work.

---

## Deploy (Vercel easiest)
1. Push this folder to a GitHub repo.
2. Go to https://vercel.com → **New Project** → Import your repo → Deploy.
3. You’ll get a live URL like `https://<project>.vercel.app`.

Or, for GitHub Pages (static export), use a plugin or Netlify instead.
```