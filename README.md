<div align="center">

# 🎓 OpenEdu

**An unofficial, free & open-source mobile client for the eduVULCAN school diary.**

_Nieoficjalny, darmowy i otwartoźródłowy klient mobilny dziennika eduVULCAN._

![Status](https://img.shields.io/badge/status-early%20development-orange)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-green)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Capacitor-61dafb)

</div>

---

## 📖 About the project

**OpenEdu** is a community-driven, privacy-friendly mobile app for students and parents who use the
**eduVULCAN** (eduvulcan.pl) electronic school diary.

The official mobile app locks some features (such as **reading messages** and **push notifications
about new messages and grades**) behind a paid subscription — even though the very same data is
**freely available in the web version** of eduVULCAN. OpenEdu simply gives you a comfortable,
native-feeling mobile interface for the data you already have free access to.

### ✨ Key features

| Feature | Description |
| --- | --- |
| 📬 **Free messages** | Read your inbox & sent messages without any paywall. |
| 🔔 **Local notifications** | On-device alerts about new messages and new grades (no external push servers). |
| 📴 **Offline mode** | Messages, grades and timetable are cached locally (IndexedDB) and available without internet. |
| 📅 **Timetable** | Clean daily view with bell times, rooms, substitutions & cancelled lessons. |
| 📊 **Grades & average calculator** | Weighted averages per subject + a _"what if I get…"_ grade simulator. |
| 🧪 **Demo mode** | Fully working mock mode with realistic data — try the app without an account. |
| 🌙 **Dark mode** | Mobile-first UI that follows your system theme. |

> 🇵🇱 **Po polsku:** OpenEdu to darmowa aplikacja mobilna dla uczniów i rodziców korzystających z
> dziennika eduVULCAN. Odblokowuje wygodny odczyt wiadomości oraz **lokalne powiadomienia o nowych
> wiadomościach i ocenach** — funkcje płatne w oficjalnej aplikacji, a darmowe w wersji webowej.
> Dodatkowo plan lekcji i oceny są dostępne **offline**.

---

## 🏗️ Architecture

OpenEdu is a **hybrid app**: a React single-page application running inside a native Android
WebView provided by **Capacitor**.

```
┌──────────────────────────────────────────────────────────────┐
│                     UI (React + Tailwind)                    │
│      Messages · Timetable · Grades · Settings / Login        │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
        ┌───────▼────────┐            ┌────────▼────────┐
        │   AppContext   │◄──────────►│  Dexie (IndexedDB)│  ← offline cache
        └───────┬────────┘            └────────▲────────┘
                │                              │
        ┌───────▼──────────────────────────────┴───────┐
        │     SyncService (diff & notify, polling)     │──► NotificationService
        └───────┬──────────────────────────────────────┘    (@capacitor/local-notifications)
                │
        ┌───────▼─────────── IVulcanDataProvider ─────────────┐
        │                                                     │
┌───────▼─────────┐                               ┌───────────▼──────────┐
│ MockVulcanProvider│  realistic demo data        │ LiveVulcanProvider   │
│  (Demo mode)     │                              │ CapacitorHttp → eduvulcan.pl │
└─────────────────┘                               └──────────────────────┘
```

### Tech stack

- **Vite + React 18 + TypeScript**
- **Tailwind CSS** + **lucide-react** icons — mobile-first, native-like UI with dark mode
- **react-router-dom** (`HashRouter` for WebView compatibility)
- **Dexie.js** (IndexedDB) — persistent offline storage
- **Capacitor** — `@capacitor/core`, `@capacitor/android`, `@capacitor/local-notifications`, `@capacitor/preferences`
- **CapacitorHttp** — native HTTP requests (bypasses browser CORS restrictions inside the app)

### Provider pattern

All network access goes through a single interface, `IVulcanDataProvider`, with two implementations:

1. **`MockVulcanProvider`** – realistic Polish school data (subjects, teachers, messages) and a
   _"simulate incoming message"_ button to test notifications and the offline database.
2. **`LiveVulcanProvider`** – talks to the **web endpoints** of `eduvulcan.pl` using your own session
   cookie, a browser-like `User-Agent`, and handles `401/403` (session expiry) gracefully.

### 🔐 Privacy & security

- **No backend, no telemetry.** OpenEdu never sends your data to any third-party server.
- Your session is stored **only on your device** (Capacitor Preferences).
- All communication happens directly between your phone and `eduvulcan.pl`.
- Session/cookie files are excluded from git by `.gitignore` — never commit them.

---

## 📁 Project structure

```
src/
├── api/          # IVulcanDataProvider + Mock & Live implementations, endpoint config
├── db/           # Dexie (IndexedDB) offline database
├── models/       # TypeScript domain types (Message, Grade, Lesson, AuthSession)
├── services/     # Sync (diff & notify) and notification services
├── context/      # Global React state (session, mode, sync status)
├── pages/        # Screens: Messages, Timetable, Grades, Settings/Auth
└── components/   # Reusable UI components & mobile layout
```

---

## 🚀 Getting started

> Detailed build instructions (including generating the Android APK) will be added as the project
> progresses.

```bash
git clone https://github.com/<your-username>/OpenEdu.git
cd OpenEdu
npm install
npm run dev
```

---

## 🤝 Contributing

Contributions are very welcome! Please open an issue to discuss bigger changes first.
Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

> 🇵🇱 Chętnie przyjmujemy pomoc! Zgłoś issue lub otwórz Pull Request.

---

## ⚖️ Legal disclaimer

**OpenEdu is NOT affiliated with, endorsed by, sponsored by, or in any way officially connected
with VULCAN sp. z o.o.**, eduVULCAN, or any of their subsidiaries or affiliates. The names
"VULCAN", "eduVULCAN" and related marks are trademarks of their respective owners and are used
here solely for identification purposes.

This software only accesses data that the user is already authorized to view through the
publicly available web version of eduVULCAN, using the user's **own credentials/session**. It does
not bypass any security mechanisms. Use it at your own risk and in accordance with the eduVULCAN
terms of service. The software is provided **"as is"**, without warranty of any kind.

> 🇵🇱 **Zastrzeżenie prawne:** OpenEdu **nie jest** w żaden sposób powiązany z firmą VULCAN sp. z o.o.
> ani przez nią wspierany. Aplikacja korzysta wyłącznie z danych, do których użytkownik ma już
> dostęp w webowej wersji eduVULCAN, przy użyciu własnej sesji. Korzystasz na własną
> odpowiedzialność.

---

## 📄 License

Released under the [MIT License](./LICENSE).
