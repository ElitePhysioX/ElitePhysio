# ElitePhysio — Setup & Deploy Guide

## Your Project Files

```
elitephysio/
├── index.html    ← Page structure (HTML)
├── style.css     ← All visual styling
├── data.js       ← Translations, lists, demo patients
├── app.js        ← All app logic (AI, PDF, patients, etc.)
├── deploy.bat    ← Double-click to publish to Netlify
└── README.md     ← This file
```

---

## First-Time Setup (do this once)

### Step 1 — Create a GitHub account
Go to https://github.com and sign up.

### Step 2 — Create a new GitHub repository
1. Click the green **New** button on GitHub
2. Name it: `elitephysio`
3. Set it to **Public**
4. Click **Create repository**

### Step 3 — Set up this folder with Git

Open GitHub Desktop:
1. Click **File → Add local repository**
2. Browse to this folder (where this README is)
3. Click **Add repository**
4. Click **Publish repository** → choose your GitHub account → Publish

### Step 4 — Connect Netlify to GitHub
1. Go to https://netlify.com and log in
2. Click **Add new site → Import an existing project**
3. Choose **GitHub**
4. Select your `elitephysio` repository
5. Leave all settings as default → click **Deploy**

That's it! Netlify will give you a URL like `elitephysio.netlify.app`.

---

## Every Time You Make Changes

Just double-click **deploy.bat** — it does everything automatically:
1. Saves your changes to Git
2. Uploads to GitHub
3. Netlify auto-publishes in ~30 seconds

---

## To Add Your AI Key

Open `app.js` and find this line near the top:
```js
var AI_KEY = "";
```
Replace `""` with your Anthropic API key:
```js
var AI_KEY = "sk-ant-...your-key-here...";
```
Then deploy.

---

## Future Development Tips

- **Adding a new feature?** Work only in `app.js` — don't touch `index.html` or `style.css` unless needed
- **Changing colors/layout?** Edit `style.css` only
- **Adding a new sport or status?** Edit `data.js` — find `var SP` or `var ST`
- **In Claude:** Paste only the file you want to change, not the whole project
