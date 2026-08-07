import json
import os

transcript_path = "/Users/manirajpandey/.gemini/antigravity-ide/brain/8cac3610-dd69-431c-b3bf-9ba65b38c744/.system_generated/logs/transcript_full.jsonl"

file_states = {}

try:
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                data = json.loads(line)
                step = data.get("step_index", 0)
                
                # Stop parsing after step 340 (before NPStocks redesign)
                if step > 340:
                    continue
                
                if data.get("type") == "PLANNER_RESPONSE":
                    calls = data.get("tool_calls", [])
                    for call in calls:
                        if call["name"] == "write_to_file":
                            args = call["args"]
                            if "TargetFile" in args and "CodeContent" in args:
                                path = args["TargetFile"]
                                if "index.html" in path or "style.css" in path or "app.js" in path:
                                    basename = os.path.basename(path)
                                    file_states[basename] = {"step": step, "content": args["CodeContent"]}
                        elif call["name"] == "run_command":
                            cmd = call["args"].get("CommandLine", "")
                            if "cat << 'EOF' > index.html" in cmd:
                                content = cmd.split("cat << 'EOF' > index.html\n")[1].split("\nEOF")[0]
                                file_states["index.html"] = {"step": step, "content": content}
                            elif "cat << 'EOF' > style.css" in cmd:
                                content = cmd.split("cat << 'EOF' > style.css\n")[1].split("\nEOF")[0]
                                file_states["style.css"] = {"step": step, "content": content}
                            elif "cat << 'EOF' > app.js" in cmd:
                                content = cmd.split("cat << 'EOF' > app.js\n")[1].split("\nEOF")[0]
                                file_states["app.js"] = {"step": step, "content": content}
                                
            except Exception as e:
                pass
except Exception as e:
    print(e)

for f, state in file_states.items():
    print(f"Recovered {f} from step {state['step']} length {len(state['content'])}")
    with open(f + ".recovered", "w") as out:
        out.write(state['content'])

