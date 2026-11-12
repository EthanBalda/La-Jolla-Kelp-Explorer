# La-Jolla-Kelp-Explorer

Local previews (serve this directory on port 5500):

- Full explorer: http://localhost:5500/index.html
- Ocean embed: http://localhost:5500/ocean-embed.html
- Relationships embed: http://localhost:5500/relationships-embed.html
- Full-width and 320px iframe checks: http://localhost:5500/tests/embed-preview.html

The embed pages reuse `src/main.js` and `src/styles.css` and display synthetic
sample data independently. Each iframe has its own selected quarter and playback
state. The preview check page automatically exercises controls and reports
horizontal overflow. It is a local QA page, not an embed target.

For Google Sites, host the project files at a public HTTPS URL, then embed the
individual page URL. Localhost URLs are for local review only. Set the Google
Sites embed height to fit the content; a short iframe will scroll vertically.
