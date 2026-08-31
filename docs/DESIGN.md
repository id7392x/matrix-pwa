# DESIGN.md — Design Review & Guidelines

> Last updated: 2026-08-25
> Scope: LoginScreen, RoomList, RoomListItem, Timeline, TimelineItem, App.svelte

---

## Executive Summary

**Status:** Needs Work

Функциональный прототип с базовым glassmorphism, но критические проблемы с accessibility, inconsistent styling, и отсутствием platform conventions. Требует significant work перед запуском.

---

## Critical Issues

### A1. No ARIA labels или screen reader support

**Components:** Все интерактивные элементы (кнопки, инпуты, листы)

**What:** Отсутствуют `aria-label`, `aria-describedby`, `role` атрибуты.

**Why (HIG Accessibility > Vision):**
> Describe your app's interface and content for screen readers.

**Fix:**
- Кнопки: `aria-label="Send message"`, `aria-label="Retry message"`
- Инпуты: `aria-label="Homeserver"`, `aria-describedby` для error states
- Контейнеры: `role="list"` на RoomList, `aria-live="polite"` на Timeline

---

### A2. Insufficient touch target sizes

**Components:** Retry (TimelineItem), Send (Timeline)

**What:** Кнопки значительно меньше минимальных 44x44pt.

**Why (HIG Accessibility > Mobility):**
> Controls that are too small are hard for many people to interact with.

**Fix:**
```
min-h-[44px] min-w-[44px]   /* mobile */
min-h-[28px] min-w-[28px]   /* desktop */
```

---

### A3. Inconsistent styling: Timeline uses raw Tailwind

**Components:** Timeline.svelte (message input, send button)

**What:** Используются сырые классы (`p-2 border rounded`, `bg-blue-500`) вместо CSS-переменных.

**Why (HIG Visual Design > Consistency):**
> Use color consistently throughout your interface.

**Fix:**
```
/* Вместо: */
<input class="w-full p-2 border rounded" />
<button class="mt-2 p-2 bg-blue-500 text-white rounded">

/* Использовать: */
<input class="bg-[var(--glass-bg)] border-[var(--glass-border)] ..." />
<button class="bg-[var(--accent-color)] ..." />
```

---

### A4. No focus states visible

**Components:** Все интерактивные элементы

**What:** Нет visible focus indicator при навигации с клавиатуры.

**Why (HIG Accessibility > Speech):**
> Let people use the keyboard alone to navigate and interact with your app.

**Fix:**
```
focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]
```

---

## Improvements

### I5. No loading states

**Components:** LoginScreen, RoomList, Timeline

**What:** Нет индикатора загрузки.

**Why (HIG Interaction Design > Loading states):**
> People want to know what's happening.

**Fix:** Skeleton screens или spinner при загрузке данных.

---

### I6. No hover/focus feedback на карточках

**Components:** RoomListItem, TimelineItem

**What:** Нет визуального feedback при hover/focus.

**Why (HIG Interaction Design > Feedback):**
> Provide appropriate feedback for user actions.

**Fix:**
```
hover:bg-white/10 transition-colors
```

---

### I7. No dark/light mode support

**What:** Цвета захардкожены (`--text-primary: #e7e5e4`), нет адаптации к system appearance.

**Why (HIG Color > Best practices):**
> Make sure all your app's colors work well in light, dark, and increased contrast contexts.

**Fix:**
```css
:root {
  --text-primary: #1c1917;
  --glass-bg: rgba(0, 0, 0, 0.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #e7e5e4;
    --glass-bg: rgba(255, 255, 255, 0.08);
  }
}
```

---

### I8. No safe area handling

**Components:** App.svelte, LoginScreen

**What:** Layout не учитывает safe areas (notch, home indicator).

**Why (HIG Layout > Guides and safe areas):**
> Safe areas are essential for avoiding a device's interactive and display features.

**Fix:**
```
padding: env(safe-area-inset-top) env(safe-area-inset-right) ...
```

---

### I9. Typography scale absent

**What:** Нет единой типографической шкалы.

**Why (HIG Typography > Best practices):**
> Establish a clear type scale.

**Fix:**
```css
:root {
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
}
```

---

### I10. No empty state design

**Components:** RoomList, Timeline

**What:** Простой текст "No rooms yet" / "No messages yet" без визуального оформления.

**Why (HIG Content & Writing):**
> Empty states should be informative and welcoming.

**Fix:** Иконка + detailed empty state с call-to-action.

---

## Positive Notes

1. **Consistent use of CSS variables** — хорошая основа для design system (5/7 компонентов).
2. **Responsive layout** — two-column на desktop, single на mobile.
3. **Glassmorphism direction** — blur/translucency, современные тренды.
4. **Error handling** — LoginScreen показывает ошибки пользователю.
5. **Status indicators** — TimelineItem: sending/failed/retry UX проработан.

---

## Design Track Д2 — Implementation Plan

### Phase 1: Design Token System

```css
:root {
  /* Typography */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;

  --line-height-tight: 1.25;
  --line-height-normal: 1.5;

  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Border radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Glass */
  --glass-bg: rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.18);
  --glass-blur: 20px;

  /* Colors (semantic) */
  --color-primary: var(--accent-color);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-primary, 0.7);
  --color-text-tertiary: var(--text-primary, 0.5);
  --color-error: #ef4444;
  --color-warning: #f59e0b;
  --color-success: #22c55e;
}
```

### Phase 2: Dark/Light Mode

1. Определить semantic colors для light и dark режимов.
2. Использовать `prefers-color-scheme` media query.
3. Добавить toggle в UI (опционально).

### Phase 3: Accessibility Fixes

1. Добавить `aria-label` на все интерактивные элементы.
2. Увеличить touch targets до 44x44pt (mobile).
3. Добавить visible focus indicators.
4. Добавить `role="list"` на контейнеры списков.
5. Добавить `aria-live="polite"` на dynamic content areas.

### Phase 4: Component Updates

1. Timeline.svelte — заменить raw Tailwind на CSS variables.
2. RoomListItem — добавить hover/focus feedback.
3. TimelineItem — добавить hover/focus feedback.
4. LoginScreen — добавить loading state.

### Phase 5: Empty & Loading States

1. Добавить skeleton screens для RoomList и Timeline.
2. Добавить empty state design с иконками и call-to-action.
3. Добавить offline indicator.

---

## 8. Новый UI-таргет (2026-08-30) — Stitch-макеты → код

**Визуальный таргет:** Telegram × «Ether UI» (см. `docs/06-TOOLS.md` §2/§6): фон #111, акцент #007aff, Inter, round-full, glass blur 16-30px + 0.5px border, хвостики баблей, a11y-лейблы на интерактиве. **НЕ** Material-3 и НЕ Element.

**Макеты — source of truth:** stitch-проект `projects/7820572232356862504`, 6 валидных экранов (полные id — `docs/06-TOOLS.md` §2/§6.2).

| Экран (Stitch) | Компонент(ы) проекта | Что переносить |
|---|---|---|
| Главный (Обновлённый) `41230df5` | `App.svelte`, `RoomList`, `RoomListItem` | список чатов, шапка, аватары-инициалы, счётчики, FAB |
| Переписка `aab4de2b` | `Timeline.svelte`, `TimelineItem`, композер | шапка DM (замок + CTA «Проверить»), бабли с хвостиками, дивайдер дат, баннер «Шифрование включено», glass-панели, attach/send 44pt (A2) |
| Верификация SAS `3e5d9ffd` | `VerificationDialog.svelte` | эмодзи-плитки 3×2 с индексами, шаги, «Совпадают»/«Не совпадают» |
| Вход `e2bd5dc3` | `LoginScreen.svelte` | glass-карточка, состояние ошибки сервера, toggle пароля, CTA 56px |
| Поиск `aeaced2f` | задел (функционал — слайс поиска) | плавающая капсула, подсветка совпадений `text-primary`, секции ЧАТЫ/ГЛОБАЛЬНЫЙ |
| Контакты `8ed5e3f4` | задел (directory) | A-Z секции, инициалы, онлайн-точка, плавающий BottomNavBar |

**Порядок натягивания (выполняется по явному запросу юзера):**

1. **Phase 1 — токены** по Ether UI: фон #111, акцент #007aff, glass-токены (blur 16-30px, 0.5px border), типографика Inter, радиусы; закрыть I7 (dark/light), I9 (scale).
2. **Phase 2 — экраны по одному** в порядке: вход → главный → переписка → verify-модалка → заделы (поиск/контакты). Каждый — TDD + `svelte-autofixer`, сверка A1–A4 (aria, 44pt, raw-Tailwind под токены, focus) и I-фиксы.
3. **Phase 3 — сверка с `docs/05-UI-E2EE.md`** для verify/переписки (баннер «Шифрование включено», CTA «Проверить» — уже реализовано в `fd68626`/`acf5106`, выровнять визуал).
4. **Phase 4 — рефакторинг старого UI** под токены (замена raw Tailwind `bg-blue-500` и т.п. — закрытие A3 по всему коду).

**Ограничения:** UI-код не трогать без запроса (AGENTS.md); сгенерированный stitch-HTML/CSS не копипастить — переносить только семантику и токены (правило `06-TOOLS` §4); маппинг на компоненты сверить с актуальными сторами/роутами на момент натягивания.

---

## References

- [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
