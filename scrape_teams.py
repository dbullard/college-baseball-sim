import urllib.request
from bs4 import BeautifulSoup
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://en.wikipedia.org/wiki/List_of_NCAA_Division_I_baseball_programs"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req, context=ctx).read()
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table', {'class': 'wikitable'})
    
    teams = []
    for row in table.find_all('tr')[1:]:
        cols = row.find_all(['td', 'th'])
        if len(cols) >= 5:
            school = cols[0].text.strip()
            nickname = cols[1].text.strip()
            city = cols[2].text.strip()
            state = cols[3].text.strip()
            conference = cols[4].text.strip()
            teams.append({
                'school': school,
                'nickname': nickname,
                'city': city,
                'state': state,
                'conference': conference
            })
    
    with open('teams.json', 'w') as f:
        json.dump(teams, f, indent=2)
    print(f"Scraped {len(teams)} teams.")
except Exception as e:
    print(f"Error: {e}")
