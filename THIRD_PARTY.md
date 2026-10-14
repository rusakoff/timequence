# Записи инструментов

Timequence включает 12 обработанных записей из **Versilian Community Sample Library (VCSL)**, Samuel Gossner / Versilian Studios и участники проекта.

- Репозиторий: https://github.com/sgossner/VCSL
- Версия источников: `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`
- Лицензия записей: **CC0 1.0 Universal**; полный текст — [public/audio/vcsl/LICENSE.txt](./public/audio/vcsl/LICENSE.txt).
- Точные исходные пути, URL, контрольные суммы оригиналов и обработанных MP3, параметры обработки — [manifest.json](./public/audio/vcsl/manifest.json).

Подборка: непальский колокольчик, ручной колокол, глокеншпиль, вибрафон, маримба, вудблок, клавес, треугольник, гонг, трубчатый колокол, шейкер, перелив колокольчиков.

Обработка: удаление начальной тишины с запасом 5 мс перед атакой, ограничение длительности до 3 секунд, нормализация по самому громкому окну 400 мс до −21 dBFS RMS с ограничением пиков до −4 dBFS, короткий вход и плавный выход, MP3 192 кбит/с, стерео 44,1 кГц. Острые ударные остаются тише по RMS, если выравнивание привело бы к превышению пиков. Высота и скорость записей не изменены.

Повторная подготовка (Python 3 и FFmpeg с libmp3lame):

```sh
python3 scripts/prepare-samples.py
```

Скрипт скачивает только выбранные записи из закреплённой версии, создаёт MP3, манифест и данные для формы волны. Контрольные суммы выходных файлов могут отличаться между версиями FFmpeg. Обычная сборка приложения не требует Python, FFmpeg или доступа к GitHub.

## Шрифт Manrope

Manrope (Mikhail Sharanda, Mirko Velimirovic), SIL Open Font License 1.1. Переменные WOFF2-файлы для кириллицы и латиницы поставляются локально в `public/fonts/`, без запроса к Google Fonts при открытии страницы. Текст лицензии: [public/fonts/OFL.txt](./public/fonts/OFL.txt). Источник: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope).
