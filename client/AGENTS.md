# AGENTS.md

## base tech stack

vite, typescript, react, react-router, react-hook-form, @hookform/resolvers, material-ui, @mui/icons-material, redux toolkit, redux toolkit query, zod, react-i18next, i18next-cli

## router

react-router in Data Mode for routing

## redux toolkit

always use useAppDispatch, useAppSelector and useAppStore located at src/hooks.ts
instead of their base redux toolkit versions

## material-ui

write color tokens in the string

```tsx
<Button
  sx={{
    color: "primary.main",
    fontWeight: "bold",
    boxShadow: 1,
  }}
>
  button
</Button>
```

color tokens:

```txt
primary.main
primary.light
primary.dark
primary.contrastText

secondary.main
secondary.light
secondary.dark
secondary.contrastText

error.main
error.light
error.dark
error.contrastText

warning.main
warning.light
warning.dark
warning.contrastText

info.main
info.light
info.dark
info.contrastText

success.main
success.light
success.dark
success.contrastText

text.primary
text.secondary
text.disabled

common.black
common.white
```

## internationalization

uses react-i18next and i18next-cli for internationalization / translations

if you edit or add to `/public/locales/`, run this to sync types

```bash
npm run i18n:extract
```

always import translations as an array

```tsx
const { t } = useTranslation(["common"]);
return <div>{t("common:some")}</div>;
```

always use full name

```tsx
return <div>{t("common:some")}</div>;
```
