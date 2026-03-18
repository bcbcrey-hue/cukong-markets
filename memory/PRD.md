# PRD — Final Cleanup Naming + Env-Driven Consistency Pass

## Original Problem Statement
User meminta penutupan final untuk dua hal: (1) naming cleanup agar branding tidak drift antara repo/README/package/docs, khususnya `package.json` yang masih memakai `mafiamarkets`; dan (2) bukti lebih konkret bahwa `render:nginx` benar-benar ada di `package.json` final serta bahwa `README.md`, `.env.example`, `package.json`, `REFACTOR_LOG.md`, dan `SESSION_CONTEXT_NEXT.md` benar-benar sinkron dengan arsitektur env-driven yang sudah dibersihkan.

## Architecture Decisions
- Rapikan branding/package/app naming ke `cukong-markets` karena tidak ditemukan alasan compatibility kuat untuk mempertahankan `mafiamarkets` pada package/app identity.
- Pertahankan route internal inti tetap `/healthz` dan `/indodax/callback`.
- Pertahankan artefak file tertentu seperti `deploy/nginx/mafiamarkets.nginx.conf` demi compatibility operasional, sambil menegaskan bahwa source of truth config tetap env + template renderer.
- Pertahankan `render:nginx` sebagai jalur resmi render config dari env.

## What’s Implemented
- Mengubah `package.json` `name` menjadi `cukong-markets`.
- Mengubah description package agar selaras dengan branding baru.
- Mengubah default `APP_NAME` di `src/config/env.ts` menjadi `cukong-markets`.
- Mengubah string runtime/journal di `src/app.ts` dan pesan root server di `src/server/appServer.ts` agar konsisten memakai `cukong-markets`.
- Menambahkan penegasan naming/package final di `README.md`, `REFACTOR_LOG.md`, dan `SESSION_CONTEXT_NEXT.md`.
- Memastikan dan membuktikan `render:nginx` ada di `package.json` final dan dapat dieksekusi sukses.
- Menambahkan catatan di README bahwa nama file artefak nginx lama dipertahankan hanya demi compatibility operasional.

## Verification Executed
Lulus:
- `yarn lint`
- `yarn build`
- `PUBLIC_BASE_URL=... INDODAX_CALLBACK_PATH=/indodax/callback ... yarn render:nginx`

Bukti final package/script:
- `package.json.name = cukong-markets`
- `package.json.scripts["render:nginx"] = node scripts/render-nginx-conf.mjs`

Consistency grep yang dicek:
- `package.json`
- `README.md`
- `.env.example`
- `REFACTOR_LOG.md`
- `SESSION_CONTEXT_NEXT.md`
- `src/config/env.ts`
- `src/app.ts`
- `src/server/appServer.ts`

## Prioritized Backlog
### P0
- Buktikan runtime publik aktif benar-benar memakai hasil `yarn render:nginx` terbaru.
- Re-run smoke test `/healthz` dan `/indodax/callback` pada domain publik.

### P1
- Evaluasi apakah artefak filename legacy seperti `mafiamarkets.nginx.conf` masih perlu dipertahankan atau bisa diganti pada window compatibility yang aman.

### P2
- Tambah release checklist singkat berbasis env + render agar operasional pindah domain/VPS makin konsisten.

## Next Tasks
1. Pertahankan guard stable path dan probe backend sebagai gate wajib.
2. Pastikan runtime publik aktif memakai hasil render terbaru.
3. Ulang smoke test domain publik setelah sinkron.
4. Baru setelah itu simpulkan final readiness operasional publik.
