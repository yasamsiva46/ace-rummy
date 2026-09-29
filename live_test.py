import requests

print("🌐 Fetching data from internet server...")

# ఉచిత టెస్టింగ్ సర్వర్
url = "https://httpbin.org/json"

try:
    response = requests.get(url, timeout=10)
    print("Status Code:", response.status_code)
    
    if response.status_code == 200:
        data = response.json()
        print("\n✅ Server response received successfully!")
        print("Data Title:", data["slideshow"]["title"])
    else:
        print("❌ Server error:", response.status_code)

except Exception as e:
    print("❌ Connection Error:", e)