# Звуки UI SFX — Glass

Timequence использует только набор **Glass** из npm-пакета [uisfx](https://www.npmjs.com/package/uisfx), версия 0.4.0 (автор Yuki Capital).

- Репозиторий: [romainsimon/uisfx](https://github.com/romainsimon/uisfx).
- Код библиотеки: [MIT](https://github.com/romainsimon/uisfx/blob/main/packages/uisfx/LICENSE).
- Сгенерированные звуки: [CC0 1.0 Universal](https://github.com/romainsimon/uisfx/blob/main/packages/uisfx/LICENSE-AUDIO).
- Все 78 сигналов синтезируются локально из рецептов Glass. Аудиофайлы других наборов не копируются в приложение.
- Шесть звуков состояния воспроизводятся как один цикл, без зацикливания события. Секундный тик использует Glass `typing`.
- `npm run sounds:metadata` обновляет `src/glass-durations.ts` из фактического рендера библиотеки. Для работы и сборки не нужны Python, FFmpeg или внешние аудиосервисы.

## Шрифт Manrope

Manrope (Mikhail Sharanda, Mirko Velimirovic), SIL Open Font License 1.1. Переменные WOFF2-файлы для кириллицы и латиницы поставляются локально в `public/fonts/`, без запроса к Google Fonts при открытии страницы. Текст лицензии: [public/fonts/OFL.txt](./public/fonts/OFL.txt). Источник: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope).
