/*
 * Which data backend the pages use.
 * - demo: everything runs in the browser with generated data (GitHub Pages demo).
 * - sheets: the Google Sheet through the Apps Script web app (apps-script/, see SETUP-GOOGLE-SHEETS.md):
 *     window.APP_CONFIG = { backend: 'sheets', url: 'https://script.google.com/macros/s/…/exec' };
 *   Optional: demoAccounts: true lists the demo logins on the login page (Sheet filled with importDemoData).
 */
window.APP_CONFIG = { backend: 'demo' };
