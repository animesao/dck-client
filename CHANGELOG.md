# Changelog

## 1.13.0 (2026-06-13)

### Security
- **JWT secret**: больше не хардкод — читается из `JWT_SECRET` env var с авто-генерацией

### Features
- **WebSocket reconnection**: exponential backoff (1s–30s), cleanup при unmount
- **ConfirmDialog**: подтверждение для stop/delete/rm действий
- **Pagination**: 20 items/page на страницах контейнеров и образов
- **Skeleton loading**: `TableSkeleton`, `CardSkeleton` вместо спиннеров

### Code Quality
- **Typed errors**: 68 `catch (err: any)` → `catch (err: unknown)` с proper message extraction

### CI
- Добавлен GitHub Release workflow (amd64 + arm64)

## 1.12.0 (Previous)
- Disable images, config, blueprints, projects for non-admin users
- 0 = disabled, -1 = unlimited in dashboard
- Admin credentials prompt during install
- uninstall.sh with SQLite DB and .env cleanup
