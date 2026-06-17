const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('PAGE ERROR:', msg.text());
    } else {
      console.log('PAGE LOG:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.error('UNCAUGHT EXCEPTION:', error.message);
  });

  page.on('requestfailed', request => {
    console.error('REQUEST FAILED:', request.url(), request.failure().errorText);
  });

  console.log('Navigating to http://localhost:4173/ ...');
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
  console.log('Navigation complete.');

  const content = await page.content();
  if (content.includes('Choose a school to take over')) {
    console.log('Team Selection rendered successfully!');
  } else {
    console.log('Team Selection NOT FOUND in HTML.');
  }

  await browser.close();
})();
