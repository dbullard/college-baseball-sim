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

  console.log('Navigating to setup local storage...');
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
  
  await page.evaluate(() => {
    localStorage.setItem('franchise-storage', JSON.stringify({
      state: {
        save: null
      },
      version: 2
    }));
  });

  console.log('Reloading with mocked localStorage...');
  await page.reload({ waitUntil: 'networkidle0' });

  console.log('Navigation complete.');

  const content = await page.content();
  if (content.includes('Choose a school to take over')) {
    console.log('Team Selection rendered successfully!');
  } else {
    console.log('Team Selection NOT FOUND in HTML.');
  }

  await browser.close();
})();
