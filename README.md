
# Etsy Listing to PDF

A one-click Chrome extension that turns the Etsy product page you're viewing into a clean PDF — the listing title on a cover block, followed by every product image at full resolution, one per page.

No servers, no accounts, no tracking. Everything happens locally in your browser.

## Features

- **One click** — press the toolbar icon on any Etsy listing, get a PDF
- **Full-resolution images** — rewrites Etsy thumbnail URLs to `il_fullxfull` originals
- **Deduplication** — the same image in multiple carousel sizes is downloaded once
- **Typeset title page block** — the listing title rendered in a serif headline with a gold rule
- **Any image format** — non-JPEG images are converted via `OffscreenCanvas`
- **Zero dependencies** — the PDF is written byte-by-byte in plain JavaScript (no jsPDF, no bundler)
- **Auto-named file** — saved as `<listing title>.pdf` with illegal filename characters stripped
- **Badge feedback** — `...` while working, `OK` on success, `ERR` on failure

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome (or Edge / Brave / any Chromium browser).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.

The orange icon appears in your toolbar. Pin it for quick access.

## Usage

1. Open any Etsy listing page (`https://www.etsy.com/listing/...`).
2. Click the extension icon.
3. The badge shows `...`, then `OK`, and the PDF lands in your Downloads folder.

## How it works

| Step | What happens |
|------|--------------|
| 1 | `chrome.scripting.executeScript` injects `extractListing()` into the active tab |
| 2 | The title is read from `h1[data-buy-box-listing-title]`; carousel images are collected from `[data-carousel-pane] img` and `img[data-src-zoom-image]` |
| 3 | Thumbnail URLs are rewritten (`il_300x300.` → `il_fullxfull.`) and deduped by image ID |
| 4 | Each image is fetched; JPEGs are passed through, anything else is re-encoded to JPEG at quality 0.95 |
| 5 | `jpegInfo()` parses SOF markers for width, height and component count — no decoding needed |
| 6 | A title image is rendered on an `OffscreenCanvas` with word-wrapped Georgia text |
| 7 | `buildPdf()` emits a PDF 1.4 file: each image becomes a `/DCTDecode` XObject embedded without re-compression |
| 8 | The blob is converted to a data URL and handed to `chrome.downloads.download` |

Pages are A4 (595.28 × 841.89 pt) with a 36 pt margin.

## Project structure

```
.
├── manifest.json     # MV3 manifest
├── background.js     # service worker: scraping, image handling, PDF writer
├── icon16.png
├── icon48.png
├── icon128.png
└── README.md
```

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` | Read the listing page only when you click the icon |
| `scripting` | Inject the extraction function into that page |
| `downloads` | Save the generated PDF |
| `https://www.etsy.com/*` | Match listing pages |
| `https://i.etsystatic.com/*` | Fetch the full-size product images |

No network requests are made to anywhere other than Etsy's own image CDN.

## Customization

Open `background.js`:

| What | Where |
|------|-------|
| Title font and size | `titleImage()` → `const font` |
| Accent rule color | `titleImage()` → `g.fillStyle = '#b08d57'` |
| Page size | `buildPdf()` / `layout()` → `MediaBox` and `PW`, `PH` |
| Page margin | `layout()` → `const M = 36` |
| JPEG quality | `convertToBlob({ quality: 0.95 })` |
| One image per page | `layout()` — the `pages.push(cur)` inside the loop forces a page break per image; remove it to pack multiple images per page |

## Limitations

- Depends on Etsy's current DOM attributes; a markup change on their side may require updating the selectors in `extractListing()`.
- Listing *videos* are not included — images only.
- Very large listings produce large PDFs, since images are embedded at original resolution without re-compression.
- Chromium browsers only (Manifest V3 service worker + `OffscreenCanvas`).

## Troubleshooting

**Badge shows `ERR`** — open `chrome://extensions`, click **service worker** under this extension, and check the console.

**"No images found"** — you're probably not on a listing page, or the page hasn't finished loading. Scroll the image carousel once and retry.

**Download doesn't start** — check that Chrome isn't set to ask for a save location for every file, and that downloads aren't blocked for the site.

## Contributing

Issues and pull requests are welcome. Keep the extension dependency-free and the service worker self-contained.

## License

MIT
