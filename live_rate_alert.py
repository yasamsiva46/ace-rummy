import time
import winsound
import requests

API_KEY = "f768ee8677e8516db99986e3401c68a2"

# అలారం మోగాల్సిన టార్గెట్ రేటు
TARGET_RATE = 50

print("🚀 లైవ్ రేట్ మానిటరింగ్ & అలారం సిస్టమ్ సిద్ధమైంది!")
print("🔔 టార్గెట్ రేటు:", TARGET_RATE)
print("🛑 ప్రోగ్రామ్ ఆపడానికి టెర్మినల్‌లో Ctrl + C నొక్కండి.\n")

def check_live_odds():
    try:
        # 1. అందుబాటులో ఉన్న అన్ని క్రికెట్ లీగ్‌లను పొందడం
        sports_url = f"https://api.the-odds-api.com/v4/sports/?apiKey={API_KEY}"
        sports_res = requests.get(sports_url, timeout=10)
        
        if sports_res.status_code != 200:
            print("❌ సర్వర్ కనెక్షన్ సమస్య:", sports_res.status_code)
            return

        sports_data = sports_res.json()
        cricket_leagues = [s for s in sports_data if "cricket" in s.get("key", "")]

        found_any_odds = False

        for league in cricket_leagues:
            league_key = league["key"]
            league_title = league["title"]

            # మ్యాచ్ రేట్లను తీసుకురావడం
            odds_url = f"https://api.the-odds-api.com/v4/sports/{league_key}/odds/?apiKey={API_KEY}&regions=in,uk,eu,au&markets=h2h"
            odds_res = requests.get(odds_url, timeout=10)
            matches = odds_res.json()

            if isinstance(matches, list) and len(matches) > 0:
                for match in matches:
                    home = match.get("home_team")
                    away = match.get("away_team")
                    bookmakers = match.get("bookmakers", [])

                    if bookmakers:
                        found_any_odds = True
                        print(f"\n🏏 [{league_title}] {home} vs {away}")
                        
                        for bm in bookmakers:
                            bm_name = bm.get("title")
                            for market in bm.get("markets", []):
                                for outcome in market.get("outcomes", []):
                                    team = outcome.get("name")
                                    rate = outcome.get("price")
                                    print(f"   👉 [{bm_name}] {team}: {rate}")

                                    # రేటు 50 లేదా అంతకంటే ఎక్కువ ఉంటే అలారం
                                    if rate >= TARGET_RATE:
                                        print("\n" + "="*45)
                                        print(f"🚨 అలర్ట్! {team} రేటు {rate} చేరింది! 🚨")
                                        print("="*45)
                                        for _ in range(5):
                                            winsound.Beep(1400, 500)
                                            time.sleep(0.1)

        if not found_any_odds:
            current_time = time.strftime("%H:%M:%S")
            print(f"[{current_time}] ప్రస్తుతానికి లైవ్ రేట్లు లేవు. తదుపరి పరిశీలన 30 సెకన్లలో...")

    except Exception as e:
        print("❌ లోపం సంభవించింది:", e)

# ప్రతి 30 సెకన్లకు ఒకసారి నిరంతరం తనిఖీ చేసే లూప్
while True:
    check_live_odds()
    time.sleep(30)