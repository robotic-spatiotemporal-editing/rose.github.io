# RoSE — Robotic Spatiotemporal Editing

Academic project website for **Robotic Spatiotemporal Editing: A Unified Interface for Controllable Action Generation via Masked Action Reconstruction**. The site is intentionally built with plain HTML, CSS, and JavaScript so it can run locally, on GitHub Pages, or behind a future custom domain without a build step.

## Project structure

```text
.
├── index.html
├── css/style.css
├── js/main.js
├── assets/
│   ├── images/
│   ├── videos/
│   └── results/
├── paper/
├── mam-demo.html
├── .nojekyll
├── README.md
└── .gitignore
```

## Preview locally

On macOS, double-click `preview.command` in this folder. It opens the website in
your browser and starts a local server if one is not already running. Keep the
Terminal window open while previewing. If port 8000 is occupied by another site,
the launcher selects another available port and prints the address.

Alternatively, from this folder run:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). Stop the server with `Ctrl+C`.

Use this HTTP address rather than double-clicking `index.html`: the interactive
demo fetches its model and reference data as needed, which requires HTTP locally.
On GitHub Pages the site is served over HTTPS, so visitors open the normal page;
they do not run a local server or use `preview.command`. The interactive demo is
embedded in the homepage and loads automatically as it comes into view.

## Optimized media and interactive demo

- The page uses WebP figures in `assets/images/`; original PNGs are retained.
- `mam-demo.html` loads its styles from `css/mam-demo-base.css` and
  `css/mam-demo-theme.css`, and its scripts from `js/mam/`.
- `assets/interactive/` contains compressed robot data and extracted reference
  videos/posters. These are required site assets: publish them with the page.
- Videos load when selected; the additional simulation model loads when first
  requested. The 3D view pauses rendering while outside the visible page.
- `tools/optimize_site_assets.py` performs the mechanical extraction from the
  original embedded HTML and generates WebP copies (Python with Pillow needed).
  On subsequent runs it preserves the extracted scripts and regenerates WebP
  copies from PNGs. No build step is needed to preview or deploy the website.

## Update the content

- Edit page copy and section structure in `index.html`.
- Edit colors, type, layout, and responsive styles in `css/style.css`.
- Edit navigation and the BibTeX copy interaction in `js/main.js`.
- Put figures and photographs in `assets/images/`.
- Put compressed demo media in `assets/videos/` (MP4/WebM recommended).
- Put downloadable results in `assets/results/`.
- Put the paper PDF and supplementary files in `paper/`.

Search for `TODO:` in `index.html` to find all content placeholders. Keep internal assets referenced with relative paths, for example:

```html
<img src="./assets/images/method.webp" alt="Overview of the RoSE method">
<video controls src="./assets/videos/demo-01.mp4"></video>
<a href="./paper/rose.pdf">Paper</a>
```

Avoid repository-specific absolute URLs. Relative paths keep the site portable between local development, GitHub Pages, and a custom domain.

## Deploy with GitHub Pages

1. Push the repository to GitHub with the default branch named `main`.
2. Open the repository on GitHub and go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/(root)` folder, then save.
5. For the originally planned `yuchiao0222/RoSE_website` repository, the
   expected URL is `https://yuchiao0222.github.io/RoSE_website/`. If publishing
   from a different repository, use the Pages URL shown in its settings.

Publish `mam-demo.html`, `css/`, `js/`, `assets/interactive/`, and all other
assets along with `index.html`. The `.nojekyll` file tells GitHub Pages to serve
the plain static files without processing them through Jekyll. No code changes
are required for the GitHub Pages subpath because all local resources use
relative paths.

## Add a custom domain later

1. Configure the domain's DNS records using GitHub's current Pages documentation.
2. In **Settings → Pages → Custom domain**, enter the domain and save it.
3. Enable **Enforce HTTPS** after GitHub provisions the certificate.
4. GitHub will create or update a `CNAME` file in the publishing source. If managing it manually, place a `CNAME` file in the repository root containing only the domain name.

Do not add a `CNAME` until the domain has been purchased and the DNS records are ready.

## Accessibility and media notes

- Add meaningful `alt` text to every research figure.
- Provide captions or a transcript for narrated videos.
- Keep video files compressed to reduce load time; consider poster images for each demo.
- Preserve visible keyboard focus and adequate text contrast when changing colors.
