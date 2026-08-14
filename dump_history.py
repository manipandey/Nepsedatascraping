import json
import os
import re

transcript_path = "/Users/manirajpandey/.gemini/antigravity-ide/brain/8cac3610-dd69-431c-b3bf-9ba65b38c744/.system_generated/logs/transcript_full.jsonl"
out_dir = "history_dump"
os.makedirs(out_dir, exist_ok=True)

file_versions = {"index.html": 0, "style.css": 0, "app.js": 0}

with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get("step_index", 0)
            
            if data.get("type") == "PLANNER_RESPONSE":
                calls = data.get("tool_calls", [])
                for call in calls:
                    if call["name"] == "write_to_file":
                        args = call["args"]
                        if "TargetFile" in args and "CodeContent" in args:
                            path = args["TargetFile"]
                            basename = os.path.basename(path)
                            if basename in file_versions:
                                file_versions[basename] += 1
                                out_path = os.path.join(out_dir, f"{basename}.v{file_versions[basename]}.step{step}")
                                with open(out_path, "w") as out:
                                    out.write(args["CodeContent"])
                    elif call["name"] == "run_command":
                        cmd = call["args"].get("CommandLine", "")
                        for basename in file_versions.keys():
                            if f"cat << 'EOF' > {basename}" in cmd:
                                try:
                                    content = cmd.split(f"cat << 'EOF' > {basename}\n")[1].split("\nEOF")[0]
                                    file_versions[basename] += 1
                                    out_path = os.path.join(out_dir, f"{basename}.v{file_versions[basename]}.step{step}")
                                    with open(out_path, "w") as out:
                                        out.write(content)
                                except:
                                    pass
        except Exception as e:
            pass

print("Dumped versions:", file_versions)
