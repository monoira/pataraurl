import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

i18n
  .use(LanguageDetector)
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "ka"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",

    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },

    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },

    defaultNS: "common",

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
