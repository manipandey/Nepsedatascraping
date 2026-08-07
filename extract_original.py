import json
import os
import re

log_dir = "/Users/manirajpandey/.gemini/antigravity-ide/brain/8cac3610-dd69-431c-b3bf-9ba65b38c744/.system_generated/logs"
transcript_path = os.path.join(log_dir, "transcript_full.jsonl")

files_to_recover = ["index.html", "style.css", "app.js"]
recovered = {f: False for f in files_to_recover}

try:
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            if all(recovered.values()): break
            try:
                data = json.loads(line)
                if data.get("type") == "TOOL_RESPONSE":
                    output = data.get("content", "")
                    
                    for filename in files_to_recover:
                        if not recovered[filename] and f"Showing lines" in output and f"/{filename}`" in output:
                            # It's a view_file response! But view_file only shows partial lines usually.
                            # Did we view the WHOLE file?
                            print(f"Found view_file response for {filename}")
                            # This is just diagnostic, we might need a better way if view_file was partial.
            except json.JSONDecodeError:
                pass
except Exception as e:
    print(e)
