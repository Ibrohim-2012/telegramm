# Mening Telegramim

O'zingizning Telegram klientingiz: haqiqiy Telegram hisobingizga telefon raqam orqali kirasiz va odamlar bilan yozishasiz.
Rasmiy MTProto API (GramJS) ishlatiladi. Interfeys: o'zbekcha (lotin), ruscha va inglizcha.

- **web/** — Next.js (App Router) + TypeScript + Tailwind + Zustand
- **server/** — Node.js + Express + Socket.IO + GramJS

## 1. Tez boshlash (MOCK rejim — kalitlarsiz)

```bash
npm install
npm run dev
```

Brauzerda http://localhost:3001 ni oching. Server `http://localhost:4000` da ishlaydi.
`TG_API_ID` / `TG_API_HASH` bo'lmasa ilova **MOCK rejimda** ishlaydi: soxta chatlar, soxta xabarlar va "jonli" javoblar.

- Kirish kodi: `12345`
- Telefon raqami `0` bilan tugasa, 2FA paroli so'raladi: `mock2fa`

## 2. Haqiqiy Telegram bilan ishlatish

### api_id va api_hash olish

1. https://my.telegram.org ga kiring (telefon raqamingiz bilan).
2. **API development tools** bo'limini oching.
3. Ilova nomi (masalan `Mening Telegramim`) va qisqa nom kiriting, platformani `Web` qilib tanlang, **Create application**.
4. Chiqqan **App api_id** (raqam) va **App api_hash** (32 ta belgi) ni nusxalang. Ularni hech kimga bermang.

### .env sozlash

```bash
cp .env.example .env        # Windows: copy .env.example .env
```

`.env` ni to'ldiring:

| O'zgaruvchi | Ma'nosi |
|---|---|
| `TG_API_ID`, `TG_API_HASH` | my.telegram.org dan olingan kalitlar |
| `SESSION_SECRET` | sessiyani shifrlash uchun kamida 32 belgili tasodifiy matn. Yaratish: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | server porti (standart 4000) |
| `WEB_ORIGIN` | frontend manzili (CORS faqat shunga ochiladi), standart `http://localhost:3001` |
| `ACCESS_TOKEN` | **deploy qilsangiz majburiy** (kamida 8 belgi), pastga qarang |
| `MAX_UPLOAD_MB` | yuklash chegarasi, standart 50 |

Frontend boshqa manzildagi serverga ulansa, `web/.env.local` ga `NEXT_PUBLIC_API_URL=https://api.sizning-domen.uz` yozing.

### Tekshirish va ishga tushirish

```bash
npm run doctor     # hamma narsani tekshiradi, har bir ❌ uchun aniq yechim yozadi
npm run dev
```

Server logida `"mode":"real"` ko'rinishi kerak (yoki http://localhost:4000/health). Telefon raqam → Telegramdan kelgan kod → (bo'lsa) 2FA paroli.
Sessiya `server/data/session.enc` da **shifrlangan** holda saqlanadi, shuning uchun serverni qayta ishga tushirganda qayta kirish shart emas.
Menyu → **Sozlamalar** → **Chiqish** sessiyani Telegramda ham, faylda ham o'chiradi.

## 3. Haqiqiy akkauntda jonli sinov (faqat "Saqlangan xabarlar")

```bash
npm run live
```

Skript terminalda telefon raqami, kod va (kerak bo'lsa) 2FA parolini so'raydi, so'ng **faqat o'zingizning "Saqlangan xabarlar" chatingizda** tekshiradi:
matn yuborish va realtime qabul qilish, tahrirlash, javob, o'chirish, rasm va fayl yuborib qaytarib yuklab olish (fayl bayt-baytiga solishtiriladi),
tarix va sahifalash, qidiruv, o'qilmagan hisoblagichlar, serverni qayta ishga tushirib saqlangan sessiyani tiklash. Oxirida jadval chiqadi va yaratilgan barcha sinov xabarlari o'chiriladi.
Birinchi xatoda to'xtaydi va sababini yozadi. Skriptning o'zini kalitlarsiz sinash: `npm run live -- --mock`.

## Premium (shu ilovaning ichida)

Menyudagi **Premium** — Telegramning o‘z Premiumi emas, u faqat shu ilovada ishlaydi:

- **2 oy bepul** (bir marta; `PREMIUM_TRIAL_MONTHS`), keyin pullik oylar;
- imkoniyatlar: katta fayl yuklash (`PREMIUM_UPLOAD_MB`, oddiy: `MAX_UPLOAD_MB`), emoji-status, ilova rang mavzulari, maxsus chat fonlari (Aurora, Galaktika, Oltin), Premium belgisi;
- holat `server/data/premium.json` faylida imzolangan holda saqlanadi (qo‘lda o‘zgartirilsa e’tiborga olinmaydi).

**To‘lov haqida halol gap:** ilova kartadan avtomatik to‘lov olmaydi — buning uchun sizning Click/Payme/Stripe merchant kalitlaringiz kerak. Hozir pullik oylar bir martalik **kodlar** bilan yoqiladi. Kodni siz yaratasiz:

```bash
npm run premium:code -- --months 1 --count 5
```

Har bir kod bir marta ishlaydi va faqat shu o‘rnatishda (`SESSION_SECRET` bir xil bo‘lsa). Foydalanuvchi kodni Premium oynasidagi maydonga kiritadi; oylar qolgan muddatga qo‘shiladi. Narx va “kod olish” havolasi `.env` dagi `PREMIUM_PRICE` va `PREMIUM_BUY_URL` dan olinadi.

## 4. Testlar

```bash
npm run lint       # ESLint + qat'iy TypeScript (server, web, e2e)
npm test           # birlik va API testlari (Vitest + supertest)
npm run build      # ishlab chiqarish build
npm run e2e        # Playwright: haqiqiy brauzerda MOCK rejimdagi to'liq oqimlar
```

E2E 3100/4100 portlarda alohida server ko'taradi (sizning 3001/4000 ga tegmaydi) va Windows'dagi Microsoft Edge dan foydalanadi (brauzer yuklab olinmaydi).
Boshqa brauzer uchun: `PW_CHANNEL=chrome npm run e2e`.

## 5. Deploy

Backend **doimiy WebSocket** va diskda saqlanadigan sessiya talab qiladi, shuning uchun serverless (Vercel Functions) mos emas.

### Backend — VPS / Railway / Render

1. Repozitoriyni joylang, `npm install && npm run build -w server` bajaring, ishga tushirish: `npm run start -w server` (yoki `node server/dist/index.js`).
2. Muhit o'zgaruvchilari: `TG_API_ID`, `TG_API_HASH`, `SESSION_SECRET`, `PORT`, `WEB_ORIGIN=https://app.sizning-domen.uz`, **`ACCESS_TOKEN`**.
3. `server/data/` papkasi **doimiy disk (volume)** da bo'lishi kerak, aks holda har deployda qayta kirishga to'g'ri keladi (Railway/Render: Volume/Disk qo'shing va `server/data` ga ulang).
4. HTTPS orqasida ishlating (Caddy/Nginx/platforma proksisi). Nginx uchun WebSocket sarlavhalarini (`Upgrade`, `Connection`) o'tkazing.

### Frontend — Vercel

1. Loyihaning `web/` papkasini import qiling (Root Directory: `web`).
2. Muhit o'zgaruvchisi: `NEXT_PUBLIC_API_URL=https://api.sizning-domen.uz`.
3. Frontend va backend uchun **bir xil asosiy domen** ishlating (`app.domen.uz` va `api.domen.uz`), aks holda brauzer kirish cookie'sini uchinchi tomon cookie'si deb bloklashi mumkin.

### Xavfsizlik (muhim)

Server **bitta akkauntga** xizmat qiladi: u kirgan hisobingizning chatlarini API orqali beradi. Shuning uchun serverni internetga chiqarsangiz `ACCESS_TOKEN` o'rnating:
ilova kirishdan oldin shu kodni so'raydi, kod to'g'ri bo'lsa httpOnly cookie beriladi va API hamda realtime ulanish faqat shu cookie bilan ishlaydi.
`ACCESS_TOKEN`siz va lokal bo'lmagan `WEB_ORIGIN` bilan server ogohlantirish yozadi, `npm run doctor` esa ❌ beradi.

Boshqa himoyalar: kirish endpointlari tezlik bilan cheklangan, CORS faqat `WEB_ORIGIN` ga ochiq, `helmet` yoqilgan, barcha kirishlar `zod` bilan tekshiriladi,
sessiya AES-256-GCM bilan shifrlanadi va brauzerga hech qachon yuborilmaydi va loglanmaydi, havola ko'rinishi (preview) uchun serverdagi so'rovlar ichki tarmoq manzillariga (SSRF) yopiq.

## 6. Qanday ishlaydi (qisqacha)

- `TelegramService` — bitta interfeys, ikkita amalga oshirish: `MockTelegramService` va `RealTelegramService` (GramJS adapteri orqali).
- Xabarlar: REST (tarix, yuborish, tahrirlash, o'chirish, media) + Socket.IO (`message:new`, `message:edit`, `message:delete`, `typing`, `read`, `dialog:update`).
- Dublikatlar id bo'yicha olib tashlanadi, qayta ulanishda ochiq chat qayta yuklanadi; vaqt brauzerning mahalliy vaqt zonasida ko'rsatiladi.
- `FLOOD_WAIT`: qisqasi (≤15 s) avtomatik kutiladi, uzunrog'i interfeysda sanoqli taymer bilan ko'rsatiladi.
- Ma'lumotlar: boshqa odamlarning xabarlari faqat ko'rsatish uchun xotirada (cheklangan keshda) saqlanadi, diskka yozilmaydi.

## 7. Muammolarni hal qilish

| Belgi | Yechim |
|---|---|
| `npm run doctor` ❌ beryapti | Chiqqan "Yechim" qatoriga amal qiling |
| `API_ID_INVALID` | `TG_API_ID`/`TG_API_HASH` noto'g'ri; my.telegram.org dan qayta nusxa oling (bo'sh joysiz) |
| `PHONE_CODE_EXPIRED` | Kod eskirdi, "Orqaga" → raqamni qayta kiriting |
| `FLOOD_WAIT (N s)` | Telegram vaqtincha cheklagan: taymer tugaguncha kuting, qayta-qayta urinmang |
| "Ulanmoqda..." turibdi | Server ishlayaptimi (`/health`)? `WEB_ORIGIN` va `NEXT_PUBLIC_API_URL` to'g'rimi? |
| Doimiy qayta kirish | `SESSION_SECRET` o'zgargan yoki `server/data` doimiy diskda emas |
| `SESSION_REVOKED` / `AUTH_KEY_UNREGISTERED` | Sessiya Telegramda bekor qilingan; ilova o'zi chiqarib yuboradi, qayta kiring |
| Telegramga ulanib bo'lmayapti | Tarmoq/VPN/firewall (443-port); `npm run doctor` ulanishni tekshiradi |
| Port band | `.env` da `PORT` ni o'zgartiring yoki band qilgan dasturni to'xtating |
| Bildirishnomalar chiqmayapti | Sozlamalar → Bildirishnomalar; brauzer saytga ruxsat berganini tekshiring |
| 50 MB dan katta fayl | `MAX_UPLOAD_MB` va frontendda `NEXT_PUBLIC_MAX_UPLOAD_MB` ni oshiring (server xotirada saqlaydi) |

## Cheklovlar

- Yuklab olish: 25 MB gacha (server xotirada ushlab turadi); yuklash: `MAX_UPLOAD_MB` gacha.
- Ovozli xabar yozish (mikrofon) va animatsion `.tgs` stikerlar hozircha yo'q (stiker o'rniga emoji ko'rsatiladi).
- Yaxshi bilingki: faqat o'z akkauntingizdan foydalaning; ommaviy xabar yuborish, scraping va spam funksiyalari yo'q, Telegram API Terms of Service ga rioya qiling.
