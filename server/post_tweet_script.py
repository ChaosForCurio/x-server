import requests
import base64
import os
import json

# Configuration
IMAGE_PATH = r"c:\Users\Lenovo\OneDrive\Desktop\X Agent\frontend\src\app\Post Images\13adf9bc-435d-4094-bc52-3a819fe385cc.jpeg"
API_URL = "http://localhost:3001/api/posts/post"
CAPTION = "Saving Time Using Prompts"

def post_tweet():
    if not os.path.exists(IMAGE_PATH):
        print(f"Error: Image not found at {IMAGE_PATH}")
        return

    try:
        # Read and encode image
        with open(IMAGE_PATH, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
        
        # Construct data URI
        image_data_uri = f"data:image/jpeg;base64,{encoded_string}"
        
        # Payload
        payload = {
            "text": CAPTION,
            "image": image_data_uri
        }
        
        headers = {
            "Content-Type": "application/json"
        }
        
        print("Sending request...")
        response = requests.post(API_URL, json=payload, headers=headers)
        
        if response.status_code == 200:
            print("Success!")
            data = response.json()
            print(json.dumps(data, indent=2))
            try:
                tweet_id = data.get("data", {}).get("data", {}).get("id")
                if tweet_id:
                    print(f"TWEET_URL: https://x.com/i/web/status/{tweet_id}")
            except:
                pass
        else:
            print(f"Failed with status {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    post_tweet()
