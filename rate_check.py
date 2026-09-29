import time
import winsound

TARGET_RATE = 50
live_rates = [10, 15, 22, 35, 42, 52, 55]

print("🏏 Match Rate Alert System Started...")
print(f"🎯 Target Alert Rate Set To: {TARGET_RATE}\n")

for rate in live_rates:
    print(f"Current Rate: {rate}")
    
    if rate >= TARGET_RATE:
        print("\n" + "="*40)
        print("🚨 ALERT! Rate reached 50! Open App Now! 🚨")
        print("="*40 + "\n")
        
        # రేటు 50 దాటగానే 3 బీప్ శబ్దాలు వస్తాయి
        for _ in range(3):
            winsound.Beep(1200, 600)
            time.sleep(0.2)
            
        break
        
    time.sleep(2)