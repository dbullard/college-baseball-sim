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

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
  
  await page.evaluate(() => {
    localStorage.setItem('franchise-storage', JSON.stringify({
      state: {
        save: {
          id: 'test-1',
          userProgramId: 'vanderbilt',
          roster: [],
          seasonStructure: {},
          complianceReviews: [],
          eventLog: []
        }
      },
      version: 2
    }));
  });

  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  const content = await page.content();
  console.log("PAGE CONTENT PREVIEW:", content.substring(0, 1000));
  
  if (content.includes('id="root"></div>')) {
     console.log("ROOT IS EMPTY!");
  }

  await browser.close();
})();
